# Scene Detector Service

A FastAPI-based microservice that consumes file upload events from RabbitMQ, detects scenes in video files using the scenedetect library, generates thumbnails, and stores scene data with S3 references. Integrates with the upload-manager service for file status updates.

## Features

- 🎬 **Scene Detection**: Automatic scene detection in video files using PySceneDetect
- 🖼️ **Thumbnail Generation**: Extracts high-quality thumbnails for each detected scene
- ☁️ **S3 Integration**: Uploads scene thumbnails to S3-compatible storage (AWS S3, MinIO)
- 🐰 **RabbitMQ Consumer**: Listens for file upload events and processes videos asynchronously
- 📊 **Database Storage**: Stores scene metadata with timestamps, frame numbers, and S3 URLs
- 🔄 **Event Publishing**: Publishes scene detection completion events for downstream services
- 🔗 **Upload Manager Integration**: Updates file processing status via REST API
- 🐳 **Docker Support**: Fully containerized for easy deployment

## Architecture

```
RabbitMQ → Scene Detector Service → Scene Detection
                ↓
         Get File Info (Upload Manager API)
                ↓
         Download from S3
                ↓
         Extract Thumbnails
                ↓
         Upload to S3
                ↓
         Store Scenes in Database
                ↓
         Update File Status (Upload Manager API)
                ↓
         Publish Completion Event
```

### Service Integration

- **Upload Manager**: Communicates via REST API for file metadata and status updates
- **RabbitMQ**: Consumes `file.upload.completed` events, publishes processing events
- **S3**: Downloads source videos and uploads scene thumbnails
- **PostgreSQL**: Stores scene metadata independently

## Scene Detection

The service uses PySceneDetect with content-based detection to identify scene changes in videos. For each detected scene:

1. Detects scene boundaries using content analysis
2. Extracts a thumbnail from the middle of each scene
3. Uploads thumbnail to S3
4. Stores scene data in PostgreSQL:
   - Scene number
   - Start/end times and frames
   - Duration
   - Thumbnail S3 key and URL
5. Updates file processing status in upload-manager

## Database Schema

### Scene Model

The service uses its own database for scene storage:

```prisma
model Scene {
  id              String    @id @default(uuid())
  fileId          String
  sceneNumber     Int
  startTime       Float     // seconds
  endTime         Float     // seconds
  startFrame      Int
  endFrame        Int
  duration        Float     // seconds
  thumbnailS3Key  String
  thumbnailS3Url  String?
  metadata        Json?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  file            File      @relation(fields: [fileId], references: [id], onDelete: Cascade)
}
```

## API Endpoints

### GET /

Health check endpoint

**Response:**
```json
{
  "service": "file-embedder",
  "status": "running",
  "version": "1.0.0"
}
```

### GET /health

Detailed health check with database and RabbitMQ status

**Response:**
```json
{
  "service": "file-embedder",
  "status": "running",
  "database": "connected",
  "rabbitmq": "connected"
}
```

## Cloud Deployment

### Google Cloud Run Deployment

The service is configured for automatic deployment to Google Cloud Run via Cloud Build triggers.

**Prerequisites:**
- Google Cloud Project: `ragspace-480709`
- Cloud SQL PostgreSQL instance: `rag-postgress`
- Secrets configured in Secret Manager:
  - `DATABASE_PASSWORD`
  - `RABBITMQ_URL`
  - `CLOUD_SQL_CONNECTION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`

**Deployment Process:**
1. Create a git tag with pattern `scene-detector-*`:
   ```bash
   git tag scene-detector-v1.0.0
   git push origin scene-detector-v1.0.0
   ```

2. Cloud Build automatically:
   - Builds Docker image
   - Pushes to Container Registry (`gcr.io/ragspace-480709/ragspace/scene-detector`)
   - Deploys to Cloud Run in `asia-south1` region

**Cloud Build Trigger Configuration:**
- **Trigger Type**: Tag push
- **Tag Pattern**: `^scene-detector-.*$`
- **Build Config**: `scene-detector/cloudbuild.yaml`
- **Region**: asia-south1

**Environment Variables (Cloud Run):**
- `PORT=8080` (set automatically by Cloud Run)
- `DATABASE_URL=postgresql://user:pass@localhost/db?host=/cloudsql/INSTANCE`
- `MODE=production`
- `RABBITMQ_URL` (from Secret Manager)
- `AWS_REGION=ap-south-1`
- `AWS_S3_BUCKET=rag-user-uploads`
- `AWS_ACCESS_KEY_ID` (from Secret Manager)
- `AWS_SECRET_ACCESS_KEY` (from Secret Manager)

**Resource Configuration:**
- Memory: 2Gi
- CPU: 2
- Timeout: 300s (5 minutes)
- Max Instances: 10
- Min Instances: 0
- Port: 8080

