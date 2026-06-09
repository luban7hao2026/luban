from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Food, User
from app.schemas import AuthToken, UserLogin, UserOut, UserRegister
from app.security import create_access_token, get_current_user, hash_password, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])
DEFAULT_TEMPLATE_USER_ID = 1


def _seed_default_foods(db: Session, user: User) -> None:
    if user.id == DEFAULT_TEMPLATE_USER_ID:
        return

    has_foods = db.scalar(select(Food.id).where(Food.user_id == user.id).limit(1))
    if has_foods is not None:
        return

    template_foods = db.scalars(
        select(Food).where(Food.user_id == DEFAULT_TEMPLATE_USER_ID).order_by(Food.id.asc())
    ).all()
    for food in template_foods:
        db.add(
            Food(
                user_id=user.id,
                name=food.name,
                image_url=food.image_url,
                category=food.category,
                is_active=food.is_active,
            )
        )


@router.post("/register", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> AuthToken:
    username = payload.username.strip()
    existing = db.scalar(select(User).where(User.username == username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

    user = User(username=username, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    _seed_default_foods(db, user)
    db.commit()
    db.refresh(user)

    return AuthToken(access_token=create_access_token(user), user=user)


@router.post("/login", response_model=AuthToken)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthToken:
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    return AuthToken(access_token=create_access_token(user), user=user)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user
