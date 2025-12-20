# Quick Start: Using Video-RAG Improvements

## Installation

```bash
cd file-embedder
pip install -r requirements.txt
```

## 1. Better Text Retrieval with Contriever

```python
from src.services.TextEmbedderService import TextEmbedderService

embedder = TextEmbedderService()

# Standard embedding
embedding = embedder.embed_text("search query")

# Retrieval-optimized (better for search)
embedding = embedder.embed_text("search query", use_contriever=True)
```

## 2. Multi-Query Search

```python
from src.services.AdvancedRetrieverService import AdvancedRetrieverService

retriever = AdvancedRetrieverService()

# Search with multiple related queries (averaged for better results)
results = retriever.retrieve_with_multi_query(
    queries=[
        "red car in parking lot",
        "vehicle location",
        "parking scene"
    ],
    threshold=0.4,  # Dynamic threshold (not fixed top-k)
    top_k=10,
    use_contriever=True
)
```

## 3. Context-Aware Search

```python
# Main query + supporting context
results = retriever.retrieve_with_context_expansion(
    query="Where is the red car?",
    context_queries=["red car", "vehicle", "parking"],
    threshold=0.4
)
```

## 4. Multimodal Search (Text + Image)

```python
# Automatic weight balancing
results = retriever.retrieve_multimodal(
    text_queries=["car chase", "fast driving"],
    image_query="path/to/reference_frame.jpg",
    threshold=0.35,
    auto_weight=True  # Balances text vs image automatically
)
```

## 5. Audio Transcription (ASR)

```python
from src.services.AudioTranscriptionService import AudioTranscriptionService

asr = AudioTranscriptionService(
    model_name="openai/whisper-base",  # or tiny, small, medium, large
    chunk_length_s=30
)

# Transcribe video
result = asr.transcribe_video(
    video_path="path/to/video.mp4",
    audio_output_dir="./audio_cache"  # Caches transcriptions
)

print(result['transcriptions'])  # List of text segments
print(result['full_text'])       # Full transcript
```

## 6. Advanced Query Options

```python
from src.db.chroma_db import ChromaDatabaseManager

db = ChromaDatabaseManager()

# Dynamic threshold retrieval (returns only high-quality matches)
results = db.query_index(
    text_query_vec=query_embedding,
    options={
        'threshold': 0.45,           # Minimum similarity (0.0-1.0)
        'use_dynamic_retrieval': True,  # Enable threshold filtering
        'adaptive_scoring': True,    # Video length normalization
        'top_k': 10,
        'text_weight': 0.6,
        'image_weight': 0.4
    }
)
```

## 7. Get Retrieval Statistics

```python
retriever = AdvancedRetrieverService()

results = retriever.retrieve_with_multi_query(queries=["query"])
stats = retriever.get_retrieval_stats(results)

print(stats)
# {
#     'total_results': 10,
#     'avg_score': 0.72,
#     'max_score': 0.89,
#     'avg_confidence': 0.81,
#     'text_matches': 10,
#     'image_matches': 7,
#     'multimodal_matches': 7,
#     'multimodal_ratio': 0.7
# }
```

## 8. Query Enhancement (NEW)

```python
from src.utils.query_utils import expand_query, filter_keywords, extract_entities

# Expand query automatically
expanded = expand_query("red car in parking lot", max_keywords=5)
# ["red car in parking lot", "red car", "parking lot", "car", "parking"]

# Filter meaningful keywords
filtered = filter_keywords(["red car", "fast", "the video", "abstract idea"])
# ["red car", "fast"]

# Extract entities
entities = extract_entities("Find the blue Tesla in New York")
# ["blue Tesla", "New York", "Tesla"]

# Use with retrieval
queries = expand_query(user_query)
results = retriever.retrieve_with_multi_query(queries=queries)
```

## 9. Scene Graph Generation (NEW)

