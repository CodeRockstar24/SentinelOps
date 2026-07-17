from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agentic import list_agent_traces, run_agent_analysis
from app.database import get_db
from app.models import IncidentRecord
from app.schemas import AgentAnalysisResponse, AgentTraceListResponse, IncidentListResponse, IncidentRead


router = APIRouter(prefix="/incidents", tags=["incidents"])


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


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    status: Literal["active", "resolved", "all"] = Query(default="active"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> IncidentListResponse:
    statement = select(IncidentRecord).order_by(IncidentRecord.last_seen_at.desc()).limit(limit)

    if status != "all":
        statement = statement.where(IncidentRecord.status == status)

    records = db.scalars(statement).all()
    return IncidentListResponse(incidents=[_to_incident_read(record) for record in records])


@router.get("/{incident_id}", response_model=IncidentRead)
async def get_incident(incident_id: str, db: Session = Depends(get_db)) -> IncidentRead:
    record = db.get(IncidentRecord, incident_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    return _to_incident_read(record)


@router.post("/{incident_id}/analyze", response_model=AgentAnalysisResponse)
async def analyze_incident(incident_id: str, db: Session = Depends(get_db)) -> AgentAnalysisResponse:
    try:
        incident, traces, analysis = run_agent_analysis(db, incident_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return AgentAnalysisResponse(run_id=traces[0].run_id, incident=incident, traces=traces, analysis=analysis)


@router.get("/{incident_id}/agent-traces", response_model=AgentTraceListResponse)
async def get_incident_agent_traces(
    incident_id: str,
    db: Session = Depends(get_db),
) -> AgentTraceListResponse:
    if db.get(IncidentRecord, incident_id) is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    return AgentTraceListResponse(traces=list_agent_traces(db, incident_id))
