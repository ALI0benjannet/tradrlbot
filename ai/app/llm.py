"""LLM — génération de réponse (GPT-4o par défaut)."""
from .config import get_settings

SYSTEM_PROMPT = (
    "Tu es Tradrly, un assistant personnel local, efficace et bienveillant. "
    "Réponds en français de façon concise. Si l'utilisateur demande une action "
    "système ou un service externe, explique brièvement ce que tu fais."
)


def generate_reply(text: str, context: str = "", intent: str = "general.query") -> str:
    settings = get_settings()

    if not settings.openai_api_key:
        return (
            f"(Mode démo — aucune clé OpenAI) J'ai compris l'intention « {intent} » "
            f"pour : « {text} »."
        )

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context:
        messages.append(
            {"role": "system", "content": f"Contexte mémoire pertinent :\n{context}"}
        )
    messages.append({"role": "user", "content": text})

    completion = client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        temperature=0.6,
    )
    return completion.choices[0].message.content.strip()
