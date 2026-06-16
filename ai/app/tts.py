"""TTS — Text To Speech (Texte → Voix).

Renvoie l'audio encodé en base64. Provider par défaut : OpenAI.
"""
import base64

from .config import get_settings


def synthesize(text: str, voice: str | None = None) -> str:
    settings = get_settings()
    voice = voice or settings.tts_voice

    if not text:
        return ""

    if settings.tts_provider == "openai" and settings.openai_api_key:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
        )
        audio_bytes = response.read()
        return base64.b64encode(audio_bytes).decode("utf-8")

    # Aucun provider TTS configuré : la voix sera synthétisée côté navigateur
    # (Web Speech API) en repli.
    return ""
