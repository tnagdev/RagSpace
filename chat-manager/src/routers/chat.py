"""Chat API routes with agentic tool-calling workflow"""
import logging
import json
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from src.models.chat import ChatRequest, ChatResponse, SearchResult
from src.services.FileEmbedderService import FileEmbedderService
from src.services.ConversationService import ConversationService
from src.services.UploadManagerService import UploadManagerService
from src.services.AgentService import AgentService
from src.services.S3Service import S3Service
from src.config import settings
from src.common.conversation_quota import check_conversation_quota

router = APIRouter()
logger = logging.getLogger(__name__)


async def generate_signed_urls_for_results(results: list[SearchResult], s3_service: S3Service) -> list[SearchResult]:
    """
    Generate fresh signed URLs for all thumbnail and file URLs in search results.
    
    Args:
        results: List of SearchResult objects
        s3_service: S3Service instance for generating signed URLs
        
    Returns:
        List of SearchResult objects with signed URLs
    """
    for result in results:
        # Generate signed URL for thumbnail
        if result.thumbnail_s3_key:
            signed_url = await s3_service.get_signed_url(
                result.thumbnail_s3_key, 
                result.thumbnail_s3_bucket
            )
            if signed_url:
                result.thumbnail_url = signed_url
        
        # Generate signed URL for file
        if result.file_s3_key:
            signed_url = await s3_service.get_signed_url(
                result.file_s3_key,
                result.file_s3_bucket
            )
            if signed_url:
                result.file_url = signed_url
    
    return results


