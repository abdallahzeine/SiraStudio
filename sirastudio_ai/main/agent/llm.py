import os

from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "minimax/minimax-m3")


def get_llm(model: str | None = None, temperature: float | None = None):
    kwargs = {"api_key": OPENROUTER_API_KEY} if OPENROUTER_API_KEY else {}
    return ChatOpenRouter(
        model=model or OPENROUTER_MODEL,
        temperature=temperature if temperature is not None else 0.7,
        **kwargs,
    )
