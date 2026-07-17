import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActionRecord, AgentTraceRecord, IncidentRecord
from app.schemas import ActionRead, ToolRead


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    label: str
    description: str
    risk_level: str
    approval_required: bool = True
    demo_only: bool = True


TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "mock_enable_payment_circuit_breaker": ToolDefinition(
        name="mock_enable_payment_circuit_breaker",
        label="Enable Payment Circuit Breaker",
        description="Simulates graceful payment degradation and marks the incident recovered in demo state.",
        risk_level="medium",
    ),
    "mock_restart_service": ToolDefinition(
        name="mock_restart_service",
        label="Restart Demo Service",
        description="Simulates a service restart by updating SentinelOps demo state only.",
        risk_level="medium",
    ),
    "mock_warm_cache": ToolDefinition(
        name="mock_warm_cache",
        label="Warm Demo Cache",
        description="Simulates cache warmup without deleting Redis keys or touching infrastructure.",
        risk_level="low",
    ),
}


def list_tools() -> list[ToolRead]:
    return [
        ToolRead(
            name=tool.name,
            label=tool.label,
            description=tool.description,
            risk_level=tool.risk_level,
            approval_required=tool.approval_required,
            demo_only=tool.demo_only,
        )
        for tool in TOOL_REGISTRY.values()
    ]


def _json_default(value: Any) -> str:
    return str(value)


def _latest_trace_output(db: Session, incident_id: str, agent_name: str) -> dict[str, Any]:
    trace = db.scalar(
        select(AgentTraceRecord)
        .where(AgentTraceRecord.incident_id == incident_id)
        .where(AgentTraceRecord.agent_name == agent_name)
        .order_by(AgentTraceRecord.created_at.desc())
    )
    if trace is None:
        return {}

    return json.loads(trace.output_payload)


def _pick_tool(incident: IncidentRecord) -> ToolDefinition:
    if incident.service == "payment-service" and "error" in incident.rule_name:
        return TOOL_REGISTRY["mock_enable_payment_circuit_breaker"]
    if incident.service == "cache":
        return TOOL_REGISTRY["mock_warm_cache"]
    return TOOL_REGISTRY["mock_restart_service"]


def _action_to_read(record: ActionRecord) -> ActionRead:
    return ActionRead(
        id=record.id,
        incident_id=record.incident_id,
        tool_name=record.tool_name,
        title=record.title,
        description=record.description,
        parameters=json.loads(record.parameters_payload),
        safety_notes=json.loads(record.safety_notes),
        status=record.status,
        requires_approval=record.requires_approval,
        proposed_by=record.proposed_by,
        approved_by=record.approved_by,
        approval_note=record.approval_note,
        approved_at=record.approved_at,
        executed_at=record.executed_at,
        result=json.loads(record.result_payload) if record.result_payload else None,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def list_incident_actions(db: Session, incident_id: str) -> list[ActionRead]:
    records = db.scalars(
        select(ActionRecord)
        .where(ActionRecord.incident_id == incident_id)
        .order_by(ActionRecord.created_at.desc())
        .limit(40)
    ).all()
    return [_action_to_read(record) for record in records]


def propose_action(db: Session, incident_id: str) -> ActionRead:
    incident = db.get(IncidentRecord, incident_id)
    if incident is None:
        raise ValueError("Incident not found")

    plan = _latest_trace_output(db, incident_id, "Remediation Planner Agent")
    safety = _latest_trace_output(db, incident_id, "Safety Agent")
    tool = _pick_tool(incident)
    proposed_steps = plan.get("proposed_steps")
    safety_notes = safety.get("safety_notes")

    if not isinstance(proposed_steps, list):
        proposed_steps = [
            "Use the selected mock tool to update demo state only.",
            "Require human approval before executor runs.",
        ]
    if not isinstance(safety_notes, list):
        safety_notes = [
            "No shell commands are allowed.",
            "Executor only changes SentinelOps SQLite demo state.",
            "Human approval is required before execution.",
        ]

    action = ActionRecord(
        incident_id=incident.id,
        tool_name=tool.name,
        title=f"{tool.label} for {incident.service}",
        description=str(plan.get("objective") or "Prepare a safe demo-only remediation action."),
        parameters_payload=json.dumps(
            {
                "incident_id": incident.id,
                "service": incident.service,
                "rule_name": incident.rule_name,
                "demo_only": True,
                "proposed_steps": proposed_steps,
            },
            default=_json_default,
        ),
        safety_notes=json.dumps([str(note) for note in safety_notes], default=_json_default),
        status="proposed",
        requires_approval=True,
        proposed_by="Remediation Planner Agent",
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return _action_to_read(action)


def approve_action(db: Session, action_id: str, *, approved_by: str, note: str | None) -> ActionRead:
    action = db.get(ActionRecord, action_id)
    if action is None:
        raise ValueError("Action not found")
    if action.status != "proposed":
        raise RuntimeError("Only proposed actions can be approved")

    action.status = "approved"
    action.approved_by = approved_by
    action.approval_note = note
    action.approved_at = datetime.now(UTC)
    db.commit()
    db.refresh(action)
    return _action_to_read(action)


def reject_action(db: Session, action_id: str, *, rejected_by: str, note: str | None) -> ActionRead:
    action = db.get(ActionRecord, action_id)
    if action is None:
        raise ValueError("Action not found")
    if action.status not in {"proposed", "approved"}:
        raise RuntimeError("Only proposed or approved actions can be rejected")

    action.status = "rejected"
    action.approved_by = rejected_by
    action.approval_note = note
    db.commit()
    db.refresh(action)
    return _action_to_read(action)


def execute_action(db: Session, action_id: str) -> ActionRead:
    action = db.get(ActionRecord, action_id)
    if action is None:
        raise ValueError("Action not found")
    if action.status != "approved":
        raise PermissionError("Human approval is required before execution")
    if action.tool_name not in TOOL_REGISTRY:
        raise RuntimeError("Tool is not registered")

    incident = db.get(IncidentRecord, action.incident_id)
    if incident is None:
        raise ValueError("Incident not found")

    now = datetime.now(UTC)
    previous_status = incident.status
    incident.status = "resolved"
    incident.summary = f"{incident.summary} Mock recovery executed by {action.tool_name}."
    incident.updated_at = now

    action.status = "executed"
    action.executed_at = now
    action.result_payload = json.dumps(
        {
            "executor": "mock-executor",
            "tool_name": action.tool_name,
            "demo_only": True,
            "shell_commands_executed": False,
            "incident_status_before": previous_status,
            "incident_status_after": incident.status,
            "message": "Demo state updated. No external systems, shell commands, or cloud resources were touched.",
        }
    )
    db.commit()
    db.refresh(action)
    return _action_to_read(action)
