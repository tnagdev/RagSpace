# RagSpace AI Development Guidelines

## Project Overview

RagSpace is a video processing platform with microservices architecture for semantic video search using RAG. Videos are uploaded, processed for scene detection, embedded with multi-modal vectors (audio transcripts + visual frames), and stored in ChromaDB for hybrid semantic search.

**Tech Stack**: React 19 + Vite + TanStack Router/Query + NestJS + Python FastAPI + RabbitMQ + PostgreSQL + ChromaDB + S3 (MinIO/AWS)

---

## Architecture & Service Boundaries

### Port Assignments (authoritative)

| Service                 | Port         | Language       |
| ----------------------- | ------------ | -------------- |
| `api-gateway`           | 8000         | NestJS         |
| `auth-service`          | 8001         | NestJS         |
| `upload-manager`        | 8002         | NestJS         |
| `scene-detector` (HTTP) | 8003         | Python FastAPI |
| `file-embedder` (HTTP)  | 8004         | Python FastAPI |
| `chat-manager`          | 8005         | Python FastAPI |
| `payment-service`       | 8006         | NestJS         |
| ChromaDB                | 8007         | —              |
| PostgreSQL              | 5432         | —              |
| RabbitMQ AMQP / UI      | 5672 / 15672 | —              |
| MinIO S3 / Console      | 9000 / 9001  | —              |

### Request Flow

```
Browser → API Gateway (8000) → downstream services (via ProxyService)
                              ↓
                        RabbitMQ exchange: file.events
```

API Gateway is the **only** entry point. All session validation and rate limiting happen there.

### Services

- `api-gateway`: Session auth (Prisma lookup), rate limiting (100 req/60s per user/IP), proxies all traffic
- `auth-service` (8001): better-auth with Prisma — User/Session/Account/Verification source of truth
- `upload-manager` (8002): S3 uploads with multipart chunking, publishes `file.upload.completed`
- `scene-detector` (8003): Consumes upload events, PySceneDetect, publishes scene data to DB
- `file-embedder` (8004): Consumes scene events, CLIP + LLM (llama-3.2-11b-vision) embeddings → ChromaDB
- `chat-manager` (8005): Agent loop (llama-3.3-70b), semantic search, SSE streaming
- `payment-service` (8006): Subscription quota enforcement

### Event-Driven Pipeline

```
file.upload.completed → scene-detector (PySceneDetect) + file-embedder (audio transcript)
                              ↓
                   file.processing.completed → file-embedder (visual CLIP embeddings per scene)
```

Pipeline stage tracked in `file.processingStage`: `UPLOAD → EMBEDDING → SCENE_DETECTION → INDEXING → COMPLETED`

---

## Architecture Rules (Enforced)

These are non-negotiable patterns. Flag violations during code review.

### 1. Fault Tolerance — Circuit Breakers

**RULE**: Any HTTP call to a downstream service from the API Gateway `ProxyService` MUST be wrapped with a timeout and failure budget. A slow downstream must not exhaust the gateway's thread pool.

```typescript
// ✅ Per-service timeout (not a global 30s blanket)
const TIMEOUTS: Record<string, number> = {
  "auth-service": 5_000,
  "upload-manager": 30_000, // S3 ops are slow
  "chat-manager": 120_000, // LLM streaming
};
// ❌ Single hardcoded 30s for all services
```

**RULE**: Python services calling external APIs (NVIDIA/LLM, ChromaDB) MUST set explicit timeouts:

```python
# ✅
response = await client.post(url, json=payload, timeout=httpx.Timeout(30.0))
# ❌ No timeout = hangs indefinitely, blocks consumer, starves queue
```

### 2. Fault Tolerance — Event Handler Idempotency

**RULE**: Every RabbitMQ message handler MUST be idempotent. Before doing work, check if it was already done (DB lookup). Use `fileId` as the idempotency key.

```python
# ✅ Python consumer — always check first
async def handle_upload_completed(event: dict):
    file_id = event["fileId"]
    existing = await db.scene.find_first(where={"fileId": file_id})
    if existing:
        logger.info(f"Skipping already-processed file {file_id}")
        return  # ack and move on
    # proceed with processing
```

**RULE**: Message handlers MUST manually ack AFTER successful processing and nack (with `requeue=False`) on permanent failures. Never rely on auto-ack for CPU-bound or I/O-bound work.

### 3. Fault Tolerance — Graceful Degradation

