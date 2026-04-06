"""
Redis Pub/Sub helper for broadcasting real-time task events.

Usage:
    # Producer (in pipeline):
    await task_publish(task_id, {"type": "gate_text", "gate": 1, "text": "..."})

    # Consumer (in SSE endpoint):
    async for event in task_subscribe(task_id):
        yield f"data: {json.dumps(event)}\\n\\n"
"""

import asyncio
import json
import logging
from typing import AsyncGenerator

from uteki.common.database import db_manager

logger = logging.getLogger(__name__)

_CHANNEL_PREFIX = "company_task:"


def _channel(task_id: str) -> str:
    return f"{_CHANNEL_PREFIX}{task_id}"


async def task_publish(task_id: str, event: dict) -> None:
    """Publish an event to the task's Redis channel."""
    try:
        redis = await db_manager.get_redis()
        if redis:
            await redis.publish(
                _channel(task_id),
                json.dumps(event, ensure_ascii=False, default=str),
            )
    except Exception as e:
        logger.debug(f"[pubsub] publish failed (non-critical): {e}")


async def task_publish_done(task_id: str) -> None:
    """Signal that the task has finished (success or error)."""
    await task_publish(task_id, {"type": "__done__"})


async def task_subscribe(task_id: str) -> AsyncGenerator[dict, None]:
    """
    Subscribe to live events for a running task.
    Yields events until the task publishes a __done__ sentinel.
    Falls back to polling DB if Redis is unavailable.
    """
    redis = await db_manager.get_redis()
    if not redis:
        logger.warning("[pubsub] Redis unavailable, falling back to DB polling")
        return

    pubsub = redis.pubsub()
    channel = _channel(task_id)

    try:
        await pubsub.subscribe(channel)

        while True:
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if msg is None:
                # No message within timeout — yield control
                await asyncio.sleep(0.05)
                continue

            if msg["type"] != "message":
                continue

            try:
                event = json.loads(msg["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            if event.get("type") == "__done__":
                break

            yield event

    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
        except Exception:
            pass
