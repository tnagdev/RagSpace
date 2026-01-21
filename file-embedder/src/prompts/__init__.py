"""Prompt management for LLM service."""
import os
from pathlib import Path
from typing import Dict

_PROMPTS_DIR = Path(__file__).parent
_prompt_cache: Dict[str, str] = {}


def load_prompt(filename: str, **kwargs) -> str:
    """Load a prompt from a markdown file and apply placeholders.
    
    Args:
        filename: Name of the prompt file (with or without .md extension)
        **kwargs: Placeholder values to replace in the prompt
        
    Returns:
        Formatted prompt string
    """
    if not filename.endswith('.md'):
        filename = f"{filename}.md"
    
    if filename not in _prompt_cache:
        prompt_path = _PROMPTS_DIR / filename
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {prompt_path}")
        
        with open(prompt_path, 'r', encoding='utf-8') as f:
            _prompt_cache[filename] = f.read()
    
    prompt = _prompt_cache[filename]
    if kwargs:
        prompt = prompt.format(**kwargs)
    
    return prompt


def clear_cache() -> None:
    """Clear the prompt cache. Useful for reloading prompts during development."""
    _prompt_cache.clear()