**RULE**: The API Gateway auth guard caches validated sessions. Do NOT call auth-service on every request. A session validated once is valid for its TTL. Use an in-process TTL cache (e.g., `node-cache`) keyed by session token.

```typescript
// ✅ Cache session lookup — reduces auth-service load by ~50%
const cached = this.sessionCache.get<User>(sessionToken);
if (cached) return cached;
const user = await this.validateWithAuthService(sessionToken);
this.sessionCache.set(sessionToken, user, SESSION_CACHE_TTL_SECONDS);
```

### 4. Performance — No Blocking I/O in Async Contexts

**RULE**: Python services MUST NOT load entire video files or large S3 objects into memory. Stream downloads using chunked reads:

```python
# ✅ Stream S3 download to temp file — O(chunk) memory not O(file)
async with s3_client.get_object(Bucket=bucket, Key=key) as response:
    async with aiofiles.open(tmp_path, 'wb') as f:
        async for chunk in response['Body'].iter_chunked(8 * 1024 * 1024):
            await f.write(chunk)
# ❌ body = await response['Body'].read()  — loads entire file into RAM
```

**RULE**: Scene detection MUST run with a per-job timeout. Heavy/corrupted videos can hang `cv2.VideoCapture` indefinitely:

```python
# ✅ Wrap detect() in asyncio.wait_for
await asyncio.wait_for(
    asyncio.to_thread(detect_scenes, video_path),
    timeout=settings.SCENE_DETECTION_TIMEOUT_SECONDS  # env-configurable
)
```

### 5. Performance — Database Query Discipline

**RULE**: Never load unbounded lists from Postgres. All list queries MUST include `take`/`skip` (Prisma) or `LIMIT`/`OFFSET`. Default max page size is 100.

**RULE**: When adding a new Prisma query that filters on a non-PK field, add the corresponding `@@index` to the schema. Migrations that add queries without indexes will be rejected.

```prisma
// ✅ Index any field used in where clauses
model File {
  id        String @id
  userId    String
  status    ProcessingStatus
  @@index([userId])
  @@index([status])
}
```

**RULE**: Do NOT select `*` when only specific fields are needed. Use Prisma `select` to avoid over-fetching:

```typescript
// ✅
const file = await this.prisma.file.findUnique({
  where: { id },
  select: { id: true, status: true, s3Key: true },
});
```

### 6. Performance — ChromaDB Batch Limits

**RULE**: ChromaDB upsert calls MUST be chunked. Never call `collection.upsert()` with unbounded arrays. Max batch size is 100 embeddings per call:

```python
CHROMA_BATCH_SIZE = 100

for i in range(0, len(embeddings), CHROMA_BATCH_SIZE):
    batch = embeddings[i:i + CHROMA_BATCH_SIZE]
    collection.upsert(
        ids=[e.id for e in batch],
        embeddings=[e.vector for e in batch],
        metadatas=[e.metadata for e in batch],
    )
```

### 7. Resilience — Exponential Backoff

**RULE**: All reconnection loops (RabbitMQ, ChromaDB, external APIs) MUST use exponential backoff with jitter. No busy-wait retry loops:

```python
# ✅
async def connect_with_backoff(connect_fn, max_attempts=10):
    for attempt in range(max_attempts):
        try:
            return await connect_fn()
        except Exception as e:
            wait = min(2 ** attempt + random.uniform(0, 1), 60)
            logger.warning(f"Connection failed (attempt {attempt+1}), retrying in {wait:.1f}s: {e}")
            await asyncio.sleep(wait)
    raise RuntimeError("Max reconnection attempts exceeded")
# ❌ while True: try: connect() except: await asyncio.sleep(5)
```

### 8. Resilience — Dead Letter Queue Categorization

**RULE**: Message handler failures MUST distinguish retriable from permanent errors. Send only permanent failures to DLX. Retry transient failures with backoff in-band:

```python
async def handle_message(body: bytes):
    try:
        await process(body)
        channel.basic_ack(delivery_tag)
    except TransientError as e:  # network, temp unavailability
        logger.warning(f"Transient failure, requeueing: {e}")
        channel.basic_nack(delivery_tag, requeue=True)
    except PermanentError as e:  # bad data, schema error
        logger.error(f"Permanent failure, sending to DLX: {e}")
        channel.basic_nack(delivery_tag, requeue=False)
```

### 9. Observability — Correlation IDs

**RULE**: Every request entering the API Gateway MUST receive a `x-correlation-id` header (generate UUID if not present). This ID MUST be forwarded to all downstream services and included in all log lines.

