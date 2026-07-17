import json
import time
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agentic import GeminiJsonClient
from app.config import get_settings
from app.models import ActionRecord, AgentTraceRecord, IncidentRecord, PostmortemRecord, TelemetryEventRecord
from app.schemas import IncidentRead, PostmortemRead


class PostmortemOutput(BaseModel):
    title: str
    executive_summary: str
    root_cause: str
    impact: str
    resolution: str
    timeline: list[str]
    what_went_well: list[str]
    what_to_improve: list[str]
    follow_up_items: list[str]


def _json_default(value: Any) -> str:
    return str(value)


def _load_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _incident_to_read(record: IncidentRecord) -> IncidentRead:
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


def _postmortem_to_read(record: PostmortemRecord) -> PostmortemRead:
    return PostmortemRead(
        id=record.id,
        incident_id=record.incident_id,
        provider=record.provider,
        model=record.model,
        status=record.status,
        title=record.title,
        executive_summary=record.executive_summary,
        root_cause=record.root_cause,
        impact=record.impact,
        resolution=record.resolution,
        timeline=_load_json(record.timeline_payload, []),
        what_went_well=_load_json(record.what_went_well, []),
        what_to_improve=_load_json(record.what_to_improve, []),
        follow_up_items=_load_json(record.follow_up_items, []),
        markdown=record.markdown,
        created_at=record.created_at,
    )


def _recent_telemetry(db: Session, service: str) -> list[dict[str, Any]]:
    records = db.scalars(
        select(TelemetryEventRecord)
        .where(TelemetryEventRecord.service == service)
        .order_by(TelemetryEventRecord.timestamp.desc())
        .limit(16)
    ).all()

    return [
        {
            "timestamp": record.timestamp.isoformat(),
            "latency_ms": record.latency_ms,
            "status_code": record.status_code,
            "error_rate": record.error_rate,
            "requests_per_minute": record.requests_per_minute,
            "cpu_percent": record.cpu_percent,
            "memory_percent": record.memory_percent,
            "message": record.message,
        }
        for record in reversed(records)
    ]


def _latest_agent_traces(db: Session, incident_id: str) -> list[dict[str, Any]]:
    records = db.scalars(
        select(AgentTraceRecord)
        .where(AgentTraceRecord.incident_id == incident_id)
        .order_by(AgentTraceRecord.created_at.desc())
        .limit(20)
    ).all()
    if not records:
        return []

    latest_run_id = records[0].run_id
    return [
        {
            "agent_name": record.agent_name,
            "provider": record.provider,
            "model": record.model,
            "status": record.status,
            "summary": record.summary,
            "output": _load_json(record.output_payload, {}),
            "created_at": record.created_at.isoformat(),
        }
        for record in reversed(records)
        if record.run_id == latest_run_id
    ]


def _incident_actions(db: Session, incident_id: str) -> list[dict[str, Any]]:
    records = db.scalars(
        select(ActionRecord)
        .where(ActionRecord.incident_id == incident_id)
        .order_by(ActionRecord.created_at.asc())
        .limit(20)
    ).all()

    return [
        {
            "tool_name": record.tool_name,
            "title": record.title,
            "description": record.description,
            "status": record.status,
            "requires_approval": record.requires_approval,
            "proposed_by": record.proposed_by,
            "approved_by": record.approved_by,
            "approval_note": record.approval_note,
            "approved_at": record.approved_at.isoformat() if record.approved_at else None,
            "executed_at": record.executed_at.isoformat() if record.executed_at else None,
            "result": _load_json(record.result_payload, None),
            "created_at": record.created_at.isoformat(),
        }
        for record in records
    ]


def _build_context(db: Session, incident: IncidentRecord) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "incident": _incident_to_read(incident).model_dump(),
        "recent_telemetry": _recent_telemetry(db, incident.service),
        "agent_traces": _latest_agent_traces(db, incident.id),
        "actions": _incident_actions(db, incident.id),
        "safety_constraints": [
            "Executor is demo-only and must not run shell commands.",
            "Human approval is required before mock execution.",
            "No cloud resources or external production systems are modified.",
        ],
    }


def _build_prompt(context: dict[str, Any]) -> str:
    return (
        "You are SentinelOps writing a concise incident postmortem for a technical portfolio demo.\n"
        "Return only valid JSON matching the requested schema.\n"
        "Be factual from the provided context. Do not invent real customer impact, real money loss, "
        "real shell commands, or real infrastructure changes.\n"
        "If the incident was handled by the mock executor, say the recovery was demo-state only.\n\n"
        f"Context:\n{json.dumps(context, default=_json_default, indent=2)}"
    )


