"""Assistant développeur SANS LLM — explications par règles.

Explique les erreurs courantes (Python/JS) et décrit la structure d'un
extrait de code, le tout hors-ligne, sans appel à une IA.
"""
import re

# ── 1) Dictionnaire d'erreurs connues ───────────────────────────────
# clé = motif (regex) cherché dans le message ; valeur = explication + correction
ERREURS_CONNUES = [
    (r"SyntaxError",
     "❌ **SyntaxError** : ton code a une faute de syntaxe (parenthèse, deux-points "
     "ou guillemet manquant).\n💡 Vérifie la ligne indiquée et celle juste avant."),
    (r"IndentationError",
     "❌ **IndentationError** : mauvaise indentation (espaces/tabulations).\n"
     "💡 Utilise 4 espaces de façon cohérente, jamais de mélange espaces/tabs."),
    (r"NameError",
     "❌ **NameError** : tu utilises une variable ou fonction qui n'existe pas "
     "(ou pas encore définie).\n💡 Vérifie l'orthographe et que la variable est créée avant."),
    (r"TypeError",
     "❌ **TypeError** : tu mélanges des types incompatibles (ex. texte + nombre).\n"
     "💡 Convertis avec `str()`, `int()` ou `float()` selon le besoin."),
    (r"KeyError",
     "❌ **KeyError** : la clé demandée n'existe pas dans le dictionnaire.\n"
     "💡 Utilise `mon_dict.get('cle')` pour éviter le plantage."),
    (r"IndexError",
     "❌ **IndexError** : tu accèdes à un index hors des limites de la liste.\n"
     "💡 Vérifie la taille avec `len(ma_liste)` avant d'accéder."),
    (r"ModuleNotFoundError|ImportError",
     "❌ **ImportError** : le module n'est pas installé ou mal nommé.\n"
     "💡 Installe-le avec `pip install <module>` et vérifie l'orthographe."),
    (r"ZeroDivisionError",
     "❌ **ZeroDivisionError** : division par zéro.\n"
     "💡 Vérifie que le diviseur n'est pas 0 avant de diviser."),
    (r"ReferenceError",
     "❌ **ReferenceError** (JS) : variable utilisée mais non déclarée.\n"
     "💡 Déclare-la avec `let`, `const` ou `var` avant de l'utiliser."),
    (r"undefined is not a function|is not a function",
     "❌ **TypeError** (JS) : tu appelles quelque chose qui n'est pas une fonction.\n"
     "💡 Vérifie le nom de la fonction et qu'elle est bien importée/définie."),
    (r"Cannot read propert(y|ies) of (undefined|null)",
     "❌ **TypeError** (JS) : tu lis une propriété sur `undefined`/`null`.\n"
     "💡 Vérifie que l'objet existe (ex. `obj?.propriete`)."),
]


def expliquer_erreur(texte: str) -> str | None:
    """Cherche une erreur connue dans le texte et renvoie son explication."""
    for motif, explication in ERREURS_CONNUES:
        if re.search(motif, texte, re.IGNORECASE):
            return explication
    return None


# ── 2) Description simple de structure de code ──────────────────────
def decrire_code(texte: str) -> str:
    """Décrit la structure d'un extrait de code (sans le comprendre)."""
    lignes = texte.strip().splitlines()
    parties = []

    fonctions = re.findall(r"(?:def|function)\s+(\w+)", texte)
    classes = re.findall(r"class\s+(\w+)", texte)
    imports = re.findall(r"(?:import|from|require)\s+[\w.]+", texte)
    boucles = len(re.findall(r"\b(for|while)\b", texte))
    conditions = len(re.findall(r"\bif\b", texte))

    parties.append(f"📄 **Analyse du code** ({len(lignes)} ligne(s)) :")
    if imports:
        parties.append(f"• 📦 {len(imports)} import(s) : utilise des bibliothèques externes.")
    if classes:
        parties.append(f"• 🏗️ Classe(s) : `{', '.join(classes)}`.")
    if fonctions:
        parties.append(f"• 🔧 Fonction(s) : `{', '.join(fonctions)}`.")
    if boucles:
        parties.append(f"• 🔁 {boucles} boucle(s) : répète des actions.")
    if conditions:
        parties.append(f"• ❓ {conditions} condition(s) `if` : prend des décisions.")

    if len(parties) == 1:  # rien détecté
        parties.append("• Aucune structure reconnue (variables/expressions simples).")

    return "\n".join(parties)


# ── 3) Point d'entrée : explique erreur OU code ─────────────────────
def assister(texte: str) -> str:
    """Renvoie une explication d'erreur si trouvée, sinon décrit le code."""
    erreur = expliquer_erreur(texte)
    if erreur:
        return erreur
    return decrire_code(texte)