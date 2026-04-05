"""Admin routes for internal service operations."""
import logging
from fastapi import APIRouter, HTTPException
from src.db.chroma_db import ChromaDatabaseManager

router = APIRouter()
logger = logging.getLogger(__name__)


@router.delete("/user/{user_id}")
async def delete_user_embeddings(user_id: str):
    """Delete all ChromaDB embeddings for a user. Called by auth-service on account deletion."""
    try:
        chroma_db = ChromaDatabaseManager()
        deleted = chroma_db.delete_by_user_id(user_id)
        logger.info(f"Deleted {deleted} embeddings for user {user_id}")
        return {"deletedCount": deleted, "userId": user_id}
    except Exception as e:
        logger.error(f"Failed to delete embeddings for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
