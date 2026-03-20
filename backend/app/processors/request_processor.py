"""
Simple request processor for production completion endpoint.
"""
from typing import Dict, Any
from fastapi import Request


async def get_processed_request(request: Request) -> Dict[str, Any]:
    """
    Process the incoming request and extract metadata.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Dictionary with processed request data
    """
    return {
        "client_ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "timestamp": request.state.__dict__.get("timestamp"),
        "request_id": request.state.__dict__.get("request_id")
    }