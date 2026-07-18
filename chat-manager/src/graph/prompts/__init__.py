"""Prompt loader — reads LLM system prompts from .txt files at import time (cached)."""
import functools
import pathlib

_PROMPTS_DIR = pathlib.Path(__file__).parent


@functools.lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """Return the contents of a prompt file, stripped of leading/trailing whitespace.

    Results are cached after the first read so there is no per-request I/O overhead.
    In tests, call load_prompt.cache_clear() to reset between cases.
    """
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8").strip()
