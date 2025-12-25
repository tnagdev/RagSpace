"""Chat API routes"""
import logging
import json
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from src.models.chat import ChatRequest, ChatResponse, SearchResult
from src.services.FileEmbedderService import FileEmbedderService
from src.services.ConversationService import ConversationService
from src.services.LLMService import LLMService

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/")
async def chat(body: ChatRequest, request: Request):
    """
    Process a chat message with SSE streaming response.
    
    If conversation_id is provided, uses conversation history for context.
    Otherwise, creates a new conversation.
    
    Args:
        body: Chat request with message and options
        request: FastAPI request with user context
    
    Returns:
        Server-Sent Events stream with chat response chunks
    """
    try:
        user = request.state.user
        user_id = user.get("id") if user else None
        user_email = user.get("email") if user else None
        user_name = user.get("name") if user else None
        
        # Build user and session context for HttpClient
        user_context = {
            "id": user_id,
            "email": user_email,
            "name": user_name
        }
        session_context = {
            "userId": user_id
        }

        logger.info(f"Chat request from user {user_id}: {json.dumps(request.state.user)}")
        
        conversation_service = ConversationService()
        file_embedder = FileEmbedderService(user_context, session_context)
        llm_service = LLMService()
        
        # Get or create conversation
        conversation_id = body.conversation_id
        if not conversation_id:
            conversation_id = await conversation_service.create_conversation(
                user_id=user_id,
                initial_message=body.message
            )
            logger.info(f"Created new conversation: {conversation_id}")
        else:
            # Verify conversation exists and belongs to user
            conversation = await conversation_service.get_conversation(conversation_id, user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            # Add user message to conversation
            await conversation_service.add_message(
                conversation_id=conversation_id,
                role="user",
                content=body.message,
                user_id=user_id
            )
        
        # Build search query with context if enabled
        search_query = body.message
        context_used = False
        
        if body.include_context and body.conversation_id:
            context = await conversation_service.get_context(conversation_id, user_id)
            if len(context) > 1:
                recent_messages = [msg.content for msg in context[-3:] if msg.role == "user"]
                context_text = " ".join(recent_messages)
                search_query = f"{context_text} {body.message}"
                context_used = True
                logger.info(f"Using conversation context for search")
        
        # Perform semantic search
        logger.info(f"Searching with query: {search_query[:100]}")
        search_response = await file_embedder.search(
            query=search_query,
            user_id=user_id,
            file_ids=body.file_ids,
            max_results=body.max_results,
            use_dynamic_retrieval=True,
            adaptive_scoring=True,
            enable_query_expansion=True,
            use_enhanced=True
        )
        
        # Parse search results
        logger.info(f"Search response: {json.dumps(search_response)}")
        results = []
        search_results_for_llm = []
        if search_response and "results" in search_response:
            for result in search_response["results"]:
                # Extract file details
                file_details = result.get("file_details") or {}
                scene_details = result.get("scene_details") or {}
                
                result_data = {
                    "file_id": result.get("file_id", ""),
                    "scene_id": result.get("scene_id"),
                    "file_name": result.get("file_name", "Unknown"),
                    "score": result.get("score", 0.0),
                    "timestamp": result.get("start_time") or result.get("timestamp"),
                    "thumbnail_s3_key": scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath"),
                    "thumbnail_s3_bucket": file_details.get("s3Bucket"),
                    "file_s3_key": file_details.get("s3Key"),
                    "file_s3_bucket": file_details.get("s3Bucket"),
                    "thumbnail_url": scene_details.get("thumbnailUrl") or file_details.get("thumbnailUrl"),
                    "file_url": file_details.get("url"),
                    "start_time": scene_details.get("startTime") or result.get("start_time"),
                    "end_time": scene_details.get("endTime") or result.get("end_time"),
                    "text_content": result.get("text", "")
                }
                
                results.append(SearchResult(**result_data))
                search_results_for_llm.append(result_data)
        logger.info(f'Search results for LLM: {json.dumps(search_results_for_llm)}')
        # Get conversation history for LLM context
        conversation_history = await conversation_service.get_conversation(conversation_id, user_id)
        
        # Create streaming response generator
        async def generate_sse():
            try:
                # Send initial metadata
                metadata = {
                    "type": "metadata",
                    "conversation_id": conversation_id,
                    "results": [result.model_dump() for result in results],
                    "context_used": context_used
                }
                yield f"data: {json.dumps(metadata)}\n\n"
                
                # Stream LLM response
                full_response = ""
                async for chunk in llm_service.generate_response_stream(
                    messages=conversation_history.messages if conversation_history else [],
                    search_results=search_results_for_llm if search_results_for_llm else None
                ):
                    full_response += chunk
                    chunk_data = {
                        "type": "content",
                        "content": chunk
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"
                
                # Save complete response to conversation with search results
                await conversation_service.add_message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                    user_id=user_id,
                    search_results=[result.model_dump() for result in results],
                    file_ids=body.file_ids if body.file_ids else []
                )
                
                # Send completion event
                completion = {
                    "type": "done",
                    "conversation_id": conversation_id
                }
                yield f"data: {json.dumps(completion)}\n\n"
                
            except Exception as e:
                error_data = {
                    "type": "error",
                    "error": str(e)
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
        return StreamingResponse(
            generate_sse(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
