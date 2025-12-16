# RagSpace AI Development Guidelines

## Project Overview

RagSpace is a video processing platform with microservices architecture for semantic video search using RAG (Retrieval Augmented Generation). Videos are uploaded, processed for scene detection, embedded with multi-modal vectors (audio transcripts + visual frames), and stored in ChromaDB for hybrid semantic search.

**Tech Stack**: React 19 + NestJS + Python FastAPI + RabbitMQ + PostgreSQL + ChromaDB + S3

## Architecture & Service Boundaries

### Microservices Communication Pattern

```
Client → API Gateway (port 3000) → Microservices
                ↓
         RabbitMQ Event Bus
```

**Services** (see [api-gateway/src/config/services.config.ts](api-gateway/src/config/services.config.ts)):

- `api-gateway`: Session auth, rate limiting, request routing to all services
- `auth-service` (port 8001): Better-auth with Prisma, handles `/api/auth/*`
- `upload-manager` (port 3002): S3 uploads, multipart chunking, publishes `file.upload.completed` events
- `scene-detector` (Python): Consumes upload events, PySceneDetect processing, publishes scene data
- `file-embedder` (Python): Consumes scene events, generates CLIP + text embeddings → ChromaDB
- `chat-manager` (port 3005): Semantic search queries against ChromaDB

### Event-Driven Processing Pipeline

```
Upload → EMBEDDING → SCENE_DETECTION → INDEXING → COMPLETED
```

Track via `file.processingStage` and `processingStatus`. Services communicate via **RabbitMQ exchange** `file.events`:

- `file.upload.completed`: Triggers scene detection + audio embedding
- `file.processing.completed`: Triggers visual embedding of scenes

## Critical Developer Patterns

### Frontend (React 19 + Vite + TanStack)

**RULE: Always use React Query for API calls** - Never call API functions directly in components:

```typescript
// ✅ CORRECT Pattern
// 1. Define in api/upload.ts
export const uploadAPI = {
  getFiles: async (query?: GetFilesQueryDto) =>
    privateAxios.get("/api/upload", { params: query }),
};

// 2. Create hook in hooks/useUpload.ts
export const useFiles = (query?, options?) =>
  useQuery({
    queryKey: uploadKeys.list(query),
    queryFn: () => uploadAPI.getFiles(query),
    ...options,
  });

// 3. Use in component
const { data, isLoading } = useFiles({ limit: 100 });
```

**Query Keys Factory** (see [frontend/src/hooks/useUpload.ts](frontend/src/hooks/useUpload.ts)):

```typescript
export const uploadKeys = {
  all: ["uploads"] as const,
  lists: () => [...uploadKeys.all, "list"] as const,
  list: (query?: GetFilesQueryDto) => [...uploadKeys.lists(), query] as const,
};
```

**Conditional Polling** - Only poll when files are actively processing:

```typescript
const { data } = useFiles(
  { limit: 100 },
  {
    refetchInterval: hasProcessingFiles ? 2000 : false, // ✅ Stops when done
  }
);
// ❌ NEVER: files.map(f => useFilePolling(f.id)) - N queries per file
```

**Component Organization**:

- Global reusables: `src/components/` (Button has 7 variants, check before creating new)
- Page-specific: `pages/[page]/components/` (e.g., `pages/files/components/FileCard.tsx`)

**Styling**: Use CSS variables from [frontend/src/styles.css](frontend/src/styles.css) - NEVER hardcode colors:

```typescript
// ✅ className="bg-accent-primary" or style={{ background: 'var(--color-accent-primary)' }}
// ❌ style={{ background: '#a855f7' }}
```

**File Upload Strategy** ([frontend/src/api/upload.ts](frontend/src/api/upload.ts)):

- `< 10MB`: Direct FormData POST
- `≥ 10MB`: Chunked multipart - Initialize → Get presigned URLs → Upload chunks to S3 → Complete

### Backend (NestJS Services)

**Authentication Pattern** - Routes protected by default, use `@Public()` decorator for exceptions:

```typescript
@Public()  // Decorator from common/decorators/public.decorator.ts
@Get('/api/auth/signup')
```

API Gateway validates **better-auth session cookies** via Prisma and injects headers for downstream services:

