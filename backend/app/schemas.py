from datetime import datetime
import re

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


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    created_at: datetime


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
