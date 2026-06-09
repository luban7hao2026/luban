from functools import lru_cache
import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL",
            "mysql+pymysql://root:password@localhost:3306/random_lunch?charset=utf8mb4",
        )
        self.auto_create_tables = os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true"
        self.upload_dir = os.getenv("UPLOAD_DIR", "app/uploads")
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if origin.strip()
        ]
        self.auth_secret = os.getenv("AUTH_SECRET", "change-me-in-production")
        self.access_token_minutes = int(os.getenv("ACCESS_TOKEN_MINUTES", "10080"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
