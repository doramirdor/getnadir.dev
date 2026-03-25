"""
Structured logging configuration for production.

Outputs JSON-formatted logs when STRUCTURED_LOGGING=true (default in non-debug mode).
Falls back to standard human-readable format otherwise.
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON for log aggregation tools."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)
        # Include extra fields if present
        for key in ("request_id", "user_id", "model", "latency_ms", "cost"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)
        return json.dumps(log_entry, default=str)


def configure_logging():
    """Configure root logger based on environment."""
    debug = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    use_json = os.getenv("STRUCTURED_LOGGING", str(not debug)).lower() in ("true", "1", "t")
    log_level = os.getenv("LOG_LEVEL", "DEBUG" if debug else "INFO").upper()

    root = logging.getLogger()
    root.setLevel(log_level)

    # Clear existing handlers
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if use_json:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))

    root.addHandler(handler)

    # Quiet noisy third-party loggers
    for name in ("httpx", "httpcore", "urllib3", "hpack", "litellm"):
        logging.getLogger(name).setLevel(logging.WARNING)
