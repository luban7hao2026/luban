from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Food, PickLog, User
from app.schemas import AdminUserListItem, AdminUserStatusUpdate, FoodCreate, FoodOut, FoodUpdate, UserOut
from app.security import get_current_admin


router = APIRouter(prefix="/admin", tags=["admin"])
DEFAULT_TEMPLATE_USER_ID = 1


@router.get("/users", response_model=list[AdminUserListItem])
def list_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
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
        .where(User.role != "admin")
        .order_by(User.created_at.desc(), User.id.desc())
    ).all()

    return [
        AdminUserListItem(
            id=user.id,
            username=user.username,
            created_at=user.created_at,
            food_count=food_counts.get(user.id, 0),
            pick_log_count=pick_log_counts.get(user.id, 0),
            is_active=user.is_active,
        )
        for user in users
    ]


def _get_managed_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.role == "admin":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return user


@router.patch("/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    payload: AdminUserStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> User:
    user = _get_managed_user(db, user_id)
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> None:
    user = _get_managed_user(db, user_id)
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
    current_admin: User = Depends(get_current_admin),
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
