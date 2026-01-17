

from pydantic import BaseModel



class Scene(BaseModel):
    id: str
    file_id: str
    scene_number: int
    start_time: float
    end_time: float
    start_frame: int
    end_frame: int
    keyframe: int
    thumbnail_url: str
    thumbnail_s3_key: str
    created_at: str
    updated_at: str