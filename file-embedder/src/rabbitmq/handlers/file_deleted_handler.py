"""Handler for file deletion events - cleans up embeddings."""
import logging
from src.db.chroma_db import ChromaDatabaseManager
from src.models.events import FileDeletedEventModel
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType

logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(FileEventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel) -> None:
    """Handle file deletion by cleaning up all associated embeddings from ChromaDB.
    
    Removes:
    - All scene embeddings (visual and text from OCR)
    - All audio transcription embeddings
    - All image embeddings
    
    Args:
        event: Validated file deletion event
    """
    file_id = event.fileId
    
    try:
        logger.info(f"Processing file deletion: {file_id}")
        
        if not file_id:
            raise ValueError("Missing fileId in event")
        
        chroma_db = ChromaDatabaseManager()
        chroma_db.delete_by_file_id(file_id)
        logger.info(f"✓ Cleaned up embeddings for file: {file_id}")
        
    except ValueError as e:
        logger.error(f"Validation error for file deletion {file_id}: {e}")
        
    except Exception as e:
        logger.error(f"Failed to clean up embeddings for file {file_id}: {e}", exc_info=True)
