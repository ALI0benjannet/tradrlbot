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

ACTIONS = {"add", "delete", "complete", "list", "update", "unknown"}
TARGETS = {"tasks", "reminders", "agenda", "pomodoro", "projects"}

# Mots-clés -> cible (utilisés par le repli local et pour deviner la cible)
TARGET_KEYWORDS = {
    "agenda": r"\b(rdv|rendez-?vous|r[ée]union|agenda|calendrier|meeting|event|[ée]v[ée]nement)\b",
    "reminders": r"\b(rappel|rappelle|alarme|pr[ée]viens|n'oublie\s+pas)\b",
    "tasks": r"\b(t[âa]che|todo|to-?do|faire|liste)\b",
    "pomodoro": r"\b(pomodoro|focus|concentration|minuteur)\b",
    "projects": r"\b(projet|chantier|suivi)\b",
}

ADD_KEYWORDS = r"\b(ajoute|ajouter|cr[ée]e?|cr[ée]er|nouvelle?|nouveau|planifie|programme|note|j'ai|jai|met|mets|ajout|d[ée]marr?e?r?|d[ée]mare?r?|lance?r?|commenc[er]+|start|démarre)\b"
DELETE_KEYWORDS = r"\b(supprime|supprimer|suppr\w*|supp\b|enl[èe]ve|enlever|retire|retirer|efface|effacer|annule|annuler|supprim|arr[êe]te|arr[êe]ter|arrete|stop|stoppe|stopper|termine|coupe|finis)\b"
COMPLETE_KEYWORDS = r"\b(termin[ée]?|fini[es]?|fait[es]?|coch[ée]?|valide|valider|accompli)\b"
LIST_KEYWORDS = r"\b(liste|affiche|montre|voir|quels?|quelles?)\b"
UPDATE_KEYWORDS = r"\b(modifie\w*|change\w*|remplace\w*|renomm\w*|corrige\w*|édite\w*|edit\w*|mets?\s+à\s+jour|mise\s+à\s+jour|update|rename|modif\w*)\b"

