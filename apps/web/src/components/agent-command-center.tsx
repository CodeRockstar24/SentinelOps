"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  analyzeIncident,
  approveAction,
  executeAction,
  fetchActions,
  fetchAgentTraces,
  fetchIncidents,
  fetchPostmortems,
  fetchTools,
  generatePostmortem,
  proposeAction,
  rejectAction,
  triggerDemoOutage,
  type AgentTrace,
  type IncidentAction,
  type Incident,
  type Postmortem,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const AGENT_STAGES = [
  {
    name: "RCA Agent",
    label: "Root Cause",
    icon: BrainCircuit,
    description: "Explains the most likely failure path from incident and telemetry.",
  },
  {
    name: "Runbook Retrieval Agent",
    label: "Runbook",
    icon: BookOpen,
    description: "Matches the incident to local Markdown runbooks.",
  },
  {
    name: "Remediation Planner Agent",
    label: "Plan",
    icon: ClipboardList,
    description: "Drafts safe next steps without execution.",
  },
  {
    name: "Safety Agent",
    label: "Safety",
    icon: ShieldCheck,
    description: "Flags risky actions and preserves human control.",
  },
] as const;

function severityTone(severity: Incident["severity"]) {
  return severity === "critical"
    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function traceTone(status?: AgentTrace["status"]) {
  if (status === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "fallback") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (status === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  return "border-border bg-card text-muted-foreground";
}

function formatTime(timestamp?: string) {
  if (!timestamp) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function latestRunTraces(traces: AgentTrace[]) {
  const latestRunId = traces[0]?.run_id;
  if (!latestRunId) {
    return [];
  }

  return traces.filter((trace) => trace.run_id === latestRunId).reverse();
}

function actionTone(status: IncidentAction["status"]) {
  if (status === "executed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "approved") {
    return "border-accent/30 bg-accent/10 text-accent";
  }

  if (status === "rejected" || status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function actionGuidance(action?: IncidentAction, incident?: Incident) {
  if (!incident) {
    return "Trigger a demo outage or select an incident to start the approval workflow.";
  }

  if (!action) {
    if (incident.status === "resolved") {
      return "This incident is already resolved. Trigger a new demo outage to start another approval cycle.";
    }

    return "Run the agents, then propose a demo-only action for human approval.";
  }

  if (action.status === "executed") {
    return "This action already executed. Approval and rejection are closed for audit integrity.";
  }

  if (incident.status === "resolved") {
    return "This incident is already resolved. Trigger a new demo outage to start another approval cycle.";
  }

  if (action.status === "proposed") {
    return "This action is waiting for a human decision. Approve or Reject are available now.";
  }

  if (action.status === "approved") {
    return "This action has human approval. Execute Mock is available; duplicate approval is locked.";
  }

  if (action.status === "rejected") {
    return "This action was rejected and is closed. Propose a new action on an active incident.";
  }

  return "This action failed and is closed. Propose a new action on an active incident.";
}

function postmortemTone(status: Postmortem["status"]) {
  if (status === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "fallback") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

export function AgentCommandCenter() {
  const queryClient = useQueryClient();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const incidentsQuery = useQuery({
    queryKey: ["incidents", "all"],
    queryFn: () => fetchIncidents("all"),
    refetchInterval: 3000,
  });

  const toolsQuery = useQuery({
    queryKey: ["tools"],
    queryFn: fetchTools,
  });

  const incidents = incidentsQuery.data?.incidents ?? [];

  useEffect(() => {
    if (!selectedIncidentId && incidents[0]) {
      setSelectedIncidentId(incidents[0].id);
    }
  }, [incidents, selectedIncidentId]);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0],
    [incidents, selectedIncidentId],
  );

  const tracesQuery = useQuery({
    queryKey: ["agent-traces", selectedIncident?.id],
    queryFn: () => fetchAgentTraces(selectedIncident!.id),
    enabled: Boolean(selectedIncident?.id),
    refetchInterval: 5000,
  });

  const actionsQuery = useQuery({
    queryKey: ["actions", selectedIncident?.id],
    queryFn: () => fetchActions(selectedIncident!.id),
    enabled: Boolean(selectedIncident?.id),
    refetchInterval: 3000,
  });

  const postmortemsQuery = useQuery({
    queryKey: ["postmortems", selectedIncident?.id],
    queryFn: () => fetchPostmortems(selectedIncident!.id),
    enabled: Boolean(selectedIncident?.id),
    refetchInterval: 5000,
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeIncident,
    onSuccess: async (_data, incidentId) => {
      await queryClient.invalidateQueries({ queryKey: ["agent-traces", incidentId] });
    },
  });

  const proposeMutation = useMutation({
    mutationFn: proposeAction,
    onSuccess: async (_data, incidentId) => {
      await queryClient.invalidateQueries({ queryKey: ["actions", incidentId] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: approveAction,
    onSuccess: async (action) => {
      await queryClient.invalidateQueries({ queryKey: ["actions", action.incident_id] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectAction,
    onSuccess: async (action) => {
      await queryClient.invalidateQueries({ queryKey: ["actions", action.incident_id] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: executeAction,
    onSuccess: async (action) => {
      await queryClient.invalidateQueries({ queryKey: ["actions", action.incident_id] });
      await queryClient.invalidateQueries({ queryKey: ["incidents", "all"] });
    },
  });

  const triggerOutageMutation = useMutation({
    mutationFn: triggerDemoOutage,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["incidents", "all"] });
      if (response.incident) {
        setSelectedIncidentId(response.incident.id);
        await queryClient.invalidateQueries({ queryKey: ["agent-traces", response.incident.id] });
        await queryClient.invalidateQueries({ queryKey: ["actions", response.incident.id] });
        await queryClient.invalidateQueries({ queryKey: ["postmortems", response.incident.id] });
      }
    },
  });

  const postmortemMutation = useMutation({
    mutationFn: generatePostmortem,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["postmortems", response.incident.id] });
    },
  });

  const traces = latestRunTraces(tracesQuery.data?.traces ?? []);
  const traceMap = new Map(traces.map((trace) => [trace.agent_name, trace]));
  const rca = traceMap.get("RCA Agent")?.output;
  const runbook = traceMap.get("Runbook Retrieval Agent")?.output;
  const plan = traceMap.get("Remediation Planner Agent")?.output;
  const safety = traceMap.get("Safety Agent")?.output;
  const actions = actionsQuery.data?.actions ?? [];
  const postmortems = postmortemsQuery.data?.postmortems ?? [];
  const activeTools = toolsQuery.data?.tools ?? [];
  const hasActiveIncident = incidents.some((incident) => incident.status === "active");

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Incident Queue</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Active and recovered incidents from deterministic detection.
            </p>
          </div>
          <AlertTriangle
            className={cn("h-5 w-5", incidents.length ? "text-red-700" : "text-primary")}
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            disabled={triggerOutageMutation.isPending}
            onClick={() => triggerOutageMutation.mutate()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-offset-2 focus:ring-offset-background disabled:cursor-wait disabled:opacity-50"
          >
            {triggerOutageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            Trigger Demo Outage
          </button>

          {triggerOutageMutation.isError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              {triggerOutageMutation.error instanceof Error
                ? triggerOutageMutation.error.message
                : "Unable to trigger the demo outage."}
            </div>
          ) : null}

          {!hasActiveIncident && incidents.length > 0 ? (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm leading-6 text-accent">
              Current incidents are resolved. Trigger a demo outage to create a fresh active incident
              with clickable approval controls.
            </div>
          ) : null}

          {incidents.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              No incidents yet. Trigger a demo outage to rehearse the incident flow.
            </div>
          ) : null}

          {incidents.map((incident) => (
            <button
              key={incident.id}
              type="button"
              onClick={() => setSelectedIncidentId(incident.id)}
              className={cn(
                "group w-full rounded-lg border p-4 text-left transition hover:border-primary hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
                selectedIncident?.id === incident.id
                  ? "border-primary bg-primary/10 shadow-glow"
                  : "border-border bg-card",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={severityTone(incident.severity)}>{incident.severity}</Badge>
                <Badge className="border-border bg-card text-foreground">{incident.status}</Badge>
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">{incident.title}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{incident.summary}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{incident.service}</span>
                <span className="text-right">{formatTime(incident.last_seen_at)}</span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="border-primary/30">
          <CardHeader className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary/25 bg-primary/10 text-primary">
                  Gemini Agents
                </Badge>
                <Badge className="border-accent/30 bg-accent/10 text-accent">
                  Step 6 postmortem ready
                </Badge>
              </div>
              <CardTitle className="mt-3 text-xl">
                {selectedIncident ? selectedIncident.title : "AI Incident Command"}
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {selectedIncident
                  ? selectedIncident.summary
                  : "Select or create an incident to launch the agent workflow."}
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedIncident || analyzeMutation.isPending}
              onClick={() => selectedIncident && analyzeMutation.mutate(selectedIncident.id)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              Run AI Agents
            </button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {AGENT_STAGES.map((stage) => {
                const trace = traceMap.get(stage.name);
                const Icon = stage.icon;

                return (
                  <div key={stage.name} className="rounded-lg border border-border bg-muted/35 p-4 transition hover:border-primary/50 hover:bg-muted/55">
                    <div className="flex items-center justify-between gap-3">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                      <Badge className={traceTone(trace?.status)}>{trace?.status ?? "waiting"}</Badge>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-foreground">{stage.label}</div>
                    <p className="mt-1 min-h-12 text-xs leading-5 text-muted-foreground">
                      {trace?.summary ?? stage.description}
                    </p>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {trace ? `${trace.provider} - ${trace.duration_ms} ms` : "Not run yet"}
                    </div>
                  </div>
                );
              })}
            </div>

            {analyzeMutation.isError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                {analyzeMutation.error instanceof Error
                  ? analyzeMutation.error.message
                  : "Agent analysis failed."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <OutputPanel
            icon={BrainCircuit}
            title="Root Cause Analysis"
            empty="Run agents to generate RCA."
            body={typeof rca?.likely_root_cause === "string" ? rca.likely_root_cause : undefined}
            items={asStringList(rca?.evidence)}
          />
          <OutputPanel
            icon={BookOpen}
            title="Runbook Retrieval"
            empty="Run agents to retrieve runbook context."
            body={
              typeof runbook?.selected_runbook === "string"
                ? `${runbook.selected_runbook}: ${String(runbook.match_reason ?? "")}`
                : undefined
            }
            items={asStringList(runbook?.key_steps)}
          />
          <OutputPanel
            icon={ClipboardList}
            title="Remediation Plan"
            empty="Run agents to draft a plan."
            body={typeof plan?.objective === "string" ? plan.objective : undefined}
            items={asStringList(plan?.proposed_steps)}
          />
          <OutputPanel
            icon={ShieldCheck}
            title="Safety Review"
            empty="Run agents to review risk."
            body={
              typeof safety?.risk_level === "string"
                ? `Risk level: ${safety.risk_level}. Human approval required.`
                : undefined
            }
            items={asStringList(safety?.safety_notes)}
          />
        </div>

        <ActionApprovalPanel
          actions={actions}
          toolsCount={activeTools.length}
          selectedIncident={selectedIncident}
          proposedSteps={asStringList(plan?.proposed_steps)}
          isProposing={proposeMutation.isPending}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          isExecuting={executeMutation.isPending}
          onPropose={() => selectedIncident && proposeMutation.mutate(selectedIncident.id)}
          onApprove={(actionId) => approveMutation.mutate(actionId)}
          onReject={(actionId) => rejectMutation.mutate(actionId)}
          onExecute={(actionId) => executeMutation.mutate(actionId)}
        />

        <PostmortemPanel
          selectedIncident={selectedIncident}
          latestAction={actions[0]}
          postmortems={postmortems}
          isGenerating={postmortemMutation.isPending}
          error={postmortemMutation.error}
          onGenerate={() => selectedIncident && postmortemMutation.mutate(selectedIncident.id)}
        />
      </div>
    </section>
  );
}

function PostmortemPanel({
  selectedIncident,
  latestAction,
  postmortems,
  isGenerating,
  error,
  onGenerate,
}: {
  selectedIncident?: Incident;
  latestAction?: IncidentAction;
  postmortems: Postmortem[];
  isGenerating: boolean;
  error: Error | null;
  onGenerate: () => void;
}) {
  const latestPostmortem = postmortems[0];
  const readyForFinalReport = selectedIncident?.status === "resolved" || latestAction?.status === "executed";

  return (
    <Card className="border-emerald-500/30">
      <CardHeader className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              Step 6 postmortem
            </Badge>
            {latestPostmortem ? (
              <Badge className={postmortemTone(latestPostmortem.status)}>
                {latestPostmortem.status}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="mt-3">AI Postmortem</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Generate an audit-ready incident report from telemetry, agent traces, approvals,
            and mock execution results.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedIncident || isGenerating}
          onClick={onGenerate}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          Generate Postmortem
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readyForFinalReport ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-700 dark:text-amber-300">
            Best demo flow: approve and execute the mock action first, then generate the final postmortem.
            You can still generate a draft before recovery.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {error.message}
          </div>
        ) : null}

        {!latestPostmortem ? (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/35 p-4 text-center text-sm text-muted-foreground">
            <FileText className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
            No postmortem generated yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={postmortemTone(latestPostmortem.status)}>
                  {latestPostmortem.provider}
                </Badge>
                <Badge className="border-border bg-muted text-foreground">
                  {latestPostmortem.model}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatTime(latestPostmortem.created_at)}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-foreground">
                {latestPostmortem.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {latestPostmortem.executive_summary}
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <PostmortemSection title="Impact" body={latestPostmortem.impact} />
              <PostmortemSection title="Root Cause" body={latestPostmortem.root_cause} />
              <PostmortemSection title="Resolution" body={latestPostmortem.resolution} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <PostmortemList title="Timeline" items={latestPostmortem.timeline} />
              <PostmortemList title="Follow-Up Items" items={latestPostmortem.follow_up_items} />
              <PostmortemList title="What Went Well" items={latestPostmortem.what_went_well} />
              <PostmortemList title="What To Improve" items={latestPostmortem.what_to_improve} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PostmortemSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function PostmortemList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-muted-foreground">No entries.</li>
        ) : null}
        {items.slice(0, 6).map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionApprovalPanel({
  actions,
  toolsCount,
  selectedIncident,
  proposedSteps,
  isProposing,
  isApproving,
  isRejecting,
  isExecuting,
  onPropose,
  onApprove,
  onReject,
  onExecute,
}: {
  actions: IncidentAction[];
  toolsCount: number;
  selectedIncident?: Incident;
  proposedSteps: string[];
  isProposing: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  isExecuting: boolean;
  onPropose: () => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  onExecute: (actionId: string) => void;
}) {
  const latestAction = actions[0];
  const guidance = actionGuidance(latestAction, selectedIncident);
  const canPropose = Boolean(selectedIncident) && selectedIncident?.status !== "resolved";

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Human approval required
            </Badge>
            <Badge className="border-border bg-card text-foreground">
              {toolsCount} tools registered
            </Badge>
          </div>
          <CardTitle className="mt-3">Mock Executor Approval</CardTitle>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Propose a demo-only action from the latest plan. Execution stays locked until approved.
          </p>
        </div>
        <button
          type="button"
          title={!canPropose ? guidance : undefined}
          disabled={!canPropose || isProposing}
          onClick={onPropose}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {isProposing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Wrench className="h-4 w-4" aria-hidden="true" />
          )}
          Propose Action
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm leading-6 text-accent">
          {guidance}
        </div>

        {proposedSteps.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/35 p-4">
            <div className="text-sm font-semibold text-foreground">Latest planner steps</div>
            <ul className="mt-3 space-y-2">
              {proposedSteps.slice(0, 4).map((step) => (
                <li key={step} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {actions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            No action proposed yet. Run agents first, then propose a demo-only action.
          </div>
        ) : null}

        {latestAction ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={actionTone(latestAction.status)}>{latestAction.status}</Badge>
                  <Badge className="border-border bg-muted text-foreground">
                    {latestAction.tool_name}
                  </Badge>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{latestAction.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {latestAction.description}
                </p>
              </div>
              <Rocket className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ActionButton
                label="Approve"
                icon={Check}
                disabled={latestAction.status !== "proposed" || isApproving}
                disabledReason="Approve is available only while the latest action is proposed."
                loading={isApproving}
                onClick={() => onApprove(latestAction.id)}
              />
              <ActionButton
                label="Reject"
                icon={XCircle}
                disabled={!["proposed", "approved"].includes(latestAction.status) || isRejecting}
                disabledReason="Reject is available only before the mock action executes."
                loading={isRejecting}
                onClick={() => onReject(latestAction.id)}
              />
              <ActionButton
                label="Execute Mock"
                icon={Rocket}
                disabled={latestAction.status !== "approved" || isExecuting}
                disabledReason="Execute Mock unlocks only after human approval."
                loading={isExecuting}
                onClick={() => onExecute(latestAction.id)}
              />
            </div>

            <div className="mt-4 grid gap-3 text-sm lg:grid-cols-2">
              <SmallStat label="Approval" value={latestAction.approved_by ?? "pending"} />
              <SmallStat label="Demo Only" value={String(latestAction.parameters.demo_only ?? true)} />
            </div>

            {latestAction.result ? (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-700 dark:text-emerald-300">
                {String(latestAction.result.message ?? "Mock execution completed.")}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  disabledReason,
  loading,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  disabled: boolean;
  disabledReason: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

function OutputPanel({
  icon: Icon,
  title,
  empty,
  body,
  items,
}: {
  icon: typeof Bot;
  title: string;
  empty: string;
  body?: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {body ? "Latest agent output" : empty}
          </p>
        </div>
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {body ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-foreground">{body}</p>
            <ul className="space-y-2">
              {items.slice(0, 5).map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/35 p-4 text-center text-sm text-muted-foreground">
            <Sparkles className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
            Waiting for analysis.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
