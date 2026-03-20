"""
Retry utilities for transient failures (Supabase, network, etc.).
"""
import asyncio
import functools
import logging
import time
from typing import TypeVar, Callable

logger = logging.getLogger(__name__)

T = TypeVar("T")


def retry_on_transient(
    max_retries: int = 3,
    base_delay: float = 0.3,
    backoff_factor: float = 2.0,
    retryable_exceptions: tuple = (ConnectionError, TimeoutError, OSError),
):
    """
    Decorator that retries a sync function on transient errors with exponential backoff.
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_exc = None
            delay = base_delay
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exc = exc
                    if attempt < max_retries:
                        logger.warning(
                            "Retry %d/%d for %s after %s: %s",
                            attempt + 1, max_retries, func.__name__,
                            type(exc).__name__, exc,
                        )
                        time.sleep(delay)
                        delay *= backoff_factor
                    else:
                        raise
            raise last_exc  # unreachable but satisfies type checker
        return wrapper
    return decorator


def async_retry_on_transient(
    max_retries: int = 3,
    base_delay: float = 0.3,
    backoff_factor: float = 2.0,
    retryable_exceptions: tuple = (ConnectionError, TimeoutError, OSError),
):
    """
    Decorator that retries an async function on transient errors with exponential backoff.
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            last_exc = None
            delay = base_delay
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exc = exc
                    if attempt < max_retries:
                        logger.warning(
                            "Retry %d/%d for %s after %s: %s",
                            attempt + 1, max_retries, func.__name__,
                            type(exc).__name__, exc,
                        )
                        await asyncio.sleep(delay)
                        delay *= backoff_factor
                    else:
                        raise
            raise last_exc
        return wrapper
    return decorator