## RabbitMQ Events

### Consumed Events

- **`file.upload.completed`**: Triggered when a file is uploaded by upload-manager
  - Only processes VIDEO file types
  - Downloads video, detects scenes, generates thumbnails

### Published Events

- **`file.processing.started`**: When scene detection begins
- **`file.processing.completed`**: When scene detection finishes successfully
  - Includes array of detected scenes with metadata
- **`file.processing.failed`**: If scene detection fails

**Event Payload Example:**
```json
{
  "type": "file.processing.completed",
  "fileId": "uuid",
  "userId": "uuid",
  "timestamp": "2025-11-29T00:00:00Z",
  "data": {
    "stage": "SCENE_DETECTION",
    "scenes_detected": 5,
    "scenes": [
      {
        "id": "scene-uuid",
        "sceneNumber": 1,
        "startTime": 0.0,
        "endTime": 5.2,
        "duration": 5.2,
        "thumbnailUrl": "https://s3.../scenes/.../scene_0001.jpg"
      }
    ]
  }
}
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Application
PORT=3003
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/file_embedder

# RabbitMQ Configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue
RABBITMQ_ROUTING_KEY=file.upload.completed

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_S3_ENDPOINT=  # Optional, for MinIO or custom endpoint

# Scene Detection Configuration
SCENE_DETECTION_THRESHOLD=27.0
SCENE_DETECTION_MIN_SCENE_LENGTH=15
THUMBNAIL_WIDTH=1280
THUMBNAIL_HEIGHT=720
THUMBNAIL_QUALITY=85

# Processing Configuration
TEMP_DIR=/tmp/file-embedder
MAX_CONCURRENT_JOBS=2
```

## Setup & Installation

### Prerequisites

- Python 3.11+
- PostgreSQL
- RabbitMQ
- S3-compatible storage (AWS S3 or MinIO)
- FFmpeg (for video processing)

### Local Development

1. **Clone the repository**
   ```bash
   cd RagSpace/file-embedder
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Generate Prisma client**
   ```bash
   prisma generate --schema ./prisma/schema.prisma
   ```

6. **Run database migrations**
   ```bash
   prisma migrate dev --schema ./prisma/schema.prisma --name init
   ```

7. **Run the service**
   ```bash
   python -m uvicorn src.main:app --host 0.0.0.0 --port 3003 --reload
   ```

### Docker Deployment

1. **Build the image**
   ```bash
   docker build -t file-embedder:latest .
   ```

2. **Run the container**
   ```bash
   docker run -d \
     --name file-embedder \
     -p 3003:3003 \
     --env-file .env \
     file-embedder:latest
   ```

## Scene Detection Configuration

### Threshold

The `SCENE_DETECTION_THRESHOLD` parameter (default: 27.0) controls sensitivity:
- **Lower values** (e.g., 20): More sensitive, detects more scenes
- **Higher values** (e.g., 35): Less sensitive, detects fewer scenes

### Minimum Scene Length

The `SCENE_DETECTION_MIN_SCENE_LENGTH` parameter (default: 15 frames) sets the minimum length for a valid scene.

### Thumbnail Settings

- **Width/Height**: Resolution of generated thumbnails (default: 1280x720)
- **Quality**: JPEG quality 1-100 (default: 85)

## Integration with Other Services

### Upload Manager
- Publishes `file.upload.completed` events when videos are uploaded
- File-embedder subscribes to these events

### Scene Detector Service (Future)
- Can use the detected scenes for further analysis

### Chat Manager Service (Future)
- Can query scene data for RAG responses about video content

## Error Handling

The service handles errors gracefully:
- Failed scene detection updates file status to `FAILED`
- Publishes `file.processing.failed` events
- Cleans up temporary files
- Logs detailed error information

## Monitoring

The service provides detailed logging:
- Scene detection progress
- Thumbnail extraction
- S3 upload operations
- Database operations
- RabbitMQ message handling
- Error tracking

## File Storage Structure

Scene thumbnails are stored in S3 with the following structure:
```
scenes/
  {userId}/
    {year}/
      {month}/
        {fileId}/
          scene_0001.jpg
          scene_0002.jpg
          ...
```

## Performance

- Processes videos asynchronously
- Configurable concurrency with `MAX_CONCURRENT_JOBS`
- Efficient temporary file cleanup
- Optimized thumbnail generation

## Dependencies

- **FastAPI**: Web framework
- **Prisma**: Database ORM
- **PySceneDetect**: Scene detection
- **OpenCV**: Video processing
- **Pillow**: Image manipulation
- **Boto3**: AWS S3 integration
- **aio-pika**: RabbitMQ async client

## License

UNLICENSED - Private project
