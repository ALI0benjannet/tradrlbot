# 🤖 Tradrly Bot

Assistant IA local, multi-couches, à exécution majoritairement hors-ligne.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COUCHE PRÉSENTATION (UI)                  │
│   Electron + React + TailwindCSS + Framer Motion            │
│   • Dashboard  • Avatar animé/LED  • Historique  • Réglages  │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC / WebSocket local
┌──────────────────────────┴──────────────────────────────────┐
│                  COUCHE ORCHESTRATION (Node.js)             │
│   • Routeur de commandes  • Gestion fenêtres/OS             │
│   • Contrôle système (apps, volume, luminosité, fichiers)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / WebSocket (localhost)
┌──────────────────────────┴──────────────────────────────────┐
│                   COUCHE IA (Python - FastAPI)             │
│   • STT  • NLU  • LLM (GPT-4o)  • TTS  • Mémoire  • Sentiment│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│              COUCHE SERVICES & INTÉGRATIONS                 │
│   Slack • Teams • Discord • Notion • Gmail • Git • Calendar │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    COUCHE DONNÉES (Local)                   │
│   SQLite • ChromaDB (mémoire vectorielle) • .env chiffré    │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Structure du projet

```
tradrly_bot/
├── apps/
│   ├── ui/             # Electron + React + Tailwind + Framer Motion
│   └── orchestrator/   # Node.js — routeur de commandes + contrôle système
├── ai/                 # Python FastAPI — STT, NLU, LLM, TTS, mémoire, sentiment
├── services/           # Intégrations Slack, Teams, Discord, Notion, Gmail, Git, Calendar
├── data/               # SQLite, ChromaDB, cache, coffre chiffré
├── .env.example
└── package.json        # Monorepo (npm workspaces)
```

## 🚀 Démarrage rapide

### Prérequis
- Node.js ≥ 22 (testé avec Node 25 — requis pour le module intégré `node:sqlite`)
- Python ≥ 3.10 (testé avec Python 3.13)
- npm ≥ 9

> ℹ️ La base de données utilise le module **`node:sqlite` intégré à Node.js**
> (≥ 22) : **aucune compilation native requise** pour le cœur du projet.
>
> ⚠️ **Windows (optionnel)** : seules les fonctions avancées de contrôle du
> bureau (`node-window-manager`, `nut.js`) compilent des modules natifs. Elles
> sont **facultatives** : si la compilation échoue, l'app fonctionne quand même
> (repli sur commandes natives OS). Pour les activer, installe les
> *Visual Studio Build Tools* (charge de travail « Desktop development with C++ »).

### Installation

```powershell
# 1. Copier la config
copy .env.example .env       # (macOS/Linux : cp .env.example .env)

# 2. Installer toutes les dépendances (Node + Python)
npm install                  # dépendances Node du monorepo (workspaces)
pip install -r ai/requirements.txt   # dépendances Python (couche IA)

# (équivalent tout-en-un)
npm run setup
```

> 💡 En cas d'erreur `EBUSY` / modules natifs corrompus pendant `npm install`,
> ferme les process Node puis nettoie et réinstalle :
> ```powershell
> Get-Process node,electron -ErrorAction SilentlyContinue | Stop-Process -Force
> Remove-Item -Recurse -Force node_modules, apps\ui\node_modules, apps\orchestrator\node_modules, package-lock.json -ErrorAction SilentlyContinue
> npm install
> ```

### Lancement

#### Tout en parallèle (IA + Orchestrateur + UI)

```powershell
npm run dev
```

#### Couche par couche (utile pour tester / déboguer)

```powershell
# Couche IA (Python FastAPI) → http://localhost:8000  (docs: /docs)
npm run dev:ai

# Couche Orchestration (Node.js) → http://localhost:4000
npm run dev:orchestrator

# Couche Présentation (Electron + React) → fenêtre desktop
npm run dev:ui
```

- UI Electron → fenêtre desktop
- Orchestrateur Node → `http://localhost:4000`
- IA FastAPI → `http://localhost:8000` (docs: `/docs`)

## 🧪 Tester l'application

> 💡 Sous **Windows PowerShell**, `curl` est un alias de `Invoke-WebRequest` et
> gère mal les corps JSON. Préfère `Invoke-RestMethod` (exemples ci-dessous,
> **testés et validés**).

### 1. Vérifier que les couches répondent (health checks)

```powershell
# Orchestrateur → {"ok":true,"layer":"orchestrator"}
Invoke-RestMethod http://localhost:4000/health

# Couche IA → {"ok":true,"layer":"ai"}
Invoke-RestMethod http://localhost:8000/health
```

