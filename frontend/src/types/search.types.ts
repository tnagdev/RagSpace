// Search types matching backend query models

export interface FileDetails {
    id: string;
    fileName: string;
    fileType: string;
    fileSize?: number;
    mimeType?: string;
    url?: string;
    thumbnailUrl?: string;
    userId?: string;
}

export interface SceneDetails {
    sceneNumber: number;
    startTime: number;
    endTime: number;
    startFrame: number;
    endFrame: number;
    keyframe: number;
    duration: number;
    thumbnailUrl?: string;
}

export interface QueryResult {
    file_id: string;
    file_name?: string;
    file_type?: string;
    scene_index?: number;
    segment_index?: number;
    text?: string;
    score: number;
    confidence: number;
    text_score: number;
    image_score: number;
    start_time?: number;
    end_time?: number;
    start_frame?: number;
    end_frame?: number;
    file_details?: FileDetails;
    scene_details?: SceneDetails;
}

export interface QueryRequest {
    query: string;
    file_ids?: string[];
    file_type?: string;
    user_id?: string;
    top_k?: number;
    text_weight?: number;
    image_weight?: number;
    use_dynamic_retrieval?: boolean;
    adaptive_scoring?: boolean;
    enable_query_expansion?: boolean;
    use_enhanced?: boolean;
}

export interface QueryResponse {
    query: string;
    filters: Record<string, any>;
    options: Record<string, any>;
    results: QueryResult[];
    total_results: number;
}
