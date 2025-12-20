"""
Spatial scene graph utilities for object relationships.
Based on Video-RAG's scene graph generation approach.
"""
import logging
from typing import List, Dict, Any, Tuple, Optional
import networkx as nx

logger = logging.getLogger(__name__)


class SpatialRelation:
    """Constants for spatial relationships."""
    OVERLAPS = "overlaps"
    LEFT_OF = "left_of"
    RIGHT_OF = "right_of"
    ABOVE = "above"
    BELOW = "below"
    NEAR = "near"
    CONTAINS = "contains"
    SAME_TYPE = "same_object_type"


class SceneGraphGenerator:
    """
    Generate scene graphs from object detection results.
    Analyzes spatial relationships between detected objects.
    """
    
    def __init__(self, near_threshold: float = 50.0):
        """
        Initialize scene graph generator.
        
        Args:
            near_threshold: Distance threshold (pixels) for "near" relationship
        """
        self.near_threshold = near_threshold
    
    def calculate_xmax_ymax(self, bbox: List[float]) -> Tuple[float, float]:
        """
        Calculate max coordinates from bounding box.
        
        Args:
            bbox: [xmin, ymin, width, height]
        
        Returns:
            (xmax, ymax)
        """
        xmin, ymin, width, height = bbox
        xmax = xmin + width
        ymax = ymin + height
        return xmax, ymax
    
    def calculate_spatial_relations(
        self,
        bbox1: List[float],
        bbox2: List[float]
    ) -> List[str]:
        """
        Calculate spatial relationships between two bounding boxes.
        Based on Video-RAG's calculate_spatial_relations.
        
        Args:
            bbox1: First bounding box [xmin, ymin, width, height]
            bbox2: Second bounding box [xmin, ymin, width, height]
        
        Returns:
            List of relationship strings
        """
        xmin1, ymin1, width1, height1 = bbox1
        xmin2, ymin2, width2, height2 = bbox2
        
        xmax1, ymax1 = self.calculate_xmax_ymax(bbox1)
        xmax2, ymax2 = self.calculate_xmax_ymax(bbox2)
        
        relations = []
        
        # Check for overlap
        if (xmin1 < xmax2 and xmax1 > xmin2 and 
            ymin1 < ymax2 and ymax1 > ymin2):
            relations.append(SpatialRelation.OVERLAPS)
        
        # Horizontal relationships
        if xmax1 < xmin2:
            relations.append(SpatialRelation.LEFT_OF)
        elif xmin1 > xmax2:
            relations.append(SpatialRelation.RIGHT_OF)
        
        # Vertical relationships
        if ymax1 < ymin2:
            relations.append(SpatialRelation.ABOVE)
        elif ymin1 > ymax2:
            relations.append(SpatialRelation.BELOW)
        
        # Check if near (no overlap but close)
        if not relations or SpatialRelation.OVERLAPS not in relations:
            center1 = ((xmin1 + xmax1) / 2, (ymin1 + ymax1) / 2)
            center2 = ((xmin2 + xmax2) / 2, (ymin2 + ymax2) / 2)
            distance = ((center1[0] - center2[0]) ** 2 + 
                       (center1[1] - center2[1]) ** 2) ** 0.5
            
            if distance < self.near_threshold:
                relations.append(SpatialRelation.NEAR)
        
        return relations
    
    def relation_to_text(
        self,
        source_id: int,
        source_label: str,
        relation: str,
        target_id: int,
        target_label: str
    ) -> str:
        """
        Convert spatial relationship to natural language description.
        Based on Video-RAG's relation_to_text.
        
        Args:
            source_id: Source object ID
            source_label: Source object label
            relation: Relationship type
            target_id: Target object ID
            target_label: Target object label
        
        Returns:
            Natural language description
        """
        relation_templates = {
            SpatialRelation.OVERLAPS: "{source} overlaps with {target}",
            SpatialRelation.LEFT_OF: "{source} is to the left of {target}",
            SpatialRelation.RIGHT_OF: "{source} is to the right of {target}",
            SpatialRelation.ABOVE: "{source} is above {target}",
            SpatialRelation.BELOW: "{source} is below {target}",
            SpatialRelation.NEAR: "{source} is near {target}",
            SpatialRelation.CONTAINS: "{source} contains {target}",
            SpatialRelation.SAME_TYPE: "{source} is of the same type as {target}"
        }
        
        template = relation_templates.get(
            relation,
            "{source} is related to {target}"
        )
        
        source_desc = f"Object {source_id} ({source_label})"
        target_desc = f"Object {target_id} ({target_label})"
        
        return template.format(source=source_desc, target=target_desc) + "."
    
    def generate_scene_graph_description(
        self,
        objects: List[Dict[str, Any]],
        include_location: bool = True,
        include_relation: bool = True,
        include_count: bool = True
    ) -> str:
        """
        Generate textual scene description from detected objects.
        Based on Video-RAG's generate_scene_graph_description.
        
        Args:
            objects: List of detected objects with 'id', 'label', 'bbox'
                     bbox format: [xmin, ymin, width, height]
            include_location: Include absolute position descriptions
            include_relation: Include spatial relationship descriptions
            include_count: Include object counting information
        
        Returns:
            Natural language scene description
        """
        if not objects:
            return "No objects detected in this frame."
        
        scene_graph = nx.DiGraph()
        object_count = {}
        
        # Add nodes for each object
        for obj in objects:
            obj_id = obj['id']
            label = obj['label']
            bbox = obj['bbox']
            
            scene_graph.add_node(obj_id, label=label, bbox=bbox)
            
            # Count objects by type
            object_count[label] = object_count.get(label, 0) + 1
        
        # Calculate relationships between all object pairs
        for node1, data1 in scene_graph.nodes(data=True):
            for node2, data2 in scene_graph.nodes(data=True):
                if node1 < node2:  # Avoid duplicate pairs
                    bbox1 = data1['bbox']
                    bbox2 = data2['bbox']
                    relations = self.calculate_spatial_relations(bbox1, bbox2)
                    
                    for relation in relations:
                        scene_graph.add_edge(node1, node2, relation=relation)
        
        # Generate descriptions
        descriptions = []
        
        # Location descriptions
        if include_location:
            for node, data in scene_graph.nodes(data=True):
                label = data.get('label', 'unknown object')
                bbox = data.get('bbox', [0, 0, 0, 0])
                description = (
                    f"Object {node} is a {label} located at coordinates "
                    f"[{bbox[0]:.0f}, {bbox[1]:.0f}] with dimensions "
                    f"{bbox[2]:.0f}x{bbox[3]:.0f}."
                )
                descriptions.append(description)
        
        # Relationship descriptions
        if include_relation:
            for source, target, data in scene_graph.edges(data=True):
                relation = data.get('relation', 'related to')
                source_label = scene_graph.nodes[source]['label']
                target_label = scene_graph.nodes[target]['label']
                description = self.relation_to_text(
                    source, source_label, relation, target, target_label
                )
                descriptions.append(description)
        
        # Object counting
        if include_count:
            count_lines = ["Object counting:"]
            for label, count in sorted(object_count.items()):
                count_lines.append(f"- {label}: {count}")
            descriptions.append("\n".join(count_lines))
        
        return "\n".join(descriptions)
    
    def get_object_relationships(
        self,
        objects: List[Dict[str, Any]]
    ) -> Dict[str, List[Tuple[str, str, str]]]:
        """
        Get structured relationship data.
        
        Args:
            objects: List of detected objects
        
        Returns:
            Dictionary mapping object IDs to list of (relation, target_id, target_label) tuples
        """
        relationships = {}
        
        for i, obj1 in enumerate(objects):
            obj1_id = obj1['id']
            relationships[obj1_id] = []
            
            for j, obj2 in enumerate(objects):
                if i >= j:  # Skip self and already processed pairs
                    continue
                
                obj2_id = obj2['id']
                relations = self.calculate_spatial_relations(obj1['bbox'], obj2['bbox'])
                
                for rel in relations:
                    relationships[obj1_id].append((rel, obj2_id, obj2['label']))
        
        return relationships
    
    def find_objects_by_relation(
        self,
        objects: List[Dict[str, Any]],
        relation_query: str,
        source_label: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Find objects matching a spatial query.
        Example: "objects to the left of the car"
        
        Args:
            objects: List of detected objects
            relation_query: Relation to search for (e.g., "left_of")
            source_label: Optional source object type to filter by
        
        Returns:
            List of matching objects with relationship information
        """
        results = []
        
        for i, obj1 in enumerate(objects):
            if source_label and obj1['label'] != source_label:
                continue
            
            for j, obj2 in enumerate(objects):
                if i == j:
                    continue
                
                relations = self.calculate_spatial_relations(obj1['bbox'], obj2['bbox'])
                
                if relation_query in relations:
                    results.append({
                        'source': obj1,
                        'target': obj2,
                        'relation': relation_query
                    })
        
        return results


# Convenience functions
_scene_graph_generator = None

def get_scene_graph_generator() -> SceneGraphGenerator:
    """Get singleton SceneGraphGenerator instance."""
    global _scene_graph_generator
    if _scene_graph_generator is None:
        _scene_graph_generator = SceneGraphGenerator()
    return _scene_graph_generator


def generate_scene_description(
    objects: List[Dict[str, Any]],
    include_location: bool = True,
    include_relation: bool = True,
    include_count: bool = True
) -> str:
    """Generate scene description using singleton generator."""
    return get_scene_graph_generator().generate_scene_graph_description(
        objects, include_location, include_relation, include_count
    )
