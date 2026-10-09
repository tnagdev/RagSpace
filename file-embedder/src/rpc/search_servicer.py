from ragspace.search.v1 import search_pb2, search_pb2_grpc
from ragspace_shared.paging import assert_batch_size
from ragspace_shared.rpc import invalid_argument

from src.services import content_service, search_service
from src.services.search_service import SearchOptions

SERVICE_NAME = search_pb2.DESCRIPTOR.services_by_name["SearchService"].full_name

DEFAULT_LIMIT = 10
MAX_LIMIT = 50
MAX_QUERY_LENGTH = 1000
# A filter, not a fetch, so it can be wider than a batch; collection-scoped chats pass whole collections.
MAX_FILTER_FILE_IDS = 1000


class SearchServicer(search_pb2_grpc.SearchServiceServicer):
    async def Search(self, request: search_pb2.SearchRequest, context) -> search_pb2.SearchResponse:
        query = request.query.strip()
        if not query:
            raise invalid_argument("query is required")
        if len(query) > MAX_QUERY_LENGTH:
            raise invalid_argument(f"query accepts at most {MAX_QUERY_LENGTH} characters")
        file_ids = list(request.file_ids)
        assert_batch_size(file_ids, "file_ids", MAX_FILTER_FILE_IDS)
        hits = await search_service.search(
            request.user_id, query, file_ids, list(request.file_types), _options(request)
        )
        return search_pb2.SearchResponse(hits=hits)

    async def GetFileContent(
        self, request: search_pb2.GetFileContentRequest, context
    ) -> search_pb2.GetFileContentResponse:
        if not request.file_id:
            raise invalid_argument("file_id is required")
        return await content_service.get_file_content(
            request.user_id, request.file_id, request.include_visual_metadata
        )


def _options(request: search_pb2.SearchRequest) -> SearchOptions:
    options = SearchOptions(limit=DEFAULT_LIMIT if request.limit < 1 else min(request.limit, MAX_LIMIT))
    tuning = request.tuning
    for field in ("text_weight", "image_weight", "threshold"):
        if tuning.HasField(field):
            value = getattr(tuning, field)
            if not 0.0 <= value <= 1.0:
                raise invalid_argument(f"tuning.{field} must be between 0 and 1")
            setattr(options, field, value)
    for field in ("dynamic_retrieval", "query_expansion"):
        if tuning.HasField(field):
            setattr(options, field, getattr(tuning, field))
    return options
