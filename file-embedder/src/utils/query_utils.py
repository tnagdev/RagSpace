"""
Query keyword filtering and enhancement utilities.
Based on Video-RAG's filter_keywords approach with spaCy NLP.
"""
import logging
from typing import List, Optional
import spacy

logger = logging.getLogger(__name__)


class QueryEnhancer:
    """
    Enhances and filters search queries using NLP.
    Extracts meaningful keywords and filters noise.
    """
    
    def __init__(self, model_name: str = "en_core_web_sm"):
        """
        Initialize spaCy model for keyword filtering.
        
        Args:
            model_name: spaCy model name (en_core_web_sm, en_core_web_md, etc.)
        """
        try:
            self.nlp = spacy.load(model_name)
            logger.info(f"Loaded spaCy model: {model_name}")
        except OSError:
            logger.warning(f"spaCy model {model_name} not found. Install with: python -m spacy download {model_name}")
            self.nlp = None
    
    def filter_keywords(self, keywords: List[str]) -> List[str]:
        """
        Filter keywords to keep only meaningful search terms.
        Based on Video-RAG's filter_keywords function.
        
        Keeps:
        - Single nouns, adjectives, verbs (e.g., "car", "red", "running")
        - Adjective + Noun pairs (e.g., "red car")
        - Noun + Noun pairs (e.g., "police car")
        - Adjective + Noun + Noun triplets (e.g., "fast police car")
        - Verb + Noun pairs (e.g., "driving car")
        
        Filters out:
        - Generic words like "video"
        - Abstract concepts without clear visual referents
        - Complex phrases that don't match patterns above
        
        Args:
            keywords: List of keyword phrases to filter
        
        Returns:
            Filtered list of meaningful keywords
        """
        if not self.nlp:
            logger.warning("spaCy model not loaded, returning unfiltered keywords")
            return [k for k in keywords if k.lower() != 'video']
        
        filtered_keywords = []
        
        for phrase in keywords:
            if not phrase or not phrase.strip():
                continue
            
            doc = self.nlp(phrase.strip())
            
            # Single word
            if len(doc) == 1:
                if doc[0].pos_ in ["NOUN", "ADJ", "VERB"] and phrase.lower() != 'video':
                    filtered_keywords.append(phrase)
            
            # Two words
            elif len(doc) == 2:
                is_valid = False
                
                # Adjective + Noun/Proper Noun (e.g., "red car", "New York")
                if doc[0].pos_ == "ADJ" and doc[1].pos_ in ["NOUN", "PROPN"]:
                    is_valid = True
                
                # Noun + Noun (e.g., "police car", "city hall")
                elif doc[0].pos_ in ["NOUN", "PROPN"] and doc[1].pos_ in ["NOUN", "PROPN"]:
                    is_valid = True
                
                # Verb + Noun (e.g., "driving car", "flying bird")
                elif doc[0].pos_ == "VERB" and doc[1].pos_ in ["NOUN", "PROPN"]:
                    is_valid = True
                
                if is_valid and phrase.lower() != 'video':
                    filtered_keywords.append(phrase)
            
            # Three words
            elif len(doc) == 3:
                # Adjective + Noun + Noun (e.g., "fast police car")
                if (doc[0].pos_ == "ADJ" and 
                    doc[1].pos_ in ["NOUN", "PROPN"] and 
                    doc[2].pos_ in ["NOUN", "PROPN"]):
                    if phrase.lower() != 'video':
                        filtered_keywords.append(phrase)
        
        logger.info(f"Filtered {len(keywords)} keywords to {len(filtered_keywords)} meaningful terms")
        return filtered_keywords
    
    def extract_entities(self, text: str) -> List[str]:
        """
        Extract named entities and noun phrases from text.
        Useful for query expansion.
        
        Args:
            text: Input text
        
        Returns:
            List of extracted entities and key noun phrases
        """
        if not self.nlp:
            return []
        
        doc = self.nlp(text)
        entities = []
        
        # Named entities (PERSON, ORG, GPE, etc.)
        for ent in doc.ents:
            if ent.label_ not in ["CARDINAL", "ORDINAL", "QUANTITY"]:  # Skip numbers
                entities.append(ent.text)
        
        # Noun phrases
        for chunk in doc.noun_chunks:
            # Filter to meaningful chunks (not too short, not too long)
            if 1 <= len(chunk.text.split()) <= 3:
                entities.append(chunk.text)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_entities = []
        for e in entities:
            e_lower = e.lower()
            if e_lower not in seen and e_lower != 'video':
                seen.add(e_lower)
                unique_entities.append(e)
        
        return unique_entities
    
    def expand_query(self, query: str, max_keywords: int = 5) -> List[str]:
        """
        Expand a query into multiple related keywords for multi-query search.
        Creates query variations by:
        1. Breaking down complex queries into simpler phrases
        2. Extracting key entities and noun phrases
        3. Generating contextual variations
        
        Args:
            query: Original search query
            max_keywords: Maximum number of keywords to extract
        
        Returns:
            List of query variants including original and expanded terms
        """
        # Start with original query
        queries = [query]
        
        if not self.nlp:
            # Fallback: Simple word-based expansion when spaCy is not available
            logger.info("Using simple word-based expansion (spaCy not loaded)")
            words = query.lower().split()
            
            # Filter out common stop words manually
            stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                         'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
                         'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
                         'can', 'could', 'may', 'might', 'must', 'this', 'that', 'these', 'those',
                         'where', 'when', 'why', 'how', 'what', 'which', 'who', 'whom', 'whose',
                         'video', 'clip', 'scene', 'show', 'find', 'search', 'look', 'see'}
            
            # Add individual meaningful words
            meaningful_words = [w for w in words if w not in stop_words and len(w) > 2]
            queries.extend(meaningful_words[:max_keywords])
            
            # Add bi-grams (two-word combinations)
            for i in range(len(words) - 1):
                if words[i] not in stop_words or words[i+1] not in stop_words:
                    bigram = f"{words[i]} {words[i+1]}"
                    if bigram != query:
                        queries.append(bigram)
            
            # Remove duplicates
            seen = set()
            unique_queries = []
            for q in queries:
                q_lower = q.strip().lower()
                if q_lower and q_lower not in seen:
                    seen.add(q_lower)
                    unique_queries.append(q.strip())
            
            unique_queries = unique_queries[:max_keywords + 1]
            logger.info(f"Expanded query '{query}' to {len(unique_queries)} variants (fallback mode): {unique_queries}")
            return unique_queries
        
        # spaCy-based expansion (original code)
        doc = self.nlp(query)
        
        # Strategy 1: Extract entities and noun phrases
        entities = self.extract_entities(query)
        filtered = self.filter_keywords(entities)
        queries.extend(filtered[:max_keywords])
        
        # Strategy 2: Extract individual important nouns and adjectives
        important_words = []
        for token in doc:
            # Skip stop words and generic terms
            if not token.is_stop and token.pos_ in ["NOUN", "PROPN", "ADJ", "VERB"]:
                word = token.lemma_.lower()  # Use lemma for base form
                if word not in ["video", "clip", "scene", "show", "find", "search", "look"]:
                    important_words.append(word)
        
        # Add individual important words (lemmatized)
        queries.extend(important_words[:3])
        
        # Strategy 3: Create simplified versions by removing articles and prepositions
        clean_query = " ".join([
            token.text for token in doc 
            if not token.is_stop or token.pos_ in ["NOUN", "PROPN", "ADJ", "VERB"]
        ])
        if clean_query and clean_query != query:
            queries.append(clean_query)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_queries = []
        for q in queries:
            q_lower = q.strip().lower()
            if q_lower and q_lower not in seen:
                seen.add(q_lower)
                unique_queries.append(q.strip())
        
        # Limit total queries
        unique_queries = unique_queries[:max_keywords + 1]  # +1 for original
        
        logger.info(f"Expanded query '{query}' to {len(unique_queries)} variants: {unique_queries}")
        return unique_queries
    
    def is_visual_concept(self, keyword: str) -> bool:
        """
        Determine if a keyword represents a visual concept.
        Useful for filtering abstract concepts in object detection queries.
        
        Args:
            keyword: Keyword to check
        
        Returns:
            True if likely a visual/physical entity, False if abstract
        """
        if not self.nlp:
            return True  # Default to True if no NLP
        
        doc = self.nlp(keyword)
        
        # Abstract concepts often have these POS tags
        abstract_indicators = ["DET", "ADP", "ADV", "CONJ", "INTJ"]
        
        # Check if any token is abstract
        for token in doc:
            if token.pos_ in abstract_indicators:
                return False
        
        # Check for physical entities
        physical_ents = ["PERSON", "ORG", "GPE", "LOC", "PRODUCT", "FAC", "VEH"]
        for ent in doc.ents:
            if ent.label_ in physical_ents:
                return True
        
        # Nouns and proper nouns are usually visual
        if any(token.pos_ in ["NOUN", "PROPN"] for token in doc):
            return True
        
        return False


# Singleton instance for easy import
_query_enhancer_instance = None

def get_query_enhancer() -> QueryEnhancer:
    """Get singleton QueryEnhancer instance."""
    global _query_enhancer_instance
    if _query_enhancer_instance is None:
        _query_enhancer_instance = QueryEnhancer()
    return _query_enhancer_instance


# Convenience functions
def filter_keywords(keywords: List[str]) -> List[str]:
    """Filter keywords using singleton QueryEnhancer."""
    return get_query_enhancer().filter_keywords(keywords)


def expand_query(query: str, max_keywords: int = 5) -> List[str]:
    """Expand query using singleton QueryEnhancer."""
    return get_query_enhancer().expand_query(query, max_keywords)


def extract_entities(text: str) -> List[str]:
    """Extract entities using singleton QueryEnhancer."""
    return get_query_enhancer().extract_entities(text)
