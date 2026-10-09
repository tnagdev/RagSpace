import functools
import pathlib

_PROMPTS_DIR = pathlib.Path(__file__).parent


@functools.lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8").strip()
