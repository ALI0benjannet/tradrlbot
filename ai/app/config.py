"""Configuration centralisée de la couche IA."""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    tts_provider: str = os.getenv("TTS_PROVIDER", "openai")
    tts_voice: str = os.getenv("TTS_VOICE", "alloy")
    chroma_path: str = os.getenv("CHROMA_PATH", "./data/chroma")


@lru_cache
def get_settings() -> Settings:
    return Settings()
