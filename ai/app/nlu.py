"""NLU — détection d'intention (Natural Language Understanding).

Approche hybride : règles rapides par mots-clés, extensible vers un
classifieur ML. Renvoie une étiquette d'intention normalisée.
"""
import re

INTENT_PATTERNS = [
    ("system.control", r"\b(volume|son|luminosit|ouvre|lance|ferme|éteins)\b"),
    ("calendar.query", r"\b(rendez-vous|agenda|calendrier|réunion|planning)\b"),
    ("email.action", r"\b(mail|email|courriel|gmail|envoie un message)\b"),
    ("messaging.send", r"\b(slack|teams|discord|message à)\b"),
    ("notes.action", r"\b(note|notion|rappel|todo|tâche)\b"),
    ("code.assist", r"\b(git|commit|code|bug|fonction|repo)\b"),
    ("smalltalk", r"\b(bonjour|salut|merci|comment vas-tu|ça va)\b"),
]


def detect_intent(text: str) -> str:
    lowered = text.lower()
    for intent, pattern in INTENT_PATTERNS:
        if re.search(pattern, lowered):
            return intent
    return "general.query"
