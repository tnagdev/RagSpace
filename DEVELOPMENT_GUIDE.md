# RagSpace Development Guide

## Project Architecture

### Stack
- **Frontend**: React 19 + TypeScript + Vite + TanStack Router + TanStack Query v5
- **Backend**: NestJS + Prisma + PostgreSQL + AWS S3 + RabbitMQ
- **Styling**: Tailwind CSS 4 + CSS Variables
- **Icons**: Lucide React

### Monorepo Structure
```
/frontend           - React SPA
/api-gateway        - API Gateway service
/auth-service       - Authentication service
/upload-manager     - File upload & S3 management
/file-embedder      - Vector embedding (Python)
/scene-detector     - Scene detection (Python)
/chat-manager       - Chat functionality
```

## Frontend Architecture

### Directory Structure
```
src/
├── api/              - API client functions (organized by domain)
├── components/       - Global reusable components
├── contexts/         - React Context providers
├── hooks/            - Custom React hooks (API + logic)
├── layouts/          - Page layouts
├── pages/            - Route pages with /components subdirectories
├── routes/           - Route configuration
├── types/            - TypeScript type definitions
└── lib/              - Utility functions
```

### Core Principles

#### 1. API Integration Pattern
**Always use React Query hooks for API calls**

```typescript
// ❌ WRONG - Direct API calls in components
const data = await uploadAPI.getFiles();

// ✅ CORRECT - Use React Query hooks
const { data, isLoading } = useFiles();
```

**Structure:**
1. Define API functions in `src/api/[domain].ts`
2. Create React Query hooks in `src/hooks/use[Domain].ts`
3. Use hooks in components

**Example:**
```typescript
// api/upload.ts
export const uploadAPI = {
    getFiles: async (query?: GetFilesQueryDto) => {
        const response = await privateAxios.get(UPLOAD_BASE, { params: query });
        return response.data;
    }
};

// hooks/useUpload.ts
export const useFiles = (query?: GetFilesQueryDto, options?) => {
    return useQuery({
        queryKey: uploadKeys.list(query),
        queryFn: () => uploadAPI.getFiles(query),
        ...options,
    });
};

// Component
const { data, isLoading } = useFiles({ limit: 100 });
```

#### 2. Component Reusability
**Check existing components before creating new ones**

Reusable components in `src/components/`:
- `Button` - 7 variants (primary, secondary, danger, success, warning, ghost, outline)
- `IconButton` - Icon-only buttons
- `NavLink` - Sidebar navigation links
- `SearchBar` - Search input
- `Logo` - Application logo
- `UserAvatar` - User profile display

**Page-specific components go in `pages/[page]/components/`**

```typescript
// ✅ CORRECT Structure
pages/
  files/
    FilesPage.tsx
    components/
      FileCard.tsx
      FileUploadZone.tsx
      FileUploadItem.tsx
```

#### 3. State Management
**Prefer React Query for server state, useState/useReducer for local UI state**

```typescript
// ✅ Server state - Use React Query
const { data: files } = useFiles();

// ✅ Local UI state - Use useState
const [isModalOpen, setIsModalOpen] = useState(false);

// ❌ WRONG - Don't use useState for server data
const [files, setFiles] = useState([]);
```

#### 4. Styling Guidelines
**Use CSS variables from `styles.css` - Never hardcode colors**

```typescript
// ❌ WRONG
<div style={{ background: '#a855f7' }}>

// ✅ CORRECT
<div className="bg-accent-primary">
<div style={{ background: 'var(--color-accent-primary)' }}>
```

**Available CSS Variables:**
- Colors: `--color-bg-primary`, `--color-text-primary`, `--color-accent-primary`, etc.
- Gradients: `--gradient-primary-start`, `--gradient-primary-end`
- Borders: `--color-border-default`, `--color-sidebar-border`

#### 5. TypeScript Best Practices
**Always define types matching backend DTOs**

```typescript
// ✅ Define types in src/types/
export interface FileResponseDto {
    id: string;
    filename: string;
    fileSize: number;
    fileType: FileType;
    processingStage: ProcessingStage;
    // ... match backend exactly
}

// Use type imports
import type { FileResponseDto } from '@/types/upload.types';
```

#### 6. Performance Optimization
**Implement proper query optimization strategies**

```typescript
// ✅ Conditional polling - only when needed
const { data } = useFiles(
    { limit: 100 },
    {
        refetchInterval: hasProcessingFiles ? 2000 : false,
        refetchIntervalInBackground: true,
    }
);

// ✅ Single query for multiple items instead of per-item polling
// WRONG: N files = N polling requests
files.map(f => useFilePolling(f.id));

// CORRECT: 1 query for all files
const { data: allFiles } = useFiles();
```

#### 7. Error Handling
**Always handle errors gracefully with try-catch and reset mutations**

```typescript
const handleAction = useCallback(async (id: string) => {
    try {
        mutation.reset(); // Reset before new operation
        await mutation.mutateAsync(id);
        refetch(); // Refresh data
    } catch (error) {
        console.error('Action failed:', error);
        // Show user-friendly error
    } finally {
        mutation.reset(); // Clean up mutation state
    }
}, [mutation]);
```

#### 8. Code Cleanliness
**No unnecessary comments - code should be self-documenting**

```typescript
// ❌ WRONG - Obvious comment
// Set the user name
setUserName(name);

// ✅ CORRECT - Only comment complex logic
// Abort multipart upload for files still uploading (UPLOAD stage)
// Use delete API for files in processing stages (EMBEDDING, INDEXING, etc.)
if (file.processingStage === 'UPLOAD') {
    await abortMutation.mutateAsync(id);
} else {
    await deleteMutation.mutateAsync(id);
}
```

