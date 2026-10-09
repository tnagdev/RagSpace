import json
import logging
from typing import Any, Dict, List, Optional

import chromadb
import numpy as np

from src.config import settings
from src.decorators.singleton import SingletonMeta

logger = logging.getLogger(__name__)

SPECIAL_CONTENT_TYPES = ("character_registry", "narrative")
# Tuned on a real library: 60 lets mediocre two-modality matches bury exact transcript hits, 10 lets OCR noise in.
RRF_K = 20


def visual_metadata(description: Any) -> Dict[str, str]:
    """Flattens an ImageDescription into Chroma-compatible scalar metadata."""
    if description is None:
        return {}
    return {
        "description_summary": description.summary or "",
        "visual_objects": json.dumps(description.objects or []),
        "visual_setting": description.setting or "",
        "visual_style": description.style or "",
        "visual_colors": json.dumps(description.colors or []),
        "characters_present": json.dumps(description.characters_present or []),
    }


def parse_visual(metadata: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    summary = metadata.get("description_summary") or None
    objects = _json_list(metadata.get("visual_objects"))
    setting = metadata.get("visual_setting") or None
    style = metadata.get("visual_style") or None
    colors = _json_list(metadata.get("visual_colors"))
    if not any((summary, objects, setting, style, colors)):
        return None
    return {"summary": summary, "objects": objects, "setting": setting, "style": style, "colors": colors}


def _record_key(metadata: Dict[str, Any]) -> str:
    file_id = metadata.get("file_id")
    if metadata.get("segment_index") is not None:
        return f"{file_id}#audio#{metadata['segment_index']}"
    return f"{file_id}#scene#{metadata.get('scene_index', 0)}"


def _json_list(value: Any) -> List[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in parsed] if isinstance(parsed, list) else []


class ChromaDatabaseManager(metaclass=SingletonMeta):
    def __init__(self):
        self.client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=chromadb.Settings(anonymized_telemetry=False, allow_reset=False),
        )
        self.text_index_name = "text_embeddings"
        self.image_index_name = "image_embeddings"
        self.text_collection = self.client.get_or_create_collection(
            name=self.text_index_name, metadata={"hnsw:space": "cosine"}
        )
        self.image_collection = self.client.get_or_create_collection(
            name=self.image_index_name, metadata={"hnsw:space": "cosine"}
        )

    def heartbeat(self) -> None:
        self.client.heartbeat()

    def upsert_items(self, index_name: str, items: List[Dict[str, Any]]) -> None:
        if not items:
            return
        collection = self.text_collection if index_name == self.text_index_name else self.image_collection
        ids, embeddings, metadatas, documents = [], [], [], []
        for item in items:
            ids.append(item["chunk_id"])
            vector = item["vector"]
            embeddings.append(vector.tolist() if isinstance(vector, np.ndarray) else vector)
            metadata = {}
            for key, value in item.items():
                if key in ("vector", "chunk_id") or value is None:
                    continue
                metadata[key] = value.item() if isinstance(value, np.generic) else value
            metadatas.append(metadata)
            documents.append(item.get("text") or "")

        batch = settings.chroma_upsert_batch_size
        for start in range(0, len(ids), batch):
            collection.upsert(
                ids=ids[start:start + batch],
                embeddings=embeddings[start:start + batch],
                metadatas=metadatas[start:start + batch],
                documents=documents[start:start + batch],
            )
        logger.info("Upserted %d items into %s", len(items), index_name)

    def query_index(
        self,
        text_query_vec: Optional[np.ndarray] = None,
        image_query_vec: Optional[np.ndarray] = None,
        filters: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Fuses text and image matches by weighted reciprocal rank.

        BGE text and CLIP image similarities sit on different scales, so their raw cosines cannot be
        added. `score` is normalised so a record ranked first in every queried modality scores 1.0;
        `text_score` and `image_score` stay raw similarities.
        """
        options = options or {}
        weights = {"text": options.get("text_weight", 0.5), "image": options.get("image_weight", 0.5)}
        top_k = options.get("top_k", 10)
        dynamic = options.get("use_dynamic_retrieval", True)
        floor = options.get("threshold", 0.2) if dynamic else 0.0
        retrieval_count = top_k * 5 if dynamic else top_k
        fused: Dict[str, Dict[str, Any]] = {}

        def run(collection, vector: np.ndarray, modality: str) -> None:
            raw = collection.query(query_embeddings=[vector.tolist()], n_results=retrieval_count, where=filters)
            seen = set()
            for metadata, distance, doc in zip(raw["metadatas"][0], raw["distances"][0], raw["documents"][0]):
                similarity = 1 - distance
                if similarity < floor or metadata.get("content_type") in SPECIAL_CONTENT_TYPES:
                    continue
                key = _record_key(metadata)
                if key in seen:
                    continue
                seen.add(key)
                entry = fused.setdefault(key, {"text": "", "text_score": 0.0, "image_score": 0.0, "score": 0.0})
                for field, value in metadata.items():
                    entry.setdefault(field, value)
                entry[f"{modality}_score"] = similarity
                entry["score"] += weights[modality] / (RRF_K + len(seen))
                doc = doc or metadata.get("text")
                if doc and (modality == "text" or not entry["text"]):
                    entry["text"] = doc

        queried = [
            (collection, vector, modality)
            for collection, vector, modality in (
                (self.text_collection, text_query_vec, "text"),
                (self.image_collection, image_query_vec, "image"),
            )
            if vector is not None and weights[modality] > 0
        ]
        for collection, vector, modality in queried:
            run(collection, vector, modality)

        best = sum(weights[modality] for _, _, modality in queried) / (RRF_K + 1)
        ranked = sorted(fused.values(), key=lambda entry: entry["score"], reverse=True)[:top_k]
        for entry in ranked:
            entry["score"] /= best
        return ranked

    def audio_segments(self, file_id: str) -> List[Dict[str, Any]]:
        raw = self.text_collection.get(
            where={"$and": [{"file_id": file_id}, {"segment_index": {"$gte": 0}}]},
            include=["metadatas", "documents"],
        )
        segments = [
            {**metadata, "text": doc or ""}
            for metadata, doc in zip(raw.get("metadatas") or [], raw.get("documents") or [])
            if metadata.get("start_time") is not None
        ]
        segments.sort(key=lambda s: s.get("start_time") or 0)
        return segments

    def scene_records(self, file_id: str) -> List[Dict[str, Any]]:
        raw = self.image_collection.get(
            where={"$and": [{"file_id": file_id}, {"scene_index": {"$gte": 0}}]},
            include=["metadatas", "documents"],
        )
        scenes = [{**metadata, "text": doc or ""} for metadata, doc in zip(raw.get("metadatas") or [], raw.get("documents") or [])]
        scenes.sort(key=lambda s: s.get("scene_index") or 0)
        return scenes

    def image_record(self, file_id: str) -> Optional[Dict[str, Any]]:
        raw = self.image_collection.get(ids=[f"{file_id}#image#0"], include=["metadatas", "documents"])
        if not raw.get("ids"):
            return None
        return {**raw["metadatas"][0], "text": raw["documents"][0] or ""}

    def special_docs(self, file_id: str) -> Dict[str, Optional[dict]]:
        result: Dict[str, Optional[dict]] = {"character_registry": None, "narrative": None}
        raw = self.text_collection.get(
            ids=[f"{file_id}#character_registry", f"{file_id}#narrative"], include=["documents", "metadatas"]
        )
        for doc, metadata in zip(raw.get("documents") or [], raw.get("metadatas") or []):
            content_type = (metadata or {}).get("content_type")
            source = doc if content_type == "character_registry" else (metadata or {}).get("narrative_json")
            if content_type in result and source:
                try:
                    result[content_type] = json.loads(source)
                except ValueError:
                    logger.warning("Unparseable %s document for file %s", content_type, file_id)
        return result

    def delete_audio_segments(self, file_id: str) -> None:
        self.text_collection.delete(where={"$and": [{"file_id": file_id}, {"segment_index": {"$gte": 0}}]})

    def delete_scene_embeddings(self, file_id: str) -> None:
        self.image_collection.delete(where={"$and": [{"file_id": file_id}, {"scene_index": {"$gte": 0}}]})
        self.text_collection.delete(where={"$and": [{"file_id": file_id}, {"scene_index": {"$gte": 0}}]})
        self.text_collection.delete(ids=[f"{file_id}#character_registry", f"{file_id}#narrative"])

    def delete_by_file_ids(self, file_ids: List[str]) -> None:
        if not file_ids:
            return
        where = {"file_id": {"$in": file_ids}}
        self.text_collection.delete(where=where)
        self.image_collection.delete(where=where)

    def delete_by_user_id(self, user_id: str) -> None:
        self.text_collection.delete(where={"user_id": user_id})
        self.image_collection.delete(where={"user_id": user_id})
