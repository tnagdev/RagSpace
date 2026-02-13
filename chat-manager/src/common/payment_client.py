import logging
from typing import Optional, Any, Dict
from enum import Enum
import httpx
from functools import wraps
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)


class UsageMetricType(str, Enum):
    CONVERSATIONS = "CONVERSATIONS"
    STORAGE = "STORAGE"
    FILE_CONVERSATIONS = "FILE_CONVERSATIONS"
    YOUTUBE_VIDEOS = "YOUTUBE_VIDEOS"
    EMBEDDINGS = "EMBEDDINGS"
    MAX_VIDEO_LENGTH = "MAX_VIDEO_LENGTH"


class UsageCheckResult:
    def __init__(self, allowed: bool, remaining: Optional[int] = None, 
                 limit: Optional[Any] = None, message: Optional[str] = None):
        self.allowed = allowed
        self.remaining = remaining
        self.limit = limit
        self.message = message


class PlanValidationResult:
    def __init__(self, has_access: bool, current_plan: Optional[str] = None,
                 required_plan: Optional[str] = None, message: Optional[str] = None):
        self.has_access = has_access
        self.current_plan = current_plan
        self.required_plan = required_plan
        self.message = message


class PaymentClient:
    def __init__(self, base_url: str, service_name: str, timeout: int = 5):
        self.base_url = base_url.rstrip('/')
        self.service_name = service_name
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    async def check_usage(
        self, 
        user_id: str, 
        metric: UsageMetricType, 
        amount: int = 1
    ) -> UsageCheckResult:
        """Check if user can perform an action based on usage quota"""
        try:
            response = await self.client.post(
                f"{self.base_url}/api/usage/check",
                json={"metric": metric.value, "amount": amount},
                headers={
                    "x-user": f'{{"id": "{user_id}"}}',
                    "x-service": self.service_name,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            return UsageCheckResult(
                allowed=data.get("allowed", False),
                remaining=data.get("remaining"),
                limit=data.get("limit"),
            )
        except Exception as e:
            logger.error(f"Failed to check usage: {str(e)}")
            # Fail open - allow operation if payment service is down
            return UsageCheckResult(
                allowed=True,
                message="Payment service unavailable, proceeding with operation"
            )

    async def track_usage(
        self,
        user_id: str,
        metric: UsageMetricType,
        amount: int = 1,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Track usage after successful operation"""
        try:
            await self.client.post(
                f"{self.base_url}/api/usage/track",
                json={"metric": metric.value, "amount": amount, "metadata": metadata},
                headers={
                    "x-user": f'{{"id": "{user_id}"}}',
                    "x-service": self.service_name,
                }
            )
            logger.debug(f"Tracked {amount} {metric.value} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to track usage: {str(e)}")
            # Don't throw - tracking failure shouldn't break the flow

    async def decrement_usage(
        self,
        user_id: str,
        metric: UsageMetricType,
        amount: int = 1
    ) -> None:
        """Decrement usage (e.g., when deleting a resource)"""
        try:
            await self.client.post(
                f"{self.base_url}/api/usage/decrement",
                json={"metric": metric.value, "amount": amount},
                headers={
                    "x-user": f'{{"id": "{user_id}"}}',
                    "x-service": self.service_name,
                }
            )
            logger.debug(f"Decremented {amount} {metric.value} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to decrement usage: {str(e)}")

    async def validate_plan_access(
        self,
        user_id: str,
        min_plan_type: str
    ) -> PlanValidationResult:
        """Validate if user's plan meets minimum requirements"""
        try:
            response = await self.client.get(
                f"{self.base_url}/api/validation/plan-type",
                headers={
                    "x-user": f'{{"id": "{user_id}"}}',
                    "x-service": self.service_name,
                }
            )
            response.raise_for_status()
            data = response.json()
            
            current_plan = data.get("planType")
            plan_order = ["FREE", "BASIC", "PRO", "ENTERPRISE"]
            user_plan_index = plan_order.index(current_plan) if current_plan in plan_order else -1
            required_plan_index = plan_order.index(min_plan_type) if min_plan_type in plan_order else -1
            
            has_access = user_plan_index >= required_plan_index
            
            return PlanValidationResult(
                has_access=has_access,
                current_plan=current_plan,
                required_plan=min_plan_type,
                message="Access granted" if has_access else f"{min_plan_type} plan or higher required"
            )
        except Exception as e:
            logger.error(f"Failed to validate plan access: {str(e)}")
            # Fail open
            return PlanValidationResult(
                has_access=True,
                message="Payment service unavailable, proceeding with operation"
            )

    async def get_remaining_quota(
        self,
        user_id: str,
        metric: UsageMetricType
    ) -> float:
        """Get remaining quota for a metric"""
        try:
            response = await self.client.get(
                f"{self.base_url}/api/usage/remaining",
                params={"metric": metric.value},
                headers={
                    "x-user": f'{{"id": "{user_id}"}}',
                    "x-service": self.service_name,
                }
            )
            response.raise_for_status()
            data = response.json()
            return data.get("remaining", float('inf'))
        except Exception as e:
            logger.error(f"Failed to get remaining quota: {str(e)}")
            return float('inf')  # Fail open

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()


# Global payment client instance
_payment_client: Optional[PaymentClient] = None


def init_payment_client(base_url: str, service_name: str, timeout: int = 5):
    """Initialize the global payment client"""
    global _payment_client
    _payment_client = PaymentClient(base_url, service_name, timeout)
    return _payment_client


def get_payment_client() -> PaymentClient:
    """Get the global payment client instance"""
    if _payment_client is None:
        raise RuntimeError("Payment client not initialized. Call init_payment_client() first.")
    return _payment_client


# Decorator for checking quotas
def check_quota(metric: UsageMetricType, amount: int = 1, 
                get_amount: Optional[callable] = None, track_on_success: bool = True):
    """
    Decorator to check user quota before executing route handler
    
    Usage:
        @check_quota(UsageMetricType.CONVERSATIONS, amount=1)
        async def create_conversation(request: Request):
            # Handler code
            pass
    
        @check_quota(UsageMetricType.STORAGE, get_amount=lambda req: req.state.file_size)
        async def upload_file(request: Request):
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
                logger.warning("No request object found, skipping quota check")
                return await func(*args, **kwargs)
            
            # Get user from request
            user = getattr(request.state, 'user', None)
            if not user:
                logger.warning("No user found in request, skipping quota check")
                return await func(*args, **kwargs)
            
            user_id = user.get('id') if isinstance(user, dict) else getattr(user, 'id', None)
            if not user_id:
                logger.warning("No user ID found, skipping quota check")
                return await func(*args, **kwargs)
            
            # Calculate amount
            check_amount = amount
            if get_amount and callable(get_amount):
                check_amount = get_amount(request)
            
            # Check quota
            client = get_payment_client()
            check_result = await client.check_usage(user_id, metric, check_amount)
            
            if not check_result.allowed:
                limit_display = check_result.limit if check_result.limit != float('inf') else 'unlimited'
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": f"Quota exceeded for {metric.value}",
                        "metric": metric.value,
                        "limit": limit_display,
                        "remaining": check_result.remaining or 0,
                        "required": check_amount,
                    }
                )
            
            # Execute handler
            result = await func(*args, **kwargs)
            
            # Track usage after success
            if track_on_success:
                try:
                    await client.track_usage(user_id, metric, check_amount)
                except Exception as e:
                    logger.error(f"Failed to track usage: {str(e)}")
            
            return result
        
        return wrapper
    return decorator


# Decorator for checking plan tier
def require_plan(min_plan: str):
    """
    Decorator to require minimum plan tier
    
    Usage:
        @require_plan('PRO')
        async def premium_feature(request: Request):
            # Handler code
            pass
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get('request')
            
            if request is None:
                logger.warning("No request object found, skipping plan check")
                return await func(*args, **kwargs)
            
            # Get user
            user = getattr(request.state, 'user', None)
            if not user:
                logger.warning("No user found in request, skipping plan check")
                return await func(*args, **kwargs)
            
            user_id = user.get('id') if isinstance(user, dict) else getattr(user, 'id', None)
            if not user_id:
                logger.warning("No user ID found, skipping plan check")
                return await func(*args, **kwargs)
            
            # Validate plan
            client = get_payment_client()
            validation = await client.validate_plan_access(user_id, min_plan)
            
            if not validation.has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": validation.message or f"{min_plan} plan or higher required",
                        "currentPlan": validation.current_plan,
                        "requiredPlan": validation.required_plan,
                    }
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
