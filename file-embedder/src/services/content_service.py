from ragspace.common.v1 import common_pb2
from ragspace.files.v1 import files_pb2
from ragspace.search.v1 import search_pb2
from ragspace_shared.protos import from_struct, to_struct
from ragspace_shared.rpc import not_found

from src.clients import get_file, list_scenes
from src.db.chroma_db import ChromaDatabaseManager, parse_visual
from src.decorators.cpu_manager import run_cpu
from src.services.media_indexer import VIDEO_TYPES
from src.services.search_service import to_visual


async def get_file_content(user_id: str, file_id: str, include_visual: bool) -> search_pb2.GetFileContentResponse:
    file = await get_file(user_id, file_id, include_urls=True)
    if file is None:
        raise not_found("File")

    response = search_pb2.GetFileContentResponse(file_id=file.id, file_name=file.name, file_type=file.type)
    if file.mime_type:
        response.mime_type = file.mime_type
    if file.HasField("download_url"):
        response.file_url = file.download_url
    if file.HasField("thumbnail_url"):
        response.thumbnail_url = file.thumbnail_url

    chroma = ChromaDatabaseManager()
    on_screen_text = None
    if file.type == common_pb2.FILE_TYPE_IMAGE:
        record = await run_cpu(chroma.image_record, file.id) or {}
        visual = parse_visual(record) if include_visual else None
        if visual:
            response.visual.CopyFrom(to_visual(visual))
        on_screen_text = record.get("ocr_text")
    else:
        audio = await run_cpu(chroma.audio_segments, file.id)
        segments = [_audio_segment(s) for s in audio]
        if file.type in VIDEO_TYPES:
            segments += await _visual_segments(file, include_visual)
            special = await run_cpu(chroma.special_docs, file.id)
            if special["character_registry"]:
                response.character_registry.CopyFrom(to_struct(special["character_registry"]))
            if special["narrative"]:
                response.narrative_summary.CopyFrom(to_struct(special["narrative"]))
        segments.sort(key=lambda s: (s.start_seconds if s.HasField("start_seconds") else 0, s.kind))
        response.segments.extend(segments)
        transcript = " ".join(s["text"] for s in audio if s["text"].strip())
        if transcript:
            response.transcript = transcript

    duration = _duration(file, response.segments)
    if duration:
        response.duration_seconds = duration
    response.summary_context = _summary_context(response, on_screen_text)
    return response


def _audio_segment(segment: dict) -> search_pb2.ContentSegment:
    return search_pb2.ContentSegment(
        kind=search_pb2.SEGMENT_KIND_AUDIO,
        segment_index=int(segment["segment_index"]),
        start_seconds=float(segment["start_time"]),
        end_seconds=float(segment.get("end_time") or segment["start_time"]),
        text=segment["text"],
    )


async def _visual_segments(file: files_pb2.File, include_visual: bool) -> list[search_pb2.ContentSegment]:
    records = await run_cpu(ChromaDatabaseManager().scene_records, file.id)
    scenes = {scene.scene_number: scene for scene in await list_scenes(file.user_id, [file.id], include_urls=True)}
    segments = []
    for record in records:
        number = int(record.get("scene_number") or record["scene_index"] + 1)
        scene = scenes.get(number)
        segment = search_pb2.ContentSegment(kind=search_pb2.SEGMENT_KIND_VISUAL, scene_number=number)
        if scene is not None:
            segment.scene_id = scene.id
            if scene.HasField("thumbnail_url"):
                segment.thumbnail_url = scene.thumbnail_url
        start = record.get("start_time", scene.start_seconds if scene else None)
        end = record.get("end_time", scene.end_seconds if scene else None)
        if start is not None:
            segment.start_seconds = float(start)
        if end is not None:
            segment.end_seconds = float(end)
        if record.get("text"):
            segment.text = record["text"]
        visual = parse_visual(record) if include_visual else None
        if visual:
            segment.visual.CopyFrom(to_visual(visual))
        segments.append(segment)
    return segments


def _duration(file: files_pb2.File, segments) -> float | None:
    seconds = from_struct(file.attributes).get("durationSeconds")
    if seconds:
        return float(seconds)
    ends = [s.end_seconds for s in segments if s.HasField("end_seconds")]
    return max(ends) if ends else None


def _summary_context(content: search_pb2.GetFileContentResponse, on_screen_text: str | None) -> str:
    file_type = common_pb2.FileType.Name(content.file_type).removeprefix("FILE_TYPE_")
    lines = [f"File: {content.file_name}", f"Type: {file_type}"]
    if content.HasField("duration_seconds"):
        lines.append(f"Duration: {content.duration_seconds:.1f} seconds ({content.duration_seconds / 60:.1f} minutes)")
    if content.HasField("visual"):
        lines.extend(_visual_lines(content.visual))
    if on_screen_text:
        lines.append(f"Text in image: {on_screen_text}")
    visual_count = sum(1 for s in content.segments if s.kind == search_pb2.SEGMENT_KIND_VISUAL)
    audio_count = len(content.segments) - visual_count
    if visual_count:
        lines.append(f"Scenes: {visual_count}")
    if audio_count:
        lines.append(f"Audio segments: {audio_count}")
    if content.segments:
        lines.append("\n--- Content Timeline ---\n")
        for position, segment in enumerate(content.segments, 1):
            lines.append(f"{position}. {_segment_line(segment)}")
    elif content.HasField("transcript"):
        lines.append(f'\nTranscript:\n"{content.transcript}"')
    return "\n".join(lines)


def _visual_lines(visual: common_pb2.VisualDescription) -> list[str]:
    lines = []
    if visual.HasField("summary"):
        lines.append(f"\nDescription: {visual.summary}")
    if visual.objects:
        lines.append(f"Objects detected: {', '.join(visual.objects)}")
    if visual.HasField("setting"):
        lines.append(f"Setting: {visual.setting}")
    if visual.HasField("style"):
        lines.append(f"Style: {visual.style}")
    if visual.colors:
        lines.append(f"Colors: {', '.join(visual.colors)}")
    return lines


def _segment_line(segment: search_pb2.ContentSegment) -> str:
    span = (
        f"[{segment.start_seconds:.1f}s - {segment.end_seconds:.1f}s] "
        if segment.HasField("start_seconds") and segment.HasField("end_seconds")
        else ""
    )
    if segment.kind == search_pb2.SEGMENT_KIND_AUDIO:
        text = segment.text if len(segment.text) <= 300 else segment.text[:300] + "..."
        return f'{span}[Audio] "{text}"'
    parts = []
    if segment.HasField("visual"):
        if segment.visual.HasField("summary"):
            parts.append(segment.visual.summary)
        if segment.visual.objects:
            parts.append(f"Objects: {', '.join(segment.visual.objects)}")
        if segment.visual.HasField("setting"):
            parts.append(f"Setting: {segment.visual.setting}")
    if parts:
        return f"{span}[Visual] {' | '.join(parts)}"
    if segment.text:
        return f"{span}[Visual] {segment.text[:200]}"
    return f"{span}[Visual] Scene {segment.scene_number}"
