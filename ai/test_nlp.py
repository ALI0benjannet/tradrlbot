"""test_nlp.py — Tests de la couche NLP (hors-ligne).

Exécution :  python ai/test_nlp.py
Aucune dépendance de test externe : assertions simples + affichage lisible.
Les tests dégradent proprement si spaCy/TextBlob ne sont pas installés.
"""
import sys
from pathlib import Path

# Force l'UTF-8 en sortie (console Windows cp1252 sinon).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

# Permet d'importer le package `app` quel que soit le dossier d'exécution.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import nlp_pipeline  # noqa: E402
from app.nlu import classify  # noqa: E402
from app.spacy_extractor import detect_priority, clean_title, extract_participants  # noqa: E402
from app.nlp_advanced import analyze_sentiment  # noqa: E402

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}  {detail}")


def test_intent():
    print("[NLU] Détection d'intention")
    check("volume → desktop", classify("monte le volume")["category"] == "desktop")
    check("réunion → calendar", classify("planifie une réunion")["category"] == "calendar")
    check("slack → communication", classify("envoie un message slack")["category"] == "communication")
    check("tâche → tasks", classify("ajoute une tâche")["category"] == "tasks")
    check("git → developer", classify("fais un commit git")["category"] == "developer")
    check("bonjour → companion", classify("bonjour")["category"] == "companion")


def test_priority():
    print("[Priorité] Détection de niveau")
    check("urgent → 5", detect_priority("c'est urgent") == 5)
    check("important → 4", detect_priority("c'est important") == 4)
    check("normal → 1", detect_priority("range les fichiers") == 1)


def test_participants():
    print("[Participants] Extraction")
    parts = extract_participants("appelle Alice avec Bob")
    check("Alice détectée", "Alice" in parts, str(parts))
    check("Bob détecté", "Bob" in parts, str(parts))


def test_title():
    print("[Titre] Nettoyage")
    title = clean_title("appelle Alice demain à 15h")
    check("verbe retiré", not title.lower().startswith("appelle"), title)
    check("heure retirée", "15h" not in title, title)


def test_sentiment():
    print("[Sentiment] Analyse")
    pos = analyze_sentiment("merci c'est génial")
    neg = analyze_sentiment("c'est nul et plein de bugs")
    check("positif", pos["emotion"] == "positive", str(pos))
    check("négatif", neg["emotion"] == "negative", str(neg))


def test_pipeline():
    print("[Pipeline] Analyse complète")
    result = nlp_pipeline.analyze("appelle Alice demain c'est urgent")
    check("intent présent", "intent" in result)
    check("priorité urgente", result["priority"] == 5, str(result["priority"]))
    check("réponse générée", len(nlp_pipeline.generate_reply("bonjour")) > 0)


if __name__ == "__main__":
    test_intent()
    test_priority()
    test_participants()
    test_title()
    test_sentiment()
    test_pipeline()
    print(f"\nRésultat : {passed} réussis, {failed} échoués.")
    sys.exit(1 if failed else 0)
