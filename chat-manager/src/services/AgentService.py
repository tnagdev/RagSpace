"""Agentic chat service with tool calling capabilities.

This service orchestrates the conversation flow, deciding when to use tools
(like search) vs responding directly based on the LLM's decisions.
"""
import logging
import json
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass, field
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageToolCall

from src.config import settings
from src.models.chat import ChatMessage, SearchResult
from src.tools.definitions import TOOLS
from src.services.SummaryService import SummaryService

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    """Result from a tool execution."""
    tool_call_id: str
    name: str
    result: Any
    search_results: Optional[List[Dict[str, Any]]] = None


@dataclass
class AgentResponse:
    """Response from the agent."""
    content: str
    search_results: List[Dict[str, Any]] = field(default_factory=list)
    tools_used: List[str] = field(default_factory=list)
    summary_updated: bool = False


# System prompt for the agent
AGENT_SYSTEM_PROMPT = """You are a helpful AI assistant for RagSpace, a video and image content search platform. 
You help users find and understand their uploaded media through conversational search.

You have access to tools, but ONLY use them when needed:

## When to use NO tools (answer directly):
- General knowledge questions ("what is 2+2?", "explain machine learning")
- Casual conversation or greetings
- Follow-up questions about results already shown
- Questions that can be answered from conversation context
- Clarifying questions or requests for explanation

## Tool: search_files
Use ONLY when the user asks about THEIR uploaded content:
- "find videos with red cars"
- "show me images from the beach"
- "where did I mention machine learning?" (searching their audio/video transcripts)
- "which video has a sunset scene?"
- Any query requiring lookup of visual, audio, or text content in their files

## Tool: get_video_content
Use ONLY when files are ATTACHED and user wants full video analysis:
- Files are attached AND user asks "summarize this video"
- Files are attached AND user wants complete scene-by-scene breakdown
- NOT for finding videos (use search_files) or when no files attached

## Tool: get_file_content  
Use ONLY when files are ATTACHED and user wants image/audio analysis:
- Files are attached AND user asks "what is in this image?"
- Files are attached AND user wants image description or audio transcript
- NOT for finding images (use search_files) or when no files attached

DECISION RULES:
1. General questions → Answer directly without tools
2. Questions about their files/content → Use search_files
3. Specific attached files → Use get_video_content or get_file_content
4. When in doubt, answer directly first; only use tools if the query clearly needs their content

When responding:
- Be concise and helpful
- Reference specific files and timestamps when available
- If search results are provided, describe what was found
- For video summaries, synthesize visual and audio content
- For image descriptions, describe objects, setting, style, and colors"""


