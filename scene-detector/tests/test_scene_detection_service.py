"""TC-01 to TC-23: SceneDetectionService unit tests."""

import os
import numpy as np
import pytest
from unittest.mock import patch
from PIL import Image
from scenedetect import FrameTimecode

from src.services.scene_detection_service import SceneDetectionService
from src.decorators.singleton import SingletonMeta


def fresh_service() -> SceneDetectionService:
    """Return a clean SceneDetectionService instance."""
    SingletonMeta._instances.clear()
    return SceneDetectionService()


# ── _split_scene ───────────────────────────────────────────────────────────────

class TestSplitScene:

    def test_shorter_than_interval_returned_unchanged(self):
        """TC-01: Scene shorter than interval → original tuple returned."""
        svc = fresh_service()
        fps = 30.0
        scene = (FrameTimecode(0, fps), FrameTimecode(90, fps))  # 3 s

        result = svc._split_scene(scene, interval_seconds=5)

        assert result == [scene]

    def test_exactly_equal_to_interval_returned_unchanged(self):
        """TC-02: Scene exactly equal to interval → no split."""
        svc = fresh_service()
        fps = 30.0
        scene = (FrameTimecode(0, fps), FrameTimecode(150, fps))  # 5 s = interval

        result = svc._split_scene(scene, interval_seconds=5)

        assert result == [scene]

    def test_exactly_double_interval_splits_into_two(self):
        """TC-03: 10 s scene with 5 s interval → 2 equal sub-scenes."""
        svc = fresh_service()
        fps = 30.0
        scene = (FrameTimecode(0, fps), FrameTimecode(300, fps))  # 10 s

        result = svc._split_scene(scene, interval_seconds=5)

        assert len(result) == 2
        assert result[0][0].frame_num == 0
        assert result[0][1].frame_num == 150
        assert result[1][0].frame_num == 150
        assert result[1][1].frame_num == 300

    def test_non_divisible_duration_adds_remainder_subscene(self):
        """TC-04: 12.5 s at 30 fps with 5 s interval → 2 full + 1 remainder."""
        svc = fresh_service()
        fps = 30.0
        scene = (FrameTimecode(0, fps), FrameTimecode(375, fps))  # 12.5 s

        result = svc._split_scene(scene, interval_seconds=5)

        assert len(result) == 3
        assert result[0][0].frame_num == 0
        assert result[0][1].frame_num == 150
        assert result[1][0].frame_num == 150
        assert result[1][1].frame_num == 300
        assert result[2][0].frame_num == 300
        assert result[2][1].frame_num == 375

    def test_non_zero_start_frame_splits_correctly(self):
        """TC-05: Scene starting mid-video splits relative to its own start."""
        svc = fresh_service()
        fps = 24.0
        # 10 s → 30 s at 24 fps: 240 → 720, duration 20 s → 4 × 5 s chunks
        scene = (FrameTimecode(240, fps), FrameTimecode(720, fps))

        result = svc._split_scene(scene, interval_seconds=5)

        assert len(result) == 4
        assert result[0][0].frame_num == 240
        assert result[0][1].frame_num == 360
        assert result[-1][1].frame_num == 720


# ── _create_square_crop ────────────────────────────────────────────────────────

class TestCreateSquareCrop:

    def test_wide_image_crops_to_height(self):
        """TC-06: 800×400 wide image → 400×400 center crop."""
        svc = fresh_service()
        img = Image.new("RGB", (800, 400), color=(255, 0, 0))

        result = svc._create_square_crop(img)

        assert result.size == (400, 400)

    def test_tall_image_crops_to_width(self):
        """TC-07: 400×800 tall image → 400×400 center crop."""
        svc = fresh_service()
        img = Image.new("RGB", (400, 800), color=(0, 255, 0))

        result = svc._create_square_crop(img)

        assert result.size == (400, 400)

    def test_square_image_unchanged(self):
        """TC-08: 400×400 square image → same dimensions."""
        svc = fresh_service()
        img = Image.new("RGB", (400, 400), color=(0, 0, 255))

        result = svc._create_square_crop(img)

        assert result.size == (400, 400)

    def test_crop_is_center_aligned(self):
        """Wide image: pixels at the horizontal center survive the crop."""
        svc = fresh_service()
        # 6×2 image; columns 2-3 are red, rest are blue
        img = Image.new("RGB", (6, 2), color=(0, 0, 255))
        for x in range(2, 4):
            for y in range(2):
                img.putpixel((x, y), (255, 0, 0))

        # Expected crop: 2×2 starting at x=2 (center of 6-wide image)
        result = svc._create_square_crop(img)

        assert result.size == (2, 2)
        assert result.getpixel((0, 0)) == (255, 0, 0)


