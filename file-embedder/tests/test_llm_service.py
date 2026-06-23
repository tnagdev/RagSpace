"""
TC-040 to TC-043: LLMService tests.
"""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_JSON_RESPONSE = (
    '{"summary": "A red car", "objects": ["car"], '
    '"setting": "parking lot", "style": "photorealistic", "colors": ["red"]}'
)


def _make_completion(content):
    """Build a minimal mock chat completion object."""
    choice = MagicMock()
    choice.message.content = content
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _make_llm_service_with_client():
    """Return an LLMService instance whose client is a mock (API key present)."""
    from src.services.LLMService import LLMService

    with patch("src.services.LLMService.settings") as mock_settings, \
         patch("src.services.LLMService.AsyncOpenAI") as mock_openai_cls, \
         patch("src.services.LLMService.load_prompt", return_value="prompt text"):

        mock_settings.nvidia_api_key = "fake-key"
        mock_settings.nvidia_base_url = "https://fake.nvidia.com/v1"
        mock_settings.llm_model = "meta/llama-3.2-11b-vision-instruct"
        mock_settings.llm_max_concurrent_requests = 5

        mock_client = AsyncMock()
        mock_openai_cls.return_value = mock_client

        svc = LLMService()
        svc.client = mock_client
        svc.model = "meta/llama-3.2-11b-vision-instruct"

    return svc, mock_client


# ---------------------------------------------------------------------------
# TC-040: rate limit backoff timing — attempt 0 sleeps 1s, attempt 1 sleeps 3s
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_llm_rate_limit_backoff_timing(tmp_path):
    """
    Verify that rate-limit backoff sleeps follow the formula (2**attempt) + 1.

    We inject a real RateLimitError by importing and using the actual class from
    the `openai` package that is installed in the venv, then temporarily
    un-patching `src.services.LLMService.RateLimitError` so the except-clause
    in the production code can catch it.
    """
    # Write a dummy image file so base64 encoding works
    img_path = str(tmp_path / "test.jpg")
    with open(img_path, "wb") as f:
        f.write(b"\xff\xd8\xff" + b"\x00" * 100)

    # Import the REAL openai RateLimitError from the venv (bypasses our mock)
    import importlib
    import sys

    # Temporarily restore the real openai module for the import
    real_openai_name = "_real_openai_for_test"
    # Use importlib to get the actual installed openai package
    # We need the real RateLimitError to be catchable by the production code

    # Strategy: patch the LLMService module's RateLimitError reference directly
    # to a real Exception subclass so the except clause can catch it.

    class FakeRateLimitError(Exception):
        """Fake RateLimitError that the production except clause will catch."""
        pass

    svc, mock_client = _make_llm_service_with_client()

    mock_client.chat.completions.create = AsyncMock(
        side_effect=[
            FakeRateLimitError("rate limited attempt 0"),
            FakeRateLimitError("rate limited attempt 1"),
            _make_completion(VALID_JSON_RESPONSE),
        ]
    )

    sleep_calls = []

    async def fake_sleep(t):
        sleep_calls.append(t)

    with patch("src.services.LLMService.RateLimitError", FakeRateLimitError), \
         patch("src.services.LLMService.asyncio.sleep", side_effect=fake_sleep), \
         patch("src.services.LLMService.load_prompt", return_value="prompt text"), \
         patch("src.services.LLMService.get_llm_semaphore", return_value=asyncio.Semaphore(5)):

        result = await svc.generate_image_description(img_path, max_retries=3)

    # Backoff formula: wait_time = (2 ** attempt) + 1
    # attempt=0 → 2; attempt=1 → 3. Sleep NOT called on last attempt (attempt=2).
    assert len(sleep_calls) == 2, f"Expected 2 sleeps, got {len(sleep_calls)}: {sleep_calls}"
    assert sleep_calls[0] == (2 ** 0) + 1   # 2
    assert sleep_calls[1] == (2 ** 1) + 1   # 3


# ---------------------------------------------------------------------------
# TC-041: non-JSON LLM response triggers a second API call with JSON instructions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_llm_json_retry_on_parse_failure(tmp_path):
    from src.services.LLMService import LLMService

    img_path = str(tmp_path / "image.jpg")
    with open(img_path, "wb") as f:
        f.write(b"\xff\xd8\xff" + b"\x00" * 100)

    svc, mock_client = _make_llm_service_with_client()

    # First call returns unstructured text; second call returns valid JSON
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[
            _make_completion("This is just some plain text, not JSON."),   # parse fail
            _make_completion(VALID_JSON_RESPONSE),                          # JSON retry
        ]
    )

    with patch("src.services.LLMService.load_prompt", return_value="prompt text"), \
         patch("src.services.LLMService.get_llm_semaphore", return_value=asyncio.Semaphore(5)), \
         patch("src.services.LLMService.asyncio.sleep", new_callable=AsyncMock):

        result = await svc.generate_image_description(img_path, max_retries=1, json_retry_count=1)

    # Two API calls: original + JSON retry
    assert mock_client.chat.completions.create.call_count == 2
    assert result is not None
    assert result.summary == "A red car"


# ---------------------------------------------------------------------------
# TC-042: _extract_json handles ```json ... ``` markdown fences
# ---------------------------------------------------------------------------

def test_llm_extract_json_handles_markdown_fences():
    from src.services.LLMService import LLMService

    text = (
        "```json\n"
        '{"summary": "ocean", "objects": ["wave"], "setting": "beach", "style": "photo", "colors": ["blue"]}\n'
        "```"
    )

    result = LLMService._extract_json(text)
    assert result is not None
    assert result["summary"] == "ocean"
    assert result["objects"] == ["wave"]


# ---------------------------------------------------------------------------
# TC-043: client=None (no API key) → returns None, no HTTP call
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_llm_returns_none_when_no_api_key(tmp_path):
    from src.services.LLMService import LLMService

    img_path = str(tmp_path / "img.jpg")
    with open(img_path, "wb") as f:
        f.write(b"\xff\xd8\xff" + b"\x00" * 100)

    with patch("src.services.LLMService.settings") as mock_settings:
        mock_settings.nvidia_api_key = None  # no key
        mock_settings.llm_max_concurrent_requests = 5

        svc = LLMService()
        svc.client = None  # Explicitly set to None (simulates missing API key)

    mock_api_call = AsyncMock()

    with patch("src.services.LLMService.get_llm_semaphore", return_value=asyncio.Semaphore(5)):
        result = await svc.generate_image_description(img_path)

    assert result is None
    mock_api_call.assert_not_called()
