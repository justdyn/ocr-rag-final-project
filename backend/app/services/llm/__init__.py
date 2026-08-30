"""LLM package — OpenAI-compatible cloud provider + RAG prompt helpers."""

from app.services.llm.base import LLMConfigError, LLMProvider, LLMProviderError
from app.services.llm.openai_compatible import OpenAICompatibleProvider, get_llm_provider
from app.services.llm.prompt import SYSTEM_PROMPT, build_rag_messages

__all__ = [
    "LLMConfigError",
    "LLMProvider",
    "LLMProviderError",
    "OpenAICompatibleProvider",
    "SYSTEM_PROMPT",
    "build_rag_messages",
    "get_llm_provider",
]
