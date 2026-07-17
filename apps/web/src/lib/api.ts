export type DependencyHealth = {
  status: "healthy" | "unhealthy";
  detail: string;
};

export type HealthResponse = {
  service: string;
  version: string;
  environment: string;
  status: "healthy" | "degraded";
  dependencies: Record<string, DependencyHealth>;
};

export type ServiceName = "payment-service" | "checkout-api" | "database" | "cache";

export type TelemetryEvent = {
  event_id: string;
  timestamp: string;
  service: ServiceName;
  health: "healthy";
  latency_ms: number;
  status_code: number;
  error_rate: number;
  requests_per_minute: number;
  cpu_percent: number;
  memory_percent: number;
  message: string;
};

export type Incident = {
  id: string;
  service: ServiceName;
  title: string;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  rule_name: string;
  summary: string;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  created_at: string;
  updated_at: string;
};

export type IncidentListResponse = {
  incidents: Incident[];
};

export type DemoOutageResponse = {
  message: string;
  redis_message_id: string;
  telemetry: TelemetryEvent;
  incident: Incident | null;
};

export type AgentTraceStatus = "completed" | "fallback" | "error";

export type AgentTrace = {
  id: string;
  run_id: string;
  incident_id: string;
  agent_name: "RCA Agent" | "Runbook Retrieval Agent" | "Remediation Planner Agent" | "Safety Agent";
  provider: string;
  model: string;
  status: AgentTraceStatus;
  output: Record<string, unknown>;
  summary: string;
  duration_ms: number;
  created_at: string;
};

export type AgentAnalysisResponse = {
  run_id: string;
  incident: Incident;
  traces: AgentTrace[];
  analysis: Record<string, Record<string, unknown>>;
};

export type AgentTraceListResponse = {
  traces: AgentTrace[];
};

export type Tool = {
  name: string;
  label: string;
  description: string;
  risk_level: string;
  approval_required: boolean;
  demo_only: boolean;
};

export type ToolListResponse = {
  tools: Tool[];
};

export type ActionStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";

export type IncidentAction = {
  id: string;
  incident_id: string;
  tool_name: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  safety_notes: string[];
  status: ActionStatus;
  requires_approval: boolean;
  proposed_by: string;
  approved_by: string | null;
  approval_note: string | null;
  approved_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ActionListResponse = {
  actions: IncidentAction[];
};

export type Postmortem = {
  id: string;
  incident_id: string;
  provider: string;
  model: string;
  status: "completed" | "fallback" | "error";
  title: string;
  executive_summary: string;
  root_cause: string;
  impact: string;
  resolution: string;
  timeline: string[];
  what_went_well: string[];
  what_to_improve: string[];
  follow_up_items: string[];
  markdown: string;
  created_at: string;
};

export type PostmortemListResponse = {
  postmortems: Postmortem[];
};

export type PostmortemResponse = {
  incident: Incident;
  postmortem: Postmortem;
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
  });

  const body = (await response.json()) as HealthResponse;

  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }

  return body;
}

export function telemetryStreamUrl() {
  return `${API_BASE_URL}/telemetry/stream`;
}

export async function fetchIncidents(status: "active" | "resolved" | "all" = "active") {
  const response = await fetch(`${API_BASE_URL}/incidents?status=${status}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Incident check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as IncidentListResponse;
}

export async function triggerDemoOutage() {
  const response = await fetch(`${API_BASE_URL}/demo/trigger-payment-outage`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Demo outage trigger failed with HTTP ${response.status}`);
  }

  return (await response.json()) as DemoOutageResponse;
}

export async function analyzeIncident(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/analyze`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Agent analysis failed with HTTP ${response.status}`);
  }

  return (await response.json()) as AgentAnalysisResponse;
}

export async function fetchAgentTraces(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/agent-traces`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Agent trace check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as AgentTraceListResponse;
}

export async function fetchTools() {
  const response = await fetch(`${API_BASE_URL}/tools`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tool registry check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as ToolListResponse;
}

export async function fetchActions(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/actions`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Action check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as ActionListResponse;
}

export async function proposeAction(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/actions/propose`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Action proposal failed with HTTP ${response.status}`);
  }

  return (await response.json()) as IncidentAction;
}

export async function approveAction(actionId: string) {
  const response = await fetch(`${API_BASE_URL}/actions/${actionId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      approved_by: "demo-commander",
      note: "Approved in SentinelOps dashboard",
    }),
  });

  if (!response.ok) {
    throw new Error(`Action approval failed with HTTP ${response.status}`);
  }

  return (await response.json()) as IncidentAction;
}

export async function rejectAction(actionId: string) {
  const response = await fetch(`${API_BASE_URL}/actions/${actionId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rejected_by: "demo-commander",
      note: "Rejected in SentinelOps dashboard",
    }),
  });

  if (!response.ok) {
    throw new Error(`Action rejection failed with HTTP ${response.status}`);
  }

  return (await response.json()) as IncidentAction;
}

export async function executeAction(actionId: string) {
  const response = await fetch(`${API_BASE_URL}/actions/${actionId}/execute`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Action execution failed with HTTP ${response.status}`);
  }

  return (await response.json()) as IncidentAction;
}

export async function fetchPostmortems(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/postmortems`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Postmortem check failed with HTTP ${response.status}`);
  }

  return (await response.json()) as PostmortemListResponse;
}

export async function generatePostmortem(incidentId: string) {
  const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/postmortems`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Postmortem generation failed with HTTP ${response.status}`);
  }

  return (await response.json()) as PostmortemResponse;
}
