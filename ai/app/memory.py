"""Mémoire vectorielle (ChromaDB) — stockage et rappel sémantique.

Conserve l'historique des échanges sous forme d'embeddings pour fournir
du contexte pertinent au LLM. Fonctionne en local et persistant.
"""
from .config import get_settings

_collection = None


def _get_collection():
    global _collection
    if _collection is not None:
        return _collection
    try:
        import chromadb

        settings = get_settings()
        client = chromadb.PersistentClient(path=settings.chroma_path)
        _collection = client.get_or_create_collection(name="memory")
    except Exception as exc:  # ChromaDB indisponible -> mémoire désactivée
        print(f"[memory] ChromaDB indisponible : {exc}")
        _collection = None
    return _collection


def remember(user_text: str, assistant_text: str) -> None:
    col = _get_collection()
    if col is None:
        return
    import uuid

    doc = f"Utilisateur: {user_text}\nAssistant: {assistant_text}"
    col.add(documents=[doc], ids=[str(uuid.uuid4())])


def recall(query: str, k: int = 3) -> str:
    col = _get_collection()
    if col is None:
        return ""
    try:
        result = col.query(query_texts=[query], n_results=k)
        docs = result.get("documents", [[]])[0]
        return "\n---\n".join(docs)
    except Exception:
        return ""
