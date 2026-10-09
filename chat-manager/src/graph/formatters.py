from typing import Any

from google.protobuf import json_format
from ragspace.common.v1 import common_pb2
from ragspace.search.v1 import search_pb2

from src.graph.prompts import load_prompt

AGENT_SYSTEM_PROMPT = load_prompt("agent_system.md")
VIDEO_TYPES = (common_pb2.FILE_TYPE_VIDEO, common_pb2.FILE_TYPE_YOUTUBE_VIDEO)


def file_type_name(file_type: int) -> str:
    return common_pb2.FileType.Name(file_type).removeprefix("FILE_TYPE_")


def format_search_results_for_llm(hits: list[common_pb2.SearchHit]) -> dict[str, Any]:
    if not hits:
        return {"found": False, "message": "No matching content found in the user's files.", "results": []}

    results = []
    for hit in hits:
        item: dict[str, Any] = {
            "file_name": hit.file_name,
            "source": "spoken_dialogue" if hit.HasField("segment_index") else "visual_scene",
        }
        if hit.HasField("start_seconds") and hit.HasField("end_seconds"):
            item["time_range"] = f"{hit.start_seconds:.1f}s - {hit.end_seconds:.1f}s"
        elif hit.HasField("start_seconds"):
            item["time_range"] = f"{hit.start_seconds:.1f}s"
        if hit.visual.HasField("summary"):
            item["scene_description"] = hit.visual.summary
        if hit.visual.objects:
            item["objects_on_screen"] = list(hit.visual.objects)
        if hit.visual.HasField("setting"):
            item["setting"] = hit.visual.setting
        if hit.HasField("snippet"):
            item["dialogue"] = hit.snippet[:500]
        results.append(item)
    return {"found": True, "count": len(results), "results": results}


def format_video_content_for_llm(content: search_pb2.GetFileContentResponse) -> dict[str, Any]:
    duration = content.duration_seconds if content.HasField("duration_seconds") else None
    visual = sorted(
        (s for s in content.segments if s.kind == search_pb2.SEGMENT_KIND_VISUAL), key=lambda s: s.start_seconds
    )
    audio = sorted(
        (s for s in content.segments if s.kind == search_pb2.SEGMENT_KIND_AUDIO and s.text),
        key=lambda s: s.start_seconds,
    )
    formatted: dict[str, Any] = {
        "found": True,
        "file_name": content.file_name,
        "file_id": content.file_id,
        "duration_seconds": duration,
        "duration_formatted": f"{duration / 60:.1f} minutes" if duration else None,
        "total_scenes": len(visual),
        "total_audio_segments": len(audio),
        "content_timeline": content.summary_context,
        "instructions": (
            "Use the content_timeline above to summarize or narrate the video. "
            "The timeline shows all visual scenes and audio transcriptions in chronological order. "
            "[Visual] entries describe what is seen on screen. "
            "[Audio] entries contain spoken words or sounds. "
            "Combine both to create a comprehensive summary or narration."
        ),
    }

    registry = json_format.MessageToDict(content.character_registry)
    if registry.get("characters"):
        formatted["characters"] = [
            {"name": c.get("name"), "role": c.get("role"), "description": c.get("description")}
            for c in registry["characters"]
        ]
        if registry.get("story_context"):
            formatted["story_context"] = registry["story_context"]

    narrative = json_format.MessageToDict(content.narrative_summary)
    if narrative.get("summary"):
        formatted["narrative"] = {
            "summary": narrative.get("summary"),
            "themes": narrative.get("themes", []),
            "story_arc": narrative.get("story_arc"),
            "key_events": narrative.get("key_events", [])[:10],
        }

    # One entry per scene with its overlapping dialogue reads far better than hundreds of interleaved rows.
    moments = []
    for scene in visual:
        start, end = scene.start_seconds, scene.end_seconds or scene.start_seconds
        moment: dict[str, Any] = {"time_range": f"{start:.1f}s - {end:.1f}s"}
        if scene.visual.HasField("summary"):
            moment["scene"] = scene.visual.summary
        elif scene.text:
            moment["scene"] = scene.text[:200]
        dialogue = " ".join(
            seg.text.strip() for seg in audio if seg.start_seconds <= end and seg.end_seconds >= start and seg.text.strip()
        )
        if dialogue:
            moment["dialogue"] = dialogue[:500]
        moments.append(moment)
    if moments:
        formatted["timeline"] = moments

    orphans = [
        f'[{seg.start_seconds:.1f}s] "{seg.text.strip()[:200]}"'
        for seg in audio
        if not any(s.start_seconds <= seg.end_seconds and s.end_seconds >= seg.start_seconds for s in visual)
    ]
    if orphans:
        formatted["additional_audio"] = orphans
    return formatted


def format_file_content_for_llm(content: search_pb2.GetFileContentResponse) -> dict[str, Any]:
    file_type = file_type_name(content.file_type)
    formatted: dict[str, Any] = {
        "found": True,
        "file_name": content.file_name,
        "file_id": content.file_id,
        "file_type": file_type,
        "content_summary": content.summary_context,
    }
    if content.HasField("visual"):
        visual = content.visual
        if visual.HasField("summary"):
            formatted["description"] = visual.summary
        if visual.objects:
            formatted["objects"] = list(visual.objects)
        for key in ("setting", "style"):
            if visual.HasField(key):
                formatted[key] = getattr(visual, key)
        if visual.colors:
            formatted["colors"] = list(visual.colors)
    if content.HasField("transcript"):
        formatted["transcript"] = content.transcript

    if file_type == "IMAGE":
        formatted["instructions"] = (
            "Use the content_summary and metadata above (description, objects, "
            "setting, style, colors) to describe or answer questions about this image."
        )
    elif file_type == "AUDIO":
        formatted["instructions"] = "Use the transcript above to answer questions about this audio file."
    else:
        formatted["instructions"] = "Use the content_summary above to answer questions about this file."
    return formatted


def hit_from_content(content: search_pb2.GetFileContentResponse) -> common_pb2.SearchHit:
    hit = common_pb2.SearchHit(file_id=content.file_id, file_name=content.file_name, file_type=content.file_type)
    if content.HasField("thumbnail_url"):
        hit.thumbnail_url = content.thumbnail_url
    if content.HasField("file_url"):
        hit.file_url = content.file_url
    if content.HasField("visual"):
        hit.visual.CopyFrom(content.visual)
    return hit
