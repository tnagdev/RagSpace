"""ChromaDB manager for storing and querying embeddings."""
import chromadb
from chromadb.config import Settings as ChromaSettings
import numpy as np
from typing import List, Dict, Any, Optional
import logging
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)

@singleton
class ChromaDatabaseManager:
    """Manages ChromaDB collections for video and audio embeddings."""
    
    def __init__(self, persist_directory: str = "./chroma_data"):
        logger.info(f"Initializing ChromaDB at {persist_directory}")
        # Use PersistentClient for data persistence across restarts
        self.client = chromadb.PersistentClient(
            path=persist_directory,
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
                - threshold: float - Minimum similarity threshold (default 0.2)
                - use_dynamic_retrieval: bool - Use threshold-based retrieval (default True)
                - adaptive_scoring: bool - Apply video length normalization (default False)
        
        Returns:
            List of results with scores and metadata
        """
        # Parse options with defaults
        if options is None:
            options = {}
        text_weight = options.get('text_weight', 0.5)
        image_weight = options.get('image_weight', 0.5)
        top_k = options.get('top_k', 10)
        threshold = options.get('threshold', 0.2)
        use_dynamic_retrieval = options.get('use_dynamic_retrieval', True)
        adaptive_scoring = options.get('adaptive_scoring', False)
        
        results = []
        result_map = {}  # Track results by unique key to merge scores
        
        # Build filter from filters dict
        where_filter = filters if filters else None
        
        logger.info(f"Starting query_index with filters: {where_filter}, threshold: {threshold}, use_dynamic: {use_dynamic_retrieval}")
        logger.info(f"Text collection count: {self.text_collection.count()}, Image collection count: {self.image_collection.count()}")
        
        # Query text embeddings collection (audio transcriptions, OCR text, image text)
        if text_query_vec is not None:
            try:
                # Use larger retrieval pool for dynamic filtering
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
                    
                    # Dynamic threshold filtering (inspired by Video-RAG's range_search)
                    if use_dynamic_retrieval and threshold > 0 and score < threshold:
                        filtered_count += 1
                        continue
                    # Standard filtering for non-dynamic retrieval (only filter very low scores)
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
                
                # Adaptive scoring: normalize by video length (inspired by Video-RAG's alpha calculation)
                num_results = len(image_results['ids'][0])
                alpha = 1.0
                if adaptive_scoring and num_results > 0:
                    # Scale factor based on number of frames (similar to Video-RAG's beta * (len/16))
                    alpha = 3.0 * (num_results / 16.0)
                
                for metadata, distance, doc in zip(
                    image_results["metadatas"][0],
                    image_results["distances"][0],
                    image_results["documents"][0]
                ):
                    score = 1 - distance
                    
                    # Apply adaptive scoring if enabled
                    if adaptive_scoring:
                        score = score * alpha / max(1.0, num_results)
                    
                    # Dynamic threshold filtering (only filter if threshold > 0)
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
        
        # Convert to list and sort by combined score
        results = list(result_map.values())
        results.sort(key=lambda x: x["combined_score"], reverse=True)
        
        # Return top_k results with enhanced confidence calculation
        final_results = []
        for r in results[:top_k]:
            # Calculate confidence based on multiple factors:
            # 1. How many modalities contributed (text + image)
            # 2. How many times this result was matched (for multi-query scenarios)
            modality_count = sum([
                r["text_score"] > 0,
                r["image_score"] > 0
            ])
            match_count = r.get("match_count", 1)
            
            # Boost confidence for multi-modal and multi-match results
            # Inspired by Video-RAG's multi-signal retrieval approach
            base_confidence = r["combined_score"]
            modality_boost = 0.2 * (modality_count - 1)  # +20% for each additional modality
            match_boost = 0.1 * min(match_count - 1, 3)  # +10% per match, capped at 3 matches
            
            r["confidence"] = min(1.0, base_confidence * (1 + modality_boost + match_boost))
            r["score"] = r.pop("combined_score")
            # Clean up internal tracking fields
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
    
    def delete_by_video_id(self, video_id: str) -> None:
        """Deprecated: Use delete_by_file_id instead. Kept for backward compatibility."""
        logger.warning("delete_by_video_id is deprecated, use delete_by_file_id instead")
        self.delete_by_file_id(video_id)