# ── _save_thumbnail_from_frame ─────────────────────────────────────────────────

class TestSaveThumbnailFromFrame:

    def test_saves_jpeg_at_given_path(self, tmp_path):
        """TC-09: BGR numpy frame saved as JPEG file."""
        svc = fresh_service()
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        frame[:, :, 0] = 255  # blue channel in BGR

        out = str(tmp_path / "thumb.jpg")
        svc._save_thumbnail_from_frame(frame, out)

        assert os.path.exists(out)
        assert Image.open(out).format == "JPEG"

    def test_creates_nested_directory(self, tmp_path):
        """TC-10: Output directory created automatically if absent."""
        svc = fresh_service()
        frame = np.zeros((50, 50, 3), dtype=np.uint8)
        nested = str(tmp_path / "a" / "b" / "c" / "thumb.jpg")

        svc._save_thumbnail_from_frame(frame, nested)

        assert os.path.exists(nested)


# ── _generate_image_thumbnail ──────────────────────────────────────────────────

class TestGenerateImageThumbnail:

    def test_rgb_image_saved_as_jpeg(self, tmp_path):
        """TC-11: RGB input → JPEG at thumbnail_size."""
        svc = fresh_service()
        src = str(tmp_path / "in.jpg")
        out = str(tmp_path / "thumb.jpg")
        Image.new("RGB", (800, 600), color=(100, 200, 50)).save(src)

        svc._generate_image_thumbnail(src, out)

        result = Image.open(out)
        assert result.format == "JPEG"
        assert result.size == svc.thumbnail_size

    def test_rgba_image_composited_on_white_background(self, tmp_path):
        """TC-12: RGBA input alpha-composited before saving."""
        svc = fresh_service()
        src = str(tmp_path / "in.png")
        out = str(tmp_path / "thumb.jpg")
        Image.new("RGBA", (400, 400), color=(255, 0, 0, 128)).save(src)

        svc._generate_image_thumbnail(src, out)

        assert Image.open(out).mode == "RGB"

    def test_palette_image_processed(self, tmp_path):
        """TC-13: P (palette/GIF) image processed without error."""
        svc = fresh_service()
        src = str(tmp_path / "in.gif")
        out = str(tmp_path / "thumb.jpg")
        img = Image.new("P", (400, 400))
        img.save(src)

        svc._generate_image_thumbnail(src, out)

        assert os.path.exists(out)

    def test_grayscale_image_converted_to_rgb(self, tmp_path):
        """TC-14: L (grayscale) image converted to RGB and saved."""
        svc = fresh_service()
        src = str(tmp_path / "in.png")
        out = str(tmp_path / "thumb.jpg")
        Image.new("L", (400, 400), color=128).save(src)

        svc._generate_image_thumbnail(src, out)

        assert Image.open(out).mode == "RGB"

    def test_exif_transpose_called(self, tmp_path):
        """TC-15: EXIF orientation corrected via ImageOps.exif_transpose."""
        svc = fresh_service()
        src = str(tmp_path / "in.jpg")
        out = str(tmp_path / "thumb.jpg")
        Image.new("RGB", (400, 400)).save(src)

        with patch("src.services.scene_detection_service.ImageOps.exif_transpose") as mock_exif:
            mock_exif.return_value = Image.new("RGB", (400, 400))
            svc._generate_image_thumbnail(src, out)

        mock_exif.assert_called_once()


# ── generate_file_thumbnail ────────────────────────────────────────────────────

