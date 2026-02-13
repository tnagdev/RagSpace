# File Embedder Service

FastAPI microservice for generating and storing video/audio embeddings. Part of the RagSpace video processing pipeline.

## 🎯 Overview

The File Embedder Service processes video files to create searchable embeddings for semantic search. It listens to RabbitMQ events, processes audio transcripts and video scenes, and stores multi-modal embeddings in ChromaDB.

### Key Features

- 🎧 **Audio Processing**: Extracts audio, transcribes with Whisper, generates text embeddings
- 🎬 **Visual Processing**: Extracts scene frames, generates CLIP embeddings
- 🔍 **Hybrid Search**: Combines audio and visual embeddings for powerful semantic search
- 📡 **Event-Driven**: Responds to RabbitMQ events from other services
- 💾 **Persistent Storage**: ChromaDB for efficient vector similarity search
- ⚡ **GPU Accelerated**: Optional CUDA support for faster processing

## 🏗️ Architecture

```
Upload Manager → RabbitMQ → File Embedder → ChromaDB
Scene Detector ↗           ↓
                      S3/MinIO
                     (Video Files)
```

### Processed Events

1. **`file.upload.completed`**: Audio extraction & transcript embedding
2. **`file.processing.completed`**: Scene visual embedding

## 🚀 Quick Start

### Option 1: Quick Start Script (Windows)

```powershell
.\start.ps1
```

This will:
- Create virtual environment
- Install dependencies
- Create `.env` from template
- Start the service

### Option 2: Manual Setup

```bash
# Create virtual environment
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run the service
python run.py
```

### Option 3: Docker

```bash
docker-compose up -d
```

## 📋 Configuration

Create a `.env` file based on `.env.example`:

```bash
# RabbitMQ Configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue

# ChromaDB Configuration
CHROMA_PERSIST_DIRECTORY=./chroma_data

# S3 Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=videos

# Service Configuration
SERVICE_PORT=8003
LOG_LEVEL=INFO
DEVICE=cuda  # or 'cpu'

# Model Configuration
CLIP_MODEL=ViT-B-32
TEXT_MODEL=BAAI/bge-base-en-v1.5

# YouTube Downloader Configuration
YOUTUBE_COOKIE_BROWSER=chrome  # Browser to extract cookies from: chrome, firefox, edge, safari
                                # Set to empty or omit for Docker environments
                                # Helps bypass YouTube bot detection when running locally
```

## 📚 API Documentation

### Health Endpoints

