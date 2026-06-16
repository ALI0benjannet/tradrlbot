# Couche Données (Local)

Ce dossier contient les données locales générées à l'exécution. Aucun fichier
sensible ne doit être commité (voir `.gitignore`).

| Élément              | Fichier / Dossier      | Rôle                                       |
|----------------------|------------------------|--------------------------------------------|
| Historique           | `tradrly.db` (SQLite)  | Interactions utilisateur ↔ assistant       |
| Mémoire vectorielle  | `chroma/` (ChromaDB)   | Embeddings pour rappel sémantique          |
| Réglages             | `settings.json`        | Préférences UI/IA                          |
| Coffre de secrets    | `secrets.vault`        | Clés API chiffrées (AES-256-GCM)           |
| Cache                | `cache/`               | Fichiers temporaires (audio, etc.)         |

## Chiffrement des secrets

Les clés API peuvent être stockées soit :
1. en variables d'environnement (`.env`),
2. soit dans le coffre `secrets.vault` chiffré via `VAULT_MASTER_KEY`.

Voir [apps/orchestrator/src/security/vault.js](../apps/orchestrator/src/security/vault.js).