```typescript
// API Gateway interceptor
const correlationId = req.headers["x-correlation-id"] ?? randomUUID();
req.headers["x-correlation-id"] = correlationId;
// Downstream: ProxyService must forward this header
```

```python
# Python services: extract and log
correlation_id = request.headers.get("x-correlation-id", "unknown")
logger.info("Processing request", extra={"correlation_id": correlation_id})
```

### 10. Input Validation Before Expensive Operations

**RULE**: Validate file type, size, and user quota **before** creating a DB record or starting an S3 upload. Fail fast at the boundary.

**RULE**: Chat message input MUST be capped before hitting the LLM. Enforce a max token estimate on the raw text:

```python
MAX_PROMPT_CHARS = 4000  # ~1000 tokens

if len(user_message) > MAX_PROMPT_CHARS:
    raise HTTPException(400, "Message too long")
```

---

## Critical Developer Patterns

### Frontend (React 19 + Vite + TanStack)

**RULE: Always use React Query for server state** — never `useState` + `useEffect` for API calls:

```typescript
// ✅ api/upload.ts → hooks/useUpload.ts → component
export const uploadAPI = {
  getFiles: (query?: GetFilesQueryDto) =>
    privateAxios.get("/api/upload", { params: query }),
};

export const useFiles = (query?: GetFilesQueryDto, options?) =>
  useQuery({
    queryKey: uploadKeys.list(query),
    queryFn: () => uploadAPI.getFiles(query),
    ...options,
  });
```

**Query Key Factory** ([frontend/src/hooks/useUpload.ts](frontend/src/hooks/useUpload.ts)):

```typescript
export const uploadKeys = {
  all: ["uploads"] as const,
  lists: () => [...uploadKeys.all, "list"] as const,
  list: (query?: GetFilesQueryDto) => [...uploadKeys.lists(), query] as const,
};
```

**Conditional Polling** — bulk query only, stop when no active processing:

```typescript
const hasProcessingFiles = data?.files.some(
  (f) => f.processingStatus === "PROCESSING",
);
const { data } = useFiles(
  { limit: 100 },
  { refetchInterval: hasProcessingFiles ? 2000 : false },
);
// ❌ NEVER: files.map(f => useFilePolling(f.id)) — N concurrent polls
```

**Component Organization**:

- Global reusables: `src/components/` — check for existing variants before creating new (Button has 7 variants)
- Page-scoped: `pages/[page]/components/FileCard.tsx`

**Styling** — CSS variables only, never hardcoded colors:

```typescript
// ✅ className="bg-accent-primary"
// ✅ style={{ background: 'var(--color-accent-primary)' }}
// ❌ style={{ background: '#a855f7' }}
```

**File Upload Strategy** ([frontend/src/api/upload.ts](frontend/src/api/upload.ts)):

- `< 10MB`: Direct `FormData` POST
- `≥ 10MB`: Chunked multipart — Initialize → Presigned URLs per chunk → Upload to S3 → Complete

**Mutations** — always reset before retrying:

```typescript
mutation.reset();
await mutation.mutateAsync(payload);
```

### Backend (NestJS Services)

**Auth Pattern** — all routes are protected by default; use `@Public()` from `common/decorators/public.decorator.ts` to opt out:

```typescript
@Public()
@Get('/api/auth/signup')
```

API Gateway injects these headers into every forwarded request after session validation:

```
x-user-id | x-user-email | x-user-name | x-correlation-id
```

**Prisma — one schema per service** (`src/prisma/schema.prisma`):

- `api-gateway`: User/Session (read-only, session lookup)
- `auth-service`: Full auth schema — User/Session/Account/Verification (source of truth)
- `upload-manager`: File + ProcessingStage
- `scene-detector`: Scene + thumbnail metadata

**RabbitMQ publish** ([upload-manager/src/rabbitmq/rabbitmq.service.ts](upload-manager/src/rabbitmq/rabbitmq.service.ts)):

```typescript
await this.rabbitmqService.publishEvent({
  type: "file.upload.completed",
  fileId: file.id,
  userId: file.userId,
  correlationId: req.headers["x-correlation-id"],
  data: { s3Key, s3Url, fileType },
});
```

### Python Services (FastAPI)

**Standard structure** (consistent across scene-detector, file-embedder, chat-manager):

