"""
Example integration of Video-RAG improvements into existing RagSpace pipeline.
This shows how to enhance the current file upload and search flow.
"""
import asyncio
import logging
from typing import List, Dict, Any, Optional
from src.services.TextEmbedderService import TextEmbedderService
from src.services.ImageEmbedderService import ImageEmbedderService
from src.services.AudioTranscriptionService import AudioTranscriptionService
from src.services.AdvancedRetrieverService import AdvancedRetrieverService
from src.db.chroma_db import ChromaDatabaseManager

logger = logging.getLogger(__name__)


class EnhancedVideoProcessor:
    """
    Enhanced video processing pipeline with Video-RAG improvements.
    Integrates ASR, better embeddings, and advanced retrieval.
    """
    
    def __init__(self):
        self.text_embedder = TextEmbedderService(use_contriever=True)
        self.image_embedder = ImageEmbedderService()
        self.asr_service = AudioTranscriptionService(
            model_name="openai/whisper-base",
            chunk_length_s=30
        )
        self.retriever = AdvancedRetrieverService()
        self.chroma_db = ChromaDatabaseManager()
    
    async def process_video_with_asr(
        self,
        file_id: str,
        video_path: str,
        user_id: str,
        scenes: List[Dict[str, Any]],
        audio_cache_dir: str = "./audio_cache"
    ) -> Dict[str, Any]:
        """
        Complete video processing pipeline with ASR.
        
        Steps:
        1. Process existing scenes (visual embeddings) - EXISTING
        2. Extract and transcribe audio - NEW
        3. Embed audio transcriptions - NEW
        4. Store everything in ChromaDB
        
        Args:
            file_id: Unique file identifier
            video_path: Path to video file
            user_id: User ID
            scenes: List of detected scenes with thumbnails
            audio_cache_dir: Directory for audio cache
        
        Returns:
            Processing results with stats
        """
        results = {
            'file_id': file_id,
            'scenes_processed': 0,
            'audio_segments_processed': 0,
            'success': False,
            'error': None
        }
        
        try:
            # Step 1: Process visual scenes (EXISTING FLOW)
            logger.info(f"Processing {len(scenes)} visual scenes for file {file_id}")
            await self._process_scenes(file_id, user_id, scenes)
            results['scenes_processed'] = len(scenes)
            
            # Step 2: Extract and transcribe audio (NEW)
            logger.info(f"Transcribing audio for file {file_id}")
            asr_result = self.asr_service.transcribe_video(
                video_path=video_path,
                audio_output_dir=audio_cache_dir
            )
            
            if not asr_result['success']:
                logger.warning(f"ASR failed for {file_id}: {asr_result.get('error')}")
                # Continue without audio - not critical
            else:
                # Step 3: Process audio transcriptions (NEW)
                await self._process_audio_transcriptions(
                    file_id=file_id,
                    user_id=user_id,
                    transcriptions=asr_result['transcriptions']
                )
                results['audio_segments_processed'] = asr_result['num_segments']
            
            results['success'] = True
            logger.info(f"Video processing complete for {file_id}")
            
        except Exception as e:
            logger.error(f"Error processing video {file_id}: {e}")
            results['error'] = str(e)
        
        return results
    
    async def _process_scenes(
        self,
        file_id: str,
        user_id: str,
        scenes: List[Dict[str, Any]]
    ):
        """Process visual scenes (EXISTING LOGIC - enhanced with Contriever)."""
        image_items = []
        text_items = []
        
        for i, scene in enumerate(scenes):
            scene_index = scene.get('scene_index', i)
            thumbnail_path = scene.get('thumbnail_path')
            
            if not thumbnail_path:
                continue
            
            # Generate visual embedding (EXISTING)
            image_embedding = self.image_embedder.embed_image(thumbnail_path)
            if image_embedding is not None:
                image_items.append({
                    'chunk_id': f"{file_id}#scene#{scene_index}",
                    'vector': image_embedding,
                    'file_id': file_id,
                    'user_id': user_id,
                    'scene_index': scene_index,
                    'thumbnail_url': scene.get('thumbnail_url', ''),
                    'start_time': scene.get('start_time', 0),
                    'end_time': scene.get('end_time', 0),
                    'modality': 'visual'
                })
            
            # Extract and embed text from image (ENHANCED: use Contriever)
            extracted_text = self.image_embedder.extract_text(thumbnail_path)
            if extracted_text:
                # Use Contriever for better retrieval
                text_embedding = self.text_embedder.embed_text(
                    extracted_text,
                    use_contriever=True  # NEW: Better for OCR text retrieval
                )
                if text_embedding is not None:
                    text_items.append({
                        'chunk_id': f"{file_id}#ocr#{scene_index}",
                        'vector': text_embedding,
                        'file_id': file_id,
                        'user_id': user_id,
                        'scene_index': scene_index,
                        'text': extracted_text,
                        'start_time': scene.get('start_time', 0),
                        'end_time': scene.get('end_time', 0),
                        'modality': 'ocr'
                    })
        
        # Store in ChromaDB
        if image_items:
            self.chroma_db.upsert_items('image_embeddings', image_items)
        if text_items:
            self.chroma_db.upsert_items('text_embeddings', text_items)
        
        logger.info(f"Stored {len(image_items)} visual + {len(text_items)} OCR embeddings")
    
    async def _process_audio_transcriptions(
        self,
        file_id: str,
        user_id: str,
        transcriptions: List[str]
    ):
        """Process audio transcriptions (NEW)."""
        text_items = []
        
        # Get timestamped segments
        timestamped = self.asr_service.get_timestamped_transcriptions(transcriptions)
        
        for segment in timestamped:
            if not segment['text'].strip():
                continue
            
            # Embed with Contriever for better retrieval
            embedding = self.text_embedder.embed_text(
                segment['text'],
                use_contriever=True
            )
            
            if embedding is not None:
                text_items.append({
                    'chunk_id': f"{file_id}#audio#{segment['segment_index']}",
                    'vector': embedding,
                    'file_id': file_id,
                    'user_id': user_id,
                    'segment_index': segment['segment_index'],
                    'text': segment['text'],
                    'start_time': segment['start_time'],
                    'end_time': segment['end_time'],
                    'modality': 'audio'
                })
        
        if text_items:
            self.chroma_db.upsert_items('text_embeddings', text_items)
            logger.info(f"Stored {len(text_items)} audio transcription embeddings")


