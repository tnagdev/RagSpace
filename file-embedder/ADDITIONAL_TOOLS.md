# Additional Video-RAG Tools Documentation

## Overview

After reviewing the Video-RAG `tools/` folder, we've integrated two additional powerful utilities that enhance our query processing and object understanding capabilities.

---

## 1. Query Enhancement (`query_utils.py`)

### Purpose
Intelligently filter and expand search queries using NLP to extract meaningful keywords and filter out noise.

### Key Features

#### `QueryEnhancer` Class

**Keyword Filtering** (`filter_keywords`)
- Keeps meaningful search terms based on POS (Part-of-Speech) tags
- Patterns preserved:
  - Single words: nouns, adjectives, verbs (e.g., "car", "red", "running")
  - Adjective + Noun: "red car", "fast vehicle"
  - Noun + Noun: "police car", "city hall"  
  - Verb + Noun: "driving car", "flying bird"
  - 3-word combos: "fast police car"
- Filters out generic terms like "video" and abstract concepts

**Entity Extraction** (`extract_entities`)
- Extracts named entities (PERSON, ORG, GPE, etc.)
- Identifies key noun phrases
- Useful for automatic query expansion

**Query Expansion** (`expand_query`)
- Converts single query into multiple related keywords
- Example: "red car in parking lot" → ["red car in parking lot", "red car", "parking lot", "vehicle"]
- Perfect for multi-query averaging

**Visual Concept Detection** (`is_visual_concept`)
- Determines if keyword represents physical/visual entity vs abstract concept
- Helps filter object detection queries

### Usage Examples

```python
from src.utils.query_utils import QueryEnhancer, filter_keywords, expand_query

# Initialize
enhancer = QueryEnhancer()

# Filter keywords from user query
keywords = ["red car", "fast", "video", "the scene", "abstract concept"]
filtered = enhancer.filter_keywords(keywords)
# Result: ["red car", "fast"]

# Expand query for multi-query search
expanded = enhancer.expand_query("red car in parking lot", max_keywords=5)
# Result: ["red car in parking lot", "red car", "parking lot", "car", "parking"]

# Extract entities from text
entities = enhancer.extract_entities("Show me the blue Tesla in New York")
# Result: ["blue Tesla", "New York", "Tesla"]

# Check if keyword is visual (for object detection)
is_visual = enhancer.is_visual_concept("red car")  # True
is_visual = enhancer.is_visual_concept("happiness")  # False

# Convenience functions (use singleton)
from src.utils.query_utils import filter_keywords, expand_query

filtered = filter_keywords(["red car", "video", "fast"])
expanded = expand_query("find the red car")
```

### Integration with AdvancedRetrieverService

```python
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.utils.query_utils import expand_query

retriever = AdvancedRetrieverService()

# Automatically expand user query
user_query = "Where is the red car parked?"
queries = expand_query(user_query, max_keywords=3)

# Use expanded queries for better retrieval
results = retriever.retrieve_with_multi_query(
    queries=queries,  # Multiple related queries
    threshold=0.4,
    use_contriever=True
)
```

### Installation

Requires spaCy model:
```bash
pip install spacy
python -m spacy download en_core_web_sm

# For better accuracy (larger model):
python -m spacy download en_core_web_md
```

---

## 2. Scene Graph Generation (`scene_graph_utils.py`)

### Purpose
Analyze spatial relationships between detected objects in video frames. Generate natural language descriptions of object positions and interactions.

### Key Features

#### `SceneGraphGenerator` Class

**Spatial Relationship Detection** (`calculate_spatial_relations`)
- Detects relationships between bounding boxes:
  - `overlaps` - Objects overlap
  - `left_of` / `right_of` - Horizontal positioning
  - `above` / `below` - Vertical positioning
  - `near` - Close proximity (within threshold)

**Natural Language Generation** (`generate_scene_graph_description`)
- Converts object detections into human-readable text
- Three description types:
  1. **Location**: Absolute positions and sizes
  2. **Relations**: Spatial relationships between objects
  3. **Counting**: Object type frequency

**Relationship Queries** (`find_objects_by_relation`)
- Search for objects matching spatial criteria
- Example: "Find objects to the left of the car"

### Usage Examples

```python
from src.utils.scene_graph_utils import SceneGraphGenerator, generate_scene_description

# Initialize generator
generator = SceneGraphGenerator(near_threshold=50.0)

# Object detection results from your detector
objects = [
    {
        'id': 0,
        'label': 'car',
        'bbox': [100, 200, 150, 100]  # [xmin, ymin, width, height]
    },
    {
        'id': 1,
        'label': 'person',
        'bbox': [50, 150, 50, 80]
    },
    {
        'id': 2,
        'label': 'tree',
        'bbox': [300, 100, 80, 200]
    }
]

# Generate complete scene description
description = generator.generate_scene_graph_description(
    objects,
    include_location=True,   # Include positions
    include_relation=True,   # Include relationships
    include_count=True       # Include object counts
)

print(description)
"""
Object 0 is a car located at coordinates [100, 200] with dimensions 150x100.
Object 1 is a person located at coordinates [50, 150] with dimensions 50x80.
Object 2 is a tree located at coordinates [300, 100] with dimensions 80x200.
Object 1 (person) is to the left of Object 0 (car).
Object 0 (car) is below Object 1 (person).
Object 0 (car) is to the left of Object 2 (tree).
Object counting:
- car: 1
- person: 1
- tree: 1
"""

# Get structured relationship data
relationships = generator.get_object_relationships(objects)
# {0: [('left_of', 2, 'tree'), ('below', 1, 'person')], ...}

# Find objects by spatial query
left_of_car = generator.find_objects_by_relation(
    objects,
    relation_query="left_of",
    source_label="car"
)
# Returns objects to the left of any car

# Convenience function
from src.utils.scene_graph_utils import generate_scene_description

description = generate_scene_description(
    objects,
    include_location=True,
    include_relation=True,
    include_count=False  # Skip counting
)
```

