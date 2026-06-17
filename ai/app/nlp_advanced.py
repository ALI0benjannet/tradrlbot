"""nlp_advanced.py — Analyse avancée : sentiment, émotion, assignation.

Combine TextBlob (polarity + subjectivity) avec un lexique français pour
fournir :
  - sentiment : polarity (-1..1), subjectivity (0..1) ;
  - emotion : 'positive' / 'negative' / 'neutral' ;
  - assignment : qui fait quoi + échéance détectée.

Tout est hors-ligne. Si TextBlob est absent, repli sur un lexique français.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

# Lexique français de secours (si TextBlob indisponible).
POSITIVE_FR = {
    "merci", "super", "génial", "genial", "parfait", "bien", "content",
    "excellent", "cool", "bravo", "top", "formidable", "j'aime", "adore",
}
NEGATIVE_FR = {
    "problème", "probleme", "bug", "nul", "erreur", "pas", "jamais",
    "déçu", "decu", "mauvais", "lent", "horrible", "déteste", "deteste",
    "catastrophe", "impossible",
}

# Marqueurs d'échéance.
DEADLINE_RE = re.compile(
    r"\b(aujourd'hui|demain|après-demain|apres-demain|ce soir|ce matin|"
    r"cette semaine|semaine prochaine|lundi|mardi|mercredi|jeudi|vendredi|"
    r"samedi|dimanche|avant\s+\w+|à\s+\d{1,2}h\d{0,2}|a\s+\d{1,2}h\d{0,2}|"
    r"\d{1,2}h\d{0,2})\b",
    re.IGNORECASE,
)


@lru_cache(maxsize=1)
def _textblob_available() -> bool:
    try:
        import textblob  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def analyze_sentiment(text: str) -> dict[str, Any]:
    """Sentiment détaillé : polarity, subjectivity, label."""
    if _textblob_available():
        try:
            from textblob import TextBlob

            blob = TextBlob(text)
            polarity = round(float(blob.sentiment.polarity), 3)
            subjectivity = round(float(blob.sentiment.subjectivity), 3)
            # TextBlob est anglo-centré : on renforce avec le lexique FR.
            polarity = _blend_with_fr_lexicon(text, polarity)
            return {
                "polarity": polarity,
                "subjectivity": subjectivity,
                "emotion": _emotion_from_polarity(polarity),
                "engine": "textblob",
            }
        except Exception:  # noqa: BLE001
            pass

    # Repli : lexique français pur.
    polarity = _fr_lexicon_polarity(text)
    return {
        "polarity": polarity,
        "subjectivity": 0.5,
        "emotion": _emotion_from_polarity(polarity),
        "engine": "lexicon-fr",
    }


def _fr_lexicon_polarity(text: str) -> float:
    tokens = set(text.lower().split())
    pos = len(tokens & POSITIVE_FR)
    neg = len(tokens & NEGATIVE_FR)
    total = pos + neg
    if total == 0:
        return 0.0
    return round((pos - neg) / total, 3)


def _blend_with_fr_lexicon(text: str, polarity: float) -> float:
    """Ajuste la polarity TextBlob avec le signal du lexique français."""
    fr = _fr_lexicon_polarity(text)
    if fr == 0.0:
        return polarity
    return round((polarity + fr) / 2, 3)


def _emotion_from_polarity(polarity: float) -> str:
    if polarity > 0.15:
        return "positive"
    if polarity < -0.15:
        return "negative"
    return "neutral"


def detect_assignment(text: str, participants: list[str] | None = None) -> dict[str, Any]:
    """Détecte qui fait quoi + l'échéance (« appelle Alice demain »)."""
    assignee = participants[0] if participants else None
    if assignee is None:
        m = re.search(r"\b(?:avec|à|a|pour)\s+([A-ZÉÈ][a-zéèêà]+)", text)
        if m:
            assignee = m.group(1)

    deadline_match = DEADLINE_RE.search(text)
    deadline = deadline_match.group(0) if deadline_match else None

    # Action principale = premier verbe à l'infinitif/impératif détecté.
    action = None
    m = re.match(r"\s*([a-zàâéèêëîïôûùç]+)", text.lower())
    if m:
        action = m.group(1)

    return {
        "assignee": assignee,
        "deadline": deadline,
        "action": action,
        "has_assignment": assignee is not None,
    }


def analyze(text: str, participants: list[str] | None = None) -> dict[str, Any]:
    """Analyse avancée complète."""
    sentiment = analyze_sentiment(text)
    assignment = detect_assignment(text, participants)
    return {
        "sentiment": sentiment,
        "assignment": assignment,
    }
