"""Shared formatters and prompts for graph nodes."""
from typing import Any, Optional

from src.graph.prompts import load_prompt

# Loaded once at import time from the text file so prompt edits don't require
# touching Python source. Use load_prompt.cache_clear() in tests to reset.
AGENT_SYSTEM_PROMPT = load_prompt("agent_system.md")

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
        result_type = result.get("result_type", "scene")
        item: dict[str, Any] = {
            "file_name": result.get("file_name"),
            "source": "spoken_dialogue" if result_type == "audio_segment" else "visual_scene",
        }
        start = result.get("start_time")
        end = result.get("end_time")
        if start is not None and end is not None:
            item["time_range"] = f"{start:.1f}s - {end:.1f}s"
        elif result.get("timestamp"):
            item["time_range"] = f"{result['timestamp']:.1f}s"
        if result.get("description"):
            item["scene_description"] = result["description"]
        if result.get("objects"):
            item["objects_on_screen"] = result["objects"]
        if result.get("setting"):
            item["setting"] = result["setting"]
        if result.get("text_content"):
            item["dialogue"] = result["text_content"][:500]
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

    # Build a merged chronological timeline: for each visual scene, attach any
    # audio segments that temporally overlap it. This lets the LLM read one
    # unified entry per scene rather than 200+ interleaved rows.
    content_items = content.get("content", [])
    if content_items:
        visual_items = sorted(
            [i for i in content_items if i.get("type") == "visual"],
            key=lambda i: i.get("start_time") or 0,
        )
        audio_items = sorted(
            [i for i in content_items if i.get("type") == "audio" and i.get("text")],
            key=lambda i: i.get("start_time") or 0,
        )
        moments: list[dict[str, Any]] = []
        for scene in visual_items:
            s_start = scene.get("start_time") or 0
            s_end = scene.get("end_time") or s_start
            moment: dict[str, Any] = {
                "time_range": f"{s_start:.1f}s - {s_end:.1f}s",
            }
            if scene.get("description"):
                moment["scene"] = scene["description"]
            elif scene.get("text"):
                moment["scene"] = scene["text"][:200]
            overlapping_audio = " ".join(
                seg["text"].strip()
                for seg in audio_items
                if (seg.get("start_time") or 0) <= s_end
                and (seg.get("end_time") or 0) >= s_start
                and seg["text"].strip()
            )
            if overlapping_audio:
                moment["dialogue"] = overlapping_audio[:500]
            moments.append(moment)
        if moments:
            formatted["timeline"] = moments

        # Also include raw audio segments that don't overlap any visual scene
        # (e.g. audio before/after all scenes) so nothing is lost.
        scene_ranges = [(s.get("start_time") or 0, s.get("end_time") or 0) for s in visual_items]
        orphan_audio = []
        for seg in audio_items:
            a_start = seg.get("start_time") or 0
            a_end = seg.get("end_time") or a_start
            covered = any(sr[0] <= a_end and sr[1] >= a_start for sr in scene_ranges)
            if not covered:
                orphan_audio.append(f"[{a_start:.1f}s] \"{seg['text'].strip()[:200]}\"")
        if orphan_audio:
            formatted["additional_audio"] = orphan_audio

    return formatted


def format_file_content_for_llm(content: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Format a /embed/content/file (RouterFileContentResponse) payload for LLM
    consumption. Sibling to format_video_content_for_llm — used for image/audio
    file types, which have no scene timeline."""
    if not content:
        return {"found": False, "message": "No content found for this file."}

    file_type = (content.get("file_type") or "").upper()
    formatted: dict[str, Any] = {
        "found": True,
        "file_name": content.get("file_name", "Unknown file"),
        "file_id": content.get("file_id"),
        "file_type": file_type,
        "content_summary": content.get("summary_context", ""),
    }
    for key in ("description", "objects", "setting", "style", "colors", "transcript"):
        if content.get(key):
            formatted[key] = content[key]

    if file_type == "IMAGE":
        formatted["instructions"] = (
            "Use the content_summary and metadata above (description, objects, "
            "setting, style, colors) to describe or answer questions about this image."
        )
    elif file_type == "AUDIO":
        formatted["instructions"] = (
            "Use the transcript above to answer questions about this audio file."
        )
    else:
        formatted["instructions"] = (
            "Use the content_summary above to answer questions about this file."
        )
    return formatted