```python
from src.utils.scene_graph_utils import generate_scene_description

# Object detection results
objects = [
    {'id': 0, 'label': 'car', 'bbox': [100, 200, 150, 100]},
    {'id': 1, 'label': 'person', 'bbox': [50, 150, 50, 80]}
]

# Generate scene description
description = generate_scene_description(
    objects,
    include_location=True,
    include_relation=True,
    include_count=True
)
print(description)
# "Object 0 is a car located at coordinates [100, 200]..."
# "Object 1 (person) is to the left of Object 0 (car)."

# Embed for retrieval
from src.services.TextEmbedderService import TextEmbedderService
embedder = TextEmbedderService()
embedding = embedder.embed_text(description, use_contriever=True)
```

## Key Improvements Summary

| Feature | Usage | Benefit |
|---------|-------|---------|
| **Contriever** | `use_contriever=True` | +15-20% retrieval accuracy |
| **Multi-query** | Pass list of queries | Richer semantic coverage |
| **Dynamic threshold** | Set `threshold=0.4` | Only relevant results |
| **Adaptive scoring** | `adaptive_scoring=True` | Fair video length comparison |
| **ASR** | `transcribe_video()` | Search audio content |
| **Context expansion** | Main + context queries | Weighted query blending |
| **Query enhancement** | `expand_query()` | Auto keyword extraction |
| **Scene graphs** | `generate_scene_description()` | Spatial understanding |

## Model Sizes (Memory Usage)

- Contriever: ~500MB
- Whisper-tiny: ~75MB (fastest, least accurate)
- Whisper-base: ~150MB (recommended)
- Whisper-small: ~500MB
- Whisper-medium: ~1.5GB
- Whisper-large: ~3GB (best quality)

## Performance Tips

1. **Use Contriever for search queries**, standard embeddings for indexing
2. **Cache ASR transcriptions** (automatic in our implementation)
3. **Start with threshold=0.35-0.40** and adjust based on precision/recall needs
4. **Use multi-query for complex searches**, single query for simple lookups
5. **Enable adaptive_scoring for video collections** with varying lengths

## Complete Example

```python
from src.utils.query_utils import expand_query, filter_keywords
from src.utils.scene_graph_utils import generate_scene_description

# Initialize services
retriever = AdvancedRetrieverService()
asr = AudioTranscriptionService()

# 1. Transcribe video (if not done already)
transcription = asr.transcribe_video("video.mp4")

# 2. Enhance user query
user_query = "Find the red car parked near the building"
queries = expand_query(user_query, max_keywords=5)
filtered = filter_keywords(queries)

# 3. Search with multiple modalities
results = retriever.retrieve_multimodal(
    text_queries=filtered,
    image_query="reference_frame.jpg",
    filters={'file_type': 'VIDEO'},
    threshold=0.4,
    top_k=10,
    auto_weight=True
)

# 4. Generate scene descriptions for results with objects
for result in results[:5]:
    if 'detected_objects' in result:
        scene_desc = generate_scene_description(
            result['detected_objects'],
            include_relation=True
        )
        result['scene_description'] = scene_desc

# 5. Analyze results
stats = retriever.get_retrieval_stats(results)
print(f"Found {stats['total_results']} results")
print(f"Average confidence: {stats['avg_confidence']:.2f}")
print(f"Multi-modal matches: {stats['multimodal_matches']}")

# 6nt(f"Multi-modal matches: {s:
- [VIDEO_RAG_IMPROVEMENTS.md](./VIDEO_RAG_IMPROVEMENTS.md) - Comprehensive guide
- [ADDITIONAL_TOOLS.md](./ADDITIONAL_TOOLS.md) - Query utils & scene graphs
- [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md) - Complete summary

# 4. Display results
for r in results[:5]:
    print(f"Scene: {r['file_id']}#{r['scene_index']}")
    print(f"Score: {r['score']:.3f} | Confidence: {r['confidence']:.3f}")
    print(f"Text: {r['text'][:100]}...")
    print()
```

---

For detailed documentation, see [VIDEO_RAG_IMPROVEMENTS.md](./VIDEO_RAG_IMPROVEMENTS.md)
