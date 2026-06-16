"""STT — Speech To Text (Voix → Texte).

Implémentation par défaut : OpenAI Whisper API.
Pour du 100% local, décommenter faster-whisper dans requirements.txt
et utiliser la branche locale ci-dessous.
"""
import base64
import io

from .config import get_settings


def transcribe(audio_b64: str) -> str:
    settings = get_settings()
    if not audio_b64:
        return ""

    audio_bytes = base64.b64decode(audio_b64)

    if settings.openai_api_key:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        buffer = io.BytesIO(audio_bytes)
        buffer.name = "audio.webm"
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=buffer,
        )
        return result.text

    # --- Variante locale (faster-whisper) ---
    # from faster_whisper import WhisperModel
    # model = WhisperModel(settings.whisper_model)
    # segments, _ = model.transcribe(io.BytesIO(audio_bytes))
    # return " ".join(s.text for s in segments)

    return "[STT indisponible : aucune clé API et aucun modèle local configuré]"
