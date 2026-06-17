"""nlp_pipeline.py — Pipeline NLP complet (remplace le LLM).

Assemble NLU (intention), spaCy (entités/structure) et l'analyse avancée
(sentiment/assignation) en un seul résultat, et génère une réponse en
langage naturel sans appel à un LLM.
"""
from __future__ import annotations

from typing import Any

from .nlu import classify
from .spacy_extractor import extract
from .nlp_advanced import analyze as analyze_advanced


def analyze(text: str) -> dict[str, Any]:
    """Analyse NLP complète d'un énoncé utilisateur."""
    intent = classify(text)
    extraction = extract(text)
    advanced = analyze_advanced(text, extraction["participants"])

    return {
        "text": text,
        "intent": intent["intent"],
        "category": intent["category"],
        "color": intent["color"],
        "confidence": intent["confidence"],
        "entities": extraction["entities"],
        "verb_object_pairs": extraction["verb_object_pairs"],
        "priority": extraction["priority"],
        "participants": extraction["participants"],
        "title": extraction["title"],
        "sentiment": advanced["sentiment"],
        "assignment": advanced["assignment"],
        "engine": extraction["engine"],
    }


def generate_reply(text: str, context: str = "", intent: str | None = None) -> str:
    """Génère une réponse en langage naturel à partir de l'analyse NLP.

    Remplace le LLM : déterministe, hors-ligne, sans clé API.
    """
    result = analyze(text)
    category = result["category"]
    participants = result["participants"]
    priority = result["priority"]
    title = result["title"]

    parts: list[str] = []

    if category == "tasks":
        msg = f"Tâche notée : « {title} »"
        if participants:
            msg += f" (avec {', '.join(participants)})"
        if priority >= 4:
            msg += " — priorité élevée"
        parts.append(msg + ".")
    elif category == "calendar":
        msg = f"Événement planifié : « {title} »"
        if result["assignment"]["deadline"]:
            msg += f" — {result['assignment']['deadline']}"
        parts.append(msg + ".")
    elif category == "communication":
        target = participants[0] if participants else "le destinataire"
        parts.append(f"Message préparé pour {target}.")
    elif category == "developer":
        parts.append(f"Demande développeur comprise : « {title} ».")
    elif category == "companion":
        emotion = result["sentiment"]["emotion"]
        if emotion == "positive":
            parts.append("Ravi de l'entendre ! Que puis-je faire pour toi ?")
        elif emotion == "negative":
            parts.append("Je suis là pour t'aider. Dis-moi ce qui ne va pas.")
        else:
            parts.append("Bonjour ! Comment puis-je t'aider ?")
    else:
        parts.append(f"J'ai compris : « {title} » (intention : {result['intent']}).")

    return " ".join(parts)
