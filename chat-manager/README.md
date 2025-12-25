# Chat Manager Service

Conversational search interface for RagSpace video platform. Provides context-aware chat functionality over semantic video search.

## Overview

The chat-manager service acts as an intelligent conversation layer on top of the file-embedder's semantic search capabilities. It maintains conversation context, manages multi-turn dialogues, and provides a natural chat interface for video content discovery.

## Architecture

```
User Query → Chat Manager → File Embedder (Semantic Search) → ChromaDB
              ↓
        Conversation Context
```

**Port**: 3005  
**Framework**: FastAPI  
**Storage**: In-memory (TODO: Migrate to PostgreSQL/Redis)

## Features

- **Streaming Responses**: Real-time SSE streaming for instant user feedback
- **Conversational AI**: Powered by Meta Llama 3.3 70B via NVIDIA API
- **Dynamic Context Management**: Intelligent token counting and context truncation for infinite conversations
- **Semantic Search Integration**: Combines vector search with LLM-generated responses
- **Context Awareness**: Maintains conversation history with automatic context window management
- **User Isolation**: Each user has separate conversation spaces
- **RAG Pattern**: Retrieval-Augmented Generation using video search results
- **File Filtering**: Optional filtering to specific videos in queries

## API Endpoints

### Chat

**POST** `/api/chat`

Process a chat message with SSE streaming response.

```json
{
  "message": "Show me scenes with people talking",
  "conversation_id": "optional-uuid",
  "file_ids": ["optional-file-id-filter"],
  "max_results": 5,
  "include_context": true
}
```

**Response: Server-Sent Events (SSE) Stream**

The endpoint returns a streaming response with multiple event types:

**1. Metadata Event** (sent first):
```json
data: {
  "type": "metadata",
  "conversation_id": "uuid",
  "results": [
    {
      "file_id": "...",
      "file_name": "video.mp4",
      "score": 0.85,
      "timestamp": 45.2,
      "thumbnail_url": "...",
      "text_content": "..."
    }
  ],
  "context_used": true
}
```

**2. Content Events** (streamed as generated):
```json
data: {
  "type": "content",
  "content": "Based on your videos, I"
}

data: {
  "type": "content",
  "content": " found 3 scenes"
}

data: {
  "type": "content",
  "content": " with people talking..."
}
```

**3. Done Event** (sent at completion):
```json
data: {
  "type": "done",
  "conversation_id": "uuid"
}
```

**4. Error Event** (sent if error occurs):
```json
data: {
  "type": "error",
  "error": "Error message"
}
```

### Conversations

**GET** `/api/conversations`

List all conversations for authenticated user.

**GET** `/api/conversations/{conversation_id}`

Get full conversation history.

**DELETE** `/api/conversations/{conversation_id}`

Delete a conversation.

### Health Check

**GET** `/health`

Service health status.

## Setup

### Prerequisites

