from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Food, PickLog, User
from app.schemas import PickLogDeleteIn, PickLogDeleteOut, PickLogOut, RandomPickOut
from app.security import get_active_user, get_current_user


router = APIRouter(prefix="/picks", tags=["picks"])


@router.post("/random", response_model=RandomPickOut)
def pick_random_food(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
) -> RandomPickOut:
    food = db.scalars(
        select(Food)
        .where(Food.user_id == current_user.id, Food.is_active.is_(True))
        .order_by(func.rand())
        .limit(1)
    ).first()

    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active foods available",
        )

    log = PickLog(food_id=food.id, user_id=current_user.id)
    db.add(log)
    db.commit()
    db.refresh(log)
    db.refresh(food)

    log.food = food
    return RandomPickOut(food=food, log=log)


@router.get("/logs", response_model=list[PickLogOut])
def list_pick_logs(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PickLog]:
    return list(
        db.scalars(
            select(PickLog)
            .options(joinedload(PickLog.food))
            .where(PickLog.user_id == current_user.id)
            .order_by(PickLog.picked_at.desc())
            .limit(limit)
        )
    )


@router.post("/logs/delete", response_model=PickLogDeleteOut)
def delete_pick_logs(
    payload: PickLogDeleteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_active_user),
) -> PickLogDeleteOut:
    unique_ids = list(dict.fromkeys(payload.ids))
    result = db.execute(delete(PickLog).where(PickLog.id.in_(unique_ids), PickLog.user_id == current_user.id))
    db.commit()
    return PickLogDeleteOut(deleted=result.rowcount or 0)