### Integration with Video Processing

```python
from src.utils.scene_graph_utils import SceneGraphGenerator
from src.services.TextEmbedderService import TextEmbedderService

generator = SceneGraphGenerator()
text_embedder = TextEmbedderService()

# When processing video scenes with object detection
for scene in video_scenes:
    # Assume you have object detection results
    detected_objects = scene['detected_objects']
    
    # Generate scene description
    scene_description = generator.generate_scene_graph_description(
        detected_objects,
        include_location=True,
        include_relation=True,
        include_count=True
    )
    
    # Embed description for retrieval
    embedding = text_embedder.embed_text(
        scene_description,
        use_contriever=True
    )
    
    # Store in ChromaDB
    chroma_db.upsert_items('text_embeddings', [{
        'chunk_id': f"{file_id}#scene_graph#{scene_index}",
        'vector': embedding,
        'file_id': file_id,
        'scene_index': scene_index,
        'text': scene_description,
        'modality': 'scene_graph'
    }])
```

### Use Cases

1. **Spatial Queries**
   - "Show me frames where a person is standing to the left of a car"
   - "Find scenes with overlapping objects"

2. **Object Counting**
   - "How many cars are in this frame?"
   - Automatically included in scene descriptions

3. **Relationship Understanding**
   - "What is next to the table?"
   - Spatial relationships enhance semantic search

4. **Scene Understanding**
   - Generate rich textual descriptions of visual scenes
   - Better multimodal retrieval combining visual + spatial text

---

## Complete Integration Example

Here's how to use both tools together for enhanced video search:

```python
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.utils.query_utils import expand_query, filter_keywords
from src.utils.scene_graph_utils import generate_scene_description

# 1. User submits complex query
user_query = "Find the red car parked next to the building"

# 2. Expand and filter query
expanded_queries = expand_query(user_query, max_keywords=5)
# ["Find the red car parked next to the building", "red car", "building", "car", "parking"]

filtered = filter_keywords(expanded_queries)
# ["red car", "building", "car", "parking"]

# 3. Search with enhanced queries
retriever = AdvancedRetrieverService()
results = retriever.retrieve_with_multi_query(
    queries=filtered,
    threshold=0.4,
    use_contriever=True
)

# 4. For each result, if it has object detections, generate scene graph
for result in results:
    if 'detected_objects' in result:
        scene_desc = generate_scene_description(
            result['detected_objects'],
            include_relation=True
        )
        result['scene_description'] = scene_desc
        
        # Check if matches spatial constraints
        # (e.g., "next to" implies 'near' relation)

print(f"Found {len(results)} relevant scenes")
```

---

## Installation & Setup

### Requirements

```bash
# Already in requirements.txt
pip install spacy networkx

# Download spaCy model
python -m spacy download en_core_web_sm
```

### Quick Test

```python
# Test query enhancement
from src.utils.query_utils import filter_keywords, expand_query

keywords = ["red car", "fast", "the video", "abstract idea"]
print(filter_keywords(keywords))
# Output: ['red car', 'fast']

query = "red car in parking lot"
print(expand_query(query))
# Output: ['red car in parking lot', 'red car', 'parking lot', ...]

# Test scene graph
from src.utils.scene_graph_utils import generate_scene_description

objects = [
    {'id': 0, 'label': 'car', 'bbox': [100, 200, 150, 100]},
    {'id': 1, 'label': 'person', 'bbox': [50, 150, 50, 80]}
]

description = generate_scene_description(objects)
print(description)
```

---

## Benefits Summary

### Query Utils
✅ Removes noise from user queries  
✅ Automatic query expansion for better coverage  
✅ Entity extraction for structured queries  
✅ Visual concept filtering for object detection  
✅ Better multi-query search results  

### Scene Graph Utils
✅ Rich spatial relationship understanding  
✅ Natural language scene descriptions  
✅ Object counting and localization  
✅ Spatial query support ("left of", "above", etc.)  
✅ Enhanced multimodal retrieval  

### Combined Benefits
✅ More accurate semantic search  
✅ Better handling of complex queries  
✅ Richer metadata for retrieval  
✅ Spatial reasoning capabilities  
✅ Production-ready NLP integration  

---

## What We Did NOT Implement

From Video-RAG's tools, we **intentionally skipped**:

1. **Object Detection Service** (APE integration)
   - Video-RAG uses external APE service for object detection
   - We can integrate any object detector later (YOLO, Detectron2, etc.)
   - Left as extensible for future needs

2. **CLIP-based Frame Filtering**
   - They use CLIP to select relevant frames before object detection
   - We already have scene detection, which serves a similar purpose
   - Can be added if needed for finer-grained frame selection

These tools are ready to use but optional - your existing code continues to work without them!

---

## Files Added

- `file-embedder/src/utils/query_utils.py` - Query enhancement and filtering
- `file-embedder/src/utils/scene_graph_utils.py` - Spatial scene graphs
- Updated `requirements.txt` - Added spacy and networkx

All improvements are backward compatible and opt-in! 🚀
