"""Handler for file deletion events - cleans up embeddings."""
import logging
import httpx
from src.db.chroma_db import ChromaDatabaseManager
from src.models.events import FileDeletedEventModel
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType
from src.config import settings

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(FileEventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion by cleaning up embeddings and conversations.
    
    Removes:
    - All scene embeddings (visual and text from OCR) from ChromaDB
    - All audio transcription embeddings from ChromaDB
    - All image embeddings from ChromaDB
    - All conversations from chat-manager
    
    Args:
        event: Validated file deletion event (supports single fileId or batch fileIds)
    """
    # Support both single and batch deletion
    file_ids = []
    if event.fileIds:
        file_ids = event.fileIds
    elif event.fileId:
        file_ids = [event.fileId]
    
    if not file_ids:
        logger.error("No file IDs provided in deletion event")
        return
    
    try:
        logger.info(f"Processing deletion for {len(file_ids)} file(s): {file_ids}")
        
        # Clean up ChromaDB embeddings using batch method
        chroma_db = ChromaDatabaseManager()
        try:
            chroma_db.delete_by_file_ids(file_ids)
            logger.info(f"✓ Batch cleaned up embeddings for {len(file_ids)} file(s)")
        except Exception as e:
            logger.error(f"Failed to batch clean up embeddings: {e}")
        
        try:
            import json
            user_dict = event.user if isinstance(event.user, dict) else event.user.dict()
            url = f"{settings.chat_manager_url}/conversations/batch/files/delete"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    headers={
                        'Content-Type': 'application/json',
                        'x-user': json.dumps(user_dict),
                        'x-service': 'file-embedder'
                    },
                    json={'file_ids': file_ids}
                )
                if response.is_success:
                    result = response.json()
                    logger.info(f"✓ Deleted {result.get('count', 0)} conversations for {len(file_ids)} file(s)")
                else:
                    logger.warn(f"Failed to delete conversations: {response.status_code}")
        except Exception as e:
            logger.error(f"Error deleting conversations: {e}")
        
    except Exception as e:
        logger.error(f"Failed to process file deletion: {e}", exc_info=True)
