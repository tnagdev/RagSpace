"""LLM service for chat functionality using NVIDIA API"""
import logging
import tiktoken
import json
from typing import List, Dict, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI
from src.config import settings
from src.decorators.singleton import SingletonMeta
from src.models.chat import ChatMessage

logger = logging.getLogger(__name__)


class LLMService(metaclass=SingletonMeta):
    """Service for handling LLM interactions with NVIDIA API via OpenAI SDK"""
    
    def __init__(self):
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url
            )
        
        # Initialize tokenizer for token counting
        try:
            # Use cl100k_base encoding (GPT-4 compatible)
            self.encoding = tiktoken.get_encoding("cl100k_base")
        except Exception as e:
            logger.warning(f"Could not load tiktoken encoding: {e}")
            self.encoding = None
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens in a text string.
        
        Args:
            text: Text to count tokens for
            
        Returns:
            Number of tokens
        """
        if not self.encoding:
            # Fallback: rough estimate (1 token ≈ 4 characters)
            return len(text) // 4
        
        try:
            return len(self.encoding.encode(text))
        except Exception as e:
            logger.error(f"Error counting tokens: {e}")
            return len(text) // 4
    
    def count_messages_tokens(self, messages: List[Dict[str, str]]) -> int:
        """
        Count total tokens in a list of messages.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            
        Returns:
            Total token count
        """
        total_tokens = 0
        for message in messages:
            # Add tokens for role
            total_tokens += 4  # Role tokens + formatting
            # Add tokens for content
            total_tokens += self.count_tokens(message.get("content", ""))
        
        total_tokens += 3  # Every reply is primed with assistant message
        return total_tokens
    
    def truncate_context(
        self,
        messages: List[ChatMessage],
        max_tokens: int,
        system_message: Optional[str] = None,
        search_results: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Intelligently truncate conversation history to fit within token limit.
        Keeps the most recent messages and system message.
        
        Args:
            messages: List of ChatMessage objects
            max_tokens: Maximum tokens allowed
            system_message: Optional system message to prepend
            search_results: Optional search results to include as multi-modal content
            
        Returns:
            List of message dicts ready for API (with multi-modal content)
        """
        formatted_messages = []
        
        # Add system message if provided
        if system_message:
            formatted_messages.append({
                "role": "system",
                "content": system_message
            })
        
        # Convert ChatMessage objects to dicts
        conversation_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]
        
        # Add search results as multi-modal content to the last user message if available
        if search_results and len(search_results) > 0 and conversation_messages:
            # Find the last user message
            for i in range(len(conversation_messages) - 1, -1, -1):
                if conversation_messages[i]["role"] == "user":
                    # Convert content to multi-modal format
                    original_content = conversation_messages[i]["content"]
                    multi_modal_content = [
                        {"type": "text", "text": original_content}
                    ]
                    
                    # Add only the top 1 image from search results (API limitation)
                    best_result = search_results[0]  # Take the highest scoring result
                    thumbnail_url = best_result.get("thumbnail_url")
                    file_url = best_result.get("file_url")
                    
                    # Prefer thumbnail, fallback to file_url
                    image_url = thumbnail_url or file_url
                    
                    if image_url:
                        multi_modal_content.append({
                            "type": "image_url",
                            "image_url": {"url": image_url}
                        })
                        logger.info(f"Added top search result image to prompt: {best_result.get('file_name')}")
                    
                    conversation_messages[i]["content"] = multi_modal_content
                    break
        
        # Calculate current token count (approximation for multi-modal)
        current_tokens = self._count_multimodal_tokens(formatted_messages + conversation_messages)
        
        # If within limit, return all messages
        if current_tokens <= max_tokens:
            return formatted_messages + conversation_messages
        
        # Truncate from the beginning, keeping recent messages
        logger.info(f"Truncating context: {current_tokens} tokens > {max_tokens} limit")
        
        # Keep most recent messages
        truncated = []
        accumulated_tokens = self._count_multimodal_tokens(formatted_messages)
        
        # Add messages from most recent backwards
        for message in reversed(conversation_messages):
            message_tokens = self._count_message_tokens(message)
            
            if accumulated_tokens + message_tokens > max_tokens:
                break
            
            truncated.insert(0, message)
            accumulated_tokens += message_tokens
        
        # Ensure we keep at least the last message
        if not truncated and conversation_messages:
            truncated = [conversation_messages[-1]]
        
        result = formatted_messages + truncated
        logger.info(f"Truncated to {len(truncated)} messages ({self._count_multimodal_tokens(result)} tokens)")
        
        return result
    
    def _count_message_tokens(self, message: Dict[str, Any]) -> int:
        """Count tokens in a single message (handles multi-modal content)"""
        content = message.get("content", "")
        
        # If content is a string, count normally
        if isinstance(content, str):
            return self.count_tokens(content) + 4
        
        # If content is a list (multi-modal), count each part
        if isinstance(content, list):
            tokens = 4  # Base role tokens
            for item in content:
                if item.get("type") == "text":
                    tokens += self.count_tokens(item.get("text", ""))
                elif item.get("type") == "image_url":
                    tokens += 85  # Approximate tokens for image (OpenAI uses ~85 tokens per image)
            return tokens
        
        return 4
    
    def _count_multimodal_tokens(self, messages: List[Dict[str, Any]]) -> int:
        """Count total tokens in a list of messages with multi-modal content"""
        return sum(self._count_message_tokens(msg) for msg in messages) + 3
    
    async def generate_response(
        self,
        messages: List[ChatMessage],
        search_results: Optional[List[Dict[str, Any]]] = None,
        temperature: Optional[float] = None
    ) -> str:
        """
        Generate a chat response using NVIDIA LLM.
        
        Args:
            messages: Conversation history
            search_results: Optional search results to include as context
            temperature: Optional temperature override
            
        Returns:
            Generated response text
        """
        if not self.client:
            return "LLM service not configured. Please set NVIDIA_API_KEY."
        
        try:
            # Build system message with search context if available
            system_message = self._build_system_message(search_results)
            
            # Truncate context to fit token limit (includes multi-modal content)
            api_messages = self.truncate_context(
                messages=messages,
                max_tokens=settings.max_context_tokens,
                system_message=system_message,
                search_results=search_results
            )
            
            # Limit number of messages to prevent excessive context
            if len(api_messages) > settings.max_messages_in_context:
                # Keep system message + recent messages
                system_msgs = [msg for msg in api_messages if msg["role"] == "system"]
                recent_msgs = api_messages[-settings.max_messages_in_context:]
                api_messages = system_msgs + recent_msgs
            
            logger.info(f"Sending {len(api_messages)} messages to LLM ({self._count_multimodal_tokens(api_messages)} tokens)")
            
            # Call NVIDIA API
            response = await self.client.chat.completions.create(
                model=settings.llm_model,
                messages=api_messages,
                max_tokens=settings.max_tokens,
                temperature=temperature or settings.temperature,
                stream=False
            )
            
            # Extract response
            assistant_message = response.choices[0].message.content
            logger.info(f"Generated response ({self.count_tokens(assistant_message)} tokens)")
            
            return assistant_message
            
        except Exception as e:
            logger.error(f"Error generating LLM response: {e}", exc_info=True)
            return f"I apologize, but I encountered an error generating a response: {str(e)}"
    
    async def generate_response_stream(
        self,
        messages: List[ChatMessage],
        search_results: Optional[List[Dict[str, Any]]] = None,
        temperature: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """
        Generate a streaming chat response using NVIDIA LLM.
        
        Args:
            messages: Conversation history
            search_results: Optional search results to include as context
            temperature: Optional temperature override
            
        Yields:
            Chunks of generated response text
        """
        if not self.client:
            yield "LLM service not configured. Please set NVIDIA_API_KEY."
            return
        
        try:
            # Build system message with search context if available
            system_message = self._build_system_message(search_results)
            
            # Truncate context to fit token limit (includes multi-modal content)
            api_messages = self.truncate_context(
                messages=messages,
                max_tokens=settings.max_context_tokens,
                system_message=system_message,
                search_results=search_results
            )
            
            # Limit number of messages to prevent excessive context
            if len(api_messages) > settings.max_messages_in_context:
                # Keep system message + recent messages
                system_msgs = [msg for msg in api_messages if msg["role"] == "system"]
                recent_msgs = api_messages[-settings.max_messages_in_context:]
                api_messages = system_msgs + recent_msgs
            
            logger.info(f"Streaming from LLM: {len(api_messages)} messages ({self._count_multimodal_tokens(api_messages)} tokens)")
            
            # Call NVIDIA API with streaming
            stream = await self.client.chat.completions.create(
                model=settings.llm_model,
                messages=api_messages,
                max_tokens=settings.max_tokens,
                temperature=temperature or settings.temperature,
                stream=True
            )
            
            # Stream the response
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield delta.content
            
        except Exception as e:
            logger.error(f"Error streaming LLM response: {e}", exc_info=True)
            yield f"I apologize, but I encountered an error: {str(e)}"
    
    def _build_system_message(self, search_results: Optional[List[Dict[str, Any]]]) -> str:
        """
        Build system message with optional search context.
        
        Args:
            search_results: Optional search results from semantic search
            
        Returns:
            System message string
        """
        base_message = """You are a helpful AI assistant for a rag content search platform called RagSpace. 
You help users find and understand their file content through conversational search.

When answering questions:
- Be concise and helpful
- Reference specific videos and scenes when available
- If search results are provided, use them to give accurate information
- If no relevant results are found, suggest alternative search strategies
- Maintain conversation context and refer back to previous messages when relevant
- Use the file descriptions, objects, settings, and other metadata to provide rich context about the files"""
        
        if search_results and len(search_results) > 0:
            context = "\n\n### Current Search Results:\n"
            for idx, result in enumerate(search_results[:5], 1):  # Limit to top 5
                file_name = result.get("file_name", "Unknown")
                score = result.get("score", 0)
                timestamp = result.get("timestamp")
                text_content = result.get("text_content", "")
                
                # Include metadata
                description = result.get("description")
                objects = result.get("objects")
                setting = result.get("setting")
                style = result.get("style")
                colors = result.get("colors")
                
                context += f"\n{idx}. **{file_name}** (relevance: {score:.1%})"
                if timestamp:
                    context += f" at {timestamp:.1f}s"
                context += "\n"
                
                # Add rich metadata context
                if description:
                    context += f"   📝 Description: {description}\n"
                if objects and len(objects) > 0:
                    context += f"   🏷️ Objects: {', '.join(objects[:10])}\n"
                if setting:
                    context += f"   📍 Setting: {setting}\n"
                if style:
                    context += f"   🎨 Style: {style}\n"
                if colors and len(colors) > 0:
                    context += f"   🎨 Colors: {', '.join(colors[:5])}\n"
                if text_content:
                    context += f"   💬 Text/Transcript: {text_content[:200]}\n"
            
            base_message += context
        
        return base_message
