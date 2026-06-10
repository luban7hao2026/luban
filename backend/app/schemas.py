from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FoodBase(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    image_url: str | None = None
    category: str | None = Field(default=None, max_length=16)
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not re.search(r"[\u4e00-\u9fffa-zA-Z]", value):
            raise ValueError("Food name must contain Chinese characters or letters")
        if re.search(r"[<>\[\]{}]", value):
            raise ValueError("Food name contains unsupported symbols")
        return value

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            return None
        if not re.search(r"[\u4e00-\u9fffa-zA-Z]", value):
            raise ValueError("Category must contain Chinese characters or letters")
        if re.search(r"[<>\[\]{}]", value):
            raise ValueError("Category contains unsupported symbols")
        return value


class FoodCreate(FoodBase):
    pass


class FoodUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=30)
    image_url: str | None = None
    category: str | None = Field(default=None, max_length=16)
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return FoodBase.validate_name(value)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        return FoodBase.validate_category(value)


class FoodOut(FoodBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class UploadOut(BaseModel):
    image_url: str


class ImageDownloadIn(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class ImageSearchResult(BaseModel):
    title: str
    url: str
    thumb_url: str
    source: str


class PickLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    food_id: int
    picked_at: datetime
    food: FoodOut


class PickLogDeleteIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=100)


class PickLogDeleteOut(BaseModel):
    deleted: int


class RandomPickOut(BaseModel):
    food: FoodOut
    log: PickLogOut


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[a-zA-Z0-9_\-\u4e00-\u9fff]+", value):
            raise ValueError("Username can contain letters, numbers, underscores, hyphens, or Chinese characters")
        return value


class UserLogin(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip()


class UserPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AdminUserListItem(BaseModel):
    id: int
    username: str
    role: str
    last_login_at: datetime | None = None
    created_at: datetime
    food_count: int
    pick_log_count: int
    is_active: bool


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserRoleUpdate(BaseModel):
    role: Literal["admin", "user"]


class AdminUserPasswordReset(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class AdminUserFoodListItem(FoodOut):
    user_id: int
    username: str


class AdminCommonFoodItem(BaseModel):
    name: str
    image_url: str | None = None
    count: int


class AdminDashboardStats(BaseModel):
    user_count: int
    food_count: int
    common_foods: list[AdminCommonFoodItem]
