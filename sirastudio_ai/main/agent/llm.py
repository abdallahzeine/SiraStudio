import os

from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter

from ..agent_logging import OpenRouterDebugCallback, debug_logging_enabled

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = "moonshotai/kimi-k2.5"


def get_llm(temperature: float | None = None):
    kwargs = {"api_key": OPENROUTER_API_KEY} if OPENROUTER_API_KEY else {}
    callbacks = [OpenRouterDebugCallback()] if debug_logging_enabled() else None
    return ChatOpenRouter(
        model=OPENROUTER_MODEL,
        max_retries=0,
        callbacks=callbacks,
        **kwargs,
    )
