"""Shared payment service HTTP client for RagSpace Python services."""
import logging
from typing import Any, Dict, Optional
import httpx

from .types import UsageMetricType, UsageCheckResult, PlanValidationResult

logger = logging.getLogger(__name__)

PLAN_ORDER = ["FREE", "BASIC", "PRO", "ENTERPRISE"]


class PaymentClient:
    def __init__(self, base_url: str, service_name: str, timeout: int = 5) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_name = service_name
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    def _headers(self, user_id: str) -> Dict[str, str]:
        return {
            "x-user": f'{{"id": "{user_id}"}}',
            "x-service": self.service_name,
        }

    async def check_usage(
        self,
        user_id: str,
        metric: UsageMetricType,
        amount: int = 1,
    ) -> UsageCheckResult:
        try:
            response = await self.client.post(
                f"{self.base_url}/api/usage/check",
                json={"metric": metric.value, "amount": amount},
                headers=self._headers(user_id),
            )
            response.raise_for_status()
            data = response.json()
            return UsageCheckResult(
                allowed=data.get("allowed", False),
                remaining=data.get("remaining"),
                limit=data.get("limit"),
            )
        except Exception as e:
            logger.error(f"Failed to check usage: {e}")
            return UsageCheckResult(allowed=True, message="Payment service unavailable, proceeding with operation")

    async def track_usage(
        self,
        user_id: str,
        metric: UsageMetricType,
        amount: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            await self.client.post(
                f"{self.base_url}/api/usage/track",
                json={"metric": metric.value, "amount": amount, "metadata": metadata},
                headers=self._headers(user_id),
            )
            logger.debug(f"Tracked {amount} {metric.value} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to track usage: {e}")

    async def decrement_usage(
        self,
        user_id: str,
        metric: UsageMetricType,
        amount: int = 1,
    ) -> None:
        try:
            await self.client.post(
                f"{self.base_url}/api/usage/decrement",
                json={"metric": metric.value, "amount": amount},
                headers=self._headers(user_id),
            )
            logger.debug(f"Decremented {amount} {metric.value} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to decrement usage: {e}")

    async def validate_plan_access(
        self,
        user_id: str,
        min_plan_type: str,
    ) -> PlanValidationResult:
        try:
            response = await self.client.get(
                f"{self.base_url}/api/validation/plan-type",
                headers=self._headers(user_id),
            )
            response.raise_for_status()
            data = response.json()
            current_plan = data.get("planType")
            user_idx = PLAN_ORDER.index(current_plan) if current_plan in PLAN_ORDER else -1
            req_idx = PLAN_ORDER.index(min_plan_type) if min_plan_type in PLAN_ORDER else -1
            has_access = user_idx >= req_idx
            return PlanValidationResult(
                has_access=has_access,
                current_plan=current_plan,
                required_plan=min_plan_type,
                message="Access granted" if has_access else f"{min_plan_type} plan or higher required",
            )
        except Exception as e:
            logger.error(f"Failed to validate plan access: {e}")
            return PlanValidationResult(has_access=True, message="Payment service unavailable, proceeding with operation")

    async def get_remaining_quota(self, user_id: str, metric: UsageMetricType) -> float:
        try:
            response = await self.client.get(
                f"{self.base_url}/api/usage/remaining",
                params={"metric": metric.value},
                headers=self._headers(user_id),
            )
            response.raise_for_status()
            return response.json().get("remaining", float("inf"))
        except Exception as e:
            logger.error(f"Failed to get remaining quota: {e}")
            return float("inf")

    async def close(self) -> None:
        await self.client.aclose()


_payment_client: Optional[PaymentClient] = None


def init_payment_client(base_url: str, service_name: str, timeout: int = 5) -> PaymentClient:
    global _payment_client
    _payment_client = PaymentClient(base_url, service_name, timeout)
    return _payment_client


def get_payment_client() -> PaymentClient:
    if _payment_client is None:
        raise RuntimeError("Payment client not initialized. Call init_payment_client() first.")
    return _payment_client
