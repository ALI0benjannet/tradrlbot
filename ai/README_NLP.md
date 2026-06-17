# 🧠 Couche NLP locale — Tradrly Bot

La compréhension du langage est désormais **100 % locale** (hors-ligne, sans
LLM ni clé API). GPT-4o n'est plus requis : il devient un repli **optionnel**.

## 🎯 Ce qui est fourni

| Module | Rôle |
|--------|------|
| `app/nlu.py` | Détection d'intention + catégorie + couleur + confiance |
| `app/spacy_extractor.py` | NER, POS, dépendances, priorité, participants, titre nettoyé |
| `app/nlp_advanced.py` | Sentiment (TextBlob), émotion, assignation (qui/quoi/quand) |
| `app/nlp_pipeline.py` | Assemble tout + génère une réponse sans LLM |

### 1️⃣ spaCy — NER + POS + dépendances (`spacy_extractor.py`)
- **Entités** : personnes (PER), organisations (ORG), lieux (LOC), divers (MISC)
- **Dependency parsing** : couples « verbe → objet »
- **Priorité** : URGENT (5) → normal (1)
- **Participants** : « avec Alice » → assignee
- **Titre nettoyé** : verbe d'action, dates et priorité retirés

### 2️⃣ Sentiment + émotion (`nlp_advanced.py`)
- **TextBlob** : polarity + subjectivity (renforcé par un lexique français)
- **Émotion** : positive / negative / neutral
- **Assignation** : qui fait quoi + échéance détectée

### 3️⃣ UI intelligente (badge d'intention)
- Détection d'intention **en temps réel** pendant la frappe (debounce 350 ms)
- **Badge couleur** par catégorie (desktop = bleu, calendar = violet, …)
- Affichage de la priorité et des participants détectés

### 4️⃣ Intégration backend
- `POST /api/analyze` (et `/productivity/analyze`) → analyse complète
- L'orchestrateur Express relaie vers FastAPI (`/api/analyze`)
- `POST /api/chat` reste **rétro-compatible** (même schéma `intent/response/sentiment`)

### 5️⃣ Tests + setup
- `test_nlp.py` : suite de tests (intention, priorité, participants, sentiment, pipeline)
- `setup_nlp.py` : installe le modèle spaCy + corpora NLTK

## 🚀 Installation

```powershell
# 1. Dépendances Python
pip install -r ai/requirements.txt

# 2. Modèles NLP (spaCy fr + NLTK)
python ai/setup_nlp.py
```

## 🧪 Tester

```powershell
python ai/test_nlp.py
```

## 🔌 Utilisation de l'API

```powershell
# Analyse NLP complète
Invoke-RestMethod -Method Post http://localhost:8000/api/analyze `
  -ContentType 'application/json' `
  -Body '{"text":"appelle Alice demain c''est urgent"}'
```

Réponse type :

```json
{
  "intent": "general.query",
  "category": "general",
  "color": "#6b7280",
  "confidence": 0.3,
  "entities": { "persons": ["Alice"], "organizations": [], "locations": [], "misc": [] },
  "verb_object_pairs": [{ "verb": "appeler", "object": "Alice" }],
  "priority": 5,
  "participants": ["Alice"],
  "title": "Alice",
  "sentiment": { "polarity": 0.0, "subjectivity": 0.5, "emotion": "neutral", "engine": "textblob" },
  "assignment": { "assignee": "Alice", "deadline": "demain", "action": "appelle", "has_assignment": true },
  "engine": "spacy"
}
```

## ⚙️ Architecture

```
UI (badge temps réel)
   │  POST /api/analyze
Orchestrateur (Express, relais)
   │  POST /api/analyze
Couche IA (FastAPI)
   └─ nlp_pipeline.analyze()
        ├─ nlu.classify()          → intention + catégorie
        ├─ spacy_extractor.extract() → entités + priorité + participants
        └─ nlp_advanced.analyze()  → sentiment + assignation
```

## 🔁 Repli LLM (optionnel)

Le NLP local est utilisé **par défaut**. Pour réactiver GPT-4o :

```dotenv
USE_LLM=true
OPENAI_API_KEY=sk-...
```

## 🛠️ Dépannage

| Problème | Solution |
|----------|----------|
| `OSError: [E050] Can't find model 'fr_core_news_md'` | `python ai/setup_nlp.py` |
| TextBlob renvoie toujours 0 | Normal en français : le lexique FR prend le relais |
| `engine: "rules"` au lieu de `"spacy"` | Le modèle spaCy n'est pas installé (repli regex actif) |

> ℹ️ Tous les modules **dégradent proprement** : si spaCy ou TextBlob ne sont
> pas installés, un repli par règles/lexique garde la couche fonctionnelle.