@router.post("")
@check_conversation_quota(check_file_conversations=True)
async def chat(body: ChatRequest, request: Request):
    """
    Process a chat message with SSE streaming response using agentic workflow.
    
    The agent decides whether to search for files based on the query,
    making conversations more natural and efficient.
    
    If conversation_id is provided, uses conversation history for context.
    Otherwise, creates a new conversation (with quota validation via decorator).
    
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

        logger.info(f"Chat request from user {user_id}: {body.message[:100]}")
        
        conversation_service = ConversationService()
        file_embedder = FileEmbedderService(user_context, session_context)
        upload_manager = UploadManagerService(user_context, session_context)
        
        # Get or create conversation
        conversation_id = body.conversation_id
        if not conversation_id:
            conversation_id = await conversation_service.create_conversation(
                user_id=user_id,
                initial_message=body.message,
                file_ids=body.file_ids,
                file_id=body.file_id,
                collection_id=body.collection_id
            )
            logger.info(f"Created new conversation: {conversation_id}")
        else:
            # Verify conversation exists and belongs to user
            conversation = await conversation_service.get_conversation(conversation_id, user_id)
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found")
            
            # Add user message to conversation with file IDs
            await conversation_service.add_message(
                conversation_id=conversation_id,
                role="user",
                content=body.message,
                user_id=user_id,
                file_ids=body.file_ids
            )
        
        # Get conversation history
        conversation_history = await conversation_service.get_conversation(conversation_id, user_id)
        messages = conversation_history.messages if conversation_history else []
        
        # Check if agentic mode is enabled
        use_agent = body.use_agent and settings.enable_agentic_mode
        
        if use_agent:
            # Use agentic workflow with tool calling
            return await _handle_agentic_chat(
                conversation_id=conversation_id,
                messages=messages,
                file_ids=body.file_ids,
                user_id=user_id,
                conversation_service=conversation_service,
                file_embedder=file_embedder,
                upload_manager=upload_manager,
                user_context=user_context,
                session_context=session_context,
                conversation_summary=getattr(conversation_history, 'summary', None)
            )
        else:
            # Fallback to direct search mode (legacy behavior)
            return await _handle_direct_search_chat(
                body=body,
                conversation_id=conversation_id,
                messages=messages,
                user_id=user_id,
                conversation_service=conversation_service,
                file_embedder=file_embedder,
                upload_manager=upload_manager,
                user_context=user_context,
                session_context=session_context
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _handle_agentic_chat(
    conversation_id: str,
    messages: list,
    file_ids: list,
    user_id: str,
    conversation_service,
    file_embedder,
    upload_manager,
    user_context: dict,
    session_context: dict,
    conversation_summary: str = None
):
    """Handle chat using the agentic workflow with tool calling."""
    
    # Initialize agent
    agent = AgentService(
        file_embedder_service=file_embedder,
        upload_manager_service=upload_manager,
        user_context=user_context,
        session_context=session_context
    )
    
    async def generate_sse():
        try:
            # Send initial metadata
            metadata = {
                "type": "metadata",
                "conversation_id": conversation_id,
                "mode": "agentic"
            }
            yield f"data: {json.dumps(metadata)}\n\n"
            
            full_response = ""
            all_search_results = []
            tools_used = []
            new_summary = None
            
            # Run the agent with streaming
            async for event in agent.run_streaming(
                messages=messages,
                file_ids=file_ids,
                conversation_summary=conversation_summary
            ):
                event_type = event.get("type")
                
                if event_type == "tool_start":
                    # Notify client about tool execution
                    yield f"data: {json.dumps(event)}\n\n"
                    
                elif event_type == "tool_result":
                    # Send search results to client
                    search_results = event.get("results", [])
                    if search_results:
                        all_search_results.extend(search_results)
                        # Format results for client display
                        results_event = {
                            "type": "results",
                            "results": [SearchResult(**r).model_dump() for r in search_results]
                        }
                        yield f"data: {json.dumps(results_event)}\n\n"
                    
                elif event_type == "content":
                    # Stream response content
                    content = event.get("content", "")
                    full_response += content
                    chunk_data = {
                        "type": "content",
                        "content": content
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"
                    
                elif event_type == "done":
                    tools_used = event.get("tools_used", [])
                    if event.get("summary_updated"):
                        new_summary = event.get("new_summary")
                    
                elif event_type == "error":
                    error_data = {
                        "type": "error",
                        "error": event.get("error", "Unknown error")
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
                    return
            
            # Save assistant response to conversation
            await conversation_service.add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
                user_id=user_id,
                search_results=[r for r in all_search_results] if all_search_results else None,
                file_ids=file_ids if file_ids else []
            )
            
            # Update conversation summary if needed
            if new_summary:
                await conversation_service.update_summary(
                    conversation_id=conversation_id,
                    summary=new_summary,
                    user_id=user_id
                )
            
            # Send completion event
            completion = {
                "type": "done",
                "conversation_id": conversation_id,
                "tools_used": tools_used,
                "result_count": len(all_search_results)
            }
            yield f"data: {json.dumps(completion)}\n\n"
            
        except Exception as e:
            logger.error(f"Agentic chat error: {e}", exc_info=True)
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


async def _handle_direct_search_chat(
    body: ChatRequest,
    conversation_id: str,
    messages: list,
    user_id: str,
    conversation_service,
    file_embedder,
    upload_manager,
    user_context: dict,
    session_context: dict
):
    """Handle chat with direct search (legacy mode - always searches)."""
    from src.services.LLMService import LLMService
    
    llm_service = LLMService()
    
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
    results = []
    search_results_for_llm = []
    
    logger.info(f"Search response received with {len(search_response.get('results', []))} results")
    
    # Collect all file_ids and scene_ids for bulk metadata fetch
    file_ids_to_fetch = set()
    scene_ids_to_fetch = set()
    raw_results = []
    
    if search_response and "results" in search_response:
        for result in search_response["results"]:
            file_id = result.get("file_id", "")
            scene_id = result.get("scene_id")
            
            if file_id:
                file_ids_to_fetch.add(file_id)
            if scene_id:
                scene_ids_to_fetch.add(scene_id)
            
            raw_results.append(result)
    
    # Bulk fetch metadata
    file_metadata_map = {}
    scene_metadata_map = {}
    
    try:
        if scene_ids_to_fetch:
            scene_metadata_list = await upload_manager.get_metadata_batch_by_scenes(list(scene_ids_to_fetch))
            if scene_metadata_list:
                for m in scene_metadata_list:
                    if m.get("sceneId"):
                        scene_metadata_map[m["sceneId"]] = m
        
        if file_ids_to_fetch:
            file_metadata_list = await upload_manager.get_metadata_batch_by_files(list(file_ids_to_fetch))
            if file_metadata_list:
                for m in file_metadata_list:
                    file_id = m.get("fileId")
                    if file_id and not m.get("sceneId"):
                        file_metadata_map[file_id] = m
    except Exception as e:
        logger.warning(f"Failed to fetch metadata in batch: {e}")
    
    # Process results with metadata
    for result in raw_results:
        file_details = result.get("file_details") or {}
        scene_details = result.get("scene_details") or {}
        file_id = result.get("file_id", "")
        scene_id = result.get("scene_id")
        
        logger.info(f"Processing result for file {file_id}: file_details keys={list(file_details.keys())}")
        logger.info(f"file_details content: fileType={file_details.get('fileType')}, youtubeUrl={file_details.get('youtubeUrl')}")
        
        metadata = None
        if scene_id and scene_id in scene_metadata_map:
            metadata = scene_metadata_map[scene_id]
        elif file_id and file_id in file_metadata_map:
            metadata = file_metadata_map[file_id]
        
        # Log what we're receiving from file_details
        file_type = file_details.get("fileType")
        youtube_url = file_details.get("youtubeUrl")
        logger.info(f"Building result for file {file_id}: fileType={file_type}, youtubeUrl={youtube_url}")
        
        result_data = {
            "file_id": file_id,
            "scene_id": scene_id,
            "file_name": file_details.get("originalFilename") or result.get("file_name", "Unknown"),
            "file_type": file_type,
            "score": result.get("score", 0.0),
            "timestamp": result.get("start_time") or result.get("timestamp"),
            "thumbnail_s3_key": scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath"),
            "thumbnail_s3_bucket": file_details.get("s3Bucket"),
            "file_s3_key": file_details.get("s3Key"),
            "file_s3_bucket": file_details.get("s3Bucket"),
            "thumbnail_url": scene_details.get("thumbnailUrl") or file_details.get("thumbnailUrl"),
            "file_url": file_details.get("url"),
            "youtube_url": youtube_url,
            "start_time": scene_details.get("startTime") or result.get("start_time"),
            "end_time": scene_details.get("endTime") or result.get("end_time"),
            "text_content": result.get("text", ""),
            "description": metadata.get("summary") if metadata else None,
            "objects": metadata.get("objects") if metadata else None,
            "setting": metadata.get("setting") if metadata else None,
            "style": metadata.get("style") if metadata else None,
            "colors": metadata.get("colors") if metadata else None,
        }
        
        logger.info(f"Result data: file_type={result_data['file_type']}, youtube_url={result_data['youtube_url']}")
        
        results.append(SearchResult(**result_data))
        search_results_for_llm.append(result_data)
    
    # Generate signed URLs for all results
    s3_service = S3Service()
    results = await generate_signed_urls_for_results(results, s3_service)
    
    # Create streaming response generator
    async def generate_sse():
        try:
            # Send initial metadata
            metadata = {
                "type": "metadata",
                "conversation_id": conversation_id,
                "results": [result.model_dump() for result in results],
                "context_used": context_used,
                "mode": "direct_search"
            }
            yield f"data: {json.dumps(metadata)}\n\n"
            
            # Stream LLM response
            full_response = ""
            async for chunk in llm_service.generate_response_stream(
                messages=messages,
                search_results=search_results_for_llm if search_results_for_llm else None
            ):
                full_response += chunk
                chunk_data = {
                    "type": "content",
                    "content": chunk
                }
                yield f"data: {json.dumps(chunk_data)}\n\n"
            
            # Save complete response to conversation
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
                "conversation_id": conversation_id,
                "tools_used": ["search_files"],
                "result_count": len(results)
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
