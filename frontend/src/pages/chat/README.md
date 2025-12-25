# Chat Page Implementation

## Overview

The Chat page provides an AI-powered conversational interface for querying media files using RAG (Retrieval-Augmented Generation). Users can ask questions about their media library, attach specific files for context, and view relevant scenes/files in real-time.

## Architecture

### Components Structure

```
frontend/src/pages/chat/
├── ChatPage.tsx                 # Main page component with two-panel layout
└── components/
    ├── ChatInput.tsx            # Message input with file attachment button
    ├── ConversationList.tsx     # Sidebar showing conversation history
    ├── MessageList.tsx          # Chat messages with search results
    └── FileAttachments.tsx      # Display attached files
```

### API Integration

- **Chat API** (`src/api/chat.ts`): Handles SSE streaming and conversation CRUD
- **Hooks** (`src/hooks/useChat.ts`): React Query hooks for data fetching
- **Types** (`src/types/chat.types.ts`): TypeScript interfaces matching backend models

## Features

### 1. Conversation Management
- **New Chat**: Start fresh conversations
- **History**: View past conversations with timestamps
- **Delete**: Remove conversations with confirmation
- **Selection**: Click to load conversation messages

### 2. Message Streaming (SSE)
- Real-time message streaming from AI
- Progress indication during generation
- Error handling with user feedback
- Automatic conversation creation/update

### 3. File Attachments
- Attach specific files for contextual queries
- Visual file chips with remove functionality
- Supports videos and images
- File picker modal integration

### 4. Search Results Display
- Shows top 3 relevant results per assistant message
- Clickable result cards with thumbnails
- Score indicators
- Timestamp display for video scenes

### 5. Preview Panel
- Right-side panel for media preview
- Video player with scene timestamps
- Image viewer
- Click any result to preview

## SSE Event Flow

```typescript
// Event Types
type ChatSSEEvent = 
  | { type: 'metadata', conversation_id: string, results: SearchResult[] }
  | { type: 'content', content: string }
  | { type: 'done', conversation_id: string }
  | { type: 'error', error: string }
```

### Event Processing
1. **metadata**: Set conversation ID, store search results
2. **content**: Accumulate message chunks, update UI
3. **done**: Finalize conversation, refresh list
4. **error**: Display error, remove pending message

## State Management

### Local State
- `attachedFiles`: Files selected for context
- `selectedResult`: Currently previewed result
- `currentConversationId`: Active conversation
- `messages`: Current chat messages
- `isStreaming`: Streaming status
- `error`: Error message display
- `searchResults`: Results from last query

### React Query Cache
- `conversations`: List of all conversations
- `conversation(id)`: Specific conversation data
- Auto-invalidation after mutations

## Usage Patterns

### Starting a New Chat
```typescript
const handleNewChat = () => {
    setCurrentConversationId(undefined);
    setMessages([]);
    setAttachedFiles([]);
};
```

### Sending a Message
```typescript
const payload = {
    message: "Find scenes with people talking",
    conversation_id: currentConversationId,
    file_ids: attachedFiles.map(f => f.id),
    max_results: 10,
    include_context: true,
};

const response = await chatAPI.sendMessage(payload);
// Process SSE stream...
```

### Loading a Conversation
```typescript
const conversationQuery = useConversation(conversationId);
// Automatically loads messages when query succeeds
useEffect(() => {
    if (conversationQuery.data?.messages) {
        setMessages(conversationQuery.data.messages);
    }
}, [conversationQuery.data]);
```

## UI/UX Considerations

### Layout
- **50/50 Split**: Equal space for chat and preview
- **Sticky Input**: Always visible at bottom
- **Scrollable Areas**: Independent scroll for conversations, messages, preview

### Visual Feedback
- Loading indicators during streaming
- Disabled state while processing
- Error messages with icons
- Hover states on clickable elements
- Active conversation highlighting

### Accessibility
- Keyboard navigation (Enter to send, Shift+Enter for newline)
- ARIA labels on icon buttons
- Focus management
- Semantic HTML structure

## Integration Points

### Backend Services
- **chat-manager**: Main chat API (`/api/chat`)
- **API Gateway**: Routes and proxies SSE streams
- **ChromaDB**: Semantic search via file-embedder
- **PostgreSQL**: Conversation persistence

### Shared Components
- `Button`: Consistent button styling
- `FilePickerModal`: From search page
- `VideoPreview/ImagePreview`: From search page

### Routing
- Route: `/chat`
- NavItem: "Chat" with MessageSquare icon
- Protected route requiring authentication

## Performance Optimizations

1. **Conditional Polling**: No polling; uses SSE for real-time updates
2. **Query Invalidation**: Only refresh conversations list after changes
3. **Optimistic Updates**: Show user message immediately
4. **Lazy Loading**: Conversation messages loaded on-demand
5. **Debounced Input**: Prevents accidental double-sends

## Error Handling

### Network Errors
- Catch fetch failures
- Display user-friendly messages
- Rollback optimistic updates

### SSE Parsing Errors
- Log to console for debugging
- Continue processing other events
- Don't break the stream

### Backend Errors
- Show error type events from backend
- Allow retry without refresh
- Preserve conversation state

## Future Enhancements

- [ ] Message editing
- [ ] Conversation renaming
- [ ] Export conversation as text/PDF
- [ ] Voice input support
- [ ] Code syntax highlighting in responses
- [ ] Markdown rendering in messages
- [ ] File upload from chat
- [ ] Multi-file preview comparison
- [ ] Conversation search
- [ ] Message reactions

## Testing Checklist

- [ ] New conversation creation
- [ ] Message sending and receiving
- [ ] SSE streaming display
- [ ] File attachment/removal
- [ ] Conversation selection
- [ ] Conversation deletion
- [ ] Search result clicking
- [ ] Preview panel display
- [ ] Error scenarios
- [ ] Mobile responsiveness
