"""Configuration centralisée de la couche IA."""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    # Compréhension : NLP local par défaut. Mettre USE_LLM=true pour réactiver GPT.
    use_llm: bool = os.getenv("USE_LLM", "false").lower() in {"1", "true", "yes", "on"}

    # --- Compréhension d'intention (ajouter / supprimer un rdv, tâche, rappel…) ---
    # Gemini est gratuit (clé sur https://aistudio.google.com/apikey). C'est le
    # fournisseur prioritaire ; OpenAI sert de secours ; sinon repli local (regex).
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    # "auto" = Gemini puis OpenAI puis règles. Forcer avec "gemini" / "openai" / "rules".
    intent_provider: str = os.getenv("INTENT_PROVIDER", "auto")

    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    tts_provider: str = os.getenv("TTS_PROVIDER", "openai")
    tts_voice: str = os.getenv("TTS_VOICE", "alloy")
    chroma_path: str = os.getenv("CHROMA_PATH", "./data/chroma")


@lru_cache
def get_settings() -> Settings:
    return Settings()
