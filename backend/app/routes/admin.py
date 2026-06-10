from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Food, PickLog, User
from app.schemas import (
    AdminCommonFoodItem,
    AdminDashboardStats,
    AdminUserFoodListItem,
    AdminUserListItem,
    AdminUserPasswordReset,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
    FoodCreate,
    FoodOut,
    FoodUpdate,
    UserOut,
)
from app.security import get_current_admin, get_current_user, hash_password


router = APIRouter(prefix="/admin", tags=["admin"])
DEFAULT_TEMPLATE_USER_ID = 1
ADMIN_ROLE = "admin"
USER_ROLE = "user"


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_admin(user: User) -> bool:
    return user.role == ADMIN_ROLE


def _admin_count(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(User.id)).where(
                User.id != DEFAULT_TEMPLATE_USER_ID,
                User.role == ADMIN_ROLE,
            )
        )
        or 0
    )


def _get_real_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.id == DEFAULT_TEMPLATE_USER_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return user


def _ensure_not_last_admin_change(db: Session, user: User) -> None:
    if user.role == ADMIN_ROLE and _admin_count(db) <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin is required")


@router.get("/dashboard", response_model=AdminDashboardStats)
def read_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminDashboardStats:
    user_count = db.scalar(select(func.count(User.id)).where(User.id != DEFAULT_TEMPLATE_USER_ID)) or 0
    food_count = (
        db.scalar(
            select(func.count(func.distinct(Food.name)))
            .join(Food.user)
            .where(Food.user_id != DEFAULT_TEMPLATE_USER_ID)
        )
        or 0
    )
    common_rows = db.execute(
        select(Food.name, func.max(Food.image_url), func.count(Food.id))
        .join(Food.user)
        .where(Food.user_id != DEFAULT_TEMPLATE_USER_ID)
        .group_by(Food.name)
        .order_by(func.count(Food.id).desc(), Food.name.asc())
        .limit(6)
    ).all()

    return AdminDashboardStats(
        user_count=user_count,
        food_count=food_count,
        common_foods=[
            AdminCommonFoodItem(name=name, image_url=image_url, count=count)
            for name, image_url, count in common_rows
        ],
    )


@router.get("/users", response_model=list[AdminUserListItem])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AdminUserListItem]:
    food_counts = dict(
        db.execute(
            select(Food.user_id, func.count(Food.id))
            .group_by(Food.user_id)
        ).all()
    )
    pick_log_counts = dict(
        db.execute(
            select(PickLog.user_id, func.count(PickLog.id))
            .group_by(PickLog.user_id)
        ).all()
    )
    users = db.scalars(
        select(User)
        .where(User.id != DEFAULT_TEMPLATE_USER_ID)
        .order_by(User.created_at.desc(), User.id.desc())
    ).all()

    return [
        AdminUserListItem(
            id=user.id,
            username=user.username,
            role=user.role,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            food_count=food_counts.get(user.id, 0),
            pick_log_count=pick_log_counts.get(user.id, 0),
            is_active=user.is_active,
        )
        for user in users
    ]


@router.patch("/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    payload: AdminUserStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> User:
    user = _get_real_user(db, user_id)
    if user.id == current_admin.id and not payload.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot disable your own account")
    if not payload.is_active:
        _ensure_not_last_admin_change(db, user)

    user.is_active = payload.is_active
    user.credentials_updated_at = _utc_now_naive()
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    payload: AdminUserRoleUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> User:
    user = _get_real_user(db, user_id)
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role")
    if payload.role not in {ADMIN_ROLE, USER_ROLE}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported role")
    if user.role == ADMIN_ROLE and payload.role != ADMIN_ROLE:
        _ensure_not_last_admin_change(db, user)

    user.role = payload.role
    user.credentials_updated_at = _utc_now_naive()
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: AdminUserPasswordReset,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> User:
    user = _get_real_user(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    user.credentials_updated_at = _utc_now_naive()
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    user = _get_real_user(db, user_id)
    if user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    _ensure_not_last_admin_change(db, user)

    db.execute(delete(PickLog).where(PickLog.user_id == user.id))
    db.execute(delete(Food).where(Food.user_id == user.id))
    db.delete(user)
    db.commit()


def _get_default_food(db: Session, food_id: int) -> Food:
    food = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == DEFAULT_TEMPLATE_USER_ID))
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    return food


