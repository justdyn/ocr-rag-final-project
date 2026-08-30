"""Application settings loaded from environment / `.env` (PRD §2)."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# backend/ is the working directory for uvicorn / alembic
BACKEND_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(BACKEND_ROOT / ".env")


class Settings(BaseModel):
    """Process-level settings. Secrets come from env; no demo secrets in code."""

    # Product placeholder (PRD §9 Open Item #1)
    app_name: str = Field(default="docintel")

    # Database — async SQLite default; Postgres-compatible URL shape
    database_url: str = Field(
        default=f"sqlite+aiosqlite:///{(BACKEND_ROOT / 'data' / 'docintel.db').as_posix()}"
    )
    # WAL is the default: multi-file upload is a real concurrent-writer load.
    # Override with DATABASE_ENABLE_SQLITE_WAL=0 to keep DELETE journal mode.
    database_enable_sqlite_wal: bool = Field(default=True)
    # Per-connection lock wait (ms). SQLite's own default is 0 (fail immediately).
    sqlite_busy_timeout_ms: int = Field(default=8000)

    # Storage paths
    data_dir: Path = Field(default=BACKEND_ROOT / "data")
    upload_dir: Path = Field(default=BACKEND_ROOT / "data" / "uploads")
    chroma_persist_dir: Path = Field(default=BACKEND_ROOT / "data" / "chroma")

    # JWT (tables ready; issuance logic comes later)
    jwt_secret: str = Field(default="change-me-in-production")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expire_minutes: int = Field(default=60 * 24 * 7)

    # OCR provider switch (PRD §3.2): tesseract | cloud
    ocr_engine: str = Field(default="tesseract")

    # Upload limits (PRD does not specify; 25 MiB chosen for FYP demo)
    max_upload_bytes: int = Field(default=25 * 1024 * 1024)

    # Embedding / chunking defaults
    embedding_model: str = Field(default="all-MiniLM-L6-v2")
    chunk_size: int = Field(default=1000)
    chunk_overlap: int = Field(default=100)

    # Hybrid retrieval defaults (consumed by later steps)
    rrf_constant: int = Field(default=60)
    bm25_weight: float = Field(default=0.5)
    vector_weight: float = Field(default=0.5)

    # LLM (OpenAI-compatible cloud API — PRD §2.1 / Step 5)
    llm_api_key: str | None = Field(default=None)
    llm_model: str = Field(default="gpt-4o-mini")
    llm_base_url: str = Field(default="https://api.openai.com/v1")
    llm_timeout_seconds: float = Field(default=120.0)
    # How many retrieved chunks to inject into the chat prompt
    chat_retrieval_k: int = Field(default=5)

    def ensure_data_dirs(self) -> None:
        """Create local data directories if missing (dev-friendly)."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_persist_dir.mkdir(parents=True, exist_ok=True)


def _path_from_env(key: str, default: Path) -> Path:
    raw = os.getenv(key, "").strip()
    if not raw:
        return default
    path = Path(raw)
    return path if path.is_absolute() else (BACKEND_ROOT / path)


def _env_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


@lru_cache
def get_settings() -> Settings:
    default_db = f"sqlite+aiosqlite:///{(BACKEND_ROOT / 'data' / 'docintel.db').as_posix()}"
    settings = Settings(
        app_name=os.getenv("APP_NAME", "docintel"),
        database_url=os.getenv("DATABASE_URL", default_db),
        database_enable_sqlite_wal=_env_bool("DATABASE_ENABLE_SQLITE_WAL", True),
        sqlite_busy_timeout_ms=int(os.getenv("SQLITE_BUSY_TIMEOUT_MS", "8000")),
        data_dir=_path_from_env("DATA_DIR", BACKEND_ROOT / "data"),
        upload_dir=_path_from_env("UPLOAD_DIR", BACKEND_ROOT / "data" / "uploads"),
        chroma_persist_dir=_path_from_env(
            "CHROMA_PERSIST_DIR", BACKEND_ROOT / "data" / "chroma"
        ),
        jwt_secret=os.getenv("JWT_SECRET", "change-me-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24 * 7))),
        ocr_engine=os.getenv("OCR_ENGINE", "tesseract"),
        max_upload_bytes=int(
            os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))
        ),
        embedding_model=os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        chunk_size=int(os.getenv("CHUNK_SIZE", "1000")),
        chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "100")),
        rrf_constant=int(os.getenv("RRF_CONSTANT", "60")),
        bm25_weight=float(os.getenv("BM25_WEIGHT", "0.5")),
        vector_weight=float(os.getenv("VECTOR_WEIGHT", "0.5")),
        llm_api_key=(os.getenv("LLM_API_KEY") or "").strip() or None,
        llm_model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        llm_base_url=os.getenv(
            "LLM_BASE_URL", "https://api.openai.com/v1"
        ).rstrip("/"),
        llm_timeout_seconds=float(os.getenv("LLM_TIMEOUT_SECONDS", "120")),
        chat_retrieval_k=int(os.getenv("CHAT_RETRIEVAL_K", "5")),
    )
    settings.ensure_data_dirs()
    return settings
