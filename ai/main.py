"""Couche IA — API FastAPI.

Expose STT, NLU, LLM, TTS, mémoire vectorielle et analyse de sentiment
à la couche Orchestration (Node.js) via HTTP localhost.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    ChatRequest,
    ChatResponse,
    STTRequest,
    STTResponse,
    TTSRequest,
    TTSResponse,
)
from app.stt import transcribe
from app.nlu import detect_intent
from app.llm import generate_reply
from app.tts import synthesize
from app.memory import remember, recall
from app.sentiment import analyze_sentiment

app = FastAPI(title="Tradrly AI Layer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "layer": "ai"}


@app.post("/api/stt", response_model=STTResponse)
def stt(req: STTRequest):
    text = transcribe(req.audio)
    return STTResponse(text=text)


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # 1) NLU : détection d'intention
    intent = detect_intent(req.text)
    # 2) Sentiment
    sentiment = analyze_sentiment(req.text)
    # 3) Mémoire : contexte pertinent
    context = recall(req.text)
    # 4) LLM : génération de la réponse
    reply = generate_reply(req.text, context=context, intent=intent)
    # 5) Mémoire : on enregistre l'échange
    remember(req.text, reply)
    return ChatResponse(intent=intent, response=reply, sentiment=sentiment)


@app.post("/api/tts", response_model=TTSResponse)
def tts(req: TTSRequest):
    audio_b64 = synthesize(req.text, voice=req.voice)
    return TTSResponse(audio=audio_b64)
