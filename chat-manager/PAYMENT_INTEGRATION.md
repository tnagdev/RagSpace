# Payment Integration - Chat Manager (Python/FastAPI)

## Setup

### 1. Install httpx (if not already installed)
```bash
pip install httpx
```

### 2. Initialize in main.py

```python
from src.common.payment_client import init_payment_client
import os

# Initialize payment client
init_payment_client(
    base_url=os.getenv("PAYMENT_SERVICE_URL", "http://localhost:3006"),
    service_name="chat-manager",
    timeout=5
)
```

### 3. Add environment variables

```env
PAYMENT_SERVICE_URL=http://localhost:3006
SERVICE_NAME=chat-manager
```

## Usage Examples

### 1. Simple Quota Check with Decorator

```python
from fastapi import APIRouter, Request
from src.common.payment_client import check_quota, UsageMetricType

router = APIRouter()

@router.post("/conversations")
@check_quota(UsageMetricType.CONVERSATIONS, amount=1, track_on_success=True)
async def create_conversation(request: Request):
    # 1. Decorator checks CONVERSATIONS quota
    # 2. If allowed, handler executes
    # 3. Decorator automatically tracks usage after success
    
    conversation = await conversation_service.create(request.state.user['id'])
    return conversation
```

### 2. Dynamic Amount Calculation

```python
from src.common.payment_client import check_quota, UsageMetricType

@router.post("/files/chat")
@check_quota(
    UsageMetricType.FILE_CHATS,
    get_amount=lambda req: req.state.message_count,  # Dynamic amount
    track_on_success=True
)
async def chat_with_file(request: Request, file_id: str, messages: list):
    request.state.message_count = len(messages)  # Set before handler
    
    response = await chat_service.process(file_id, messages)
    return response
```

### 3. Premium Feature with Plan Check

```python
from src.common.payment_client import require_plan, check_quota, UsageMetricType

@router.post("/advanced-search")
@require_plan('PRO')  # Requires PRO plan or higher
@check_quota(UsageMetricType.API_CALLS, amount=1)
async def advanced_search(request: Request, query: dict):
    # 1. Plan check (PRO required)
    # 2. Quota check (API_CALLS)
    # 3. Handler executes
    # 4. Usage tracked automatically
    
    results = await search_service.advanced_search(query)
    return results
```

### 4. Manual Usage Tracking

```python
from src.common.payment_client import get_payment_client, UsageMetricType

@router.post("/batch-chat")
async def batch_chat(request: Request, conversations: list[str]):
    client = get_payment_client()
    user_id = request.state.user['id']
    
    # Manual check
    check_result = await client.check_usage(
        user_id,
        UsageMetricType.CONVERSATIONS,
        len(conversations)
    )
    
    if not check_result.allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Quota exceeded. Limit: {check_result.limit}, Remaining: {check_result.remaining}"
        )
    
    # Process conversations
    results = []
    for conv_id in conversations:
        result = await chat_service.process(conv_id)
        results.append(result)
    
    # Manual tracking
    await client.track_usage(
        user_id,
        UsageMetricType.CONVERSATIONS,
        len(conversations),
        metadata={"batch": True, "count": len(conversations)}
    )
    
    return results
```

### 5. Decrement on Delete

```python
from src.common.payment_client import get_payment_client, UsageMetricType

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(request: Request, conversation_id: str):
    user_id = request.state.user['id']
    
    # Delete conversation
    await conversation_service.delete(conversation_id)
    
    # Decrement quota
    client = get_payment_client()
    await client.decrement_usage(
        user_id,
        UsageMetricType.CONVERSATIONS,
        1
    )
    
    return {"success": True}
```

## Available Metrics

```python
class UsageMetricType(str, Enum):
    CONVERSATIONS = "CONVERSATIONS"
    STORAGE = "STORAGE"
    FILE_CONVERSATIONS = "FILE_CONVERSATIONS"
    YOUTUBE_VIDEOS = "YOUTUBE_VIDEOS"
    EMBEDDINGS = "EMBEDDINGS"
    MAX_VIDEO_LENGTH = "MAX_VIDEO_LENGTH"
```

