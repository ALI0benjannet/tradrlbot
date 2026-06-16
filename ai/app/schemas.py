"""Schémas Pydantic des requêtes/réponses de l'API IA."""
from pydantic import BaseModel


class ChatRequest(BaseModel):
    text: str


class ChatResponse(BaseModel):
    intent: str
    response: str
    sentiment: str


class STTRequest(BaseModel):
    audio: str  # audio encodé en base64


class STTResponse(BaseModel):
    text: str


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


class TTSResponse(BaseModel):
    audio: str  # audio encodé en base64
