"""
Advanced retrieval service with multi-query support and sophisticated ranking.
Inspired by Video-RAG's dynamic retrieval approach.
"""
import numpy as np
from typing import List, Dict, Any, Optional, Union
import logging
from src.db.chroma_db import ChromaDatabaseManager
from src.services.TextEmbedderService import TextEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.decorators.singleton import singleton

logger = logging.getLogger(__name__)


@singleton
class AdvancedRetrieverService:
    """
    Advanced retrieval combining multiple strategies from Video-RAG:
    - Multi-query averaging for better semantic coverage
    - Dynamic threshold-based filtering
    - Adaptive scoring based on video characteristics
    - Hybrid text/image retrieval with smart weighting
    """
    
    def __init__(
        self,
        chroma_db: ChromaDatabaseManager = None,
        text_embedder: TextEmbedderService = None,
        image_embedder: ImageEmbedderService = None
    ):
        self.db = chroma_db or ChromaDatabaseManager()
        self.text_embedder = text_embedder or TextEmbedderService()
        self.image_embedder = image_embedder or ImageEmbedderService()
    
    def retrieve_with_multi_query(
        self,
        queries: Union[str, List[str]],
        image_query: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        threshold: float = 0.4,
        top_k: int = 10,
        use_contriever: bool = True,
        text_weight: float = 0.5,
        image_weight: float = 0.5,
        adaptive_scoring: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Retrieve documents using multiple query averaging.
        Implements Video-RAG's multi-query semantic search strategy.
        
        Args:
            queries: Single query string or list of query strings to average
            image_query: Optional image path for visual similarity
            filters: Metadata filters (file_id, user_id, etc.)
            threshold: Minimum similarity threshold (0.0-1.0)
            top_k: Number of results to return
            use_contriever: Use Contriever model for text embeddings
            text_weight: Weight for text similarity
            image_weight: Weight for image similarity
            adaptive_scoring: Apply video-length normalization
        
        Returns:
            List of ranked results with scores and metadata
        """
        text_query_vec = None
        image_query_vec = None
        
        # Handle text queries with averaging
        if queries:
            if isinstance(queries, str):
                queries = [queries]
            
            logger.info(f"Processing {len(queries)} text queries with averaging")
            
            # Embed all queries
            query_embeddings = []
            for query in queries:
                embedding = self.text_embedder.embed_text(query, use_contriever=use_contriever)
                if embedding is not None:
                    query_embeddings.append(embedding)
            
            if query_embeddings:
                # Average query vectors (from Video-RAG's retrieve_documents_with_dynamic)
                query_vectors = np.array(query_embeddings)
                average_query_vector = np.mean(query_vectors, axis=0)
                # Normalize the averaged vector
                text_query_vec = average_query_vector / np.linalg.norm(average_query_vector)
                logger.info(f"Averaged {len(query_embeddings)} query embeddings")
        
        # Handle image query (can be text for CLIP text-to-image similarity)
        if image_query:
            # Check if it's a text query (for CLIP) or image path
            if isinstance(image_query, str) and not image_query.startswith(('/', 'http', 'file:', '.')):
                # It's text - use CLIP text encoder
                image_query_vec = self.image_embedder.embed_text_with_clip(image_query)
                if image_query_vec is not None:
                    logger.info("Generated CLIP text embedding for visual search")
            else:
                # It's an image path
                image_query_vec = self.image_embedder.embed_image(image_query)
                if image_query_vec is not None:
                    logger.info("Generated image query embedding")
        
        # Query with enhanced options
        options = {
            'text_weight': text_weight,
            'image_weight': image_weight,
            'top_k': top_k,
            'threshold': threshold,
            'use_dynamic_retrieval': True,
            'adaptive_scoring': adaptive_scoring
        }
        
        logger.info(f"Calling query_index with filters={filters}, options={options}")
        
        results = self.db.query_index(
            text_query_vec=text_query_vec,
            image_query_vec=image_query_vec,
            filters=filters,
            options=options
        )
        
        logger.info(f"Retrieved {len(results)} results with multi-query averaging")
        return results
    
    def retrieve_with_context_expansion(
        self,
        query: str,
        context_queries: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None,
        threshold: float = 0.4,
        top_k: int = 10,
        context_weight: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Retrieve with context expansion - main query gets higher weight,
        context queries provide additional signals.
        
        Useful for scenarios like:
        - Main query: "Where is the red car?"
        - Context: ["red car", "vehicle location", "parking scene"]
        
        Args:
            query: Main search query
            context_queries: Additional context queries
            filters: Metadata filters
            threshold: Minimum similarity threshold
            top_k: Number of results
            context_weight: Weight given to context queries (0.0-1.0)
        
        Returns:
            Ranked results combining main and context signals
        """
        all_queries = [query]
        if context_queries:
            all_queries.extend(context_queries)
        
        # Generate embeddings with weighted averaging
        embeddings = []
        weights = []
        
        # Main query gets higher weight
        main_embedding = self.text_embedder.embed_text(query, use_contriever=True)
        if main_embedding is not None:
            embeddings.append(main_embedding)
            weights.append(1.0)
        
        # Context queries get lower weight
        if context_queries:
            for ctx_query in context_queries:
                ctx_embedding = self.text_embedder.embed_text(ctx_query, use_contriever=True)
                if ctx_embedding is not None:
                    embeddings.append(ctx_embedding)
                    weights.append(context_weight)
        
        if not embeddings:
            logger.warning("No valid embeddings generated")
            return []
        
        # Weighted average
        embeddings_array = np.array(embeddings)
        weights_array = np.array(weights).reshape(-1, 1)
        weighted_avg = np.sum(embeddings_array * weights_array, axis=0) / np.sum(weights_array)
        text_query_vec = weighted_avg / np.linalg.norm(weighted_avg)
        
        options = {
            'text_weight': 1.0,
            'image_weight': 0.0,
            'top_k': top_k,
            'threshold': threshold,
            'use_dynamic_retrieval': True
        }
        
        results = self.db.query_index(
            text_query_vec=text_query_vec,
            filters=filters,
            options=options
        )
        
        logger.info(f"Retrieved {len(results)} results with context expansion")
        return results
    
    def retrieve_multimodal(
        self,
        text_queries: Optional[Union[str, List[str]]] = None,
        image_query: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        threshold: float = 0.35,
        top_k: int = 10,
        auto_weight: bool = True,
        text_weight: float = 0.5,
        image_weight: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Multimodal retrieval with automatic weight balancing.
        
        Args:
            text_queries: Text query or list of queries
            image_query: Path to query image
            filters: Metadata filters
            threshold: Similarity threshold
            top_k: Number of results
            auto_weight: Automatically balance text/image weights based on query presence
            text_weight: Manual text weight (used if auto_weight=False)
            image_weight: Manual image weight (used if auto_weight=False)
        
        Returns:
            Multimodal ranked results
        """
        # Auto-balance weights based on which modalities are provided
        if auto_weight:
            has_text = text_queries is not None
            has_image = image_query is not None
            
            if has_text and has_image:
                text_weight = 0.5
                image_weight = 0.5
            elif has_text:
                text_weight = 1.0
                image_weight = 0.0
            elif has_image:
                text_weight = 0.0
                image_weight = 1.0
            else:
                logger.warning("No queries provided")
                return []
        
        return self.retrieve_with_multi_query(
            queries=text_queries,
            image_query=image_query,
            filters=filters,
            threshold=threshold,
            top_k=top_k,
            text_weight=text_weight,
            image_weight=image_weight,
            adaptive_scoring=True  # Enable adaptive scoring for multimodal
        )
    
    def get_retrieval_stats(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate statistics about retrieval results for analysis.
        
        Returns:
            Dictionary with stats like avg_score, modality_coverage, etc.
        """
        if not results:
            return {
                'total_results': 0,
                'avg_score': 0.0,
                'avg_confidence': 0.0,
                'text_matches': 0,
                'image_matches': 0,
                'multimodal_matches': 0
            }
        
        scores = [r.get('score', 0) for r in results]
        confidences = [r.get('confidence', 0) for r in results]
        
        text_matches = sum(1 for r in results if r.get('text_score', 0) > 0)
        image_matches = sum(1 for r in results if r.get('image_score', 0) > 0)
        multimodal_matches = sum(
            1 for r in results 
            if r.get('text_score', 0) > 0 and r.get('image_score', 0) > 0
        )
        
        return {
            'total_results': len(results),
            'avg_score': np.mean(scores) if scores else 0.0,
            'max_score': np.max(scores) if scores else 0.0,
            'min_score': np.min(scores) if scores else 0.0,
            'avg_confidence': np.mean(confidences) if confidences else 0.0,
            'text_matches': text_matches,
            'image_matches': image_matches,
            'multimodal_matches': multimodal_matches,
            'multimodal_ratio': multimodal_matches / len(results) if results else 0.0
        }
