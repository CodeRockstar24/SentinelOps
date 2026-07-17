from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


DependencyStatus = Literal["healthy", "unhealthy"]
OverallStatus = Literal["healthy", "degraded"]
ServiceName = Literal["payment-service", "checkout-api", "database", "cache"]
ServiceHealth = Literal["healthy"]
IncidentSeverity = Literal["warning", "critical"]
IncidentStatus = Literal["active", "resolved"]
AgentTraceStatus = Literal["completed", "fallback", "error"]
ActionStatus = Literal["proposed", "approved", "rejected", "executed", "failed"]
PostmortemStatus = Literal["completed", "fallback", "error"]


class DependencyHealth(BaseModel):
    status: DependencyStatus
    detail: str


class HealthResponse(BaseModel):
    service: str
    version: str
    environment: str
    status: OverallStatus
    dependencies: dict[str, DependencyHealth]


class TelemetryEvent(BaseModel):
    event_id: str
    timestamp: datetime
    service: ServiceName
    health: ServiceHealth
    latency_ms: int
    status_code: int
    error_rate: float
    requests_per_minute: int
    cpu_percent: float
    memory_percent: float
    message: str


class IncidentRead(BaseModel):
    id: str
    service: str
    title: str
    severity: IncidentSeverity
    status: IncidentStatus
    rule_name: str
    summary: str
    first_seen_at: datetime
    last_seen_at: datetime
    event_count: int
    created_at: datetime
    updated_at: datetime


class IncidentListResponse(BaseModel):
    incidents: list[IncidentRead]


class DemoOutageResponse(BaseModel):
    message: str
    redis_message_id: str
    telemetry: TelemetryEvent
    incident: IncidentRead | None


class AgentTraceRead(BaseModel):
    id: str
    run_id: str
    incident_id: str
    agent_name: str
    provider: str
    model: str
    status: AgentTraceStatus
    output: dict[str, Any]
    summary: str
    duration_ms: int
    created_at: datetime


class AgentTraceListResponse(BaseModel):
    traces: list[AgentTraceRead]


class AgentAnalysisResponse(BaseModel):
    run_id: str
    incident: IncidentRead
    traces: list[AgentTraceRead]
    analysis: dict[str, Any]


class ToolRead(BaseModel):
    name: str
    label: str
    description: str
    risk_level: str
    approval_required: bool
    demo_only: bool


class ToolListResponse(BaseModel):
    tools: list[ToolRead]


class ActionRead(BaseModel):
    id: str
    incident_id: str
    tool_name: str
    title: str
    description: str
    parameters: dict[str, Any]
    safety_notes: list[str]
    status: ActionStatus
    requires_approval: bool
    proposed_by: str
    approved_by: str | None
    approval_note: str | None
    approved_at: datetime | None
    executed_at: datetime | None
    result: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class ActionListResponse(BaseModel):
    actions: list[ActionRead]


class ActionApprovalRequest(BaseModel):
    approved_by: str = "demo-commander"
    note: str | None = None


class ActionRejectRequest(BaseModel):
    rejected_by: str = "demo-commander"
    note: str | None = None


class PostmortemRead(BaseModel):
    id: str
    incident_id: str
    provider: str
    model: str
    status: PostmortemStatus
    title: str
    executive_summary: str
    root_cause: str
    impact: str
    resolution: str
    timeline: list[str]
    what_went_well: list[str]
    what_to_improve: list[str]
    follow_up_items: list[str]
    markdown: str
    created_at: datetime


class PostmortemListResponse(BaseModel):
    postmortems: list[PostmortemRead]


class PostmortemResponse(BaseModel):
    incident: IncidentRead
    postmortem: PostmortemRead