#### 9. File Organization
**Co-locate related code**

```typescript
// ✅ CORRECT - Page with its components
pages/files/
  FilesPage.tsx
  components/
    FileCard.tsx          // File display card
    FileUploadZone.tsx    // Upload interface
    FileUploadItem.tsx    // Processing item
    PollingFileItem.tsx   // Wrapper with polling logic

// ❌ WRONG - All components in global directory
components/
  FileCard.tsx
  FileUploadZone.tsx
  ...
```

#### 10. Callback Dependencies
**Always specify correct dependencies in useCallback/useEffect**

```typescript
// ✅ CORRECT - Include all dependencies
const handleClick = useCallback(
    async (id: string) => {
        await mutation.mutateAsync(id);
        refetch();
    },
    [mutation, refetch] // All used variables
);

// ❌ WRONG - Missing dependencies
const handleClick = useCallback(async (id: string) => {
    await mutation.mutateAsync(id);
}, []); // Missing mutation dependency
```

## Backend Integration

### API Endpoint Pattern
```typescript
// Base URL configuration in apiClient.ts
export const privateAxios = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

// Domain-specific base paths
const UPLOAD_BASE = '/api/upload';
const AUTH_BASE = '/api/auth';
```

### File Upload Flow
**Multi-strategy upload based on file size:**

1. **Small files (<10MB)**: Direct upload with FormData
2. **Large files (≥10MB)**: Chunked multipart upload
   - Initialize multipart upload → Get presigned URLs
   - Upload chunks directly to S3
   - Complete multipart upload

```typescript
// Automatic routing in uploadAPI.uploadFile()
if (file.size > CHUNK_SIZE) {
    return uploadAPI.uploadFileChunked(file, onProgress, onInit);
}
// ... direct upload
```

### Processing Pipeline
```
UPLOAD → EMBEDDING → SCENE_DETECTION → INDEXING → COMPLETED
```

Track via `processingStage` and `processingStatus` fields.

## Common Patterns

### Query Keys Factory
```typescript
export const uploadKeys = {
    all: ['uploads'] as const,
    lists: () => [...uploadKeys.all, 'list'] as const,
    list: (query?: GetFilesQueryDto) => [...uploadKeys.lists(), query] as const,
    details: () => [...uploadKeys.all, 'detail'] as const,
    detail: (id: string) => [...uploadKeys.details(), id] as const,
};
```

### Mutation with Optimistic Updates
```typescript
export const useDeleteFile = (options?) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => uploadAPI.deleteFile(id),
        onSuccess: (_data, variables) => {
            queryClient.removeQueries({ queryKey: uploadKeys.detail(variables) });
            queryClient.invalidateQueries({ queryKey: uploadKeys.lists() });
        },
        ...options,
    });
};
```

### Conditional Rendering
```typescript
{isLoading ? (
    <LoadingSpinner />
) : data.length === 0 ? (
    <EmptyState message="No items found" />
) : (
    <ItemGrid items={data} />
)}
```

## Development Workflow

### Before Creating New Components
1. Check if similar component exists in `src/components/`
2. Check if Button variants cover your needs
3. Look for similar patterns in other pages
4. Only create new components if truly unique

### Before Making API Calls
1. Check if hook already exists in `src/hooks/`
2. Check if API function exists in `src/api/`
3. Follow the established pattern: API function → Hook → Component

### Testing Approach
1. Test happy path
2. Test error scenarios
3. Test edge cases (empty states, loading states)
4. Verify mutation state resets properly

## Best Practices Checklist

- [ ] Use existing components/hooks before creating new
- [ ] API calls through React Query hooks only
- [ ] Types match backend DTOs exactly
- [ ] CSS variables for all colors
- [ ] Proper error handling with try-catch
- [ ] Reset mutation states after operations
- [ ] Conditional polling (only when needed)
- [ ] Single query for multiple items
- [ ] Page-specific components in pages/[page]/components/
- [ ] Self-documenting code, minimal comments
- [ ] Correct useCallback/useEffect dependencies
- [ ] Proper loading/error/empty states
- [ ] Clean up side effects (timers, subscriptions)

## Anti-Patterns to Avoid

❌ Direct API calls in components
❌ Hardcoded colors/styles
❌ Creating new components without checking existing
❌ Per-item polling when bulk query possible
❌ useState for server data
❌ Missing error handling
❌ Forgetting to reset mutation states
❌ Unnecessary comments
❌ Missing TypeScript types
❌ Global components for page-specific UI

## Quick Reference

### Import Aliases
```typescript
import Button from '@/components/Button';
import { useFiles } from '@/hooks/useUpload';
import type { FileResponseDto } from '@/types/upload.types';
```

### Common Hook Patterns
```typescript
// Query
const { data, isLoading, error, refetch } = useQuery(...);

// Mutation
const mutation = useMutation(...);
const result = await mutation.mutateAsync(params);
mutation.reset();

// Callback
const handler = useCallback(() => {}, [deps]);

// Effect
useEffect(() => {
    // side effect
    return () => cleanup();
}, [deps]);
```

### File Size Constants
```typescript
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
```

## Documentation Updates
When adding new features:
1. Add types to appropriate `types/` file
2. Add API function to appropriate `api/` file
3. Add hook to appropriate `hooks/` file
4. Update this guide if introducing new patterns