@router.get("/default-foods", response_model=list[FoodOut])
def list_default_foods(
    q: str | None = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Food]:
    statement = select(Food).where(Food.user_id == DEFAULT_TEMPLATE_USER_ID)
    if q and q.strip():
        statement = statement.where(Food.name.contains(q.strip()))

    return list(db.scalars(statement.order_by(Food.created_at.desc(), Food.id.desc())))


@router.post("/default-foods", response_model=FoodOut, status_code=status.HTTP_201_CREATED)
def create_default_food(
    payload: FoodCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Food:
    food = Food(**payload.model_dump(), user_id=DEFAULT_TEMPLATE_USER_ID)
    db.add(food)
    db.commit()
    db.refresh(food)
    return food


@router.patch("/default-foods/{food_id}", response_model=FoodOut)
def update_default_food(
    food_id: int,
    payload: FoodUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> Food:
    food = _get_default_food(db, food_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(food, field, value)

    db.commit()
    db.refresh(food)
    return food


@router.delete("/default-foods/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_default_food(
    food_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    food = _get_default_food(db, food_id)
    db.execute(delete(PickLog).where(PickLog.food_id == food.id, PickLog.user_id == DEFAULT_TEMPLATE_USER_ID))
    db.delete(food)
    db.commit()


def _get_user_food(db: Session, food_id: int) -> Food:
    food = db.scalar(
        select(Food)
        .options(joinedload(Food.user))
        .where(Food.id == food_id, Food.user_id != DEFAULT_TEMPLATE_USER_ID)
    )
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")

    return food


def _ensure_can_manage_user_food(current_user: User, food: Food) -> None:
    if _is_admin(current_user) or food.user_id == current_user.id:
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only manage your own foods")


@router.get("/user-foods", response_model=list[AdminUserFoodListItem])
def list_user_foods(
    q: str | None = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AdminUserFoodListItem]:
    statement = (
        select(Food)
        .join(Food.user)
        .options(joinedload(Food.user))
        .where(Food.user_id != DEFAULT_TEMPLATE_USER_ID)
    )
    if q and q.strip():
        statement = statement.where(Food.name.contains(q.strip()))

    foods = db.scalars(statement.order_by(Food.created_at.desc(), Food.id.desc())).all()
    return [
        AdminUserFoodListItem(
            id=food.id,
            name=food.name,
            image_url=food.image_url,
            category=food.category,
            is_active=food.is_active,
            created_at=food.created_at,
            updated_at=food.updated_at,
            user_id=food.user_id,
            username=food.user.username,
        )
        for food in foods
    ]


@router.patch("/user-foods/{food_id}", response_model=AdminUserFoodListItem)
def update_user_food(
    food_id: int,
    payload: FoodUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminUserFoodListItem:
    food = _get_user_food(db, food_id)
    _ensure_can_manage_user_food(current_user, food)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(food, field, value)

    db.commit()
    db.refresh(food)
    return AdminUserFoodListItem(
        id=food.id,
        name=food.name,
        image_url=food.image_url,
        category=food.category,
        is_active=food.is_active,
        created_at=food.created_at,
        updated_at=food.updated_at,
        user_id=food.user_id,
        username=food.user.username,
    )


@router.delete("/user-foods/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_food(
    food_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    food = _get_user_food(db, food_id)
    _ensure_can_manage_user_food(current_user, food)
    db.execute(delete(PickLog).where(PickLog.food_id == food.id, PickLog.user_id == food.user_id))
    db.delete(food)
    db.commit()
