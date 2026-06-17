"""spacy_extractor.py — Extraction d'entités et de structure via spaCy.

Fournit (hors-ligne, sans LLM) :
  - NER : noms (PER), organisations (ORG), lieux (LOC), divers (MISC) ;
  - POS tagging + dependency parsing : couples « verbe → objet » ;
  - détection de priorité : URGENT (5) → normale (1) ;
  - extraction des participants : « avec Alice » → assignee ;
  - titre nettoyé (sans verbe d'action ni marqueurs de priorité/date).

Le modèle spaCy est chargé paresseusement. S'il est absent, un repli
par règles (regex) garde l'extraction fonctionnelle.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

SPACY_MODEL = "fr_core_news_md"

# Lexique de priorité : mot-clé -> niveau (5 = urgent, 1 = normal).
PRIORITY_LEXICON = {
    5: {"urgent", "urgentissime", "asap", "immediat", "immédiat", "critique", "tout de suite"},
    4: {"important", "prioritaire", "vite", "rapidement", "au plus vite"},
    3: {"bientot", "bientôt", "cette semaine", "aujourd'hui", "ce soir"},
    2: {"plus tard", "quand tu peux", "semaine prochaine"},
}

# Verbes d'action courants à retirer du titre nettoyé.
ACTION_VERBS = {
    "appelle", "appeler", "envoie", "envoyer", "rappelle", "rappeler",
    "cree", "créer", "crée", "ajoute", "ajouter", "planifie", "planifier",
    "organise", "organiser", "fais", "faire", "prepare", "prépare",
    "ecris", "écris", "note", "noter", "termine", "terminer", "finis",
}

# Marqueurs temporels à retirer du titre.
TIME_MARKERS = re.compile(
    r"\b(aujourd'hui|demain|apres-demain|après-demain|ce soir|ce matin|"
    r"cette semaine|semaine prochaine|lundi|mardi|mercredi|jeudi|vendredi|"
    r"samedi|dimanche|a \d{1,2}h\d{0,2}|à \d{1,2}h\d{0,2}|\d{1,2}h\d{0,2})\b",
    re.IGNORECASE,
)


def _strip_accents(s: str) -> str:
    import unicodedata

    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


@lru_cache(maxsize=1)
def _load_nlp():
    """Charge le modèle spaCy une fois (ou None si indisponible)."""
    try:
        import spacy

        return spacy.load(SPACY_MODEL)
    except Exception:  # noqa: BLE001 — modèle absent / spaCy non installé
        return None


def detect_priority(text: str) -> int:
    """Retourne un niveau de priorité de 1 (normal) à 5 (urgent)."""
    lowered = _strip_accents(text.lower())
    for level in sorted(PRIORITY_LEXICON, reverse=True):
        for kw in PRIORITY_LEXICON[level]:
            if _strip_accents(kw) in lowered:
                return level
    return 1


def extract_participants(text: str, persons: list[str] | None = None) -> list[str]:
    """Extrait les participants (« avec Alice », « à Bob ») + entités PER."""
    found: list[str] = []
    # 1) Noms précédés de avec/à/a/pour.
    for m in re.finditer(r"\b(?:avec|à|a|pour)\s+([A-ZÉÈ][a-zéèêà]+)", text):
        found.append(m.group(1))
    # 2) Repli (sans spaCy) : noms propres capitalisés non en tête de phrase.
    tokens = text.split()
    for i, tok in enumerate(tokens):
        clean = tok.strip(".,;:!?")
        if i > 0 and re.fullmatch(r"[A-ZÉÈ][a-zéèêà]+", clean):
            found.append(clean)
    # 3) Entités PER fournies par spaCy.
    for p in persons or []:
        if p not in found:
            found.append(p)
    # Déduplication en conservant l'ordre.
    seen: set[str] = set()
    return [x for x in found if not (x in seen or seen.add(x))]


def clean_title(text: str) -> str:
    """Nettoie le titre : retire verbe d'action initial, dates, priorité."""
    cleaned = text.strip()
    # Retire un verbe d'action en tête.
    tokens = cleaned.split()
    if tokens and _strip_accents(tokens[0].lower()) in {
        _strip_accents(v) for v in ACTION_VERBS
    }:
        tokens = tokens[1:]
    cleaned = " ".join(tokens)
    # Retire marqueurs temporels et de priorité.
    cleaned = TIME_MARKERS.sub("", cleaned)
    for kws in PRIORITY_LEXICON.values():
        for kw in kws:
            cleaned = re.sub(rf"\b{re.escape(kw)}\b", "", cleaned, flags=re.IGNORECASE)
    # Nettoyage final des espaces/ponctuation résiduels.
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,.;:-")
    return cleaned or text.strip()


def extract(text: str) -> dict[str, Any]:
    """Extraction complète : entités, dépendances, priorité, participants."""
    nlp = _load_nlp()

    persons: list[str] = []
    organizations: list[str] = []
    locations: list[str] = []
    misc: list[str] = []
    verb_object_pairs: list[dict[str, str]] = []

    if nlp is not None:
        doc = nlp(text)
        for ent in doc.ents:
            label = ent.label_.upper()
            if label in {"PER", "PERSON"}:
                persons.append(ent.text)
            elif label == "ORG":
                organizations.append(ent.text)
            elif label in {"LOC", "GPE"}:
                locations.append(ent.text)
            else:
                misc.append(ent.text)
        # Dependency parsing : couples verbe -> objet direct.
        for token in doc:
            if token.pos_ == "VERB":
                for child in token.children:
                    if child.dep_ in {"obj", "dobj", "nmod", "obl"}:
                        verb_object_pairs.append(
                            {"verb": token.lemma_, "object": child.text}
                        )

    return {
        "engine": "spacy" if nlp is not None else "rules",
        "entities": {
            "persons": persons,
            "organizations": organizations,
            "locations": locations,
            "misc": misc,
        },
        "verb_object_pairs": verb_object_pairs,
        "priority": detect_priority(text),
        "participants": extract_participants(text, persons),
        "title": clean_title(text),
    }
