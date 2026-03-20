"""
Authentication module for Nadir.

This module provides Supabase-based API key authentication.
"""

from .supabase_auth import (
    get_current_user,
    validate_api_key,
    UserSession,
    log_usage_event,
    update_user_preference,
    check_rate_limit,
    check_user_budget,
    supabase
)

__all__ = [
    # Authentication functions
    "get_current_user",
    "validate_api_key",
    "UserSession",
    "log_usage_event",
    "update_user_preference",
    "check_rate_limit",
    "check_user_budget",
    "supabase"
] 