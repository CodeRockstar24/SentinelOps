import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from random import Random
from uuid import uuid4

from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings
from app.redis_client import build_redis_client
from app.schemas import ServiceName, TelemetryEvent


SERVICE_NAMES: tuple[ServiceName, ...] = (
    "payment-service",
    "checkout-api",
    "database",
    "cache",
)


@dataclass(frozen=True)
class ServiceProfile:
    latency_ms: int
    requests_per_minute: int
    error_rate: float
    cpu_percent: float
    memory_percent: float


SERVICE_PROFILES: dict[ServiceName, ServiceProfile] = {
    "payment-service": ServiceProfile(145, 420, 0.008, 34.0, 48.0),
    "checkout-api": ServiceProfile(95, 620, 0.006, 29.0, 42.0),
    "database": ServiceProfile(42, 980, 0.002, 51.0, 66.0),
    "cache": ServiceProfile(12, 1400, 0.001, 18.0, 31.0),
}

_random = Random()


def _jitter(value: float, ratio: float) -> float:
    return value * _random.uniform(1 - ratio, 1 + ratio)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def generate_normal_telemetry(service: ServiceName) -> TelemetryEvent:
    profile = SERVICE_PROFILES[service]
    error_rate = round(_clamp(_jitter(profile.error_rate, 0.45), 0.0, 0.05), 4)
    status_code = 500 if _random.random() < error_rate else 200

    return TelemetryEvent(
        event_id=str(uuid4()),
        timestamp=datetime.now(UTC),
        service=service,
        health="healthy",
        latency_ms=round(_jitter(profile.latency_ms, 0.18)),
        status_code=status_code,
        error_rate=error_rate,
        requests_per_minute=round(_jitter(profile.requests_per_minute, 0.12)),
        cpu_percent=round(_clamp(_jitter(profile.cpu_percent, 0.16), 1.0, 95.0), 1),
        memory_percent=round(_clamp(_jitter(profile.memory_percent, 0.12), 1.0, 95.0), 1),
        message="Normal synthetic telemetry",
    )


def generate_payment_outage_telemetry() -> TelemetryEvent:
    return TelemetryEvent(
        event_id=str(uuid4()),
        timestamp=datetime.now(UTC),
        service="payment-service",
        health="healthy",
        latency_ms=round(_jitter(930, 0.08)),
        status_code=503,
        error_rate=round(_clamp(_jitter(0.38, 0.12), 0.25, 0.60), 4),
        requests_per_minute=round(_jitter(520, 0.10)),
        cpu_percent=round(_clamp(_jitter(78.0, 0.08), 1.0, 95.0), 1),
        memory_percent=round(_clamp(_jitter(72.0, 0.08), 1.0, 95.0), 1),
        message="Demo outage trigger: payment-service 5xx spike",
    )


class TelemetryStream:
    def __init__(self, client: Redis, stream_name: str) -> None:
        self._client = client
        self._stream_name = stream_name

    async def append(self, event: TelemetryEvent) -> str:
        settings = get_settings()
        message_id = await self._client.xadd(
            self._stream_name,
            {"payload": event.model_dump_json()},
            maxlen=settings.telemetry_stream_maxlen,
            approximate=True,
        )
        return str(message_id)

    async def read(
        self,
        last_id: str,
        *,
        count: int = 10,
        block_ms: int = 1000,
    ) -> list[tuple[str, TelemetryEvent]]:
        response = await self._client.xread(
            {self._stream_name: last_id},
            count=count,
            block=block_ms,
        )

        events: list[tuple[str, TelemetryEvent]] = []
        for _stream, messages in response:
            for message_id, fields in messages:
                payload = fields.get("payload")
                if not payload:
                    continue

                try:
                    events.append((str(message_id), TelemetryEvent.model_validate_json(payload)))
                except ValidationError:
                    continue

        return events


async def run_telemetry_producer(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    client = build_redis_client()
    stream = TelemetryStream(client, settings.telemetry_stream_name)

    try:
        while not stop_event.is_set():
            try:
                for service in SERVICE_NAMES:
                    await stream.append(generate_normal_telemetry(service))
            except RedisError:
                await asyncio.sleep(1)

            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=settings.telemetry_producer_interval_seconds,
                )
            except TimeoutError:
                continue
    finally:
        await client.aclose()
