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

Do NOT use this tool when:
- The user asks general questions not about their files
- The user is asking follow-up questions about results already shown
- The user wants to have a casual conversation
- The question can be answered from conversation history alone""",
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
