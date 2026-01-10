"""Service for managing conversation history and context"""
import logging
import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional
from src.models.chat import Conversation, ChatMessage, ConversationSummary
from src.config import settings
from src.decorators.singleton import singleton
from src.services.PrismaService import PrismaService

logger = logging.getLogger(__name__)


@singleton
class ConversationService:
    """
    Database-backed conversation management using Prisma.
    Stores conversations and messages in PostgreSQL.
    """
    
    def __init__(self):
        self.prisma_service = PrismaService()
    
    async def create_conversation(self, user_id: str, initial_message: Optional[str] = None, 
                                  file_ids: Optional[List[str]] = None) -> str:
        """Create a new conversation"""
        await self.prisma_service.ensure_connected()
        
        conversation_id = str(uuid.uuid4())
        title = self._generate_title(initial_message) if initial_message else "New Conversation"
        
        # Create conversation in database
        await self.prisma_service.prisma.conversation.create(
            data={
                "id": conversation_id,
                "userId": user_id,
                "title": title
            }
        )
        
        # Add initial message if provided
        if initial_message:
            message_data = {
                "conversationId": conversation_id,
                "role": "user",
                "content": initial_message
            }
            # Include file_ids if provided
            if file_ids:
                message_data["fileIds"] = file_ids
            
            await self.prisma_service.prisma.message.create(data=message_data)
        
        logger.info(f"Created conversation {conversation_id} for user {user_id}")
        return conversation_id
    
    async def get_conversation(self, conversation_id: str, user_id: str) -> Optional[Conversation]:
        """Get conversation by ID with ownership check"""
        await self.prisma_service.ensure_connected()
        
        conversation = await self.prisma_service.prisma.conversation.find_unique(
            where={"id": conversation_id},
            include={"messages": {"order_by": {"timestamp": "asc"}}}
        )
        
        if not conversation or conversation.userId != user_id:
            return None
        
        # Convert to Pydantic model
        messages = []
        for msg in conversation.messages:
            # Parse searchResults from JSON string if present
            search_results = None
            if msg.searchResults:
                try:
                    search_results_data = json.loads(msg.searchResults) if isinstance(msg.searchResults, str) else msg.searchResults
                    from src.models.chat import SearchResult
                    search_results = [SearchResult(**result) for result in search_results_data]
                except Exception as e:
                    logger.warning(f"Failed to parse searchResults for message {msg.id}: {e}")
            
            messages.append(
                ChatMessage(
                    role=msg.role,
                    content=msg.content,
                    timestamp=msg.timestamp,
                    searchResults=search_results,
                    fileIds=msg.fileIds if msg.fileIds else None
                )
            )
        
        return Conversation(
            id=conversation.id,
            user_id=conversation.userId,
            messages=messages,
            created_at=conversation.createdAt,
            updated_at=conversation.updatedAt,
            title=conversation.title,
            summary=conversation.summary  # Include summary for infinite chat
        )
    
    async def update_summary(self, conversation_id: str, summary: str, user_id: str) -> bool:
        """Update the conversation summary for infinite chat support"""
        await self.prisma_service.ensure_connected()
        
        # Verify conversation exists and belongs to user
        conversation = await self.prisma_service.prisma.conversation.find_unique(
            where={"id": conversation_id}
        )
        
        if not conversation or conversation.userId != user_id:
            logger.warning(f"Conversation {conversation_id} not found for user {user_id}")
            return False
        
        await self.prisma_service.prisma.conversation.update(
            where={"id": conversation_id},
            data={
                "summary": summary,
                "updatedAt": datetime.utcnow()
            }
        )
        
        logger.info(f"Updated summary for conversation {conversation_id}")
        return True
    
    async def add_message(self, conversation_id: str, role: str, content: str, user_id: str, 
                         search_results: Optional[List[Dict]] = None, file_ids: Optional[List[str]] = None) -> bool:
        """Add a message to conversation with optional search results and file IDs"""
        await self.prisma_service.ensure_connected()
        
        # Verify conversation exists and belongs to user
        conversation = await self.prisma_service.prisma.conversation.find_unique(
            where={"id": conversation_id}
        )
        
        if not conversation or conversation.userId != user_id:
            logger.warning(f"Conversation {conversation_id} not found for user {user_id}")
            return False
        
        # Create message
        message_data = {
            "conversationId": conversation_id,
            "role": role,
            "content": content
        }
        
        # Add optional fields if provided
        if search_results is not None:
            message_data["searchResults"] = json.dumps(search_results)
        if file_ids is not None:
            message_data["fileIds"] = file_ids
        
        await self.prisma_service.prisma.message.create(data=message_data)
        
        # Update conversation's updatedAt
        await self.prisma_service.prisma.conversation.update(
            where={"id": conversation_id},
            data={"updatedAt": datetime.utcnow()}
        )
        
        logger.debug(f"Added {role} message to conversation {conversation_id}")
        return True
    
    async def get_context(self, conversation_id: str, user_id: str) -> List[ChatMessage]:
        """Get recent conversation context"""
        await self.prisma_service.ensure_connected()
        
        conversation = await self.get_conversation(conversation_id, user_id)
        
        if not conversation:
            return []
        
        # Return last N messages for context
        context_size = settings.context_window_size * 2  # user + assistant pairs
        return conversation.messages[-context_size:]
    
    async def list_user_conversations(self, user_id: str) -> List[ConversationSummary]:
        """List all conversations for a user"""
        await self.prisma_service.ensure_connected()
        
        conversations = await self.prisma_service.prisma.conversation.find_many(
            where={"userId": user_id},
            include={"messages": True},
            order={"updatedAt": "desc"}
        )
        
        summaries = []
        for conv in conversations:
            # Sort messages by timestamp desc and get the last one
            sorted_messages = sorted(conv.messages, key=lambda m: m.timestamp, reverse=True)
            last_message = sorted_messages[0].content if sorted_messages else ""
            
            summaries.append(ConversationSummary(
                id=conv.id,
                title=conv.title,
                last_message=last_message[:100],
                message_count=len(conv.messages),
                created_at=conv.createdAt,
                updated_at=conv.updatedAt
            ))
        
        return summaries
    
    async def delete_conversation(self, conversation_id: str, user_id: str) -> bool:
        """Delete a conversation"""
        await self.prisma_service.ensure_connected()
        
        # Verify conversation exists and belongs to user
        conversation = await self.prisma_service.prisma.conversation.find_unique(
            where={"id": conversation_id}
        )
        
        if not conversation or conversation.userId != user_id:
            return False
        
        # Delete conversation (messages will cascade delete)
        await self.prisma_service.prisma.conversation.delete(
            where={"id": conversation_id}
        )
        
        logger.info(f"Deleted conversation {conversation_id}")
        return True
    
    def _generate_title(self, message: str) -> str:
        """Generate a title from the first message"""
        # Simple title generation - take first 50 chars
        title = message[:50].strip()
        if len(message) > 50:
            title += "..."
        return title
