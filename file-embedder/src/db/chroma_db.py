"""ChromaDB manager for storing and querying embeddings."""
import chromadb
from chromadb.config import Settings as ChromaSettings
import numpy as np
from typing import List, Dict, Any, Optional
import logging
from src.decorators.singleton import SingletonMeta
from src.config import settings

logger = logging.getLogger(__name__)


class ChromaDatabaseManager(metaclass=SingletonMeta):
    """Manages ChromaDB collections for video and audio embeddings."""
    
    def __init__(self):
        # Skip if already initialized (prevents duplicate initialization)
        if hasattr(self, '_chroma_db_initialized'):
            return
        
        self._chroma_db_initialized = True
            
        # Use HttpClient for remote ChromaDB server
        logger.info(f"Connecting to ChromaDB at {settings.chroma_host}:{settings.chroma_port}")
        self.client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=chromadb.Settings(
                anonymized_telemetry=False,
                allow_reset=False
            )
        )
        
        self.text_index_name = "text_embeddings"
        self.image_index_name = "image_embeddings"
        
        self.text_collection = self.client.get_or_create_collection(
            name=self.text_index_name,
            metadata={"hnsw:space": "cosine"}
        )

        self.image_collection = self.client.get_or_create_collection(
            name=self.image_index_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        logger.info(f"ChromaDB collections initialized with {self.text_collection.count()} text and {self.image_collection.count()} image embeddings")


    def get_text_collection(self):
        return self.text_collection
    
    def get_image_collection(self):
        return self.image_collection

    def upsert_items(self, index_name: str, items: List[Dict[str, Any]]) -> None:
        """Upsert items into the specified collection."""
        if not items:
            return
        
        # Select the appropriate collection
        if index_name == self.text_index_name:
            collection = self.text_collection
        elif index_name == self.image_index_name:
            collection = self.image_collection
        else:
            logger.error(f"Unknown index name: {index_name}")
            return
        
        ids = []
        embeddings = []
        metadatas = []
        documents = []
        
        for item in items:
            ids.append(item["chunk_id"])
            embeddings.append(item["vector"])
            metadata = {
                k: v for k, v in item.items()
                if k not in ["vector", "chunk_id"] and v is not None
            }
            
            # Convert numpy types to Python native types
            for key, value in metadata.items():
                if isinstance(value, (np.integer, np.floating)):
                    metadata[key] = float(value)
            
            metadatas.append(metadata)
            documents.append(item.get("text", ""))
        
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents
        )
        logger.info(f"Upserted {len(items)} items to {index_name}")
    
    def query_index(
        self,
        text_query_vec: Optional[np.ndarray] = None,
        image_query_vec: Optional[np.ndarray] = None,
        filters: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query across text and image collections with flexible filtering.
        Enhanced with dynamic threshold retrieval from Video-RAG.
        
        Args:
            text_query_vec: Text embedding for semantic search
            image_query_vec: Image embedding for visual similarity
            filters: Optional dictionary of filters:
                - file_id: str - Filter by specific file
                - file_type: str - Filter by type (IMAGE, VIDEO, AUDIO)
                - user_id: str - Filter by user
                - Any other metadata field
            options: Optional dictionary of query options:
                - text_weight: float - Weight for text matches (default 0.5)
                - image_weight: float - Weight for image matches (default 0.5)
                - top_k: int - Number of results (default 10)
                - threshold: float - Minimum similarity threshold (default 0.3, Video-RAG recommended)
                - use_dynamic_retrieval: bool - Use threshold-based retrieval (default True)
                - adaptive_scoring: bool - Apply video length normalization (default True)
        
        Returns:
            List of results with scores and metadata
        """
        # Parse options with defaults (Video-RAG recommended values)
        if options is None:
            options = {}
        text_weight = options.get('text_weight', 0.5)
        image_weight = options.get('image_weight', 0.5)
        top_k = options.get('top_k', 10)
        threshold = options.get('threshold', 0.2)
        use_dynamic_retrieval = options.get('use_dynamic_retrieval', True)
        adaptive_scoring = options.get('adaptive_scoring', False)
        results = []
        result_map = {}
        where_filter = filters if filters else None
        
        logger.info(f"Starting query_index with filters: {where_filter}, threshold: {threshold}, use_dynamic: {use_dynamic_retrieval}")
        logger.info(f"Text collection count: {self.text_collection.count()}, Image collection count: {self.image_collection.count()}")
        
        # Query text embeddings collection (audio transcriptions, OCR text, image text)
        if text_query_vec is not None:
            try:
                retrieval_count = top_k * 5 if use_dynamic_retrieval else top_k
                
                logger.info(f"Querying text collection with n_results={retrieval_count}, where={where_filter}")
                
                text_results = self.text_collection.query(
                    query_embeddings=[text_query_vec.tolist()],
                    n_results=retrieval_count,
                    where=where_filter
                )
                logger.info(f"Text query returned {len(text_results['ids'][0])} RAW results from ChromaDB")
                
                filtered_count = 0
                for metadata, distance, doc in zip(
                    text_results["metadatas"][0],
                    text_results["distances"][0],
                    text_results["documents"][0]
                ):
                    score = 1 - distance
                    if use_dynamic_retrieval and threshold > 0 and score < threshold:
                        filtered_count += 1
                        continue
                    
                    elif not use_dynamic_retrieval and score < 0.0:
                        filtered_count += 1
                        continue
                    
                    # Create unique key based on file_id and scene/segment index
                    scene_idx = metadata.get('scene_index', metadata.get('segment_index', 0))
                    key = f"{metadata.get('file_id')}#{scene_idx}"
                    
                    if key not in result_map:
                        result_map[key] = {
                            **metadata,
                            "text": doc,
                            "text_score": score,
                            "image_score": 0.0,
                            "combined_score": score * text_weight,
                            "match_count": 1
                        }
                    else:
                        # Update if better score
                        if score > result_map[key]["text_score"]:
                            old_score = result_map[key]["text_score"]
                            result_map[key]["text_score"] = score
                            result_map[key]["combined_score"] += (score - old_score) * text_weight
                        if doc and not result_map[key].get("text"):
                            result_map[key]["text"] = doc
                        result_map[key]["match_count"] += 1
                
                if filtered_count > 0:
                    logger.info(f"Filtered out {filtered_count} results due to threshold={threshold}")
            
            except Exception as e:
                logger.error(f"Error querying text collection: {e}")
        
        # Query image embeddings collection (visual features from images/video scenes)
        if image_query_vec is not None:
            try:
                retrieval_count = top_k * 5 if use_dynamic_retrieval else top_k
                
                image_results = self.image_collection.query(
                    query_embeddings=[image_query_vec.tolist()],
                    n_results=retrieval_count,
                    where=where_filter
                )

                logger.info(f"Image query returned {len(image_results['ids'][0])} results")
                
                for metadata, distance, doc in zip(
                    image_results["metadatas"][0],
                    image_results["distances"][0],
                    image_results["documents"][0]
                ):
                    score = 1 - distance
                    if use_dynamic_retrieval and threshold > 0 and score < threshold:
                        continue
                    elif not use_dynamic_retrieval and score < 0.0:
                        continue
                        
                    scene_idx = metadata.get('scene_index', 0)
                    key = f"{metadata.get('file_id')}#{scene_idx}"
                    
                    if key not in result_map:
                        result_map[key] = {
                            **metadata,
                            "text": doc or metadata.get("text", ""),
                            "text_score": 0.0,
                            "image_score": score,
                            "combined_score": score * image_weight,
                            "match_count": 1
                        }
                    else:
                        # Update scores properly
                        if score > result_map[key]["image_score"]:
                            old_score = result_map[key]["image_score"]
                            result_map[key]["image_score"] = score
                            result_map[key]["combined_score"] += (score - old_score) * image_weight
                        # Merge text if available
                        if doc and not result_map[key].get("text"):
                            result_map[key]["text"] = doc
                        result_map[key]["match_count"] += 1
            
            except Exception as e:
                logger.error(f"Error querying image collection: {e}")
        
        # Convert to list and normalize scores by modality count before sorting
        # This prevents videos with both text+image from automatically ranking higher than images
        results = list(result_map.values())
        for r in results:
            modality_count = sum([r["text_score"] > 0, r["image_score"] > 0])
            if modality_count > 0:
                r["combined_score"] = r["combined_score"] / modality_count
        
        results.sort(key=lambda x: x["combined_score"], reverse=True)
        
        # Return top_k results with enhanced confidence calculation
        final_results = []
        for r in results[:top_k]:
            modality_count = sum([
                r["text_score"] > 0,
                r["image_score"] > 0
            ])
            match_count = r.get("match_count", 1)
            base_confidence = r["combined_score"]
            modality_boost = 0.2 * (modality_count - 1)
            match_boost = 0.1 * min(match_count - 1, 3)
            r["confidence"] = min(1.0, base_confidence * (1 + modality_boost + match_boost))
            r["score"] = r.pop("combined_score")
            r.pop("match_count", None)
            final_results.append(r)
        
        logger.info(f"Returning {len(final_results)} final results after merging and ranking")
        return final_results
    
    def delete_by_file_id(self, file_id: str) -> None:
        """Delete all embeddings associated with a file ID across all collections."""
        # Delete from text collection
        text_results = self.text_collection.get(
            where={"file_id": file_id}
        )
        if text_results["ids"]:
            self.text_collection.delete(ids=text_results["ids"])
            logger.info(f"Deleted {len(text_results['ids'])} text embeddings for file: {file_id}")
        
        # Delete from image collection
        image_results = self.image_collection.get(
            where={"file_id": file_id}
        )
        if image_results["ids"]:
            self.image_collection.delete(ids=image_results["ids"])
            logger.info(f"Deleted {len(image_results['ids'])} image embeddings for file: {file_id}")
    
    def delete_by_file_ids(self, file_ids: List[str]) -> None:
        """Delete all embeddings associated with multiple file IDs across all collections (batch operation)."""
        if not file_ids:
            return
        
        total_text_deleted = 0
        total_image_deleted = 0
        text_results = self.text_collection.get(
            where={"file_id": {"$in": file_ids}}
        )
        if text_results["ids"]:
            self.text_collection.delete(ids=text_results["ids"])
            total_text_deleted = len(text_results["ids"])
            logger.info(f"Deleted {total_text_deleted} text embeddings for {len(file_ids)} files")
        
        image_results = self.image_collection.get(
            where={"file_id": {"$in": file_ids}}
        )
        if image_results["ids"]:
            self.image_collection.delete(ids=image_results["ids"])
            total_image_deleted = len(image_results["ids"])
            logger.info(f"Deleted {total_image_deleted} image embeddings for {len(file_ids)} files")
        
        logger.info(f"Batch deleted {total_text_deleted + total_image_deleted} total embeddings for {len(file_ids)} files")
    
    def delete_by_video_id(self, video_id: str) -> None:
        """Deprecated: Use delete_by_file_id instead. Kept for backward compatibility."""
        logger.warning("delete_by_video_id is deprecated, use delete_by_file_id instead")
        self.delete_by_file_id(video_id)
    
    def get_all_content_for_file(self, file_id: str) -> Dict[str, Any]:
        """
        Retrieve ALL embeddings (text + image) for a specific file.
        Used for video summarization and full content retrieval.
        
        Args:
            file_id: The file ID to get all content for
            
        Returns:
            Dictionary with 'scenes' (visual) and 'segments' (audio) content,
            sorted chronologically by start_time
        """
        scenes = []
        segments = []
        
        # Get all text embeddings (audio transcriptions) for this file
        try:
            text_results = self.text_collection.get(
                where={"file_id": file_id},
                include=["metadatas", "documents"]
            )
            
            if text_results and text_results["ids"]:
                for idx, (metadata, doc) in enumerate(zip(
                    text_results["metadatas"],
                    text_results["documents"]
                )):
                    segment_data = {
                        **metadata,
                        "text": doc,
                        "type": "audio"
                    }
                    segments.append(segment_data)
                
                logger.info(f"Retrieved {len(segments)} audio segments for file {file_id}")
        except Exception as e:
            logger.error(f"Error getting text embeddings for file {file_id}: {e}")
        
        # Get all image embeddings (visual scenes) for this file
        try:
            image_results = self.image_collection.get(
                where={"file_id": file_id},
                include=["metadatas", "documents"]
            )
            
            if image_results and image_results["ids"]:
                for idx, (metadata, doc) in enumerate(zip(
                    image_results["metadatas"],
                    image_results["documents"]
                )):
                    scene_data = {
                        **metadata,
                        "text": doc if doc else "",
                        "type": "visual"
                    }
                    scenes.append(scene_data)
                
                logger.info(f"Retrieved {len(scenes)} visual scenes for file {file_id}")
        except Exception as e:
            logger.error(f"Error getting image embeddings for file {file_id}: {e}")
        
        # Sort by start_time for chronological order
        scenes.sort(key=lambda x: x.get("start_time", 0) or 0)
        segments.sort(key=lambda x: x.get("start_time", 0) or 0)
        
        return {
            "file_id": file_id,
            "scenes": scenes,
            "segments": segments,
            "total_scenes": len(scenes),
            "total_segments": len(segments)
        }