SYSTEM_INSTRUCTION = (
    "Tu es un routeur d'intention pour une application de productivité en français. "
    "L'utilisateur peut écrire ou parler dans N'IMPORTE QUELLE langue (français, arabe, "
    "anglais, etc.). Tu DOIS TOUJOURS produire un \"content\" et un \"query\" EN FRANÇAIS "
    "(traduis si nécessaire).\n"
    "À partir d'une phrase de l'utilisateur, renvoie UNIQUEMENT un objet JSON valide "
    "(sans texte autour, sans balises markdown) avec ces clés :\n"
    '- "action" : un de "add", "delete", "complete", "list", "update", "unknown".\n'
    '- pour "update" (modifier) : "query" = mots EN FRANÇAIS qui identifient l\'élément '
    '"existant à changer, et \"content\" = le NOUVEAU texte EN FRANÇAIS.\n"'
    '- "target" : un de "tasks", "reminders", "agenda", "pomodoro", "projects" ou null.\n'
    '- "content" : pour "add", le texte de l\'élément à créer EN FRANÇAIS (sans le verbe '
    "d'action).\n"
    '- "query" : pour "delete"/"complete", les mots EN FRANÇAIS qui identifient l\'élément.\n\n'
    "NORMALISATION DES DATES/HEURES (très important) : convertis TOUTE expression de date "
    "ou d'heure (même écrite en lettres ou en arabe/anglais) en CHIFFRES dans le content :\n"
    "- l'heure au format 24h \"HH:MM\" (ex: \"trois heures et demie de l'après-midi\" -> "
    "\"15:30\" ; arabe \"الساعة الثالثة و38 دقيقة مساءً\" -> \"15:38\" ; anglais "
    "\"half past three pm\" -> \"15:30\").\n"
    "- la date au format \"JJ/MM/AAAA\" (ou \"JJ/MM\") si une date précise est donnée.\n"
    "Garde le reste du libellé traduit en français autour de l'heure/date.\n\n"
    "Règles cible : 'tâche/todo' -> tasks ; 'rappel/alarme' -> reminders ; "
    "'rdv/rendez-vous/réunion/agenda' -> agenda ; 'pomodoro/focus' -> pomodoro ; "
    "'projet' -> projects. Si le contexte actif est fourni et qu'aucune cible n'est "
    "explicite, utilise le contexte actif.\n"
    'Exemples :\n'
    'Phrase: "ajoute une tâche acheter du pain" -> '
    '{"action":"add","target":"tasks","content":"acheter du pain","query":""}\n'
    'Phrase: "supprime le rdv de demain" -> '
    '{"action":"delete","target":"agenda","content":"","query":"demain"}\n'
    'Phrase: "j\'ai réunion lundi à 14h avec Paul" -> '
    '{"action":"add","target":"agenda","content":"réunion lundi à 14:00 avec Paul","query":""}\n'
    'Phrase arabe: "يجب عليك الخروج في تمام الساعة الثالثة و38 دقيقة مساءً" -> '
    '{"action":"add","target":"agenda","content":"sortir à 15:38","query":""}\n'
    'Phrase arabe: "أضف مهمة شراء الخبز" -> '
    '{"action":"add","target":"tasks","content":"acheter du pain","query":""}\n'
    'Phrase anglaise: "remind me to call John at 6 pm" -> '
    '{"action":"add","target":"reminders","content":"appeler John à 18:00","query":""}\n'
    'Phrase anglaise: "add a task buy milk" -> '
    '{"action":"add","target":"tasks","content":"acheter du lait","query":""}\n'
    'Phrase: "rappelle-moi de prendre mes clés à 18h" -> '
    '{"action":"add","target":"reminders","content":"prendre mes clés à 18:00","query":""}\n'
    'Phrase: "démarre un focus de 50 min" -> '
    '{"action":"add","target":"pomodoro","content":"focus de 50 min","query":""}\n'
    'Phrase: "démarre un focus mode" (sans durée) -> '
    '{"action":"add","target":"pomodoro","content":"focus","query":""}\n'
    'Phrase: "arrête le focus mode" -> '
    '{"action":"delete","target":"pomodoro","content":"","query":""}\n'
    'Phrase: "modifie la tâche pain en acheter du lait" -> '
    '{"action":"update","target":"tasks","query":"pain","content":"acheter du lait"}\n'
    'Phrase anglaise: "rename task meet to meet with manel" -> '
    '{"action":"update","target":"tasks","query":"meet","content":"meet avec manel"}\n'
    'Phrase: "remplace le rdv de lundi par réunion mardi à 10h" -> '
    '{"action":"update","target":"agenda","query":"lundi","content":"réunion mardi à 10:00"}\n'
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

    if re.search(UPDATE_KEYWORDS, lowered):
        action = "update"
    elif re.search(DELETE_KEYWORDS, lowered):
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
        f"({ADD_KEYWORDS}|{DELETE_KEYWORDS}|{COMPLETE_KEYWORDS}|{LIST_KEYWORDS}|{UPDATE_KEYWORDS})",
        "",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(une?|le|la|les|du|de|des|mon|ma|mes|moi|ce|cet|cette)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:,")

    if action == "add":
        content_val, query_val = cleaned, ""
    elif action in {"delete", "complete"}:
        content_val, query_val = "", cleaned
    elif action == "update":
        # Prioritize 'en' or 'par' as separators (most common in French for updates)
        parts = re.split(r"\s+(?:en|par)\s+", cleaned, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) < 2:
            # Fallback to other separators if no 'en' or 'par' found
            parts = re.split(r"\s+(?:vers|avec|->|:)\s+", cleaned, maxsplit=1, flags=re.IGNORECASE)
        
        if len(parts) == 2:
            query_val, content_val = parts[0].strip(), parts[1].strip()
        else:
            query_val, content_val = "", cleaned  # pas de séparateur : tout = nouveau texte
    else:
        content_val, query_val = "", ""

    return {
        "action": action,
        "target": target,
        "content": content_val,
        "query": query_val,
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
