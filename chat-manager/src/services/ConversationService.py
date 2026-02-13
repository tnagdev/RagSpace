"""Service for managing conversation history and context"""
import logging
import uuid
import json
from datetime import datetime
from typing import Dict, List, Optional
from src.models.chat import Conversation, ChatMessage, ConversationSummary
from src.config import settings
from src.decorators.singleton import SingletonMeta
from src.services.PrismaService import PrismaService

logger = logging.getLogger(__name__)



class ConversationService(metaclass=SingletonMeta):
    """
    Database-backed conversation management using Prisma.
    Stores conversations and messages in PostgreSQL.
    Uses shared Prisma connection to avoid exhausting connection pool.
    """
    _prisma_service: Optional[PrismaService] = None
    
    def __init__(self):
        # Use shared singleton instance - don't create new connections
        if ConversationService._prisma_service is None:
            ConversationService._prisma_service = PrismaService()
    
    @property
    def prisma_service(self) -> PrismaService:
        """Get the shared Prisma service"""
        if ConversationService._prisma_service is None:
            ConversationService._prisma_service = PrismaService()
        return ConversationService._prisma_service
    
    async def create_conversation(self, user_id: str, initial_message: Optional[str] = None, 
                                  file_ids: Optional[List[str]] = None, file_id: Optional[str] = None,
                                  collection_id: Optional[str] = None) -> str:
        """Create a new conversation"""
        await self.prisma_service.ensure_connected()
        
        conversation_id = str(uuid.uuid4())
        title = self._generate_title(initial_message) if initial_message else "New Conversation"
        
        # Create conversation in database
        conversation_data = {
            "id": conversation_id,
            "userId": user_id,
            "title": title
        }
        
        # Add fileId or collectionId if provided
        if file_id:
            conversation_data["fileId"] = file_id
        if collection_id:
            conversation_data["collectionId"] = collection_id
        
        await self.prisma_service.prisma.conversation.create(data=conversation_data)
        
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
            summary=conversation.summary,
            file_id=conversation.fileId,
            collection_id=conversation.collectionId
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
    
    async def list_user_conversations(self, user_id: str, file_id: Optional[str] = None, 
                                     collection_id: Optional[str] = None) -> List[ConversationSummary]:
        """List all conversations for a user, optionally filtered by file_id or collection_id"""
        await self.prisma_service.ensure_connected()
        
        # Build where clause
        where_clause = {"userId": user_id}
        if file_id:
            where_clause["fileId"] = file_id
        if collection_id:
            where_clause["collectionId"] = collection_id
        
        conversations = await self.prisma_service.prisma.conversation.find_many(
            where=where_clause,
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
                updated_at=conv.updatedAt,
                file_id=conv.fileId,
                collection_id=conv.collectionId
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
    
    async def delete_conversations_by_file_id(self, file_id: str, user_id: str) -> int:
        """Delete all conversations for a specific file"""
        await self.prisma_service.ensure_connected()
        result = await self.prisma_service.prisma.conversation.delete_many(
            where={
                "fileId": file_id,
                "userId": user_id
            }
        )
        logger.info(f"Deleted {result} conversations for file {file_id}")
        return result
    
    async def delete_conversations_by_collection_id(self, collection_id: str, user_id: str) -> int:
        """Delete all conversations for a specific collection"""
        await self.prisma_service.ensure_connected()
        result = await self.prisma_service.prisma.conversation.delete_many(
            where={
                "collectionId": collection_id,
                "userId": user_id
            }
        )
        logger.info(f"Deleted {result} conversations for collection {collection_id}")
        return result
    
    async def delete_conversations_by_file_ids(self, file_ids: list[str], user_id: str) -> int:
        """Delete all conversations for multiple files in batch"""
        await self.prisma_service.ensure_connected()
        
        result = await self.prisma_service.prisma.conversation.delete_many(
            where={
                "fileId": {"in": file_ids},
                "userId": user_id
            }
        )
        
        logger.info(f"Deleted {result} conversations for {len(file_ids)} files")
        return result
    
    async def delete_conversations_by_collection_ids(self, collection_ids: list[str], user_id: str) -> int:
        """Delete all conversations for multiple collections in batch"""
        await self.prisma_service.ensure_connected()
        
        result = await self.prisma_service.prisma.conversation.delete_many(
            where={
                "collectionId": {"in": collection_ids},
                "userId": user_id
            }
        )
        
        logger.info(f"Deleted {result} conversations for {len(collection_ids)} collections")
        return result
    
    def _generate_title(self, message: str) -> str:
        """Generate a title from the first message"""
        # Simple title generation - take first 50 chars
        title = message[:50].strip()
        if len(message) > 50:
            title += "..."
        return title
