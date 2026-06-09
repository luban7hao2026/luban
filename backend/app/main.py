from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import Base, engine
from app.routes import auth, foods, picks


settings = get_settings()

app = FastAPI(title="Random Lunch API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth.router)
app.include_router(foods.router)
app.include_router(picks.router)


@app.on_event("startup")
def on_startup() -> None:
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
