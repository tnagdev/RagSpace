"""Greeting API route — returns a personalised AI-generated greeting for the current user"""
import logging
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from src.services.GreetingService import GreetingService

router = APIRouter()
logger = logging.getLogger(__name__)


class GreetingResponse(BaseModel):
    greeting: str


@router.get("", response_model=GreetingResponse)
async def get_greeting(request: Request):
    """
    Generate a short, witty, personalised greeting for the authenticated user.

    The greeting is grounded in the names of the user's fully-processed files so
    it feels relevant to their actual library.  The LLM call is made server-side;
    the client simply receives the finished string.
    """
    user = request.state.user
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = user.get("id")
    user_context = {
        "id": user_id,
        "email": user.get("email"),
        "name": user.get("name"),
    }
    session_context = {"userId": user_id}

    logger.info(f"Greeting requested by user {user_id}")

    service = GreetingService(user_context, session_context)
    greeting = await service.generate()

    if not greeting:
        # Graceful fallback — never let the endpoint error out
        name = (user.get("name") or "").split()[0] or "there"
        greeting = f"Hey {name}, welcome back to RagSpace!"

    return GreetingResponse(greeting=greeting)
