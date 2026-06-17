"""
Couche IA — API FastAPI.
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
    AnalyzeRequest,
    AnalyzeResponse,
)
from app.stt import transcribe
from app.nlu import detect_intent
from app.tts import synthesize
from app.memory import remember, recall
from app.sentiment import analyze_sentiment
from app import nlp_pipeline
from app.config import get_settings

app = FastAPI(title="Tradrly AI Layer", version="0.2.0")

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

    # 2) Sentiment (étiquette simple, compat ascendante)
    sentiment = analyze_sentiment(req.text)

    # 3) ── Assistant développeur SANS LLM ──
    if intent == "code.assist":
        from app.code_assist import assister
        reply = assister(req.text)
        remember(req.text, reply)
        return ChatResponse(intent=intent, response=reply, sentiment=sentiment)

    # 4) Mémoire : contexte pertinent
    context = recall(req.text)

    # 5) Compréhension : NLP local par défaut, LLM seulement si activé + clé
    settings = get_settings()
    if settings.use_llm and settings.openai_api_key:
        from app.llm import generate_reply as llm_reply
        reply = llm_reply(req.text, context=context, intent=intent)
    else:
        reply = nlp_pipeline.generate_reply(req.text, context=context, intent=intent)

    # 6) Mémoire : on enregistre l'échange
    remember(req.text, reply)
    return ChatResponse(intent=intent, response=reply, sentiment=sentiment)


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    """Analyse NLP complète : entités, priorité, sentiment, assignation."""
    return AnalyzeResponse(**nlp_pipeline.analyze(req.text))


# Alias pour le module productivité (UI / orchestrateur).
@app.post("/productivity/analyze", response_model=AnalyzeResponse)
def productivity_analyze(req: AnalyzeRequest):
    return AnalyzeResponse(**nlp_pipeline.analyze(req.text))


@app.post("/api/tts", response_model=TTSResponse)
def tts(req: TTSRequest):
    audio_b64 = synthesize(req.text, voice=req.voice)
    return TTSResponse(audio=audio_b64)