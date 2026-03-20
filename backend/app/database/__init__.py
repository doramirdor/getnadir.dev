"""
Database module for Nadir.

Note: All database operations now use Supabase.
This module is kept for compatibility during migration.
"""
from app.database.supabase_db import supabase_db

__all__ = [
    "supabase_db"
] 