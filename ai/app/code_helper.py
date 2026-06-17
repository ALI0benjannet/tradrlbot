"""Assistant développeur SANS LLM — explication d'erreurs par règles.

Reconnaît les erreurs courantes (Python & JavaScript) à partir de motifs
et renvoie une explication + une solution pré-écrites. 100% local, gratuit.
"""
import re

# Base de connaissances : (motif regex, titre, explication, solution)
ERROR_RULES = [
    # ---------- Python ----------
    (
        r"NameError.*name '(\w+)' is not defined",
        "NameError — variable non définie",
        "Tu utilises une variable ou fonction « {0} » qui n'existe pas encore "
        "(pas créée, ou mal orthographiée).",
        "Vérifie l'orthographe de « {0} » et assure-toi de l'avoir définie AVANT "
        "de l'utiliser.",
    ),
    (
        r"TypeError.*'(\w+)' object is not subscriptable",
        "TypeError — objet non indexable",
        "Tu essaies d'utiliser des crochets [ ] sur un objet de type « {0} » "
        "qui ne le permet pas (ex: un entier ou None).",
        "Vérifie que la variable est bien une liste, un dictionnaire ou une "
        "chaîne avant d'utiliser [ ].",
    ),
    (
        r"IndentationError",
        "IndentationError — mauvaise indentation",
        "Python est strict sur les espaces : ton bloc de code n'est pas aligné "
        "correctement.",
        "Utilise 4 espaces (pas de tabulations mélangées) pour chaque niveau "
        "d'indentation.",
    ),
    (
        r"KeyError: ['\"]?(\w+)",
        "KeyError — clé absente",
        "Tu demandes la clé « {0} » dans un dictionnaire, mais elle n'existe pas.",
        "Vérifie que la clé existe, ou utilise dict.get('{0}') qui renvoie None "
        "au lieu de planter.",
    ),
    (
        r"ModuleNotFoundError.*named '(\w+)'",
        "ModuleNotFoundError — module manquant",
        "Le module « {0} » n'est pas installé dans ton environnement.",
        "Installe-le avec : pip install {0}",
    ),
    (
        r"IndexError.*list index out of range",
        "IndexError — index hors limites",
        "Tu accèdes à un élément de liste qui n'existe pas (index trop grand).",
        "Vérifie la taille avec len(ma_liste) avant d'accéder à un index.",
    ),
    # ---------- JavaScript ----------
    (
        r"Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '(\w+)'\)",
        "TypeError JS — lecture sur undefined/null",
        "Tu lis la propriété « {0} » sur quelque chose qui vaut undefined ou null.",
        "Vérifie que l'objet existe d'abord, ex: monObjet?.{0} (optional chaining).",
    ),
    (
        r"(\w+) is not a function",
        "TypeError JS — pas une fonction",
        "Tu appelles « {0} » comme une fonction, mais ce n'en est pas une.",
        "Vérifie l'orthographe et que « {0} » est bien défini comme fonction.",
    ),
    (
        r"(\w+) is not defined",
        "ReferenceError JS — non défini",
        "La variable ou fonction « {0} » n'existe pas dans cette portée.",
        "Déclare « {0} » avec let/const, ou vérifie l'orthographe et l'import.",
    ),
    (
        r"Unexpected token",
        "SyntaxError JS — jeton inattendu",
        "Il y a une erreur de syntaxe : parenthèse, accolade ou virgule mal placée.",
        "Relis la ligne indiquée : vérifie les ( ), { }, [ ] et les virgules.",
    ),
]


def explain_error(text: str) -> str | None:
    """Cherche une erreur connue dans le texte. Renvoie None si rien trouvé."""
    for pattern, titre, explication, solution in ERROR_RULES:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            expl = explication.format(*groups) if groups else explication
            sol = solution.format(*groups) if groups else solution
            return (
                f"🔍 {titre}\n\n"
                f"📖 Explication : {expl}\n\n"
                f"✅ Solution : {sol}"
            )
    return None


def explain_code(text: str) -> str:
    """Explication basique d'un extrait de code par détection de mots-clés."""
    lowered = text.lower()
    indices = []
    if "def " in lowered:
        indices.append("• `def` définit une fonction.")
    if "class " in lowered:
        indices.append("• `class` définit une classe (modèle d'objet).")
    if "for " in lowered or "while " in lowered:
        indices.append("• Une boucle répète des instructions.")
    if "if " in lowered:
        indices.append("• `if` exécute du code sous condition.")
    if "import " in lowered:
        indices.append("• `import` charge un module externe.")
    if "function" in lowered or "=>" in lowered:
        indices.append("• Définition d'une fonction JavaScript.")
    if "return" in lowered:
        indices.append("• `return` renvoie une valeur et sort de la fonction.")

    if indices:
        return "📝 Analyse rapide du code :\n\n" + "\n".join(indices)
    return (
        "Je peux expliquer les erreurs courantes (Python/JS) et les structures "
        "de base du code. Colle ton erreur ou ton extrait de code complet."
    )


def handle_code_request(text: str) -> str:
    """Point d'entrée : essaie d'abord une erreur connue, sinon explique le code."""
    erreur = explain_error(text)
    if erreur:
        return erreur
    return explain_code(text)