def _fallback_output(context: dict[str, Any], reason: str) -> dict[str, Any]:
    incident = context["incident"]
    actions = context["actions"]
    executed = next((action for action in actions if action["status"] == "executed"), None)
    resolution = (
        f"Mock executor completed {executed['tool_name']} after human approval. "
        "Only SentinelOps demo state was updated."
        if executed
        else "No executed remediation action is recorded yet; this is a draft postmortem."
    )

    return PostmortemOutput(
        title=f"Postmortem: {incident['title']}",
        executive_summary=(
            f"{incident['service']} triggered the {incident['rule_name']} detector and was tracked "
            f"as a {incident['severity']} incident. SentinelOps correlated telemetry, agent analysis, "
            "runbook context, approval state, and mock execution into this audit record."
        ),
        root_cause=(
            f"The deterministic detector observed {incident['summary']} Agent analysis attributes the "
            "failure mode to the same service-level signal rather than a confirmed external production cause."
        ),
        impact=(
            "Impact is limited to the local SentinelOps demo environment. No real customer records, "
            "payment systems, cloud resources, or shell commands were touched."
        ),
        resolution=resolution,
        timeline=[
            f"{incident['first_seen_at']}: Incident opened for {incident['service']}.",
            f"{incident['last_seen_at']}: Latest related telemetry observed.",
            f"{context['generated_at']}: Postmortem generated by SentinelOps.",
        ],
        what_went_well=[
            "Redis Streams and SSE kept telemetry visible in real time.",
            "Deterministic detection created an auditable incident.",
            "Agent outputs, approval, and mock execution were persisted for review.",
        ],
        what_to_improve=[
            "Add richer dependency correlation across services.",
            "Add persistent incident replay controls for demos.",
            "Replace simple runbook matching with vector retrieval after the MVP.",
        ],
        follow_up_items=[
            "Add operator notes to approval records.",
            "Add downloadable postmortem export.",
            "Add trend charts for incident windows.",
            "Verify live LLM quota before the final presentation if Gemini output is required.",
        ],
    ).model_dump()


def _markdown(output: dict[str, Any]) -> str:
    sections = [
        f"# {output['title']}",
        "## Executive Summary",
        output["executive_summary"],
        "## Impact",
        output["impact"],
        "## Root Cause",
        output["root_cause"],
        "## Resolution",
        output["resolution"],
        "## Timeline",
        "\n".join(f"- {item}" for item in output["timeline"]),
        "## What Went Well",
        "\n".join(f"- {item}" for item in output["what_went_well"]),
        "## What To Improve",
        "\n".join(f"- {item}" for item in output["what_to_improve"]),
        "## Follow-Up Items",
        "\n".join(f"- {item}" for item in output["follow_up_items"]),
    ]
    return "\n\n".join(sections)


def list_postmortems(db: Session, incident_id: str) -> list[PostmortemRead]:
    records = db.scalars(
        select(PostmortemRecord)
        .where(PostmortemRecord.incident_id == incident_id)
        .order_by(PostmortemRecord.created_at.desc())
        .limit(20)
    ).all()
    return [_postmortem_to_read(record) for record in records]


def generate_postmortem(db: Session, incident_id: str) -> tuple[IncidentRead, PostmortemRead]:
    incident = db.get(IncidentRecord, incident_id)
    if incident is None:
        raise ValueError("Incident not found")

    context = _build_context(db, incident)
    prompt = _build_prompt(context)
    settings = get_settings()
    provider = "fallback"
    model = "deterministic"
    status = "fallback"
    started = time.perf_counter()

    try:
        if settings.llm_provider != "gemini":
            raise RuntimeError("LLM provider is not Gemini")
        client = GeminiJsonClient()
        output = client.generate(agent_name="Postmortem Agent", prompt=prompt, schema=PostmortemOutput)
        provider = client.provider
        model = client.model
        status = "completed"
    except Exception as exc:  # noqa: BLE001 - postmortem fallback keeps the demo usable.
        output = _fallback_output(context, str(exc))

    PostmortemOutput.model_validate(output)
    output["generation_duration_ms"] = round((time.perf_counter() - started) * 1000)
    markdown = _markdown(output)

    record = PostmortemRecord(
        incident_id=incident.id,
        provider=provider,
        model=model,
        status=status,
        title=str(output["title"]),
        executive_summary=str(output["executive_summary"]),
        root_cause=str(output["root_cause"]),
        impact=str(output["impact"]),
        resolution=str(output["resolution"]),
        timeline_payload=json.dumps(output["timeline"], default=_json_default),
        what_went_well=json.dumps(output["what_went_well"], default=_json_default),
        what_to_improve=json.dumps(output["what_to_improve"], default=_json_default),
        follow_up_items=json.dumps(output["follow_up_items"], default=_json_default),
        markdown=markdown,
        input_payload=json.dumps({"prompt": prompt, "context": context}, default=_json_default),
        output_payload=json.dumps(output, default=_json_default),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _incident_to_read(incident), _postmortem_to_read(record)