- Python 3.11+
- PostgreSQL database
- file-embedder service running (port 8003)
- API Gateway for authentication
- NVIDIA API key (get from [NVIDIA API Catalog](https://build.nvidia.com/))

### Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Generate Prisma client
prisma generate --schema=./prisma/schema.prisma

# Create environment file
cp .env.example .env
Add your NVIDIA API key to .env
# NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxx

# 
# Run migrations
prisma migrate dev --schema=./prisma/schema.prisma

# Run service
python main.py
```

### Database Setup

See [PRISMA_SETUP.md](PRISMA_SETUP.md) for detailed database configuration.

### Environment Variables

See [.env.exauses a RAG (Retrieval-Augmented Generation) pattern:

1. **User Query** → Semantic search via file-embedder
2. **Search Results** → Fed as context to NVIDIA LLM
3. **LLM Response** → Contextualized answer with video references

```python
# Chat Manager workflow
search_results = await file_embedder.search(query, user_id)

# Feed results to LLM as context
response = await llm_service.generate_response(
    messages=conversation_history,
    search_results=search_results
)
```

## Context Window Management
Semantic Search**: Query sent to file-embedder for video results
3. **LLM Generation**: NVIDIA LLM generates contextualized response with search results
4. **Context Building**: Each message adds to conversation history
5. **Context Management**: Automatic truncation when approaching token limits
6. **Follow-up**: User can ask follow-up questions with full context maintained

## Example Conversation

```
User: "Show me scenes with cars"
Assistant: "I found 5 scenes featuring cars in your videos:
1. 'city_drive.mp4' at 1:23 - Red sedan on highway
2. 'parking_lot.mp4' at 0:45 - Multiple vehicles...
Would you like to see specific types of cars?"

User: "Any red ones?"  # Context: previous query about cars
Assistant: "Yes! From the search results, I found 2 scenes with red cars:
1. 'city_drive.mp4' at 1:23 - Red sedan in motion
2. 'sunset_drive.mp4' at 2:10 - Red sports car...
The first scene has the clearest view."

User: "What else is in the first video?"
Assistant: "In 'city_drive.mp4', besides the red car scene, I can see:
- Urban landscape with buildings (0:30)
- Traffic lights and intersections (1:50)
- Pedestrians crossing (2:30)..."
### Example
```
MAX_CONTEXT_TOKENS=4000  # Reserve 4K tokens for context
MAX_TOKENS=1024          # Reserve 1K for response
Total model limit: ~8K tokens (depending on model)
```

### How It Works
1. Count tokens in conversation history
2. If over limit, remove oldest messages
3. Always keep system message + recent context
4. Ensure smooth conversation flow even with 100+ messages query=search_query,
    user_id=user_id,
    max_results=5
) with NVIDIA API
curl -X POST http://localhost:3005/api/chat \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{
    "message": "Show me action scenes",
    "max_results": 5
  }'
```

## NVIDIA API Models

The service supports various NVIDIA models. Configure via `LLM_MODEL`:

- `meta/llama-3.3-70b-instruct` (default) - Meta's latest and most capable Llama model
- `nvidia/llama-3.1-nemotron-70b-instruct` - NVIDIA's instruction-tuned model
- `meta/llama-3.1-8b-instruct` - Faster, lighter model
- `mistralai/mixtral-8x7b-instruct-v0.1` - Alternative architecture

Get your API key: [NVIDIA API Catalog](https://build.nvidia.com/)**New Conversation**: User sends first message → creates conversation ID
2. **Context Building**: Each message adds to conversation history
3. **Context-Enhanced Search**: Recent messages inform current query
4. **Result Presentation**: Search results returned with conversational response
5. **Follow-up**: User can ask follow-up questions with maintained context

## Example Conversation

```
User: "Show me scenes with cars"
Assistant: "Found 5 relevant results" + [car scenes]

User: "Any red ones?"  # Context: previous query about cars
Assistant: "Found 2 relevant results" + [red car scenes]
```

## Authentication

Routes are protected by `InterServiceMiddleware`:
- Expects headers from API Gateway: `x-user-id`, `x-user-email`, `x-user-name`
- Health check endpoint is public

## Storage

**Current**: PostgreSQL with Prisma ORM

**Schema**: `chat_manager`
- `Conversation` table: Conversation metadata
- `Message` table: Individual messages with cascade delete

See [PRISMA_SETUP.md](PRISMA_SETUP.md) for database setup instructions.

## Development

```bash
# Run with auto-reload
MODE=development python main.py

# Test chat endpoint
curl -X POST http://localhost:3005/api/chat \
  -H "Content-Type: application/json" \
  -H "x-user-id: user123" \
  -d '{"message": "Show me action scenes"}'
```

## Future Enhancements
LLM integration for better responses
- [ ] Query refinement suggestions
- [ ] Conversation summarization
- [ ] Export conversation history
- [ ] Real-time streaming responses
- [ ] Multi-language support
- [ ] Redis caching for frequently accessed conversationssponses
- [ ] Multi-language support

## Related Services

- **file-embedder** (port 8003): Semantic search backend
- **upload-manager** (port 3002): File metadata
- **scene-detector** (port 3003): Scene information
- **api-gateway** (port 3000): Authentication & routing
