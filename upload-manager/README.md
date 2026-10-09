# upload-manager

Owns files, uploads, collections and processing state.

- **gRPC**: `FileService` and `CollectionService` (`contracts/proto/ragspace/files/v1`).
- **Uploads**: every upload is an S3 multipart session; the server picks the part size, presigns the parts and keeps the S3 upload id. Completing an upload probes the media (ffprobe) and enforces plan limits through `BillingService`.
- **Processing state**: the single writer. Workers report `file.stage_changed`; `src/files/processing.ts` applies the forward-only state machine and publishes `file.updated` for live clients.
- **Events published**: `file.uploaded`, `file.updated`, `file.deleted`, `collection.deleted`. **Consumed**: `file.stage_changed`, `user.deleted`.

```bash
npm test
npx prisma migrate dev --schema src/modules/prisma/schema.prisma
```
