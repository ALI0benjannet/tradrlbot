"""Analyse de sentiment légère (règles + lexique).

Renvoie : 'positif', 'négatif' ou 'neutre'. Remplaçable par VADER ou
un modèle transformeur pour plus de précision.
"""
POSITIVE = {"merci", "super", "génial", "parfait", "bien", "content", "j'aime", "excellent", "cool"}
NEGATIVE = {"problème", "bug", "nul", "erreur", "pas", "jamais", "déçu", "mauvais", "lent", "horrible"}


def analyze_sentiment(text: str) -> str:
    tokens = set(text.lower().split())
    pos = len(tokens & POSITIVE)
    neg = len(tokens & NEGATIVE)
    if pos > neg:
        return "positif"
    if neg > pos:
        return "négatif"
    return "neutre"
