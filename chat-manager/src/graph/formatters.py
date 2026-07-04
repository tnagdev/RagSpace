"""Shared formatters and prompts for graph nodes."""
from typing import Any, Optional

AGENT_SYSTEM_PROMPT = """You are a helpful AI assistant for RagSpace, a video and image content search platform.
You help users find and understand their uploaded media through conversational search.

You have access to tools, but ONLY use them when needed:

## When to use NO tools (answer directly):
- General knowledge questions ("what is 2+2?", "explain machine learning")
- Casual conversation or greetings
- Follow-up questions about results already shown
- Questions that can be answered from conversation context
- Clarifying questions or requests for explanation

## Tool: search_files
Use ONLY when the user asks about THEIR uploaded content:
- "find videos with red cars"
- "show me images from the beach"
- "where did I mention machine learning?" (searching their audio/video transcripts)
- "which video has a sunset scene?"
- Any query requiring lookup of visual, audio, or text content in their files

## Tool: get_video_content
Use ONLY when files are ATTACHED and user wants full video analysis:
- Files are attached AND user asks "summarize this video"
- Files are attached AND user wants complete scene-by-scene breakdown
- NOT for finding videos (use search_files) or when no files attached

## Tool: get_file_content
Use ONLY when files are ATTACHED and user wants image/audio analysis:
- Files are attached AND user asks "what is in this image?"
- Files are attached AND user wants image description or audio transcript
- NOT for finding images (use search_files) or when no files attached

DECISION RULES:
1. General questions → Answer directly without tools
2. Questions about their files/content → Use search_files
3. Specific attached files → Use get_video_content or get_file_content
4. When in doubt, answer directly first; only use tools if the query clearly needs their content

When responding:
- Be concise and helpful
- Reference specific files and timestamps when available
- If search results are provided, describe what was found
- For video summaries, synthesize visual and audio content
- For image descriptions, describe objects, setting, style, and colors

## Timestamp formatting (IMPORTANT)
Whenever you mention a time range in a video, ALWAYS use this exact format: (Xs - Ys)
where X and Y are numbers in seconds. Use SINGLE parentheses only. Examples:
- Scene 1: Introduction (0s - 10s) — the opening shot shows...
- At (45s - 90s) the speaker discusses machine learning...
- The conclusion appears at (110s - 140s)
Do NOT use double parentheses ((0s - 10s)). Do NOT wrap in bold (**).
This format allows the UI to render clickable seek buttons so users can jump to that moment."""


def format_search_results_for_llm(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return {
            "found": False,
            "message": "No matching content found in the user's files.",
            "results": []
        }

    formatted = {
        "found": True,
        "count": len(results),
        "results": []
    }

    for idx, result in enumerate(results, 1):
        item: dict[str, Any] = {
            "rank": idx,
            "file_name": result.get("file_name"),
            "relevance_score": f"{result.get('score', 0):.1%}",
        }
        if result.get("timestamp"):
            item["timestamp"] = f"{result['timestamp']:.1f}s"
        if result.get("description"):
            item["description"] = result["description"]
        if result.get("objects"):
            item["objects"] = result["objects"]
        if result.get("setting"):
            item["setting"] = result["setting"]
        if result.get("text_content"):
            item["transcript"] = result["text_content"][:200]
        formatted["results"].append(item)

    return formatted


def format_video_content_for_llm(content: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not content:
        return {"found": False, "message": "No content found for this video."}

    file_name = content.get("file_name", "Unknown video")
    total_duration = content.get("total_duration")
    total_scenes = content.get("total_scenes", 0)
    total_segments = content.get("total_segments", 0)
    summary_context = content.get("summary_context", "")

    formatted: dict[str, Any] = {
        "found": True,
        "file_name": file_name,
        "file_id": content.get("file_id"),
        "duration_seconds": total_duration,
        "duration_formatted": f"{total_duration/60:.1f} minutes" if total_duration else None,
        "total_scenes": total_scenes,
        "total_audio_segments": total_segments,
        "content_timeline": summary_context,
        "instructions": (
            "Use the content_timeline above to summarize or narrate the video. "
            "The timeline shows all visual scenes and audio transcriptions in chronological order. "
            "[Visual] entries describe what is seen on screen. "
            "[Audio] entries contain spoken words or sounds. "
            "Combine both to create a comprehensive summary or narration."
        )
    }

    # Include character registry so the LLM can use character names in its response.
    registry = content.get("character_registry")
    if registry and registry.get("characters"):
        formatted["characters"] = [
            {
                "name": c.get("name"),
                "role": c.get("role"),
                "description": c.get("description"),
            }
            for c in registry["characters"]
        ]
        if registry.get("story_context"):
            formatted["story_context"] = registry["story_context"]

    # Include narrative summary at the top level for easy LLM access.
    narrative = content.get("narrative_summary")
    if narrative and narrative.get("summary"):
        formatted["narrative"] = {
            "summary": narrative.get("summary"),
            "themes": narrative.get("themes", []),
            "story_arc": narrative.get("story_arc"),
            "key_events": narrative.get("key_events", [])[:10],
        }

    content_items = content.get("content", [])
    if content_items:
        formatted["detailed_content"] = []
        for item in content_items[:50]:
            detail: dict[str, Any] = {
                "type": item.get("type"),
                "time_range": (
                    f"{item.get('start_time', 0):.1f}s - {item.get('end_time', 0):.1f}s"
                    if item.get("start_time") is not None else None
                ),
            }
            if item.get("description"):
                detail["description"] = item["description"]
            if item.get("text"):
                detail["transcript"] = item["text"][:300]
            formatted["detailed_content"].append(detail)

    return formatted
