"""Compréhension d'intention pour la productivité.

Transforme une phrase libre ("supprime le rdv de demain", "ajoute une tâche
acheter du pain", "j'ai réunion lundi à 14h") en une ACTION structurée :

    {
      "action": "add" | "delete" | "complete" | "list" | "unknown",
      "target": "tasks" | "reminders" | "agenda" | "pomodoro" | "projects" | null,
      "content": "...",   # texte nettoyé à ajouter (action=add)
      "query":   "...",   # texte servant à retrouver l'élément (action=delete/complete)
      "engine":  "gemini" | "openai" | "rules"
    }

Priorité : Gemini (gratuit) → OpenAI → repli local par règles (regex).
"""
from __future__ import annotations

import json
import re

from .config import get_settings

ACTIONS = {"add", "delete", "complete", "list", "unknown"}
TARGETS = {"tasks", "reminders", "agenda", "pomodoro", "projects"}

# Mots-clés -> cible (utilisés par le repli local et pour deviner la cible)
TARGET_KEYWORDS = {
    "agenda": r"\b(rdv|rendez-?vous|r[ée]union|agenda|calendrier|meeting|event|[ée]v[ée]nement)\b",
    "reminders": r"\b(rappel|rappelle|alarme|pr[ée]viens|n'oublie\s+pas)\b",
    "tasks": r"\b(t[âa]che|todo|to-?do|faire|liste)\b",
    "pomodoro": r"\b(pomodoro|focus|concentration|minuteur)\b",
    "projects": r"\b(projet|chantier|suivi)\b",
}

ADD_KEYWORDS = r"\b(ajoute|ajouter|cr[ée]e?|cr[ée]er|nouvelle?|nouveau|planifie|programme|note|j'ai|jai|met|mets|ajout)\b"
DELETE_KEYWORDS = r"\b(supprime|supprimer|enl[èe]ve|enlever|retire|retirer|efface|effacer|annule|annuler|supprim)\b"
COMPLETE_KEYWORDS = r"\b(termin[ée]?|fini[es]?|fait[es]?|coch[ée]?|valide|valider|accompli)\b"
LIST_KEYWORDS = r"\b(liste|affiche|montre|voir|quels?|quelles?)\b"

SYSTEM_INSTRUCTION = (
    "Tu es un routeur d'intention pour une application de productivité en français. "
    "À partir d'une phrase de l'utilisateur, renvoie UNIQUEMENT un objet JSON valide "
    "(sans texte autour, sans balises markdown) avec ces clés :\n"
    '- "action" : un de "add", "delete", "complete", "list", "unknown".\n'
    '- "target" : un de "tasks", "reminders", "agenda", "pomodoro", "projects" ou null.\n'
    '- "content" : pour "add", le texte de l\'élément à créer (sans le verbe d\'action). '
    "Conserve les dates/heures (ex: \"lundi à 14h\").\n"
    '- "query" : pour "delete"/"complete", les mots qui identifient l\'élément visé.\n\n'
    "Règles : 'tâche/todo' -> tasks ; 'rappel/alarme' -> reminders ; "
    "'rdv/rendez-vous/réunion/agenda' -> agenda ; 'pomodoro/focus' -> pomodoro ; "
    "'projet' -> projects. Si le contexte actif est fourni et qu'aucune cible n'est "
    "explicite, utilise le contexte actif.\n"
    'Exemples :\n'
    'Phrase: "ajoute une tâche acheter du pain" -> '
    '{"action":"add","target":"tasks","content":"acheter du pain","query":""}\n'
    'Phrase: "supprime le rdv de demain" -> '
    '{"action":"delete","target":"agenda","content":"","query":"demain"}\n'
    'Phrase: "j\'ai réunion lundi à 14h avec Paul" -> '
    '{"action":"add","target":"agenda","content":"réunion lundi à 14h avec Paul","query":""}\n'
    'Phrase: "rappelle-moi de prendre mes clés à 18h" -> '
    '{"action":"add","target":"reminders","content":"prendre mes clés à 18h","query":""}\n'
)


def _normalize(data: dict, active: str | None) -> dict:
    action = str(data.get("action", "")).lower().strip()
    target = data.get("target")
    target = str(target).lower().strip() if target else None

    if action not in ACTIONS:
        action = "unknown"
    if target not in TARGETS:
        target = active if active in TARGETS else None

    return {
        "action": action,
        "target": target,
        "content": (data.get("content") or "").strip(),
        "query": (data.get("query") or "").strip(),
        "engine": data.get("engine", "rules"),
    }


def _extract_json(raw: str) -> dict:
    """Récupère le 1er objet JSON présent dans une réponse LLM."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("aucun JSON dans la réponse")
    return json.loads(raw[start : end + 1])


# ----------------------------- Fournisseurs ------------------------------ #

def _classify_gemini(text: str, active: str | None, settings) -> dict | None:
    if not settings.gemini_api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            settings.gemini_model,
            system_instruction=SYSTEM_INSTRUCTION,
        )
        prompt = f"Contexte actif: {active or 'aucun'}\nPhrase: {text}"
        resp = model.generate_content(
            prompt,
            generation_config={"temperature": 0, "response_mime_type": "application/json"},
        )
        data = _extract_json(resp.text)
        data["engine"] = "gemini"
        return _normalize(data, active)
    except Exception:
        return None


def _classify_openai(text: str, active: str | None, settings) -> dict | None:
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        completion = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": f"Contexte actif: {active or 'aucun'}\nPhrase: {text}"},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        data = _extract_json(completion.choices[0].message.content)
        data["engine"] = "openai"
        return _normalize(data, active)
    except Exception:
        return None


def _classify_rules(text: str, active: str | None) -> dict:
    """Repli local hors-ligne : détection par mots-clés (regex)."""
    lowered = text.lower()

    if re.search(DELETE_KEYWORDS, lowered):
        action = "delete"
    elif re.search(COMPLETE_KEYWORDS, lowered):
        action = "complete"
    elif re.search(LIST_KEYWORDS, lowered):
        action = "list"
    else:
        # Par défaut : ajouter (cas le plus fréquent)
        action = "add"

    target = None
    for tgt, pattern in TARGET_KEYWORDS.items():
        if re.search(pattern, lowered):
            target = tgt
            break
    if target is None:
        target = active if active in TARGETS else "tasks"

    # Nettoie le texte des verbes d'action pour obtenir le contenu/la requête
    cleaned = re.sub(
        f"({ADD_KEYWORDS}|{DELETE_KEYWORDS}|{COMPLETE_KEYWORDS}|{LIST_KEYWORDS})",
        "",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(une?|le|la|les|du|de|des|mon|ma|mes|moi|ce|cet|cette)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:,")

    return {
        "action": action,
        "target": target,
        "content": cleaned if action == "add" else "",
        "query": cleaned if action in {"delete", "complete"} else "",
        "engine": "rules",
    }


def classify_action(text: str, active: str | None = None) -> dict:
    """Point d'entrée : renvoie l'action structurée selon le fournisseur configuré."""
    text = (text or "").strip()
    if not text:
        return {"action": "unknown", "target": active, "content": "", "query": "", "engine": "rules"}

    settings = get_settings()
    provider = (settings.intent_provider or "auto").lower()

    if provider in {"auto", "gemini"}:
        res = _classify_gemini(text, active, settings)
        if res:
            return res
        if provider == "gemini":
            return _classify_rules(text, active)

    if provider in {"auto", "openai"}:
        res = _classify_openai(text, active, settings)
        if res:
            return res
        if provider == "openai":
            return _classify_rules(text, active)

    return _classify_rules(text, active)