**GET /** - Basic health check
```bash
curl http://localhost:8003/
```

**GET /health** - Detailed health status
```bash
curl http://localhost:8003/health
```

### Query Endpoint

**POST /query** - Semantic search across embeddings

```bash
curl -X POST "http://localhost:8003/query?query_text=person%20explaining%20technology&top_k=5&audio_weight=0.4&visual_weight=0.6"
```

Parameters:
- `query_text` (required): Search query
- `video_id` (optional): Filter by specific video
- `top_k` (default: 10): Number of results
- `audio_weight` (default: 0.5): Audio similarity weight
- `visual_weight` (default: 0.5): Visual similarity weight

Response:
```json
{
  "query": "person explaining technology",
  "count": 5,
  "results": [
    {
      "score": 0.8542,
      "video_id": "tech_tutorial",
      "start_time": 45.2,
      "end_time": 52.8,
      "text": "Let me explain how this technology works...",
      "type": "audio"
    }
  ]
}
```

### Delete Endpoint

**DELETE /video/{video_id}** - Remove all embeddings for a video

```bash
curl -X DELETE http://localhost:8003/video/my_video_id
```

## 🔄 Event Processing Flow

### 1. Upload Completed Event
```
file.upload.completed → Download Video → Extract Audio → 
Transcribe with Whisper → Generate Text Embeddings → 
Store in ChromaDB (audio_text_embeddings)
```

### 2. Processing Completed Event
```
file.processing.completed → Download Video → Extract Scene Frames → 
Generate CLIP Embeddings → Store in ChromaDB (video_embeddings)
```

## 🧪 Testing

Run the example script to test all endpoints:

```bash
python example_usage.py
```

This will:
- Check service health
- Query embeddings
- Display formatted results

## 🛠️ Technologies

- **Framework**: FastAPI + Uvicorn
- **Message Queue**: aio-pika (async RabbitMQ)
- **Vector Database**: ChromaDB
- **ML Models**:
  - OpenAI CLIP (ViT-B-32) for visual embeddings
  - OpenAI Whisper for transcription
  - Sentence Transformers (BGE) for text embeddings
- **Media Processing**: OpenCV, FFmpeg
- **Deep Learning**: PyTorch

## 📁 Project Structure

```
file-embedder/
├── src/
│   ├── main.py              # FastAPI app & event handlers
│   ├── config.py            # Configuration management
│   ├── db/
│   │   └── chroma_db.py     # ChromaDB operations
│   ├── rabbitmq/
│   │   └── consumer.py      # RabbitMQ consumer
│   └── utils/
│       ├── audio_embedder.py    # Audio processing
│       ├── video_embedder.py    # Video processing
│       ├── s3_client.py         # S3 downloads
│       └── file_utils.py        # Utilities
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── run.py
├── start.ps1                # Quick start script
└── example_usage.py         # Testing examples
```

## 🐛 Troubleshooting

### CUDA Out of Memory
Set `DEVICE=cpu` in `.env`

### FFmpeg Not Found
**Windows**: Download from https://ffmpeg.org/download.html  
**Linux**: `sudo apt-get install ffmpeg`  
**Mac**: `brew install ffmpeg`

### RabbitMQ Connection Failed
Ensure RabbitMQ is running:
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

### YouTube Bot Detection Error
If you get "Sign in to confirm you're not a bot" errors:

**For Local Development:**
1. **Set Browser Cookie Source**: Configure `YOUTUBE_COOKIE_BROWSER` in `.env`:
   ```bash
   YOUTUBE_COOKIE_BROWSER=chrome  # or firefox, edge, safari
   ```

2. **Sign In to YouTube**: Open the browser specified above, sign in to YouTube, and watch a video to ensure cookies are active.

**For Docker/Production:**
The service automatically disables cookie extraction in Docker environments (where browsers aren't available). It will:
- First attempt download with realistic headers and user-agent
- Automatically retry without cookies if cookie extraction fails
- Continue working even if bot detection is encountered occasionally

To explicitly disable cookies in any environment:
```bash
# In .env file
YOUTUBE_COOKIE_BROWSER=  # Leave empty
# or omit the variable entirely
```

3. **Update yt-dlp**: Ensure latest version:
   ```bash
   pip install --upgrade yt-dlp
   ```

### Models Download Slow
First run downloads ~3GB of models. Ensure stable internet connection.

## 📊 Performance

- **With GPU (CUDA)**: ~2-5 seconds per video (depending on length)
- **With CPU**: ~10-30 seconds per video
- **Concurrent Processing**: Handles multiple videos simultaneously
- **Storage**: ~2-5KB per scene embedding

## 🔐 Security Considerations

- Set secure RabbitMQ credentials in production
- Use IAM roles for S3 access instead of hardcoded keys
- Enable authentication for ChromaDB in production
- Use HTTPS for API endpoints
- Validate and sanitize all file inputs

## 📖 Additional Documentation

- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup instructions
- [SUMMARY.md](SUMMARY.md) - Architectural overview and design decisions
- [API Documentation](http://localhost:8003/docs) - Interactive Swagger UI (when running)

## 🤝 Integration

This service integrates with:
- **upload-manager**: Receives upload completion events
- **scene-detector**: Receives scene detection results
- **chat-manager**: Provides search results for user queries

## 📝 License

Part of the RagSpace project

## 🙋 Support

For issues or questions, please check the troubleshooting section or review the SETUP_GUIDE.md
