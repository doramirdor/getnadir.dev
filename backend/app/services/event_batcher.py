"""
Event batching service for analytics writes.

Collects usage events in memory and flushes them to Supabase in batches
to reduce per-request database pressure under high traffic.
"""
import asyncio
import logging
import time
from collections import deque
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


class EventBatcher:
    """Buffers events and flushes to Supabase periodically or when batch is full."""

    def __init__(
        self,
        table_name: str = "usage_events",
        max_batch_size: int = 50,
        flush_interval_seconds: float = 10.0,
    ):
        self._table_name = table_name
        self._max_batch_size = max_batch_size
        self._flush_interval = flush_interval_seconds
        self._buffer: deque[Dict[str, Any]] = deque()
        self._flush_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._running = False
        # Stats
        self.total_enqueued = 0
        self.total_flushed = 0
        self.total_flush_errors = 0

    async def start(self):
        """Start the periodic flush loop."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info("EventBatcher started (table=%s, batch=%d, interval=%.1fs)",
                     self._table_name, self._max_batch_size, self._flush_interval)

    async def stop(self):
        """Flush remaining events and stop."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self._flush_now()

    def enqueue(self, event: Dict[str, Any]):
        """Add an event to the buffer (non-blocking)."""
        self._buffer.append(event)
        self.total_enqueued += 1
        if len(self._buffer) >= self._max_batch_size:
            asyncio.create_task(self._flush_now())

    async def _flush_loop(self):
        """Periodically flush the buffer."""
        while self._running:
            await asyncio.sleep(self._flush_interval)
            await self._flush_now()

    async def _flush_now(self):
        """Flush all buffered events to Supabase."""
        async with self._lock:
            if not self._buffer:
                return

            batch: List[Dict[str, Any]] = []
            while self._buffer and len(batch) < self._max_batch_size * 2:
                batch.append(self._buffer.popleft())

            if not batch:
                return

            try:
                from app.auth.supabase_auth import supabase
                supabase.table(self._table_name).insert(batch).execute()
                self.total_flushed += len(batch)
                logger.debug("Flushed %d events to %s", len(batch), self._table_name)
            except Exception as e:
                self.total_flush_errors += 1
                logger.error("Failed to flush %d events to %s: %s", len(batch), self._table_name, e)
                # Put events back for retry (at the front)
                for event in reversed(batch):
                    self._buffer.appendleft(event)


# Global instance (start in app startup, stop in shutdown)
analytics_batcher = EventBatcher(table_name="usage_events")
