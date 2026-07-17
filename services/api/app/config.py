from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    api_service_name: str = "SentinelOps API"
    api_version: str = "0.1.0"
    environment: str = "development"
    database_url: str = "sqlite:///./data/sentinelops.db"
    redis_url: str = "redis://127.0.0.1:6379/0"
    cors_origins: str = "http://localhost:3000"
    telemetry_stream_name: str = "telemetry:events"
    telemetry_stream_maxlen: int = 500
    telemetry_producer_enabled: bool = True
    telemetry_producer_interval_seconds: float = 1.0
    incident_detector_enabled: bool = True
    llm_provider: str = "gemini"
    gemini_model: str = "gemini-2.5-flash"
    gemini_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def resolved_database_url(self) -> str:
        if self.database_url.startswith("sqlite:///./"):
            relative_path = self.database_url.removeprefix("sqlite:///./")
            absolute_path = (API_ROOT / relative_path).resolve()
            return f"sqlite:///{absolute_path.as_posix()}"

        return self.database_url

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
