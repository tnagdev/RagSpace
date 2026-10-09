from prisma.models import Scene
from ragspace.scenes.v1 import scenes_pb2, scenes_pb2_grpc
from ragspace_shared.paging import assert_batch_size
from ragspace_shared.protos import to_struct, to_timestamp

from src.services import scene_repository
from src.services.s3_service import S3Service

SERVICE_NAME = scenes_pb2.DESCRIPTOR.services_by_name["SceneService"].full_name


class SceneServicer(scenes_pb2_grpc.SceneServiceServicer):
    async def ListScenes(self, request: scenes_pb2.ListScenesRequest, context) -> scenes_pb2.ListScenesResponse:
        file_ids = list(request.file_ids)
        assert_batch_size(file_ids, "file_ids")
        bounds: dict[str, float] = {}
        for prefix, field in (("start", "start_seconds"), ("end", "end_seconds")):
            if request.HasField(field):
                bound = getattr(request, field)
                if bound.HasField("min"):
                    bounds[f"{prefix}_min"] = bound.min
                if bound.HasField("max"):
                    bounds[f"{prefix}_max"] = bound.max
        scenes, token = await scene_repository.list_scenes(
            request.user_id, file_ids, bounds, request.page_size, request.page_token
        )
        return scenes_pb2.ListScenesResponse(
            scenes=await _to_proto(scenes, request.include_urls), next_page_token=token
        )

    async def BatchGetScenes(
        self, request: scenes_pb2.BatchGetScenesRequest, context
    ) -> scenes_pb2.BatchGetScenesResponse:
        scene_ids = list(request.scene_ids)
        assert_batch_size(scene_ids, "scene_ids")
        scenes = await scene_repository.batch_get(request.user_id, scene_ids)
        return scenes_pb2.BatchGetScenesResponse(scenes=await _to_proto(scenes, request.include_urls))


async def _to_proto(scenes: list[Scene], include_urls: bool) -> list[scenes_pb2.Scene]:
    urls = (
        await S3Service().get_signed_urls([s.thumbnailS3Key for s in scenes if s.thumbnailS3Key])
        if include_urls
        else {}
    )
    result = []
    for scene in scenes:
        message = scenes_pb2.Scene(
            id=scene.id,
            file_id=scene.fileId,
            user_id=scene.userId,
            scene_number=scene.sceneNumber,
            start_seconds=scene.startTime,
            end_seconds=scene.endTime,
            start_frame=scene.startFrame,
            end_frame=scene.endFrame,
            keyframe=scene.keyframe,
            duration_seconds=scene.duration,
            thumbnail_key=scene.thumbnailS3Key or "",
            create_time=to_timestamp(scene.createdAt),
        )
        if scene.thumbnailS3Key in urls:
            message.thumbnail_url = urls[scene.thumbnailS3Key]
        if isinstance(scene.metadata, dict):
            message.attributes.CopyFrom(to_struct(scene.metadata))
        result.append(message)
    return result
