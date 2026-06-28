"""FastAPI decorators for quota enforcement via the payment service."""
import logging
from functools import wraps
from typing import Callable, Optional

from fastapi import HTTPException, Request

from .client import get_payment_client
from .types import UsageMetricType

logger = logging.getLogger(__name__)


def _extract_user_id(request: Request) -> Optional[str]:
    user = getattr(request.state, "user", None)
    if not user:
        return None
    return user.get("id") if isinstance(user, dict) else getattr(user, "id", None)


def check_quota(
    metric: UsageMetricType,
    amount: int = 1,
    get_amount: Optional[Callable] = None,
    track_on_success: bool = True,
):
    """
    Decorator to check user quota before executing a FastAPI route handler.

    Usage::

        @router.post("/conversations")
        @check_quota(UsageMetricType.CONVERSATIONS)
        async def create_conversation(request: Request): ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get("request")

            if request is None:
                logger.warning("No request object found, skipping quota check")
                return await func(*args, **kwargs)

            user_id = _extract_user_id(request)
            if not user_id:
                logger.warning("No user ID found, skipping quota check")
                return await func(*args, **kwargs)

            check_amount = get_amount(request) if (get_amount and callable(get_amount)) else amount

            client = get_payment_client()
            result = await client.check_usage(user_id, metric, check_amount)

            if not result.allowed:
                limit_display = result.limit if result.limit != float("inf") else "unlimited"
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": f"Quota exceeded for {metric.value}",
                        "metric": metric.value,
                        "limit": limit_display,
                        "remaining": result.remaining or 0,
                        "required": check_amount,
                    },
                )

            response = await func(*args, **kwargs)

            if track_on_success:
                try:
                    await client.track_usage(user_id, metric, check_amount)
                except Exception as e:
                    logger.error(f"Failed to track usage: {e}")

            return response

        return wrapper
    return decorator


def require_plan(min_plan: str):
    """
    Decorator to require a minimum plan tier for a FastAPI route handler.

    Usage::

        @router.get("/premium-feature")
        @require_plan("PRO")
        async def premium_feature(request: Request): ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get("request")

            if request is None:
                logger.warning("No request object found, skipping plan check")
                return await func(*args, **kwargs)

            user_id = _extract_user_id(request)
            if not user_id:
                logger.warning("No user ID found, skipping plan check")
                return await func(*args, **kwargs)

            client = get_payment_client()
            validation = await client.validate_plan_access(user_id, min_plan)

            if not validation.has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": validation.message or f"{min_plan} plan or higher required",
                        "currentPlan": validation.current_plan,
                        "requiredPlan": validation.required_plan,
                    },
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator
