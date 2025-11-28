# Upload Manager Service

A comprehensive file upload service for the RagSpace platform that handles file uploads to S3-compatible storage and publishes events to RabbitMQ for downstream processing.

## Features

- 🔐 **JWT Authentication**: All requests require authentication through the API Gateway
- 📤 **S3 Upload**: Seamless file uploads to S3-compatible storage (AWS S3, MinIO)
- 🐰 **RabbitMQ Events**: Publishes file lifecycle events for other services to consume
- 📊 **File Metadata**: Tracks comprehensive file information in PostgreSQL
- 🔍 **File Management**: List, retrieve, and delete files
- 🎯 **File Type Detection**: Automatic classification (image, video, audio, document)
- 📈 **Progress Tracking**: Monitor upload and processing status
- 🐳 **Docker Support**: Fully containerized with Docker

## Architecture

```
Client → API Gateway (JWT Auth) → Upload Manager → S3 Storage
                                          ↓
                                    RabbitMQ Events
                                          ↓
                                Other Services (Scene Detector, File Embedder)
```

## Database Schema

The service uses PostgreSQL with Prisma ORM. The main `File` model tracks:

- **User Information**: `userId` - Links file to user
- **File Details**: `filename`, `originalFilename`, `fileSize`, `mimeType`, `fileType`
- **S3 Details**: `s3Key`, `s3Bucket`, `s3Url`
- **Status Tracking**: 
  - `uploadStatus`: PENDING, UPLOADING, COMPLETED, FAILED, CANCELLED
  - `processingStatus`: NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED, SKIPPED
  - `processingStage`: UPLOAD, EMBEDDING, SCENE_DETECTION, INDEXING, COMPLETED
- **Timestamps**: `createdAt`, `updatedAt`, `uploadedAt`, `processingStartedAt`, `processingCompletedAt`
- **Metadata**: `metadata` (JSON), `errorMessage`

## API Endpoints

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### Upload File
```http
POST /api/upload
Content-Type: multipart/form-data

file: <binary file>
```

### List Files
```http
GET /api/upload?page=1&limit=20&uploadStatus=COMPLETED&processingStatus=IN_PROGRESS
```

### Get File Details
```http
GET /api/upload/:id
```

### Delete File
```http
DELETE /api/upload/:id
```

### Health Check
```http
GET /api/upload/health
```

## RabbitMQ Events

The service publishes the following events to RabbitMQ:

- `file.upload.started`: When upload begins
- `file.upload.progress`: Upload progress updates
- `file.upload.completed`: When file is successfully uploaded
- `file.upload.failed`: If upload fails
- `file.processing.started`: When processing begins
- `file.processing.completed`: When processing completes
- `file.processing.failed`: If processing fails

Event payload:
```json
{
  "type": "file.upload.completed",
  "fileId": "uuid",
  "userId": "uuid",
  "timestamp": "2025-11-25T00:00:00Z",
  "data": {
    "s3Key": "uploads/user-id/2025/11/file.mp4",
    "s3Url": "https://...",
    "fileType": "VIDEO"
  }
}
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Application
PORT=3002
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/upload_manager

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_S3_ENDPOINT=  # Optional, for MinIO or custom endpoint

# RabbitMQ Configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.upload.queue

# File Upload Configuration
MAX_FILE_SIZE=524288000  # 500MB
ALLOWED_FILE_TYPES=image/*,video/*,audio/*,application/pdf
```

## Setup & Installation

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- RabbitMQ 3+
- S3-compatible storage (AWS S3 or MinIO)

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Generate Prisma client**:
   ```bash
   npm run prisma:generate
   ```

4. **Run database migrations**:
   ```bash
   npm run prisma:migrate
   ```

5. **Start development server**:
   ```bash
   npm run start:dev
   ```

### Docker Development

Start infrastructure services (PostgreSQL, RabbitMQ, MinIO):
```bash
docker-compose -f docker-compose-dev.yml up -d
```

Run migrations:
```bash
npm run prisma:migrate
```

Start the service:
```bash
npm run start:dev
```

### Production Deployment

Build and start all services:
```bash
docker-compose up -d
```

## Scripts

- `npm run build` - Build the application
- `npm run start` - Start production server
- `npm run start:dev` - Start development server with watch mode
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm test` - Run tests
- `npm run lint` - Lint code

## Integration with Other Services

### API Gateway
The API Gateway proxies all `/api/upload/*` requests to this service and validates JWT tokens.

### Scene Detector Service
Subscribes to `file.upload.completed` events to detect scenes in video files.

### File Embedder Service
Subscribes to file events to generate embeddings for search functionality.

### Chat Manager Service
Uses file metadata for RAG (Retrieval-Augmented Generation) queries.

## File Storage Structure

Files are organized in S3 with the following structure:
```
uploads/
  {userId}/
    {year}/
      {month}/
        {uuid}.{extension}
```

Example: `uploads/user-123/2025/11/abc-def-123.mp4`

## Security

- All endpoints require JWT authentication
- File uploads are validated for size and type
- S3 URLs are pre-signed with expiration
- User isolation - users can only access their own files
- SQL injection protection via Prisma
- CORS enabled for cross-origin requests

## Error Handling

The service provides detailed error messages:
- `400 Bad Request` - Invalid input or file
- `401 Unauthorized` - Missing or invalid JWT token
- `404 Not Found` - File not found
- `413 Payload Too Large` - File exceeds size limit
- `500 Internal Server Error` - Server or storage error

## Monitoring

The service logs:
- File upload start/completion
- S3 operations
- RabbitMQ event publishing
- Database operations
- Authentication failures
- Errors and exceptions

## License

UNLICENSED - Private project
