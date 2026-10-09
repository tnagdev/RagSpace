# chat-manager

RAG chat over a user's files.

- **gRPC**: `ChatService` (`contracts/proto/ragspace/chat/v1`). `SendMessage` is server-streamed (`step`, `tool`, `results`, `delta`, then `done` or `error`); a repeated `request_id` replays the stored reply.
- **Pipeline** (`src/graph`): LangGraph — load attachments → classify intent → search (`SearchService.Search`) or read whole files (`SearchService.GetFileContent`) → stream the answer.
- **History**: messages are paged newest first; older turns fold into a rolling summary (`summarizedUntil`).
- **Quota**: conversations consume `CONVERSATIONS` or `FILE_CONVERSATIONS` via `BillingService` and release it on delete.
- **Events consumed**: `file.deleted`, `collection.deleted`, `user.deleted`.

```bash
venv/Scripts/python -m pytest -q
```
