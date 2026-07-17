import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from google import genai
from google.genai import types
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import PROJECT_ROOT, get_settings
from app.models import AgentTraceRecord, IncidentRecord, TelemetryEventRecord
from app.schemas import AgentTraceRead, IncidentRead


class RCAOutput(BaseModel):
    likely_root_cause: str
    confidence: float = Field(ge=0, le=1)
    evidence: list[str]
    affected_services: list[str]
    next_questions: list[str]


class RunbookOutput(BaseModel):
    selected_runbook: str
    match_reason: str
    relevant_excerpt: str
    key_steps: list[str]


class PlanOutput(BaseModel):
    objective: str
    proposed_steps: list[str]
    rollback_plan: str
    blast_radius: str
    human_approval_required: bool


class SafetyOutput(BaseModel):
    risk_level: str
    safe_to_present: bool
    blocked_actions: list[str]
    safety_notes: list[str]
    required_human_approval: bool


AGENT_SCHEMAS: dict[str, type[BaseModel]] = {
    "RCA Agent": RCAOutput,
    "Runbook Retrieval Agent": RunbookOutput,
    "Remediation Planner Agent": PlanOutput,
    "Safety Agent": SafetyOutput,
}


@dataclass(frozen=True)
class RunbookMatch:
    file_name: str
    title: str
    content: str
    score: int


def _json_default(value: Any) -> str:
    return str(value)


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


def _trace_to_read(record: AgentTraceRecord) -> AgentTraceRead:
    return AgentTraceRead(
        id=record.id,
        run_id=record.run_id,
        incident_id=record.incident_id,
        agent_name=record.agent_name,
        provider=record.provider,
        model=record.model,
        status=record.status,
        output=json.loads(record.output_payload),
        summary=record.summary,
        duration_ms=record.duration_ms,
        created_at=record.created_at,
    )


def list_agent_traces(db: Session, incident_id: str) -> list[AgentTraceRead]:
    records = db.scalars(
        select(AgentTraceRecord)
        .where(AgentTraceRecord.incident_id == incident_id)
        .order_by(AgentTraceRecord.created_at.desc())
        .limit(40)
    ).all()
    return [_trace_to_read(record) for record in records]


def _recent_telemetry(db: Session, service: str) -> list[dict[str, Any]]:
    records = db.scalars(
        select(TelemetryEventRecord)
        .where(TelemetryEventRecord.service == service)
        .order_by(TelemetryEventRecord.timestamp.desc())
        .limit(12)
    ).all()

    return [
        {
            "timestamp": record.timestamp.isoformat(),
            "service": record.service,
            "latency_ms": record.latency_ms,
            "status_code": record.status_code,
            "error_rate": record.error_rate,
            "requests_per_minute": record.requests_per_minute,
            "cpu_percent": record.cpu_percent,
            "memory_percent": record.memory_percent,
            "message": record.message,
        }
        for record in records
    ]


def _read_runbooks() -> list[RunbookMatch]:
    runbooks_dir = PROJECT_ROOT / "runbooks"
    matches: list[RunbookMatch] = []

    for path in sorted(runbooks_dir.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        title = content.splitlines()[0].lstrip("# ").strip() if content.splitlines() else path.stem
        matches.append(RunbookMatch(file_name=path.name, title=title, content=content, score=0))

    return matches


def _score_runbook(runbook: RunbookMatch, incident: IncidentRecord) -> RunbookMatch:
    haystack = f"{runbook.file_name} {runbook.title} {runbook.content}".lower()
    terms = [
        incident.service,
        incident.rule_name,
        "500" if "error" in incident.rule_name else "",
        "timeout" if "database" in incident.service or "latency" in incident.rule_name else "",
        "latency" if "latency" in incident.rule_name else "",
        "payment" if "payment" in incident.service else "",
    ]
    score = sum(3 for term in terms if term and term.lower() in haystack)
    return RunbookMatch(runbook.file_name, runbook.title, runbook.content, score)


def retrieve_runbooks(incident: IncidentRecord) -> list[RunbookMatch]:
    scored = [_score_runbook(runbook, incident) for runbook in _read_runbooks()]
    return sorted(scored, key=lambda runbook: runbook.score, reverse=True)


def _fallback_output(agent_name: str, context: dict[str, Any]) -> dict[str, Any]:
    incident = context["incident"]
    runbooks = context["runbooks"]
    selected = runbooks[0] if runbooks else {"file_name": "none", "content": ""}

    if agent_name == "RCA Agent":
        return RCAOutput(
            likely_root_cause=(
                f"{incident['service']} is breaching the deterministic rule "
                f"{incident['rule_name']} with recent telemetry confirming the condition."
            ),
            confidence=0.74,
            evidence=[
                incident["summary"],
                f"Detector observed {incident['event_count']} related event(s).",
                "Recent telemetry is persisted in SQLite for audit.",
            ],
            affected_services=[incident["service"]],
            next_questions=[
                "Did the dependency graph change in the last deployment?",
                "Are adjacent services showing correlated latency or error spikes?",
            ],
        ).model_dump()

    if agent_name == "Runbook Retrieval Agent":
        return RunbookOutput(
            selected_runbook=selected["file_name"],
            match_reason="Selected by keyword overlap with service, rule, and incident summary.",
            relevant_excerpt=selected["content"][:500],
            key_steps=[
                "Confirm the incident symptoms match the runbook.",
                "Check recent service metrics and dependency health.",
                "Prepare a remediation proposal for human review.",
            ],
        ).model_dump()

    if agent_name == "Remediation Planner Agent":
        return PlanOutput(
            objective=f"Restore healthy behavior for {incident['service']} without executing commands.",
            proposed_steps=[
                "Keep collecting telemetry until the error or latency pattern is stable.",
                "Compare the incident against the selected runbook.",
                "Draft a mock remediation action for the approval flow.",
            ],
            rollback_plan="Only demo state changes are allowed, so rollback is limited to action audit state.",
            blast_radius="Planning only; no production systems or local shell commands are touched.",
            human_approval_required=True,
        ).model_dump()

    return SafetyOutput(
        risk_level="medium",
        safe_to_present=True,
        blocked_actions=[
            "No shell remediation commands.",
            "No direct infrastructure changes.",
            "No executor action before human approval.",
        ],
        safety_notes=[
            "The plan is advisory only.",
            "All agent output is stored as an audit trace.",
        ],
        required_human_approval=True,
    ).model_dump()


class GeminiJsonClient:
    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def provider(self) -> str:
        return "gemini"

    @property
    def model(self) -> str:
        return self._settings.gemini_model

    def generate(self, *, agent_name: str, prompt: str, schema: type[BaseModel]) -> dict[str, Any]:
        if not self._settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        client = genai.Client(api_key=self._settings.gemini_api_key)
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=self._settings.gemini_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                        response_json_schema=schema.model_json_schema(),
                    ),
                )
                break
            except Exception as exc:  # noqa: BLE001 - retry transient model pressure.
                last_error = exc
                time.sleep(0.8 * (attempt + 1) + random.uniform(0, 0.4))
        else:
            raise RuntimeError(str(last_error) if last_error else "Gemini request failed")

        try:
            return schema.model_validate_json(response.text).model_dump()
        except ValidationError:
            return schema.model_validate(_extract_json(response.text)).model_dump()


