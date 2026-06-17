"""NLU — détection d'intention (Natural Language Understanding).

Approche par règles rapides (hors-ligne) renvoyant une intention normalisée,
une catégorie (pour l'UI) et un score de confiance simple.
"""
import re

# (intention, catégorie UI, motif regex)
INTENT_PATTERNS = [
    ("system.control", "desktop", r"\b(volume|son|luminosit|ouvre|lance|ferme|éteins|verrouille|fenêtre)\b"),
    ("calendar.query", "calendar", r"\b(rendez-vous|agenda|calendrier|réunion|planning|réserve)\b"),
    ("email.action", "communication", r"\b(mail|email|courriel|gmail|envoie un message)\b"),
    ("messaging.send", "communication", r"\b(slack|teams|discord|message à)\b"),
    ("notes.action", "tasks", r"\b(note|notion|rappel|todo|tâche|tache)\b"),
    ("code.assist", "developer", r"\b(git|commit|code|bug|fonction|repo|déploie)\b"),
    ("smalltalk", "companion", r"\b(bonjour|salut|merci|comment vas-tu|ça va|blague)\b"),
]

# Couleur de badge par catégorie (cohérent avec l'UI).
CATEGORY_COLORS = {
    "desktop": "#3b82f6",
    "calendar": "#a855f7",
    "communication": "#06b6d4",
    "tasks": "#22d3ee",
    "developer": "#22c55e",
    "companion": "#ec4899",
    "general": "#6b7280",
}


def detect_intent(text: str) -> str:
    """Compat ascendante : renvoie l'étiquette d'intention seule."""
    return classify(text)["intent"]


def classify(text: str) -> dict:
    """Détection enrichie : intention + catégorie + couleur + confiance."""
    lowered = text.lower()
    for intent, category, pattern in INTENT_PATTERNS:
        matches = re.findall(pattern, lowered)
        if matches:
            confidence = min(1.0, 0.6 + 0.2 * len(matches))
            return {
                "intent": intent,
                "category": category,
                "color": CATEGORY_COLORS[category],
                "confidence": round(confidence, 2),
            }
    return {
        "intent": "general.query",
        "category": "general",
        "color": CATEGORY_COLORS["general"],
        "confidence": 0.3,
    }