class TestGenerateFileThumbnail:

    async def test_image_type_dispatches_to_image_method(self, tmp_path):
        """TC-16: file_type='image' → _generate_image_thumbnail called."""
        svc = fresh_service()
        out = str(tmp_path / "thumb.jpg")

        with patch.object(svc, "_generate_image_thumbnail") as mock_gen:
            result = await svc.generate_file_thumbnail("dummy.jpg", "image", out)

        mock_gen.assert_called_once()
        assert result == out

    async def test_video_type_dispatches_to_video_method(self, tmp_path):
        """TC-17: file_type='video' → _generate_video_thumbnail called."""
        svc = fresh_service()
        out = str(tmp_path / "thumb.jpg")

        with patch.object(svc, "_generate_video_thumbnail") as mock_gen:
            await svc.generate_file_thumbnail("dummy.mp4", "video", out)

        mock_gen.assert_called_once()

    async def test_youtube_video_dispatches_to_video_method(self, tmp_path):
        """TC-18: file_type='youtube_video' (any case) → _generate_video_thumbnail."""
        svc = fresh_service()
        out = str(tmp_path / "thumb.jpg")

        with patch.object(svc, "_generate_video_thumbnail") as mock_gen:
            await svc.generate_file_thumbnail("dummy.mp4", "YOUTUBE_VIDEO", out)

        mock_gen.assert_called_once()

    async def test_unsupported_type_raises_value_error(self, tmp_path):
        """TC-19: Unsupported file_type raises ValueError."""
        svc = fresh_service()

        with pytest.raises(ValueError, match="Unsupported file type"):
            await svc.generate_file_thumbnail("dummy.mp3", "AUDIO", str(tmp_path / "thumb.jpg"))


# ── detect_scenes ──────────────────────────────────────────────────────────────

class TestDetectScenes:

    def test_returns_correctly_structured_dicts(self):
        """TC-20: detect_scenes returns dicts with all required keys."""
        svc = fresh_service()
        fps = 30.0
        mock_scenes = [
            (FrameTimecode(0, fps), FrameTimecode(90, fps)),
            (FrameTimecode(90, fps), FrameTimecode(180, fps)),
        ]

        with patch("src.services.scene_detection_service.detect", return_value=mock_scenes):
            result = svc.detect_scenes("dummy.mp4", max_scene_duration=5)

        required_keys = {"scene_number", "start_time", "end_time", "start_frame", "end_frame", "keyframe", "duration"}
        assert len(result) == 2
        for scene in result:
            assert required_keys <= scene.keys()
        assert result[0]["scene_number"] == 1
        assert result[1]["scene_number"] == 2

    def test_long_scene_is_split(self):
        """TC-21: Single 30 s scene with 5 s max → 6 sub-scenes."""
        svc = fresh_service()
        fps = 30.0
        mock_scenes = [(FrameTimecode(0, fps), FrameTimecode(900, fps))]

        with patch("src.services.scene_detection_service.detect", return_value=mock_scenes):
            result = svc.detect_scenes("dummy.mp4", max_scene_duration=5)

        assert len(result) == 6

    def test_empty_detection_returns_empty_list(self):
        """TC-22: No scenes detected → empty list."""
        svc = fresh_service()

        with patch("src.services.scene_detection_service.detect", return_value=[]):
            result = svc.detect_scenes("dummy.mp4")

        assert result == []

    def test_detection_exception_propagated(self):
        """TC-23: PySceneDetect exception re-raised to caller."""
        svc = fresh_service()

        with patch("src.services.scene_detection_service.detect", side_effect=RuntimeError("GPU error")):
            with pytest.raises(RuntimeError, match="GPU error"):
                svc.detect_scenes("dummy.mp4")

    def test_keyframe_is_midpoint_of_scene(self):
        """Keyframe field equals (start_frame + end_frame) // 2."""
        svc = fresh_service()
        fps = 30.0
        mock_scenes = [(FrameTimecode(0, fps), FrameTimecode(60, fps))]

        with patch("src.services.scene_detection_service.detect", return_value=mock_scenes):
            result = svc.detect_scenes("dummy.mp4", max_scene_duration=5)

        assert result[0]["keyframe"] == 30
