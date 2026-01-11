"""Tool definitions for the agentic chat workflow.

These tools follow the OpenAI function calling format and are used by the LLM
to decide when to search for files vs respond directly.
"""
from typing import Dict, List, Any

# Tool definitions in OpenAI function calling format
TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": """Search through the user's uploaded files (videos, images, audio) to find relevant content.
Use this tool when:
- The user asks about specific content in their files
- The user wants to find scenes, images, or audio matching a description
- The user asks "where is...", "find...", "show me...", "which video has..."
- The query requires looking up visual or audio content
- The user references their uploaded media
- NO specific files are attached to the message
- This is your DEFAULT tool for queries about content

Do NOT use this tool when:
- The user asks general questions not about their files
- The user is asking follow-up questions about results already shown
- The user wants a FULL summary of ATTACHED files (use get_video_content or get_file_content)
- Specific files are attached and the user wants details about THOSE files""",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant content. Be specific and descriptive. Include visual details, actions, objects, or audio content being searched for."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (1-20). Use fewer for specific queries, more for broad searches.",
                        "default": 5
                    },
                    "file_type": {
                        "type": "string",
                        "enum": ["all", "video", "image", "audio"],
                        "description": "Filter results by file type. Use 'all' if the user doesn't specify a type.",
                        "default": "all"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_video_content",
            "description": """Get the COMPLETE content of ATTACHED VIDEO files for summarization or narration.

REQUIRES: Video files must be attached to the message

Use this tool ONLY when:
- Video files are attached AND the user asks "summarize this video"
- Files are attached AND the user asks "narrate the story" or "what happens in this video"
- Files are attached AND the user wants an overview of the entire video
- Files are attached AND the user asks "what is this video about?"

This tool retrieves ALL scenes and audio transcriptions in chronological order.

IMPORTANT: 
- If NO files are attached, use search_files to find videos first
- If multiple videos are attached, include ALL their IDs in file_ids array

Do NOT use this tool when:
- NO files are attached (use search_files instead)
- The file is an IMAGE or AUDIO (use get_file_content instead)
- The user wants to FIND videos (use search_files instead)""",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Array of video file IDs to get content for. Include ALL video file IDs when multiple files are attached."
                    }
                },
                "required": ["file_ids"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_content",
            "description": """Get the content and metadata of ATTACHED IMAGE or AUDIO files.

REQUIRES: Files must be attached to the message

Use this tool when:
- Files are attached AND the user asks "what is in this image?" or "describe this image"
- Files are attached AND the user wants to know objects, colors, or setting
- Files are attached AND the user asks for the transcript of an audio file
- Files are attached AND the user wants details about uploaded images/audio

Returns:
- For IMAGES: Description, detected objects, setting, style, colors
- For AUDIO: Transcript of spoken content
- File metadata (name, type, URL)

IMPORTANT: 
- If NO files are attached, use search_files to find files first
- If multiple files are attached, include ALL their IDs to analyze them all

Do NOT use this tool when:
- The file is a VIDEO (use get_video_content instead)
- The user wants to FIND images (use search_files instead)
- NO files are attached to the message""",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Array of image or audio file IDs to get content for. Include ALL file IDs when multiple files are attached."
                    }
                },
                "required": ["file_ids"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_conversation_summary",
            "description": """Get a summary of the earlier parts of this conversation.
Use this tool when:
- The user references something from much earlier in the conversation
- You need context about what was discussed before
- The conversation has been going on for a while and you need to recall earlier topics

Do NOT use this tool for recent messages - those are already in your context.""",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


def get_tool_by_name(name: str) -> Dict[str, Any] | None:
    """Get a tool definition by name."""
    for tool in TOOLS:
        if tool["function"]["name"] == name:
            return tool
    return None


def get_tool_names() -> List[str]:
    """Get list of all available tool names."""
    return [tool["function"]["name"] for tool in TOOLS]
