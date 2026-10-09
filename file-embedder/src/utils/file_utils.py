import ffmpeg


def has_audio_stream(media_path: str) -> bool:
    probe = ffmpeg.probe(media_path)
    return any(stream.get("codec_type") == "audio" for stream in probe.get("streams", []))


def extract_audio(video_path: str, output_path: str) -> str:
    stream = ffmpeg.output(ffmpeg.input(video_path), output_path, acodec="libmp3lame", ac=1, ar="16000")
    ffmpeg.run(stream, overwrite_output=True, capture_stdout=True, capture_stderr=True)
    return output_path
