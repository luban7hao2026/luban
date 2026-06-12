import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Food, PickLog, User
from app.schemas import FoodCreate, FoodOut, FoodUpdate, ImageDownloadIn, ImageSearchResult, UploadOut
from app.security import get_active_user, get_current_user


router = APIRouter(prefix="/foods", tags=["foods"])
ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
DUPLICATE_FOOD_NAME_MESSAGE = "该食物名称已存在，请换一个名称"


def _ensure_unique_food_name(
    db: Session,
    user_id: int,
    name: str,
    exclude_id: int | None = None,
) -> None:
    statement = select(Food.id).where(
        Food.user_id == user_id,
        func.lower(Food.name) == name.lower(),
    )
    if exclude_id is not None:
        statement = statement.where(Food.id != exclude_id)
    if db.scalar(statement.limit(1)) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=DUPLICATE_FOOD_NAME_MESSAGE,
        )


def _commit_food_changes(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=DUPLICATE_FOOD_NAME_MESSAGE,
        ) from exc
FOOD_QUERY_HINTS = {
    "鱼": "fish food",
    "鸡": "chicken dish",
    "鸭": "duck dish",
    "牛": "beef dish",
    "羊": "lamb dish",
    "猪": "pork dish",
    "肉": "meat dish",
    "面": "noodle food",
    "粉": "rice noodle food",
    "饭": "rice food",
    "粥": "congee food",
    "饺": "dumpling food",
    "包": "baozi food",
    "菜": "vegetable dish",
    "汤": "soup food",
    "火锅": "hot pot food",
    "寿司": "sushi food",
    "汉堡": "hamburger food",
    "披萨": "pizza food",
}


@router.get("", response_model=list[FoodOut])
def list_foods(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Food]:
    return list(
        db.scalars(
            select(Food)
            .where(Food.user_id == current_user.id)
            .order_by(Food.created_at.desc())
        )
    )


@router.post("", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
def create_food(
    payload: FoodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
) -> Food:
    _ensure_unique_food_name(db, current_user.id, payload.name)
    food = Food(**payload.model_dump(), user_id=current_user.id)
    db.add(food)
    _commit_food_changes(db)
    db.refresh(food)
    return food


@router.patch("/{food_id}", response_model=FoodOut)
def update_food(
    food_id: int,
    payload: FoodUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
) -> Food:
    food = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == current_user.id))
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    data = payload.model_dump(exclude_unset=True)
    new_name = data.get("name")
    if new_name is not None:
        _ensure_unique_food_name(db, current_user.id, new_name, exclude_id=food.id)
    for field, value in data.items():
        setattr(food, field, value)

    _commit_food_changes(db)
    db.refresh(food)
    return food


@router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(
    food_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
) -> None:
    food = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == current_user.id))
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    db.execute(delete(PickLog).where(PickLog.food_id == food_id, PickLog.user_id == current_user.id))
    db.delete(food)
    db.commit()


@router.get("/search-images", response_model=list[ImageSearchResult])
def search_food_images(
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=6, ge=1, le=10),
) -> list[ImageSearchResult]:
    return _search_commons_images(q, limit)


def _expand_food_queries(query: str) -> list[str]:
    normalized = query.strip()
    queries = [f"{normalized} food"]

    for key, hint in FOOD_QUERY_HINTS.items():
      if key in normalized:
          queries.append(hint)

    queries.append(normalized)

    unique_queries: list[str] = []
    for item in queries:
        if item and item not in unique_queries:
            unique_queries.append(item)
    return unique_queries


def _search_commons_images(query: str, limit: int) -> list[ImageSearchResult]:
    results: list[ImageSearchResult] = []
    seen_urls: set[str] = set()
    last_error: Exception | None = None

    for search_query in _expand_food_queries(query):
        try:
            results.extend(_search_commons_once(search_query, limit, seen_urls))
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            continue

        if len(results) >= limit:
            return results[:limit]

    if results:
        return results[:limit]

    if last_error is not None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not search images: {last_error}",
        )

    return []


def _search_commons_once(
    search_query: str,
    limit: int,
    seen_urls: set[str],
) -> list[ImageSearchResult]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrsearch": f"{search_query} filemime:image",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|mime",
        "iiurlwidth": "480",
        "origin": "*",
    }
    api_url = f"https://commons.wikimedia.org/w/api.php?{urlencode(params)}"
    request = Request(
        api_url,
        headers={"User-Agent": "RandomLunchImageSearch/1.0"},
    )

    with urlopen(request, timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))

    pages = payload.get("query", {}).get("pages", {})
    results: list[ImageSearchResult] = []
    for page in pages.values():
        image_info = (page.get("imageinfo") or [{}])[0]
        image_url = image_info.get("url")
        thumb_url = image_info.get("thumburl") or image_url
        mime = image_info.get("mime", "")
        if not image_url or not thumb_url or not mime.startswith("image/"):
            continue
        if image_url in seen_urls:
            continue

        seen_urls.add(image_url)

        results.append(
            ImageSearchResult(
                title=page.get("title", "Wikimedia Commons image").replace("File:", ""),
                url=image_url,
                thumb_url=thumb_url,
                source="Wikimedia Commons",
            )
        )

    return results


@router.post("/upload", response_model=UploadOut)
async def upload_food_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_active_user),
) -> UploadOut:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image uploads are supported",
        )

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "").suffix.lower()
    safe_suffix = suffix if suffix in ALLOWED_IMAGE_SUFFIXES else ".jpg"
    filename = f"{uuid4().hex}{safe_suffix}"
    target = upload_dir / filename

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is too large",
        )

    target.write_bytes(contents)

    return UploadOut(image_url=f"/uploads/{filename}")


@router.post("/download-image", response_model=UploadOut)
def download_food_image(
    payload: ImageDownloadIn,
    current_user: User = Depends(get_active_user),
) -> UploadOut:
    parsed = urlparse(payload.url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only http and https image URLs are supported",
        )

    request = Request(
        payload.url,
        headers={"User-Agent": "RandomLunchImageDownloader/1.0"},
    )

    try:
        with urlopen(request, timeout=12) as response:
            content_type = response.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The URL does not point to an image",
                )

            contents = response.read(MAX_IMAGE_BYTES + 1)
    except HTTPException:
        raise
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download image: {exc}",
        ) from exc

    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is too large",
        )

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(parsed.path).suffix.lower()
    safe_suffix = suffix if suffix in ALLOWED_IMAGE_SUFFIXES else ".jpg"
    filename = f"{uuid4().hex}{safe_suffix}"
    target = upload_dir / filename
    target.write_bytes(contents)

    return UploadOut(image_url=f"/uploads/{filename}")
