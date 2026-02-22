"""
Conversation-specific quota decorators for checking both CONVERSATIONS and FILE_CONVERSATIONS
"""
import logging
from functools import wraps
from typing import Optional
from fastapi import HTTPException, Request
from src.common.payment_client import get_payment_client, UsageMetricType
from src.services.PrismaService import PrismaService

logger = logging.getLogger(__name__)


def check_conversation_quota(check_file_conversations: bool = False):
    """
    Decorator to check conversation quotas with automatic tracking
    
    Validates:
    - CONVERSATIONS quota (global)
    - FILE_CONVERSATIONS quota (per-file, if file_id is in request)
    
    Args:
        check_file_conversations: If True, also validates per-file conversation limit
    
    Usage:
        @check_conversation_quota(check_file_conversations=True)
        async def create_conversation(request: Request):
            # Handler code
            pass
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args/kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get('request')
            
            if request is None:
                logger.warning("No request object found, skipping conversation quota check")
                return await func(*args, **kwargs)
            
            # Get user from request
            user = getattr(request.state, 'user', None)
            if not user:
                logger.warning("No user found in request, skipping conversation quota check")
                return await func(*args, **kwargs)
            
            user_id = user.get('id') if isinstance(user, dict) else getattr(user, 'id', None)
            if not user_id:
                logger.warning("No user ID found, skipping conversation quota check")
                return await func(*args, **kwargs)
            
            # Check if this is adding to an existing conversation (not creating new)
            # Only check and track quota when creating a NEW conversation
            conversation_id = None
            
            # Try to get conversation_id from function arguments (body parameter)
            for arg in args:
                if hasattr(arg, 'conversation_id'):
                    conversation_id = getattr(arg, 'conversation_id', None)
                    if conversation_id:
                        break
            
            # Try body in kwargs
            if not conversation_id:
                body = kwargs.get('body')
                if body and hasattr(body, 'conversation_id'):
                    conversation_id = getattr(body, 'conversation_id', None)
            
            # If conversation_id exists, this is adding to existing conversation - skip quota check
            if conversation_id:
                logger.debug(f"Adding message to existing conversation {conversation_id}, skipping quota check")
                return await func(*args, **kwargs)
            
            # This is a NEW conversation - proceed with quota check
            payment_client = get_payment_client()
            
            # Determine if this is a file-specific conversation
            file_id = None
            if check_file_conversations:
                # Try to get file_id from function arguments (body parameter)
                for arg in args:
                    if hasattr(arg, 'file_id'):
                        file_id = getattr(arg, 'file_id', None)
                        if file_id:
                            break
                
                # Try body in kwargs
                if not file_id:
                    body = kwargs.get('body')
                    if body and hasattr(body, 'file_id'):
                        file_id = getattr(body, 'file_id', None)
                
                # Try to get file_id from query params
                if not file_id and hasattr(request, 'query_params'):
                    file_id = request.query_params.get('file_id')
                
                # Try to get from request state (set by route handler)
                if not file_id and hasattr(request.state, 'file_id'):
                    file_id = request.state.file_id
            
            # CONVERSATIONS and FILE_CONVERSATIONS are separate quotas
            # Check the appropriate quota based on conversation type
            if file_id:
                # File-specific conversation: check FILE_CONVERSATIONS quota only
                check_result = await payment_client.check_usage(
                    user_id,
                    UsageMetricType.FILE_CONVERSATIONS,
                    1
                )
                
                if not check_result.allowed:
                    limit_display = check_result.limit if check_result.limit != float('inf') else 'unlimited'
                    
                    # Count existing conversations for this file for error message
                    try:
                        prisma_service = PrismaService()
                        await prisma_service.ensure_connected()
                        existing_count = await prisma_service.prisma.conversation.count(
                            where={"userId": user_id, "fileId": file_id}
                        )
                    except Exception:
                        existing_count = 0
                    
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "message": f"File conversation limit exceeded. You have {existing_count} file conversations.",
                            "metric": UsageMetricType.FILE_CONVERSATIONS.value,
                            "limit": limit_display,
                            "remaining": check_result.remaining or 0,
                        }
                    )
            else:
                # General conversation: check CONVERSATIONS quota only
                check_result = await payment_client.check_usage(
                    user_id,
                    UsageMetricType.CONVERSATIONS,
                    1
                )
                
                if not check_result.allowed:
                    limit_display = check_result.limit if check_result.limit != float('inf') else 'unlimited'
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "message": f"Conversation limit exceeded",
                            "metric": UsageMetricType.CONVERSATIONS.value,
                            "limit": limit_display,
                            "remaining": check_result.remaining or 0,
                        }
                    )
            
            # Execute handler
            result = await func(*args, **kwargs)
            
            # Track usage after success - CONVERSATIONS and FILE_CONVERSATIONS are separate quotas
            try:
                if file_id:
                    # File-specific conversation: track FILE_CONVERSATIONS only
                    await payment_client.track_usage(
                        user_id,
                        UsageMetricType.FILE_CONVERSATIONS,
                        1,
                        {"fileId": file_id, "endpoint": str(request.url)}
                    )
                else:
                    # General conversation: track CONVERSATIONS only
                    await payment_client.track_usage(
                        user_id,
                        UsageMetricType.CONVERSATIONS,
                        1,
                        {"endpoint": str(request.url)}
                    )
            except Exception as e:
                logger.error(f"Failed to track conversation usage: {str(e)}")
            
            return result
        
        return wrapper
    return decorator
