import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from redis.exceptions import RedisError

from app.config import get_settings
from app.redis_client import build_redis_client
from app.telemetry import TelemetryStream


router = APIRouter(prefix="/telemetry", tags=["telemetry"])


def _sse_message(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def _telemetry_events(request: Request) -> AsyncIterator[str]:
    settings = get_settings()
    client = build_redis_client()
    stream = TelemetryStream(client, settings.telemetry_stream_name)
    last_id = "$"

    yield _sse_message(
        "connected",
        json.dumps({"stream": settings.telemetry_stream_name, "status": "connected"}),
    )

    try:
        while not await request.is_disconnected():
            try:
                messages = await stream.read(last_id, count=20, block_ms=1000)
            except RedisError as exc:
                yield _sse_message("error", json.dumps({"detail": str(exc)}))
                await asyncio.sleep(1)
                continue

            if not messages:
                yield ": heartbeat\n\n"
                continue

            for message_id, event in messages:
                last_id = message_id
                yield _sse_message("telemetry", event.model_dump_json())
    finally:
        await client.aclose()


@router.get("/stream")
async def stream_telemetry(request: Request) -> StreamingResponse:
    return StreamingResponse(
        _telemetry_events(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
