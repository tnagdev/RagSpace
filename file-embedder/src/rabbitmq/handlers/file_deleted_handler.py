"""
Handler for file deletion events.
Cleans up all embeddings associated with the deleted file.
"""
import logging
from src.db.chroma_db import ChromaDatabaseManager
from src.models.events import FileDeletedEventModel
from src.rabbitmq.consumer import rabbitmq_consumer, FileEventType


logger = logging.getLogger(__name__)


@rabbitmq_consumer.register_handler(FileEventType.FILE_DELETED)
async def handle_file_deleted(event: FileDeletedEventModel):
    """
    Handle file deletion by cleaning up all associated embeddings from ChromaDB.
    
    This will remove:
    - All scene embeddings (visual and text from OCR)
    - All audio transcription embeddings
    - All image embeddings
    """
    try:
        file_id = event.fileId
        
        if not file_id:
            logger.error("No file ID in file deletion event")
            return
        
        logger.info(f"Cleaning up embeddings for deleted file: {file_id}")

        chroma_db = ChromaDatabaseManager()
        chroma_db.delete_by_file_id(file_id)
        
        logger.info(f"Successfully cleaned up embeddings for file: {file_id}")
        
    except Exception as e:
        logger.error(f"Error handling file deletion event: {e}", exc_info=True)
