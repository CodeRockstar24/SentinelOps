from fastapi import APIRouter, Depends, HTTPException
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.incidents import evaluate_telemetry, record_and_detect
from app.models import IncidentRecord
from app.redis_client import build_redis_client
from app.schemas import DemoOutageResponse, IncidentRead
from app.telemetry import TelemetryStream, generate_payment_outage_telemetry


router = APIRouter(prefix="/demo", tags=["demo"])


def _to_incident_read(record: IncidentRecord) -> IncidentRead:
    return IncidentRead(
        id=record.id,
        service=record.service,
        title=record.title,
        severity=record.severity,
        status=record.status,
        rule_name=record.rule_name,
        summary=record.summary,
        first_seen_at=record.first_seen_at,
        last_seen_at=record.last_seen_at,
        event_count=record.event_count,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.post("/trigger-payment-outage", response_model=DemoOutageResponse)
async def trigger_payment_outage(db: Session = Depends(get_db)) -> DemoOutageResponse:
    settings = get_settings()
    client = build_redis_client()
    stream = TelemetryStream(client, settings.telemetry_stream_name)
    event = generate_payment_outage_telemetry()

    try:
        redis_message_id = await stream.append(event)
    except RedisError as exc:
        raise HTTPException(status_code=503, detail=f"Redis stream append failed: {exc}") from exc
    finally:
        await client.aclose()

    incident = record_and_detect(db, redis_message_id=redis_message_id, event=event)
    if incident is None:
        finding = evaluate_telemetry(event)
        if finding is not None:
            incident = db.scalar(
                select(IncidentRecord)
                .where(IncidentRecord.status == "active")
                .where(IncidentRecord.service == event.service)
                .where(IncidentRecord.rule_name == finding.rule_name)
                .order_by(IncidentRecord.last_seen_at.desc())
            )

    return DemoOutageResponse(
        message="Demo payment outage emitted to Redis and evaluated by the detector.",
        redis_message_id=redis_message_id,
        telemetry=event,
        incident=_to_incident_read(incident) if incident else None,
    )
