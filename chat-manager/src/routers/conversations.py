"""Conversation management routes"""
import logging
from fastapi import APIRouter, Request, HTTPException, Query
from typing import List, Dict, Any, Optional
from src.models.chat import Conversation, ConversationSummary, SearchResult, ChatMessage
from src.services.ConversationService import ConversationService
from src.services.S3Service import S3Service

router = APIRouter()
logger = logging.getLogger(__name__)


async def generate_signed_urls_for_results(search_results: List[SearchResult]) -> List[SearchResult]:
    """
    Generate fresh signed URLs for search results using stored S3 keys.
    
    Args:
        search_results: List of SearchResult objects with S3 keys
        
    Returns:
        Updated SearchResult objects with fresh signed URLs
    """
    if not search_results:
        return search_results
    
    s3_service = S3Service()
    
    # Collect all unique S3 keys with their buckets
    s3_items = []
    for result in search_results:
        if result.thumbnail_s3_key:
            s3_items.append((result.thumbnail_s3_key, result.thumbnail_s3_bucket))
        if result.file_s3_key:
            s3_items.append((result.file_s3_key, result.file_s3_bucket))
    
    if not s3_items:
        return search_results
    
    # Generate signed URLs for all keys
    signed_urls = await s3_service.get_signed_urls_batch(s3_items)
    
    # Update results with fresh URLs
    refreshed_results = []
    for result in search_results:
        refreshed_results.append(SearchResult(
            file_id=result.file_id,
            scene_id=result.scene_id,
            file_name=result.file_name,
            file_type=result.file_type,
            score=result.score,
            timestamp=result.timestamp,
            thumbnail_s3_key=result.thumbnail_s3_key,
            thumbnail_s3_bucket=result.thumbnail_s3_bucket,
            file_s3_key=result.file_s3_key,
            file_s3_bucket=result.file_s3_bucket,
            thumbnail_url=signed_urls.get(result.thumbnail_s3_key) if result.thumbnail_s3_key else None,
            file_url=signed_urls.get(result.file_s3_key) if result.file_s3_key else None,
            youtube_url=result.youtube_url,
            start_time=result.start_time,
            end_time=result.end_time,
            text_content=result.text_content
        ))
    
    return refreshed_results


@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    request: Request,
    file_id: Optional[str] = Query(None, description="Filter by file ID"),
    collection_id: Optional[str] = Query(None, description="Filter by collection ID")
):
    """
    List all conversations for the authenticated user.
    Optionally filter by file_id or collection_id.
    
    Returns:
        List of conversation summaries
    """
    try:
        user = request.state.user
        user_id = user.get("id") if user else None
        conversation_service = ConversationService()
        
        conversations = await conversation_service.list_user_conversations(
            user_id,
            file_id=file_id,
            collection_id=collection_id
        )
        return conversations
        
    except Exception as e:
        logger.error(f"Error listing conversations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str, request: Request):
    """
    Get full conversation history by ID.
    Generates fresh signed URLs for search results on-the-fly.
    
    Args:
        conversation_id: Conversation ID
    
    Returns:
        Full conversation with all messages and fresh signed URLs
    """
    try:
        user = request.state.user
        user_id = user.get("id") if user else None
        
        conversation_service = ConversationService()
        
        conversation = await conversation_service.get_conversation(conversation_id, user_id)
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Generate fresh signed URLs for all search results
        refreshed_messages = []
        for message in conversation.messages:
            if message.searchResults and len(message.searchResults) > 0:
                refreshed_search_results = await generate_signed_urls_for_results(message.searchResults)
                refreshed_messages.append(ChatMessage(
                    role=message.role,
                    content=message.content,
                    timestamp=message.timestamp,
                    searchResults=refreshed_search_results,
                    fileIds=message.fileIds
                ))
            else:
                refreshed_messages.append(message)
        
        # Return conversation with refreshed URLs
        return Conversation(
            id=conversation.id,
            user_id=conversation.user_id,
            messages=refreshed_messages,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            title=conversation.title
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request):
    """
    Delete a conversation.
    
    Args:
        conversation_id: Conversation ID to delete
    
    Returns:
        Success message
    """
    try:
        user_id = request.state.user.get("id") if request.state.user else None
        conversation_service = ConversationService()
        
        success = await conversation_service.delete_conversation(conversation_id, user_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return {"message": "Conversation deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/file/{file_id}")
async def delete_conversations_by_file(file_id: str, request: Request):
    """
    Delete all conversations for a specific file.
    
    Args:
        file_id: File ID
    
    Returns:
        Number of deleted conversations
    """
    try:
        user_id = request.state.user.get("id") if request.state.user else None
        conversation_service = ConversationService()
        
        count = await conversation_service.delete_conversations_by_file_id(file_id, user_id)
        
        return {"message": f"Deleted {count} conversations", "count": count}
        
    except Exception as e:
        logger.error(f"Error deleting conversations for file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/collection/{collection_id}")
async def delete_conversations_by_collection(collection_id: str, request: Request):
    """
    Delete all conversations for a specific collection.
    
    Args:
        collection_id: Collection ID
    
    Returns:
        Number of deleted conversations
    """
    try:
        user_id = request.state.user.get("id") if request.state.user else None
        conversation_service = ConversationService()
        
        count = await conversation_service.delete_conversations_by_collection_id(collection_id, user_id)
        
        return {"message": f"Deleted {count} conversations", "count": count}
        
    except Exception as e:
        logger.error(f"Error deleting conversations for collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/files/delete")
async def batch_delete_conversations_by_files(request: Request):
    """
    Delete all conversations for multiple files in batch.
    
    Body:
        file_ids: List of file IDs
    
    Returns:
        Number of deleted conversations
    """
    try:
        user_id = request.state.user.get("id") if request.state.user else None
        body = await request.json()
        file_ids = body.get("file_ids", [])
        
        if not file_ids:
            raise HTTPException(status_code=400, detail="file_ids is required")
        
        conversation_service = ConversationService()
        count = await conversation_service.delete_conversations_by_file_ids(file_ids, user_id)
        
        return {"message": f"Deleted {count} conversations", "count": count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch deleting conversations for files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/collections/delete")
async def batch_delete_conversations_by_collections(request: Request):
    """
    Delete all conversations for multiple collections in batch.
    
    Body:
        collection_ids: List of collection IDs
    
    Returns:
        Number of deleted conversations
    """
    try:
        user_id = request.state.user.get("id") if request.state.user else None
        body = await request.json()
        collection_ids = body.get("collection_ids", [])
        
        if not collection_ids:
            raise HTTPException(status_code=400, detail="collection_ids is required")
        
        conversation_service = ConversationService()
        count = await conversation_service.delete_conversations_by_collection_ids(collection_ids, user_id)
        
        return {"message": f"Deleted {count} conversations", "count": count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch deleting conversations for collections: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
