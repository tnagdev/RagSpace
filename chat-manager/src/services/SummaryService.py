"""Service for summarizing conversation history when it gets too long.

This enables infinite chat by compressing older messages into summaries
while keeping recent messages in full detail.
"""
import logging
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
from src.config import settings
from src.models.chat import ChatMessage
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)

# System prompt for summarization
SUMMARY_SYSTEM_PROMPT = """You are a conversation summarizer. Your job is to create a concise summary of a conversation between a user and an AI assistant about their video/image files.

Create a summary that captures:
1. The main topics discussed
2. Key files or content the user was looking for
3. Important findings or results from searches
4. Any preferences or context the user shared

Keep the summary concise but informative. Focus on information that would be useful for continuing the conversation."""


@singleton
class SummaryService:
    """Service for generating and managing conversation summaries."""
    
    def __init__(self):
        if not settings.nvidia_api_key:
            logger.warning("NVIDIA API key not configured for SummaryService")
            self.client = None
        else:
            self.client = AsyncOpenAI(
                api_key=settings.nvidia_api_key,
                base_url=settings.nvidia_base_url
            )
    
    async def should_summarize(self, messages: List[ChatMessage]) -> bool:
        """
        Determine if the conversation should be summarized.
        
        Args:
            messages: List of conversation messages
            
        Returns:
            True if summarization is needed
        """
        # Summarize when we exceed the threshold
        return len(messages) > settings.summary_threshold
    
    async def summarize_messages(
        self,
        messages: List[ChatMessage],
        existing_summary: Optional[str] = None
    ) -> str:
        """
        Generate a summary of the given messages.
        
        Args:
            messages: Messages to summarize
            existing_summary: Optional existing summary to incorporate
            
        Returns:
            Summary string
        """
        if not self.client:
            logger.warning("Cannot summarize: LLM client not configured")
            return existing_summary or ""
        
        try:
            # Build the content to summarize
            content_parts = []
            
            if existing_summary:
                content_parts.append(f"Previous conversation summary:\n{existing_summary}\n\n---\n")
            
            content_parts.append("Messages to summarize:\n")
            for msg in messages:
                role = "User" if msg.role == "user" else "Assistant"
                content_parts.append(f"{role}: {msg.content[:500]}...")  # Truncate long messages
            
            user_content = "\n".join(content_parts)
            
            response = await self.client.chat.completions.create(
                model=settings.summary_model,
                messages=[
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=settings.summary_max_tokens,
                temperature=0.3  # Lower temperature for more consistent summaries
            )
            
            summary = response.choices[0].message.content
            logger.info(f"Generated summary from {len(messages)} messages")
            return summary
            
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            return existing_summary or ""
    
    def get_messages_for_context(
        self,
        messages: List[ChatMessage],
        summary: Optional[str] = None,
        keep_recent: int = None
    ) -> tuple[List[Dict[str, str]], Optional[str]]:
        """
        Get messages formatted for LLM context, with summarization if needed.
        
        Returns recent messages and incorporates summary into system context.
        
        Args:
            messages: All conversation messages
            summary: Existing conversation summary
            keep_recent: Number of recent messages to keep in full
            
        Returns:
            Tuple of (messages for context, summary to prepend to system message)
        """
        keep_recent = keep_recent or settings.keep_recent_messages
        
        if len(messages) <= keep_recent:
            # No need to use summary, return all messages
            return [{"role": m.role, "content": m.content} for m in messages], None
        
        # Keep only recent messages, rely on summary for older context
        recent_messages = messages[-keep_recent:]
        formatted = [{"role": m.role, "content": m.content} for m in recent_messages]
        
        summary_context = None
        if summary:
            summary_context = f"\n\n### Earlier Conversation Summary:\n{summary}\n\n(The above summarizes earlier parts of this conversation. Recent messages follow.)"
        
        return formatted, summary_context
    
    async def get_or_create_summary(
        self,
        messages: List[ChatMessage],
        existing_summary: Optional[str] = None
    ) -> tuple[str, List[ChatMessage]]:
        """
        Get or create a summary, returning the summary and messages that weren't summarized.
        
        This is the main entry point for managing conversation length.
        
        Args:
            messages: All conversation messages
            existing_summary: Previous summary if any
            
        Returns:
            Tuple of (updated summary, messages to keep in full context)
        """
        if len(messages) <= settings.summary_threshold:
            # No summarization needed yet
            return existing_summary or "", messages
        
        # Determine how many messages to summarize
        keep_recent = settings.keep_recent_messages
        messages_to_summarize = messages[:-keep_recent]
        messages_to_keep = messages[-keep_recent:]
        
        # Generate new summary incorporating old messages
        new_summary = await self.summarize_messages(
            messages=messages_to_summarize,
            existing_summary=existing_summary
        )
        
        logger.info(f"Summarized {len(messages_to_summarize)} messages, keeping {len(messages_to_keep)} recent")
        return new_summary, messages_to_keep