class EnhancedSearchService:
    """
    Enhanced search service using Video-RAG improvements.
    """
    
    def __init__(self):
        self.retriever = AdvancedRetrieverService()
    
    async def search_videos(
        self,
        query: str,
        user_id: Optional[str] = None,
        file_id: Optional[str] = None,
        top_k: int = 10,
        threshold: float = 0.4
    ) -> Dict[str, Any]:
        """
        Basic search (backward compatible with existing API).
        Enhanced with multi-query and dynamic threshold.
        """
        filters = {}
        if user_id:
            filters['user_id'] = user_id
        if file_id:
            filters['file_id'] = file_id
        
        # Use single query for backward compatibility
        results = self.retriever.retrieve_with_multi_query(
            queries=query,
            filters=filters,
            threshold=threshold,
            top_k=top_k,
            use_contriever=True
        )
        
        stats = self.retriever.get_retrieval_stats(results)
        
        return {
            'results': results,
            'stats': stats,
            'query': query
        }
    
    async def advanced_search(
        self,
        main_query: str,
        context_queries: Optional[List[str]] = None,
        image_query: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        top_k: int = 10,
        threshold: float = 0.4
    ) -> Dict[str, Any]:
        """
        Advanced search with multi-query and multimodal support (NEW).
        """
        # Combine main query with context
        if context_queries:
            results = self.retriever.retrieve_with_context_expansion(
                query=main_query,
                context_queries=context_queries,
                filters=filters,
                threshold=threshold,
                top_k=top_k
            )
        elif image_query:
            # Multimodal search
            results = self.retriever.retrieve_multimodal(
                text_queries=main_query,
                image_query=image_query,
                filters=filters,
                threshold=threshold,
                top_k=top_k,
                auto_weight=True
            )
        else:
            # Multi-query text search
            queries = [main_query] + (context_queries or [])
            results = self.retriever.retrieve_with_multi_query(
                queries=queries,
                filters=filters,
                threshold=threshold,
                top_k=top_k,
                use_contriever=True
            )
        
        stats = self.retriever.get_retrieval_stats(results)
        
        return {
            'results': results,
            'stats': stats,
            'main_query': main_query,
            'context_queries': context_queries,
            'has_image_query': image_query is not None
        }
    
    async def semantic_video_search(
        self,
        question: str,
        filters: Optional[Dict[str, Any]] = None,
        top_k: int = 5,
        threshold: float = 0.45
    ) -> Dict[str, Any]:
        """
        Question-answering style search (inspired by Video-RAG's QA approach).
        Automatically expands query with related concepts.
        """
        # Extract key concepts from question (simplified version)
        # In production, could use LLM to decompose complex questions
        query_variants = [
            question,
            # Add variations (in production, use proper NLP)
            question.replace("?", ""),
            question.lower()
        ]
        
        results = self.retriever.retrieve_with_multi_query(
            queries=query_variants,
            filters=filters,
            threshold=threshold,
            top_k=top_k,
            use_contriever=True,
            adaptive_scoring=True  # Enable for QA
        )
        
        stats = self.retriever.get_retrieval_stats(results)
        
        # Format for QA response
        formatted_results = []
        for r in results:
            formatted_results.append({
                'file_id': r['file_id'],
                'scene_index': r.get('scene_index'),
                'segment_index': r.get('segment_index'),
                'text': r.get('text', ''),
                'start_time': r.get('start_time'),
                'end_time': r.get('end_time'),
                'confidence': r['confidence'],
                'modality': r.get('modality', 'unknown')
            })
        
        return {
            'question': question,
            'answers': formatted_results,
            'stats': stats
        }


# Example usage in FastAPI route
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
search_service = EnhancedSearchService()

class AdvancedSearchRequest(BaseModel):
    main_query: str
    context_queries: Optional[List[str]] = None
    image_query: Optional[str] = None
    user_id: Optional[str] = None
    file_id: Optional[str] = None
    top_k: int = 10
    threshold: float = 0.4

@router.post("/api/search/advanced")
async def advanced_search_endpoint(request: AdvancedSearchRequest):
    filters = {}
    if request.user_id:
        filters['user_id'] = request.user_id
    if request.file_id:
        filters['file_id'] = request.file_id
    
    result = await search_service.advanced_search(
        main_query=request.main_query,
        context_queries=request.context_queries,
        image_query=request.image_query,
        filters=filters,
        top_k=request.top_k,
        threshold=request.threshold
    )
    
    return result

@router.get("/api/search/qa")
async def qa_search_endpoint(question: str, user_id: Optional[str] = None):
    filters = {'user_id': user_id} if user_id else None
    
    result = await search_service.semantic_video_search(
        question=question,
        filters=filters,
        top_k=5,
        threshold=0.45
    )
    
    return result
"""