```typescript
// AuthGuard adds these to forwarded requests:
"x-user-id", "x-user-email", "x-user-name";
```

**Prisma Setup** - Each service has independent schema in `src/prisma/schema.prisma`:

- `api-gateway`: User/Session (session validation only)
- `auth-service`: Full User/Session/Account/Verification (source of truth)
- `upload-manager`: File model with processing stages
- `scene-detector`: Scene model with thumbnail metadata

**RabbitMQ Pattern** (see [upload-manager/src/rabbitmq/rabbitmq.service.ts](upload-manager/src/rabbitmq/rabbitmq.service.ts)):

```typescript
await this.rabbitmqService.publishEvent({
  type: "file.upload.completed",
  fileId: file.id,
  userId: file.userId,
  data: { s3Key, s3Url, fileType },
});
```

### Python Services (FastAPI)

**Service Structure**:

```
src/
├── config.py          # Settings with pydantic-settings
├── rabbitmq/          # Consumer/publisher logic
├── services/          # Core business logic
├── routers/           # FastAPI routes
└── models/            # Pydantic models
```

**RabbitMQ Consumer Pattern** ([file-embedder/src/rabbitmq/consumer.py](file-embedder/src/rabbitmq/consumer.py)):

```python
@rabbitmq.on('file.upload.completed')
async def handle_upload(event):
    # Download from S3, process, store embeddings
```

**Dependencies**: `requirements.txt` includes:

- `scenedetect[opencv]` (scene-detector)
- `chromadb`, `sentence-transformers`, `openai-clip` (file-embedder)

## Development Workflows

### Running Services Locally

**Prerequisites**: PostgreSQL, RabbitMQ, S3 (MinIO for local), ChromaDB

```bash
# Frontend
cd frontend && npm run dev  # Port 3000

# NestJS services
cd [service-name] && npm run start:dev
# Ports: api-gateway:3000, auth:8001, upload-manager:3002

# Python services
cd [service-name] && python main.py
# Ports: scene-detector:3003, file-embedder:8003
```

**Prisma Migrations** (NestJS services):

```bash
npx prisma generate          # Generate client
npx prisma migrate dev       # Run migrations
npx prisma studio            # GUI to view data
```

### Testing Patterns

Frontend tests use **Vitest + Testing Library**:

```bash
cd frontend && npm test
```

Backend: Jest for unit/e2e tests (standard NestJS patterns)

## Project-Specific Conventions

1. **TypeScript Types Match Backend DTOs Exactly** - Keep `frontend/src/types/*.types.ts` in sync
2. **Processing Stage Enum** - `UPLOAD → EMBEDDING → SCENE_DETECTION → INDEXING → COMPLETED`
3. **Query Parameter DTOs** - Use `GetFilesQueryDto` pattern with pagination (`page`, `limit`)
4. **Error Handling** - Always reset mutations: `mutation.reset()` before and after operations
5. **No Unnecessary Comments** - Code should be self-documenting; comment only complex logic
6. **Service Discovery** - API Gateway handles routing via [services.config.ts](api-gateway/src/config/services.config.ts)
7. **Session Cookies** - Better-auth manages sessions; API Gateway validates them via Prisma lookup
8. **Rate Limiting** - Configured in API Gateway via `RATE_LIMIT_TTL` and `RATE_LIMIT_MAX` env vars

## Key Files to Reference

- [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md): Comprehensive frontend patterns and best practices
- [api-gateway/README.md](api-gateway/README.md): Service routing rules and authentication flow
- [upload-manager/README.md](upload-manager/README.md): File upload strategies and RabbitMQ events
- [file-embedder/README.md](file-embedder/README.md): Embedding generation and ChromaDB integration
- [scene-detector/README.md](scene-detector/README.md): PySceneDetect configuration and workflow

## Common Anti-Patterns to Avoid

❌ Direct API calls in React components (always use hooks)  
❌ Per-item polling when bulk query is possible  
❌ Hardcoding colors instead of CSS variables  
❌ Creating new components without checking existing ones  
❌ Using `useState` for server data (use React Query)  
❌ Forgetting `@Public()` decorator on auth endpoints  
❌ Missing Prisma migrations after schema changes