### 2. Tester le contrôle du bureau (couche Orchestration)

```powershell
# Lister les 30 actions bureau disponibles
Invoke-RestMethod http://localhost:4000/api/desktop/actions

# Monter le volume (modifie réellement le volume système)
Invoke-RestMethod -Method Post http://localhost:4000/api/desktop `
  -ContentType 'application/json' -Body '{"action":"volume.up"}'

# Régler le volume à 25 %
Invoke-RestMethod -Method Post http://localhost:4000/api/desktop `
  -ContentType 'application/json' -Body '{"action":"volume.set","params":{"level":25}}'

# Régler la luminosité à 60 %
Invoke-RestMethod -Method Post http://localhost:4000/api/desktop `
  -ContentType 'application/json' -Body '{"action":"brightness.set","params":{"level":60}}'

# Lister le contenu du dossier personnel (module fs intégré)
Invoke-RestMethod -Method Post http://localhost:4000/api/desktop `
  -ContentType 'application/json' -Body '{"action":"files.list","params":{"path":"."}}'

# Ouvrir une application (Bloc-notes)
Invoke-RestMethod -Method Post http://localhost:4000/api/desktop `
  -ContentType 'application/json' -Body '{"action":"app.open","params":{"name":"notepad"}}'
```

### 3. Tester une commande en langage naturel (routeur)

> Le routeur est **insensible aux accents** : « regle le volume a 25% » et
> « règle le volume à 25% » fonctionnent à l'identique.

```powershell
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"monte le volume"}'

Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"regle le volume a 25%"}'

Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"verrouille la session"}'
```

### 3bis. Gérer des fichiers et dossiers (créer / modifier / supprimer)

> Toutes les opérations fichiers sont **confinées au dossier utilisateur**
> (`HOME`). Les emplacements reconnus : « bureau », « documents »,
> « téléchargements ». Le nom est nettoyé automatiquement des suffixes
> d'emplacement (« demo2 sur le bureau » → « demo2 »).

```powershell
# Créer un dossier
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"crie un dossier sur le bureau avec le nom demo1"}'

# Lister le contenu d'un emplacement
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"liste le contenu du bureau"}'

# Renommer un dossier ou un fichier
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"renomme le dossier demo1 en demo2 sur le bureau"}'

# Déplacer un élément vers un autre emplacement
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"deplace demo2 vers documents"}'

# Écrire du texte dans un fichier
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"ecris bonjour tradrly dans le fichier note.txt sur le bureau"}'

# Supprimer un dossier
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"supprime le dossier demo2 sur le bureau"}'

# Supprimer un fichier
Invoke-RestMethod -Method Post http://localhost:4000/api/command `
  -ContentType 'application/json' -Body '{"text":"supprime le fichier note.txt sur le bureau"}'
```

### 4. Consulter l'historique et les réglages

```powershell
Invoke-RestMethod http://localhost:4000/api/history   # persisté dans SQLite
Invoke-RestMethod http://localhost:4000/api/settings
```

## 🖥️ Couche Contrôle du bureau — actions disponibles

| Domaine | Actions | Librairie |
|---------|---------|-----------|
| Applications | `app.open`, `app.close`, `app.openPath` | `child_process` |
| Volume | `volume.up`, `volume.down`, `volume.set`, `volume.mute` | `loudness` |
| Luminosité | `brightness.up`, `brightness.down`, `brightness.set` | `brightness` |
| Fenêtres | `window.active`, `window.list`, `window.focus`, `window.minimize`, `window.maximize` | `node-window-manager`, `active-win` |
| Alimentation | `power.lock`, `power.sleep`, `power.displayOff`, `power.shutdown`, `power.restart` | commandes natives OS |
| Fichiers | `files.list`, `files.mkdir`, `files.read`, `files.write`, `files.move`, `files.delete` | `fs` |
| Clavier/souris | `input.type`, `input.keys`, `input.mouseMove`, `input.click`, `input.cursor` | `nut.js` |

> Les actions sensibles (`power.shutdown`, `power.restart`, `files.delete`)
> exigent `params.confirm = true`. Les opérations fichiers sont confinées au
> dossier personnel de l'utilisateur.

## 🔄 Flux d'une commande vocale

```
Voix → UI capture → Orchestrateur → IA (STT→NLU→LLM→TTS)
     → action système / service → réponse → UI (avatar + audio)
```

## 🔐 Sécurité
- Tout fonctionne en `localhost` ; aucun port exposé publiquement.
- Les clés API sont stockées dans un coffre `.env` chiffré (AES-256-GCM).
- Voir [ai/app/](ai/app) et [apps/orchestrator/src/security](apps/orchestrator/src/security).
