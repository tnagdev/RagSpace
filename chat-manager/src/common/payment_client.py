"""
Payment client for chat-manager.

All implementation lives in ragspace_shared.payment — this module just
re-exports what callers in chat-manager need and wires up the global singleton.
"""
from ragspace_shared.payment import (
    UsageMetricType,
    UsageCheckResult,
    PlanValidationResult,
    PaymentClient,
    init_payment_client,
    get_payment_client,
    check_quota,
    require_plan,
)

__all__ = [
    "UsageMetricType",
    "UsageCheckResult",
    "PlanValidationResult",
    "PaymentClient",
    "init_payment_client",
    "get_payment_client",
    "check_quota",
    "require_plan",
]