class AgentService:
    """
    Agentic service that uses tool calling to decide when to search.
    
    The LLM decides whether a query needs a search or can be answered directly,
    making the conversation more natural and efficient.
    """
    
    def __init__(
        self,
        file_embedder_service,
        upload_manager_service,
        user_context: Dict[str, Any],
        session_context: Dict[str, Any]
    ):
        """
        Initialize the agent with required services.
        
        Args:
            file_embedder_service: Service for semantic search
            upload_manager_service: Service for file metadata
            user_context: User info for auth headers
            session_context: Session info for auth headers
        """
        self.file_embedder = file_embedder_service
        self.upload_manager = upload_manager_service
        self.user_context = user_context
        self.session_context = session_context
        self.summary_service = SummaryService()
        
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url,
                timeout=120.0
            )
    
    async def run(
        self,
        messages: List[ChatMessage],
        file_ids: Optional[List[str]] = None,
        conversation_summary: Optional[str] = None,
        max_iterations: int = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run the agent loop with streaming response.
        
        Yields SSE-formatted events for:
        - tool_start: When a tool is being called
        - tool_result: When a tool returns results
        - content: Streamed response chunks
        - done: Final completion with metadata
        
        Args:
            messages: Conversation history
            file_ids: Optional file ID filter for search
            conversation_summary: Optional existing conversation summary
            max_iterations: Maximum tool calling iterations
        """
        if not self.client:
            yield {"type": "error", "error": "LLM service not configured"}
            return
        
        max_iterations = max_iterations or settings.max_agent_iterations
        
        # Fetch file details if file_ids are provided
        attached_files = None
        if file_ids and len(file_ids) > 0:
            try:
                files_response = await self.upload_manager.get_files_batch(file_ids)
                logger.info(f"Files response from upload-manager: {files_response}")
                if files_response and "files" in files_response:
                    attached_files = files_response["files"]
                    logger.info(f"Fetched {len(attached_files)} attached files for context: {[f.get('originalFilename', f.get('id')) for f in attached_files]}")
            except Exception as e:
                logger.warning(f"Failed to fetch attached file details: {e}")
        
        # Check if we need to summarize the conversation
        summary = conversation_summary
        summary_updated = False
        
        if await self.summary_service.should_summarize(messages):
            summary, messages = await self.summary_service.get_or_create_summary(
                messages=messages,
                existing_summary=conversation_summary
            )
            summary_updated = True
            logger.info("Conversation summarized for context management")
        
        # Build initial messages for API
        api_messages = self._build_api_messages(messages, summary, attached_files)
        
        all_search_results = []
        tools_used = []
        executed_tool_calls = set()  # Track executed tool calls to prevent duplicates
        iteration = 0
        tools_executed_this_session = False  # Track if we've executed tools
        
        while iteration < max_iterations:
            iteration += 1
            
            try:
                # After tools have been executed, force a text response
                current_tool_choice = "none" if tools_executed_this_session else "auto"
                
                # Call LLM with tools
                response = await self.client.chat.completions.create(
                    model=settings.agent_model,
                    messages=api_messages,
                    tools=TOOLS if not tools_executed_this_session else None,
                    tool_choice=current_tool_choice if not tools_executed_this_session else None,
                    max_tokens=settings.max_tokens,
                    temperature=settings.temperature
                )
                
                message = response.choices[0].message
                
                # Check if LLM wants to use tools
                if message.tool_calls and not tools_executed_this_session:
                    # Process each tool call
                    tool_results = []
                    
                    for tool_call in message.tool_calls:
                        tool_name = tool_call.function.name
                        
                        # Create a unique key for this tool call
                        tool_key = f"{tool_name}:{tool_call.function.arguments}"
                        
                        # Skip if we've already executed this exact call
                        if tool_key in executed_tool_calls:
                            logger.info(f"Skipping duplicate tool call: {tool_name}")
                            continue
                        
                        executed_tool_calls.add(tool_key)
                        tools_used.append(tool_name)
                        
                        # Notify about tool execution
                        yield {
                            "type": "tool_start",
                            "tool": tool_name,
                            "arguments": tool_call.function.arguments
                        }
                        
                        # Execute the tool
                        result = await self._execute_tool(
                            tool_call=tool_call,
                            file_ids=file_ids
                        )
                        tool_results.append(result)
                        
                        # Collect search results if any
                        if result.search_results:
                            all_search_results.extend(result.search_results)
                        
                        # Notify about tool result
                        yield {
                            "type": "tool_result",
                            "tool": tool_name,
                            "results": result.search_results or [],
                            "result_count": len(result.search_results) if result.search_results else 0
                        }
                    
                    # Add assistant message with tool calls to conversation
                    api_messages.append({
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments
                                }
                            }
                            for tc in message.tool_calls
                        ]
                    })
                    
                    # Add tool results to conversation
                    for result in tool_results:
                        api_messages.append({
                            "role": "tool",
                            "tool_call_id": result.tool_call_id,
                            "content": json.dumps(result.result)
                        })
                    
                    # Mark that tools have been executed - next iteration will force text response
                    tools_executed_this_session = True
                    continue
                
                # No tool calls - stream the final response
                if message.content:
                    # For non-streaming response, yield the content
                    yield {
                        "type": "content",
                        "content": message.content
                    }
                
                # Done - yield completion with metadata
                yield {
                    "type": "done",
                    "search_results": all_search_results,
                    "tools_used": tools_used,
                    "summary_updated": summary_updated,
                    "new_summary": summary if summary_updated else None
                }
                return
                
            except Exception as e:
                logger.error(f"Agent error: {e}", exc_info=True)
                yield {"type": "error", "error": str(e)}
                return
        
        # Max iterations reached
        yield {
            "type": "error",
            "error": "Maximum tool iterations reached"
        }
    
    async def run_streaming(
        self,
        messages: List[ChatMessage],
        file_ids: Optional[List[str]] = None,
        conversation_summary: Optional[str] = None,
        max_iterations: int = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run the agent with streaming LLM response.
        
        Similar to run() but streams the final response token by token.
        """
        if not self.client:
            yield {"type": "error", "error": "LLM service not configured"}
            return
        
        max_iterations = max_iterations or settings.max_agent_iterations
        
        # Fetch file details if file_ids are provided
        attached_files = None
        if file_ids and len(file_ids) > 0:
            logger.info(f"run_streaming called with file_ids: {file_ids}")
            try:
                files_response = await self.upload_manager.get_files_batch(file_ids)
                logger.info(f"run_streaming files_response: {files_response}")
                if files_response and "files" in files_response:
                    attached_files = files_response["files"]
                    logger.info(f"Fetched {len(attached_files)} attached files for context: {[f.get('originalFilename', f.get('id')) for f in attached_files]}")
            except Exception as e:
                logger.warning(f"Failed to fetch attached file details: {e}")
        
        # Check if we need to summarize
        summary = conversation_summary
        summary_updated = False
        
        if await self.summary_service.should_summarize(messages):
            summary, messages = await self.summary_service.get_or_create_summary(
                messages=messages,
                existing_summary=conversation_summary
            )
            summary_updated = True
        
        api_messages = self._build_api_messages(messages, summary, attached_files)
        
        all_search_results = []
        tools_used = []
        executed_tool_calls = set()  # Track executed tool calls to prevent duplicates
        iteration = 0
        tools_executed_this_session = False  # Track if we've executed tools
        
        while iteration < max_iterations:
            iteration += 1
            
            try:
                # After tools have been executed, skip non-streaming check and go straight
                # to streaming. The non-streaming check would generate a full response and
                # discard it, wasting a round-trip and causing the flow to hang.
                if tools_executed_this_session:
                    logger.info("Generating final streaming response after tool execution")
                    stream = await self.client.chat.completions.create(
                        model=settings.agent_model,
                        messages=api_messages,
                        max_tokens=settings.max_tokens,
                        temperature=settings.temperature,
                        stream=True
                    )
                    
                    async for chunk in stream:
                        if chunk.choices and len(chunk.choices) > 0:
                            delta = chunk.choices[0].delta
                            if delta.content:
                                yield {
                                    "type": "content",
                                    "content": delta.content
                                }
                    
                    yield {
                        "type": "done",
                        "search_results": all_search_results,
                        "tools_used": tools_used,
                        "summary_updated": summary_updated,
                        "new_summary": summary if summary_updated else None
                    }
                    return
                
                # Check if tools are needed (non-streaming call)
                logger.info(f"Agent iteration {iteration}: checking for tool calls")
                response = await self.client.chat.completions.create(
                    model=settings.agent_model,
                    messages=api_messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    max_tokens=settings.max_tokens,
                    temperature=settings.temperature,
                    stream=False
                )
                
                message = response.choices[0].message
                
                if message.tool_calls:
                    # Process tools
                    tool_results = []
                    
                    for tool_call in message.tool_calls:
                        tool_name = tool_call.function.name
                        
                        # Create a unique key for this tool call
                        tool_key = f"{tool_name}:{tool_call.function.arguments}"
                        
                        # Skip if we've already executed this exact call
                        if tool_key in executed_tool_calls:
                            logger.info(f"Skipping duplicate tool call: {tool_name}")
                            continue
                        
                        executed_tool_calls.add(tool_key)
                        tools_used.append(tool_name)
                        
                        yield {
                            "type": "tool_start",
                            "tool": tool_name,
                            "arguments": tool_call.function.arguments
                        }
                        
                        result = await self._execute_tool(
                            tool_call=tool_call,
                            file_ids=file_ids
                        )
                        tool_results.append(result)
                        
                        if result.search_results:
                            all_search_results.extend(result.search_results)
                        
                        yield {
                            "type": "tool_result",
                            "tool": tool_name,
                            "results": result.search_results or [],
                            "result_count": len(result.search_results) if result.search_results else 0
                        }
                    
                    # Add to conversation
                    api_messages.append({
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments
                                }
                            }
                            for tc in message.tool_calls
                        ]
                    })
                    
                    for result in tool_results:
                        api_messages.append({
                            "role": "tool",
                            "tool_call_id": result.tool_call_id,
                            "content": json.dumps(result.result)
                        })
                    
                    # Mark that tools have been executed - next iteration goes straight to streaming
                    tools_executed_this_session = True
                    continue
                
                # No tool calls - model responded directly; use the content already received
                # to avoid a redundant second LLM call
                if message.content:
                    yield {
                        "type": "content",
                        "content": message.content
                    }
                
                yield {
                    "type": "done",
                    "search_results": all_search_results,
                    "tools_used": tools_used,
                    "summary_updated": summary_updated,
                    "new_summary": summary if summary_updated else None
                }
                return
                
            except Exception as e:
                logger.error(f"Agent streaming error: {e}", exc_info=True)
                yield {"type": "error", "error": str(e)}
                return
        
        yield {"type": "error", "error": "Maximum tool iterations reached"}
    
    def _build_api_messages(
        self,
        messages: List[ChatMessage],
        summary: Optional[str] = None,
        attached_files: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Build messages list for the API, incorporating summary and attached files if present."""
        api_messages = []
        
        # Build system message with optional summary and attached files
        system_content = AGENT_SYSTEM_PROMPT
        
        if attached_files and len(attached_files) > 0:
            system_content += f"\n\n### User has attached {len(attached_files)} file(s):\n"
            for f in attached_files:
                file_name = f.get("originalFilename") or f.get("original_filename") or f.get("filename") or "Unknown"
                file_id = f.get("id", "Unknown")
                file_type = f.get("fileType", "Unknown")
                system_content += f"- {file_name} (ID: {file_id}, Type: {file_type})\n"
            
            system_content += "\nIMPORTANT: The user wants to work with these attached files. "
            system_content += "Use search_files to find specific content, or get_video_content to summarize/narrate entire videos."
        
        if summary:
            system_content += f"\n\n### Earlier Conversation Summary:\n{summary}\n\n(Recent messages follow below.)"
        
        api_messages.append({
            "role": "system",
            "content": system_content
        })
        
        # Add conversation messages
        for msg in messages:
            api_messages.append({
                "role": msg.role,
                "content": msg.content
            })
        
        return api_messages
    
    async def _execute_tool(
        self,
        tool_call: ChatCompletionMessageToolCall,
        file_ids: Optional[List[str]] = None
    ) -> ToolResult:
        """Execute a tool call and return the result."""
        tool_name = tool_call.function.name
        
        try:
            arguments = json.loads(tool_call.function.arguments)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse tool arguments: {tool_call.function.arguments}")
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_name,
                result={"error": "Failed to parse tool arguments"}
            )
        
        logger.info(f"Executing tool: {tool_name} with args: {arguments}")
        
        if tool_name == "search_files":
            return await self._execute_search(tool_call.id, arguments, file_ids)
        elif tool_name == "get_video_content":
            return await self._execute_get_video_content(tool_call.id, arguments, file_ids)
        elif tool_name == "get_file_content":
            return await self._execute_get_file_content(tool_call.id, arguments, file_ids)
        elif tool_name == "get_conversation_summary":
            return await self._execute_get_summary(tool_call.id)
        else:
            return ToolResult(
                tool_call_id=tool_call.id,
                name=tool_name,
                result={"error": f"Unknown tool: {tool_name}"}
            )
    
    async def _execute_search(
        self,
        tool_call_id: str,
        arguments: Dict[str, Any],
        file_ids: Optional[List[str]] = None
    ) -> ToolResult:
        """Execute the search_files tool."""
        query = arguments.get("query", "")
        max_results = arguments.get("max_results", 5)
        file_type = arguments.get("file_type", "all")
        
        user_id = self.user_context.get("id")
        
        try:
            # Call file embedder search
            search_response = await self.file_embedder.search(
                query=query,
                user_id=user_id,
                file_ids=file_ids,
                max_results=max_results,
                use_dynamic_retrieval=True,
                adaptive_scoring=True,
                enable_query_expansion=True,
                use_enhanced=True
            )
            
            results = []
            if search_response and "results" in search_response:
                for result in search_response["results"]:
                    file_details = result.get("file_details") or {}
                    scene_details = result.get("scene_details") or {}
                    
                    result_data = {
                        "file_id": result.get("file_id", ""),
                        "scene_id": result.get("scene_id"),
                        "file_name":file_details.get("originalFilename", "") or result.get("file_name", "Unknown"),
                        "score": result.get("score", 0.0),
                        "timestamp": result.get("start_time") or result.get("timestamp"),
                        "thumbnail_s3_key": scene_details.get("thumbnailS3Key") or file_details.get("thumbnailPath"),
                        "thumbnail_s3_bucket": file_details.get("s3Bucket"),
                        "file_s3_key": file_details.get("s3Key"),
                        "file_s3_bucket": file_details.get("s3Bucket"),
                        "thumbnail_url": scene_details.get("thumbnailUrl") or file_details.get("thumbnailUrl"),
                        "file_url": file_details.get("url"),
                        "youtube_url": file_details.get("youtubeUrl"),
                        "start_time": scene_details.get("startTime") or result.get("start_time"),
                        "end_time": scene_details.get("endTime") or result.get("end_time"),
                        "text_content": result.get("text", ""),
                    }
                    
                    # Fetch metadata if available
                    scene_id = result.get("scene_id")
                    file_id = result.get("file_id")
                    
                    try:
                        if scene_id:
                            metadata_list = await self.upload_manager.get_metadata_batch_by_scenes([scene_id])
                            if metadata_list:
                                metadata = metadata_list[0]
                                result_data.update({
                                    "description": metadata.get("summary"),
                                    "objects": metadata.get("objects"),
                                    "setting": metadata.get("setting"),
                                    "style": metadata.get("style"),
                                    "colors": metadata.get("colors")
                                })
                        elif file_id:
                            metadata_list = await self.upload_manager.get_metadata_batch_by_files([file_id])
                            if metadata_list:
                                metadata = metadata_list[0]
                                result_data.update({
                                    "description": metadata.get("summary"),
                                    "objects": metadata.get("objects"),
                                    "setting": metadata.get("setting"),
                                    "style": metadata.get("style"),
                                    "colors": metadata.get("colors")
                                })
                    except Exception as e:
                        logger.warning(f"Failed to fetch metadata: {e}")
                    
                    results.append(result_data)
            
            # Format for LLM consumption
            formatted_results = self._format_search_results_for_llm(results)
            
            return ToolResult(
                tool_call_id=tool_call_id,
                name="search_files",
                result=formatted_results,
                search_results=results
            )
            
        except Exception as e:
            logger.error(f"Search error: {e}", exc_info=True)
            return ToolResult(
                tool_call_id=tool_call_id,
                name="search_files",
                result={"error": str(e), "results": []}
            )
    
    async def _execute_get_summary(self, tool_call_id: str) -> ToolResult:
        """Execute the get_conversation_summary tool."""
        # This is handled by the summary already being in context
        # Tool exists for LLM to explicitly request it
        return ToolResult(
            tool_call_id=tool_call_id,
            name="get_conversation_summary",
            result={
                "message": "The conversation summary is already included in your context above."
            }
        )
    
    async def _execute_get_video_content(
        self,
        tool_call_id: str,
        arguments: Dict[str, Any],
        file_ids: Optional[List[str]] = None
    ) -> ToolResult:
        """
        Execute the get_video_content tool for video summarization/narration.
        Retrieves ALL content for one or more videos in chronological order.
        """
        # Support both single file_id and array of file_ids
        requested_file_ids = arguments.get("file_ids") or []
        if arguments.get("file_id"):
            requested_file_ids = [arguments.get("file_id")]
        
        # If no file_ids provided but we have attached files, use all of them
        if not requested_file_ids and file_ids and len(file_ids) > 0:
            requested_file_ids = file_ids
            logger.info(f"No file_ids provided, using all attached files: {requested_file_ids}")
        
        # Reject if no files attached - should use search_files instead
        if not requested_file_ids:
            logger.warning("get_video_content called with no file_ids and no attachments - should use search_files")
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_video_content",
                result={
                    "error": "No files are attached to analyze. To find videos, use search_files tool instead.",
                    "found": False,
                    "suggestion": "Use search_files to find videos matching your query, then attach specific files to get their full content."
                }
            )
        
        try:
            # Process all videos
            all_results = []
            for fid in requested_file_ids:
                # Validate file_id format (should be UUID-like, not a filename)
                if " " in fid or "." in fid:
                    logger.warning(f"Invalid file_id format detected: '{fid}' - looks like a filename, not an ID")
                    all_results.append({
                        "file_id": fid,
                        "found": False,
                        "error": f"Invalid file_id: '{fid}' appears to be a filename. Please use the actual file ID."
                    })
                    continue
                
                logger.info(f"Fetching video content for file_id: {fid}")
                content_response = await self.file_embedder.get_video_content(
                    file_id=fid,
                    include_metadata=True
                )
                
                if content_response:
                    formatted = self._format_video_content_for_llm(content_response)
                    all_results.append(formatted)
                else:
                    all_results.append({
                        "file_id": fid,
                        "found": False,
                        "error": f"Could not retrieve content for video: {fid}"
                    })
            
            # Combine results
            if len(all_results) == 1:
                combined_result = all_results[0]
            else:
                combined_result = {
                    "found": any(r.get("found", False) for r in all_results),
                    "total_files": len(all_results),
                    "files": all_results,
                    "instructions": (
                        "Multiple videos have been analyzed. Each file's content is provided above. "
                        "Describe or summarize each video based on its content_timeline and metadata."
                    )
                }
            
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_video_content",
                result=combined_result,
                search_results=None
            )
            
        except Exception as e:
            logger.error(f"Get video content error: {e}", exc_info=True)
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_video_content",
                result={"error": str(e), "found": False}
            )
    
    def _format_video_content_for_llm(
        self,
        content: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Format video content for LLM consumption (summarization/narration)."""
        if not content:
            return {
                "found": False,
                "message": "No content found for this video."
            }
        
        file_name = content.get("file_name", "Unknown video")
        total_duration = content.get("total_duration")
        total_scenes = content.get("total_scenes", 0)
        total_segments = content.get("total_segments", 0)
        summary_context = content.get("summary_context", "")
        
        # Build a rich context for the LLM
        formatted = {
            "found": True,
            "file_name": file_name,
            "file_id": content.get("file_id"),
            "duration_seconds": total_duration,
            "duration_formatted": f"{total_duration/60:.1f} minutes" if total_duration else None,
            "total_scenes": total_scenes,
            "total_audio_segments": total_segments,
            "content_timeline": summary_context,
            "instructions": (
                "Use the content_timeline above to summarize or narrate the video. "
                "The timeline shows all visual scenes and audio transcriptions in chronological order. "
                "[Visual] entries describe what is seen on screen. "
                "[Audio] entries contain spoken words or sounds. "
                "Combine both to create a comprehensive summary or narration."
            )
        }
        
        # Also include structured content for detailed access
        content_items = content.get("content", [])
        if content_items:
            formatted["detailed_content"] = []
            for item in content_items[:50]:  # Limit to prevent token overflow
                detail = {
                    "type": item.get("type"),
                    "time_range": f"{item.get('start_time', 0):.1f}s - {item.get('end_time', 0):.1f}s" if item.get("start_time") else None,
                }
                if item.get("description"):
                    detail["description"] = item.get("description")
                if item.get("text"):
                    detail["transcript"] = item.get("text")[:300]  # Truncate long transcripts
                formatted["detailed_content"].append(detail)
        
        return formatted
    
    async def _execute_get_file_content(
        self,
        tool_call_id: str,
        arguments: Dict[str, Any],
        file_ids: Optional[List[str]] = None
    ) -> ToolResult:
        """
        Execute the get_file_content tool for image/audio file analysis.
        Retrieves content and metadata for one or more non-video files.
        """
        # Support both single file_id and array of file_ids
        requested_file_ids = arguments.get("file_ids") or []
        if arguments.get("file_id"):
            requested_file_ids = [arguments.get("file_id")]
        
        # If no file_ids provided but we have attached files, use all of them
        if not requested_file_ids and file_ids and len(file_ids) > 0:
            requested_file_ids = file_ids
            logger.info(f"No file_ids provided, using all attached files: {requested_file_ids}")
        
        # Reject if no files attached - should use search_files instead
        if not requested_file_ids:
            logger.warning("get_file_content called with no file_ids and no attachments - should use search_files")
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_file_content",
                result={
                    "error": "No files are attached to analyze. To find images or files, use search_files tool instead.",
                    "found": False,
                    "suggestion": "Use search_files to find images/files matching your query, then attach specific files to get their detailed content."
                }
            )
        
        try:
            # Process all files
            all_results = []
            for fid in requested_file_ids:
                # Validate file_id format (should be UUID-like, not a filename)
                if " " in fid or "." in fid:
                    logger.warning(f"Invalid file_id format detected: '{fid}' - looks like a filename, not an ID")
                    all_results.append({
                        "file_id": fid,
                        "found": False,
                        "error": f"Invalid file_id: '{fid}' appears to be a filename. Please use the actual file ID."
                    })
                    continue
                
                logger.info(f"Fetching content for file_id: {fid}")
                content_response = await self.file_embedder.get_file_content(
                    file_id=fid,
                    include_metadata=True
                )
                
                if content_response:
                    formatted = self._format_file_content_for_llm(content_response)
                    all_results.append(formatted)
                else:
                    all_results.append({
                        "file_id": fid,
                        "found": False,
                        "error": f"Could not retrieve content for file: {fid}"
                    })
            
            # Combine results
            if len(all_results) == 1:
                combined_result = all_results[0]
            else:
                combined_result = {
                    "found": any(r.get("found", False) for r in all_results),
                    "total_files": len(all_results),
                    "files": all_results,
                    "instructions": (
                        "Multiple files have been analyzed. Each file's content and metadata is provided above. "
                        "Describe each file based on its content_summary, description, objects, setting, and other metadata."
                    )
                }
            
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_file_content",
                result=combined_result,
                search_results=None
            )
            
        except Exception as e:
            logger.error(f"Get file content error: {e}", exc_info=True)
            return ToolResult(
                tool_call_id=tool_call_id,
                name="get_file_content",
                result={"error": str(e), "found": False}
            )
    
    def _format_file_content_for_llm(
        self,
        content: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Format file content for LLM consumption (image/audio analysis)."""
        if not content:
            return {
                "found": False,
                "message": "No content found for this file."
            }
        
        file_name = content.get("file_name", "Unknown file")
        file_type = content.get("file_type", "Unknown")
        summary_context = content.get("summary_context", "")
        
        # Build a rich context for the LLM
        formatted = {
            "found": True,
            "file_name": file_name,
            "file_id": content.get("file_id"),
            "file_type": file_type,
            "file_url": content.get("file_url"),
            "thumbnail_url": content.get("thumbnail_url"),
            "content_summary": summary_context,
        }
        
        # Add metadata fields if present
        if content.get("description"):
            formatted["description"] = content["description"]
        
        if content.get("objects"):
            formatted["objects"] = content["objects"]
        
        if content.get("setting"):
            formatted["setting"] = content["setting"]
        
        if content.get("style"):
            formatted["style"] = content["style"]
        
        if content.get("colors"):
            formatted["colors"] = content["colors"]
        
        if content.get("transcript"):
            formatted["transcript"] = content["transcript"]
        
        # Add instructions based on file type
        if file_type == "IMAGE":
            formatted["instructions"] = (
                "Use the content_summary and metadata above to describe or analyze this image. "
                "The description, objects, setting, style, and colors provide details about what is in the image."
            )
        elif file_type == "AUDIO":
            formatted["instructions"] = (
                "Use the transcript above to understand the audio content. "
                "The transcript contains the spoken words or sounds from the audio file."
            )
        else:
            formatted["instructions"] = (
                "Use the content_summary above to describe this file."
            )
        
        return formatted
    
    def _format_search_results_for_llm(
        self,
        results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Format search results for LLM consumption."""
        if not results:
            return {
                "found": False,
                "message": "No matching content found in the user's files.",
                "results": []
            }
        
        formatted = {
            "found": True,
            "count": len(results),
            "results": []
        }
        
        for idx, result in enumerate(results, 1):
            item = {
                "rank": idx,
                "file_name": result.get("file_name"),
                "relevance_score": f"{result.get('score', 0):.1%}",
            }
            
            if result.get("timestamp"):
                item["timestamp"] = f"{result['timestamp']:.1f}s"
            if result.get("description"):
                item["description"] = result["description"]
            if result.get("objects"):
                item["objects"] = result["objects"]
            if result.get("setting"):
                item["setting"] = result["setting"]
            if result.get("text_content"):
                item["transcript"] = result["text_content"][:200]
            
            formatted["results"].append(item)
        
        return formatted
