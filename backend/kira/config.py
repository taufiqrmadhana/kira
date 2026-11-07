"""Environment settings shared by the API, services and agent."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "KIRA_DATABASE_URL", f"sqlite:///{ROOT / 'backend' / 'kira.db'}"
        )
    )
    model: str = field(default_factory=lambda: os.getenv("KIRA_MODEL", "deepseek/deepseek-chat"))
    ui_dir: Path = field(default_factory=lambda: ROOT / "web" / "dist")
    max_upload_mb: int = 10
    user: str = field(default_factory=lambda: os.getenv("KIRA_USER", "Nadia Aulia"))
    auth_user: str = field(default_factory=lambda: os.getenv("KIRA_USERNAME", "kira"))
    auth_password: str = field(default_factory=lambda: os.getenv("KIRA_PASSWORD", ""))
    secret: str = field(default_factory=lambda: os.getenv("KIRA_SECRET", ""))
    session_days: int = field(default_factory=lambda: int(os.getenv("KIRA_SESSION_DAYS", "14")))
    client_name: str = field(
        default_factory=lambda: os.getenv("KIRA_CLIENT_NAME", "Main workspace")
    )
    ai: bool = field(
        default_factory=lambda: (
            os.getenv("KIRA_AI", "on").lower() not in {"off", "false", "0", "no"}
        )
    )
    deepseek_api_key: str = field(default_factory=lambda: os.getenv("DEEPSEEK_API_KEY", ""))


settings = Settings()
