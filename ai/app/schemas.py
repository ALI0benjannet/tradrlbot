"""Schémas Pydantic des requêtes/réponses de l'API IA."""
from typing import Any

from pydantic import BaseModel


class ChatRequest(BaseModel):
    text: str


class ChatResponse(BaseModel):
    intent: str
    response: str
    sentiment: str


class AnalyzeRequest(BaseModel):
    text: str


class AnalyzeResponse(BaseModel):
    text: str
    intent: str
    category: str
    color: str
    confidence: float
    entities: dict[str, Any]
    verb_object_pairs: list[dict[str, str]]
    priority: int
    participants: list[str]
    title: str
    sentiment: dict[str, Any]
    assignment: dict[str, Any]
    engine: str


class ActionIntentRequest(BaseModel):
    text: str
    active: str | None = None  # contexte (onglet actif : tasks, reminders, agenda…)


class ActionIntentResponse(BaseModel):
    action: str   # add | delete | complete | list | update | unknown
    target: str | None
    content: str
    query: str
    engine: str


class STTRequest(BaseModel):
    audio: str  # audio encodé en base64
    mime: str = "audio/webm"  # type MIME de l'audio enregistré


class STTResponse(BaseModel):
    text: str


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


class TTSResponse(BaseModel):
    audio: str  # audio encodé en base64
