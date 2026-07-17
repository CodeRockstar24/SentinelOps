import asyncio
from dataclasses import dataclass
from datetime import datetime

from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import IncidentRecord, TelemetryEventRecord
from app.redis_client import build_redis_client
from app.schemas import IncidentSeverity, ServiceName, TelemetryEvent
from app.telemetry import TelemetryStream


@dataclass(frozen=True)
class DetectionThresholds:
    latency_warning_ms: int
    latency_critical_ms: int


@dataclass(frozen=True)
class IncidentFinding:
    rule_name: str
    severity: IncidentSeverity
    title: str
    summary: str


THRESHOLDS: dict[ServiceName, DetectionThresholds] = {
    "payment-service": DetectionThresholds(latency_warning_ms=450, latency_critical_ms=800),
    "checkout-api": DetectionThresholds(latency_warning_ms=350, latency_critical_ms=650),
    "database": DetectionThresholds(latency_warning_ms=180, latency_critical_ms=320),
    "cache": DetectionThresholds(latency_warning_ms=80, latency_critical_ms=160),
}


def evaluate_telemetry(event: TelemetryEvent) -> IncidentFinding | None:
    thresholds = THRESHOLDS[event.service]

    if event.status_code >= 500 and event.error_rate >= 0.10:
        return IncidentFinding(
            rule_name="high-error-rate",
            severity="critical",
            title=f"{event.service} is returning elevated 5xx errors",
            summary=(
                f"{event.service} reported HTTP {event.status_code} with "
                f"{event.error_rate:.1%} error rate."
            ),
        )

    if event.latency_ms >= thresholds.latency_critical_ms:
        return IncidentFinding(
            rule_name="critical-latency",
            severity="critical",
            title=f"{event.service} latency is critical",
            summary=(
                f"{event.service} latency reached {event.latency_ms} ms, "
                f"above the {thresholds.latency_critical_ms} ms critical threshold."
            ),
        )

    if event.latency_ms >= thresholds.latency_warning_ms:
        return IncidentFinding(
            rule_name="latency-warning",
            severity="warning",
            title=f"{event.service} latency is elevated",
            summary=(
                f"{event.service} latency reached {event.latency_ms} ms, "
                f"above the {thresholds.latency_warning_ms} ms warning threshold."
            ),
        )

    if event.cpu_percent >= 90:
        return IncidentFinding(
            rule_name="cpu-saturation",
            severity="warning",
            title=f"{event.service} CPU is saturated",
            summary=f"{event.service} CPU reached {event.cpu_percent:.1f}%.",
        )

    if event.memory_percent >= 90:
        return IncidentFinding(
            rule_name="memory-saturation",
            severity="warning",
            title=f"{event.service} memory is saturated",
            summary=f"{event.service} memory reached {event.memory_percent:.1f}%.",
        )

    return None


def record_telemetry_event(
    db: Session,
    *,
    redis_message_id: str,
    event: TelemetryEvent,
) -> TelemetryEventRecord | None:
    record = TelemetryEventRecord(
        event_id=event.event_id,
        redis_message_id=redis_message_id,
        timestamp=event.timestamp,
        service=event.service,
        health=event.health,
        latency_ms=event.latency_ms,
        status_code=event.status_code,
        error_rate=event.error_rate,
        requests_per_minute=event.requests_per_minute,
        cpu_percent=event.cpu_percent,
        memory_percent=event.memory_percent,
        message=event.message,
        raw_payload=event.model_dump_json(),
    )

    db.add(record)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return None

    return record


def open_or_update_incident(
    db: Session,
    *,
    event: TelemetryEvent,
    finding: IncidentFinding,
) -> IncidentRecord:
    active_incident = db.scalar(
        select(IncidentRecord)
        .where(IncidentRecord.status == "active")
        .where(IncidentRecord.service == event.service)
        .where(IncidentRecord.rule_name == finding.rule_name)
        .order_by(IncidentRecord.created_at.desc())
    )

    if active_incident is None:
        active_incident = IncidentRecord(
            service=event.service,
            title=finding.title,
            severity=finding.severity,
            status="active",
            rule_name=finding.rule_name,
            summary=finding.summary,
            first_seen_at=event.timestamp,
            last_seen_at=event.timestamp,
            event_count=1,
        )
        db.add(active_incident)
        db.flush()
        return active_incident

    active_incident.severity = finding.severity
    active_incident.title = finding.title
    active_incident.summary = finding.summary
    active_incident.last_seen_at = event.timestamp
    active_incident.event_count += 1
    db.flush()
    return active_incident


def record_and_detect(
    db: Session,
    *,
    redis_message_id: str,
    event: TelemetryEvent,
) -> IncidentRecord | None:
    record = record_telemetry_event(db, redis_message_id=redis_message_id, event=event)
    if record is None:
        return None

    finding = evaluate_telemetry(event)
    if finding is None:
        db.commit()
        return None

    incident = open_or_update_incident(db, event=event, finding=finding)
    db.commit()
    db.refresh(incident)
    return incident


async def run_incident_detector(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    client = build_redis_client()
    stream = TelemetryStream(client, settings.telemetry_stream_name)
    last_id = "$"

    try:
        while not stop_event.is_set():
            try:
                messages = await stream.read(last_id, count=20, block_ms=1000)
            except RedisError:
                await asyncio.sleep(1)
                continue

            if not messages:
                continue

            for message_id, event in messages:
                last_id = message_id
                with SessionLocal() as db:
                    record_and_detect(db, redis_message_id=message_id, event=event)
    finally:
        await client.aclose()