```
src/
├── config/
│   └── settings.py      # pydantic-settings — all config from env vars
├── rabbitmq/            # consumer.py + publisher.py
├── services/            # core business logic (no HTTP concerns)
├── routers/             # FastAPI route handlers (thin)
├── models/              # Pydantic request/response models
├── common/              # shared decorators, middleware
└── db/                  # ChromaDB / Prisma client wrappers
```

**Lifespan pattern** — all Python services use FastAPI lifespan for ordered startup/shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: connect DB, start consumers, load models
    yield
    # shutdown: stop consumers, wait for in-flight tasks (30s), disconnect
```

**All config from environment** — no hardcoded paths or magic numbers:

```python
class Settings(BaseSettings):
    SCENE_DETECTION_TIMEOUT_SECONDS: int = 300
    CHROMA_BATCH_SIZE: int = 100
    LLM_REQUEST_TIMEOUT_SECONDS: int = 60
    # ❌ Never: TESSERACT_PATH = "/usr/bin/tesseract" in code
    TESSERACT_PATH: str = "/usr/bin/tesseract"  # from env
```

---

## Development Workflows

### Running Services

```bash
# Infrastructure (PostgreSQL, RabbitMQ, MinIO, ChromaDB)
docker compose -f docker-compose.dev.yml up -d postgres rabbitmq minio chromadb

# Frontend (http://localhost:5173 via Vite proxy → api-gateway:8000)
cd frontend && npm run dev

# NestJS services
cd api-gateway && npm run start:dev        # :8000
cd auth-service && npm run start:dev       # :8001
cd upload-manager && npm run start:dev     # :8002

# Python services (HTTP server + consumer run separately)
cd scene-detector && python main_server.py    # :8003
cd scene-detector && python main_consumer.py
cd file-embedder && python main_server.py    # :8004
cd file-embedder && python main_consumer.py
cd chat-manager && python main.py            # :8005
```

### Prisma (NestJS services)

```bash
npx prisma generate        # after schema changes
npx prisma migrate dev     # create + apply migration
npx prisma studio          # GUI
```

**RULE**: Never modify `schema.prisma` without creating a migration. Never share connection strings between services.

### Testing

```bash
# Frontend — Vitest + Testing Library
cd frontend && npm test

# NestJS — Jest
cd [service] && npm run test
cd [service] && npm run test:e2e
```

---

## Conventions (Non-Negotiable)

1. **TypeScript DTO parity** — `frontend/src/types/*.types.ts` must match backend DTO field names exactly
2. **Processing stages** — `UPLOAD → EMBEDDING → SCENE_DETECTION → INDEXING → COMPLETED`; only advance forward, never backward
3. **Pagination always** — all list endpoints accept `page` + `limit`; default `limit=20`, max `limit=100`
4. **No comments for obvious code** — comment only non-obvious decisions, algorithm trade-offs, and workarounds
5. **Correlation IDs in logs** — every log statement in an HTTP or event handler context MUST include `correlation_id`
6. **Env vars for all config** — no magic numbers or file paths in application code
7. **Timeouts are required** — every external call (HTTP, S3, LLM, DB, RabbitMQ publish) MUST have an explicit timeout
8. **Health checks** — every service exposes `GET /health` returning `{ status: 'ok', service: '...', timestamp: '...' }`

---

## Anti-Patterns (Reject in Code Review)

| Anti-Pattern                                      | Why                        | Fix                                                  |
| ------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `files.map(f => useFilePolling(f.id))`            | N concurrent polls         | Single bulk query with conditional `refetchInterval` |
| `await response.Body.read()` for large S3 objects | OOM on large videos        | Stream to temp file in chunks                        |
| `asyncio.sleep(5)` retry loop                     | Busy-wait, no backoff      | Exponential backoff with jitter                      |
| `collection.upsert(ids=all_embeddings)`           | ChromaDB batch limit crash | Chunk into batches of 100                            |
| `useState` for server data                        | Stale data, no caching     | React Query                                          |
| Hardcoded `#hex` colors                           | Breaks theming             | CSS variables                                        |
| DB queries without `take`/`limit`                 | Unbounded result set, OOM  | Require pagination params                            |
| New filter field without `@@index`                | Full table scan at scale   | Add index in same migration                          |
| External call without timeout                     | Hangs indefinitely         | Always set explicit timeout                          |
| Message auto-ack before processing                | Lost messages on crash     | Manual ack after success                             |
| `@Public()` missing on auth routes                | 401 on public endpoints    | Add decorator                                        |
| Schema change without migration                   | Runtime Prisma error       | `prisma migrate dev`                                 |
