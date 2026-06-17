"""Installation des ressources NLP (modèles spaCy + corpora NLTK).

Lance ce script une seule fois après `pip install -r ai/requirements.txt` :

    python ai/setup_nlp.py

Il télécharge :
  - le modèle spaCy français `fr_core_news_md` (NER, POS, dépendances) ;
  - les corpora NLTK requis par TextBlob (punkt, etc.).

spaCy est OPTIONNEL : s'il n'est pas installé, le script l'ignore et la
couche NLP continue de fonctionner via son repli par règles.
"""
import subprocess
import sys

SPACY_MODEL = "fr_core_news_md"
NLTK_PACKAGES = ["punkt", "punkt_tab", "averaged_perceptron_tagger"]


def install_spacy_model() -> None:
    print(f"[setup] Vérification de spaCy + modèle « {SPACY_MODEL} »…")
    try:
        import spacy
    except ImportError:
        print(
            "[setup] ⓘ spaCy non installé (optionnel).\n"
            "        Pour l'activer : pip install -r ai/requirements-nlp.txt\n"
            "        En attendant, l'extraction utilise le repli par règles."
        )
        return

    try:
        spacy.load(SPACY_MODEL)
        print(f"[setup] ✓ Modèle « {SPACY_MODEL} » déjà installé.")
        return
    except OSError:
        pass

    try:
        subprocess.run(
            [sys.executable, "-m", "spacy", "download", SPACY_MODEL], check=True
        )
        print(f"[setup] ✓ Modèle spaCy « {SPACY_MODEL} » installé.")
    except Exception as exc:  # noqa: BLE001
        print(f"[setup] ✗ Échec téléchargement du modèle spaCy : {exc}")


def install_nltk_data() -> None:
    print("[setup] Téléchargement des corpora NLTK pour TextBlob…")
    try:
        import nltk

        for pkg in NLTK_PACKAGES:
            try:
                nltk.download(pkg, quiet=True)
            except Exception:  # noqa: BLE001
                pass
        print("[setup] ✓ Corpora NLTK installés.")
    except Exception as exc:  # noqa: BLE001
        print(f"[setup] ✗ Échec NLTK : {exc}")


if __name__ == "__main__":
    install_spacy_model()
    install_nltk_data()
    print("[setup] Terminé. Vous pouvez lancer la couche IA : npm run dev:ai")