## Decorators

### @check_quota()

```python
@check_quota(
    metric: UsageMetricType,           # Required: Which metric to check
    amount: int = 1,                    # Optional: Fixed amount
    get_amount: callable = None,        # Optional: Dynamic amount function
    track_on_success: bool = True       # Optional: Auto-track after success
)
```

**Examples:**
```python
# Fixed amount
@check_quota(UsageMetricType.DOCUMENTS, amount=1)

# Dynamic amount
@check_quota(UsageMetricType.STORAGE, get_amount=lambda req: req.state.file_size)

# Check only, no tracking
@check_quota(UsageMetricType.API_CALLS, amount=1, track_on_success=False)
```

### @require_plan()

```python
@require_plan(min_plan: str)  # 'FREE', 'BASIC', 'PRO', or 'ENTERPRISE'
```

**Examples:**
```python
@require_plan('PRO')     # PRO or ENTERPRISE only
@require_plan('BASIC')   # BASIC, PRO, or ENTERPRISE
```

## Error Responses

### Quota Exceeded
```json
{
  "detail": {
    "message": "Quota exceeded for CONVERSATIONS",
    "metric": "CONVERSATIONS",
    "limit": 50,
    "remaining": 0,
    "required": 1
  }
}
```

### Plan Insufficient
```json
{
  "detail": {
    "message": "PRO plan or higher required",
    "currentPlan": "BASIC",
    "requiredPlan": "PRO"
  }
}
```

## Manual Client Usage

```python
from src.common.payment_client import get_payment_client, UsageMetricType

client = get_payment_client()

# Check quota
check = await client.check_usage(user_id, UsageMetricType.CONVERSATIONS, 1)
if check.allowed:
    # Do something
    pass

# Track usage
await client.track_usage(user_id, UsageMetricType.CONVERSATIONS, 1, metadata={...})

# Decrement usage
await client.decrement_usage(user_id, UsageMetricType.CONVERSATIONS, 1)

# Validate plan
plan_check = await client.validate_plan_access(user_id, 'PRO')
if plan_check.has_access:
    # Do premium feature
    pass

# Get remaining quota
remaining = await client.get_remaining_quota(user_id, UsageMetricType.CONVERSATIONS)
```

## Middleware (Optional)

To automatically attach user to request state:

```python
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import json

class UserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Parse x-user header
        user_header = request.headers.get('x-user')
        if user_header:
            try:
                request.state.user = json.loads(user_header)
            except:
                request.state.user = None
        
        response = await call_next(request)
        return response

# Add to app
from fastapi import FastAPI
app = FastAPI()
app.add_middleware(UserMiddleware)
```

## Fail-Open Strategy

If payment service is unavailable:
- Quota checks **allow** operations (fail open)
- Usage tracking fails silently (logs error)
- Service remains operational

Monitor logs for payment service connectivity issues.

## Best Practices

1. **Use decorators for simple cases** - Cleaner code, automatic tracking
2. **Manual tracking for complex scenarios** - Batch operations, conditional logic
3. **Always decrement on delete** - Free up quota when resources removed
4. **Stack decorators** - `@require_plan()` then `@check_quota()` for premium features
5. **Set request.state for dynamic amounts** - Compute before decorator runs

## Testing

Mock the payment client in tests:

```python
from unittest.mock import AsyncMock, patch
from src.common.payment_client import UsageCheckResult

@patch('src.common.payment_client.get_payment_client')
async def test_create_conversation(mock_get_client):
    mock_client = AsyncMock()
    mock_client.check_usage.return_value = UsageCheckResult(
        allowed=True,
        remaining=49,
        limit=50
    )
    mock_client.track_usage.return_value = None
    mock_get_client.return_value = mock_client
    
    # Test your endpoint
    response = await client.post("/conversations", json={...})
    assert response.status_code == 200
    
    # Verify quota was checked
    mock_client.check_usage.assert_called_once()
```

## Cleanup

Remember to close the client on shutdown:

```python
from src.common.payment_client import get_payment_client

@app.on_event("shutdown")
async def shutdown_event():
    client = get_payment_client()
    await client.close()
```
