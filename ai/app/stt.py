"""STT — Speech To Text (Voix → Texte).

Priorité : faster-whisper LOCAL (gratuit, hors-ligne, sans quota) → Gemini → OpenAI.
La couche UI enregistre l'audio (MediaRecorder) et l'envoie encodé en base64.
"""
import base64
import io
import os
import tempfile

from .config import get_settings

# Modèle Whisper chargé une seule fois (coûteux à initialiser) puis réutilisé.
_whisper_model = None


def _get_whisper(settings):
    """Charge (paresseusement) le modèle faster-whisper et le met en cache."""
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        # device=cpu + compute_type=int8 : rapide et léger, fonctionne partout.
        _whisper_model = WhisperModel(
            settings.whisper_model,
            device="cpu",
            compute_type=settings.whisper_compute,
        )
    return _whisper_model


def warm_up_whisper() -> None:
    """Précharge le modèle Whisper (télécharge si besoin) pour éviter tout
    blocage long au premier appel de transcription."""
    settings = get_settings()
    provider = (getattr(settings, "stt_provider", "local") or "local").lower()
    if provider in ("gemini", "openai"):
        return
    try:
        _get_whisper(settings)
        print("[STT] Modèle faster-whisper prêt.")
    except Exception as exc:  # pragma: no cover - dépend de l'installation
        print(f"[STT] Préchargement faster-whisper impossible : {exc}")


def _ext_for_mime(mime: str) -> str:
    """Devine une extension de fichier à partir du type MIME audio."""
    m = (mime or "").lower()
    if "webm" in m:
        return ".webm"
    if "ogg" in m or "opus" in m:
        return ".ogg"
    if "wav" in m:
        return ".wav"
    if "mp4" in m or "m4a" in m or "aac" in m:
        return ".m4a"
    if "mpeg" in m or "mp3" in m:
        return ".mp3"
    return ".webm"


def _transcribe_local(audio_bytes: bytes, mime: str, settings) -> str | None:
    """Transcription 100% locale via faster-whisper. Détecte la langue (fr/ar/en…).

    On écrit l'audio dans un fichier temporaire : ffmpeg (via PyAV) décode bien
    plus fiablement un fichier qu'un flux mémoire, notamment le webm/opus produit
    par MediaRecorder qui peut manquer d'en-têtes de durée.
    """
    tmp_path = None
    try:
        model = _get_whisper(settings)
        with tempfile.NamedTemporaryFile(
            suffix=_ext_for_mime(mime), delete=False
        ) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        # Pas de langue forcée : Whisper auto-détecte (la traduction se fait ensuite
        # côté compréhension d'intention via Gemini).
        segments, _info = model.transcribe(tmp_path, beam_size=1)
        text = " ".join(seg.text for seg in segments).strip()
        return text or None
    except Exception as exc:  # pragma: no cover - dépend de l'installation
        print(f"[STT] faster-whisper indisponible : {exc}")
        return None
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _transcribe_gemini(audio_bytes: bytes, mime: str, settings) -> str | None:
    """Transcription via Gemini (accepte l'audio en entrée). Réutilise la clé existante."""
    if not settings.gemini_api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        resp = model.generate_content([
            (
                "Transcris fidèlement cet audio en français. "
                "Réponds UNIQUEMENT avec le texte transcrit, sans guillemets ni commentaire."
            ),
            {"mime_type": mime, "data": audio_bytes},
        ])
        text = (resp.text or "").strip()
        return text or None
    except Exception as exc:  # pragma: no cover - dépend du réseau/clé
        print(f"[STT] Gemini indisponible : {exc}")
        return None


def _transcribe_openai(audio_bytes: bytes, settings) -> str | None:
    """Repli : OpenAI Whisper (nécessite OPENAI_API_KEY)."""
    if not settings.openai_api_key:
        return None
    try:
        import io

        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        buffer = io.BytesIO(audio_bytes)
        buffer.name = "audio.webm"
        result = client.audio.transcriptions.create(model="whisper-1", file=buffer)
        return (result.text or "").strip() or None
    except Exception as exc:  # pragma: no cover
        print(f"[STT] OpenAI indisponible : {exc}")
        return None


def transcribe(audio_b64: str, mime: str = "audio/webm") -> str:
    settings = get_settings()
    if not audio_b64:
        return ""

    # Certains navigateurs envoient une Data URL : on retire le préfixe éventuel.
    if "," in audio_b64 and audio_b64.strip().startswith("data:"):
        header, audio_b64 = audio_b64.split(",", 1)
        if "audio/" in header:
            mime = header.split(";")[0].replace("data:", "") or mime

    audio_bytes = base64.b64decode(audio_b64)

    provider = (getattr(settings, "stt_provider", "local") or "local").lower()

    # 0) STT LOCAL (faster-whisper) en priorité : gratuit, hors-ligne, sans quota.
    if provider != "gemini" and provider != "openai":
        text = _transcribe_local(audio_bytes, mime, settings)
        if text:
            return text

    # 1) Gemini (en ligne) puis 2) OpenAI Whisper (replis)
    text = _transcribe_gemini(audio_bytes, mime, settings)
    if text:
        return text

    text = _transcribe_openai(audio_bytes, settings)
    if text:
        return text

    # Dernier recours : si le local n'a pas encore été tenté (provider forcé en ligne).
    text = _transcribe_local(audio_bytes, mime, settings)
    if text:
        return text

    return "[STT indisponible : installe faster-whisper ou configure une clé IA]"