def _extract_json(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Gemini response did not contain a JSON object")
    return json.loads(text[start : end + 1])


def _build_prompt(agent_name: str, context: dict[str, Any], previous_outputs: dict[str, Any]) -> str:
    return (
        "You are SentinelOps, an autonomous but safety-bounded cloud incident commander.\n"
        "Return only valid JSON matching the requested schema. Do not propose shell command execution.\n"
        "Never claim that remediation was executed; this step is analysis and planning only.\n\n"
        f"Agent: {agent_name}\n"
        f"Incident and telemetry context:\n{json.dumps(context, default=_json_default, indent=2)}\n\n"
        f"Previous agent outputs:\n{json.dumps(previous_outputs, default=_json_default, indent=2)}"
    )


def _summary(agent_name: str, output: dict[str, Any]) -> str:
    if agent_name == "RCA Agent":
        return str(output.get("likely_root_cause", "RCA completed"))
    if agent_name == "Runbook Retrieval Agent":
        return f"Selected {output.get('selected_runbook', 'a runbook')}"
    if agent_name == "Remediation Planner Agent":
        return str(output.get("objective", "Plan completed"))
    return f"Safety review: {output.get('risk_level', 'unknown')} risk"


def _save_trace(
    db: Session,
    *,
    run_id: str,
    incident_id: str,
    agent_name: str,
    provider: str,
    model: str,
    status: str,
    input_payload: dict[str, Any],
    output_payload: dict[str, Any],
    duration_ms: int,
) -> AgentTraceRead:
    trace = AgentTraceRecord(
        run_id=run_id,
        incident_id=incident_id,
        agent_name=agent_name,
        provider=provider,
        model=model,
        status=status,
        input_payload=json.dumps(input_payload, default=_json_default),
        output_payload=json.dumps(output_payload, default=_json_default),
        summary=_summary(agent_name, output_payload),
        duration_ms=duration_ms,
    )
    db.add(trace)
    db.commit()
    db.refresh(trace)
    return _trace_to_read(trace)


def run_agent_analysis(db: Session, incident_id: str) -> tuple[IncidentRead, list[AgentTraceRead], dict[str, Any]]:
    incident = db.get(IncidentRecord, incident_id)
    if incident is None:
        raise ValueError("Incident not found")

    telemetry = _recent_telemetry(db, incident.service)
    runbooks = retrieve_runbooks(incident)
    context = {
        "incident": _incident_to_read(incident).model_dump(),
        "recent_telemetry": telemetry,
        "runbooks": [
            {
                "file_name": runbook.file_name,
                "title": runbook.title,
                "score": runbook.score,
                "content": runbook.content[:1600],
            }
            for runbook in runbooks[:3]
        ],
    }

    settings = get_settings()
    llm = GeminiJsonClient()
    run_id = str(uuid4())
    traces: list[AgentTraceRead] = []
    outputs: dict[str, Any] = {}

    for agent_name, schema in AGENT_SCHEMAS.items():
        prompt = _build_prompt(agent_name, context, outputs)
        started = time.perf_counter()
        provider = llm.provider if settings.llm_provider == "gemini" else "fallback"
        model = llm.model if settings.llm_provider == "gemini" else "deterministic"
        status = "completed"

        try:
            if settings.llm_provider != "gemini":
                raise RuntimeError("LLM provider is not Gemini")
            output = llm.generate(agent_name=agent_name, prompt=prompt, schema=schema)
        except Exception as exc:  # noqa: BLE001 - fallback keeps the demo usable.
            provider = "fallback"
            model = "deterministic"
            status = "fallback"
            output = _fallback_output(agent_name, context)
            output["fallback_reason"] = str(exc)

        duration_ms = round((time.perf_counter() - started) * 1000)
        trace = _save_trace(
            db,
            run_id=run_id,
            incident_id=incident.id,
            agent_name=agent_name,
            provider=provider,
            model=model,
            status=status,
            input_payload={"prompt": prompt, "context": context},
            output_payload=output,
            duration_ms=duration_ms,
        )
        traces.append(trace)
        outputs[agent_name] = output

    return _incident_to_read(incident), traces, outputs
