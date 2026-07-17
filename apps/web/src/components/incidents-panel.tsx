"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchIncidents, type Incident } from "@/lib/api";
import { cn } from "@/lib/utils";

function severityTone(severity: Incident["severity"]) {
  return severity === "critical"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function IncidentsPanel() {
  const incidentsQuery = useQuery({
    queryKey: ["incidents", "active"],
    queryFn: () => fetchIncidents("active"),
    refetchInterval: 3000,
  });

  const incidents = incidentsQuery.data?.incidents ?? [];
  const hasIncidents = incidents.length > 0;
  const Icon = hasIncidents ? Siren : CheckCircle2;

  return (
    <section className="grid gap-4">
      <Card className={cn(hasIncidents && "border-red-200")}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Incident Detection</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Deterministic rules backed by SQLite incident state.
            </p>
          </div>
          <Icon
            className={cn("h-5 w-5", hasIncidents ? "text-red-700" : "text-primary")}
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Active Incidents" value={String(incidents.length)} />
            <Metric label="Detector" value={incidentsQuery.isError ? "error" : "running"} />
            <Metric label="Storage" value="SQLite" />
          </div>

          {incidentsQuery.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {incidentsQuery.error instanceof Error
                ? incidentsQuery.error.message
                : "Unable to load incidents."}
            </div>
          ) : null}

          {hasIncidents ? (
            <div className="grid gap-3">
              {incidents.map((incident) => (
                <IncidentRow key={incident.id} incident={incident} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              No active incidents detected.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  return (
    <div className="rounded-md border border-border bg-muted/35 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={severityTone(incident.severity)}>{incident.severity}</Badge>
            <Badge className="border-border bg-card text-foreground">{incident.status}</Badge>
            <span className="text-sm font-medium text-muted-foreground">{incident.service}</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{incident.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{incident.summary}</p>
          </div>
        </div>
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <SmallStat label="Rule" value={incident.rule_name} />
        <SmallStat label="Events" value={String(incident.event_count)} />
        <SmallStat label="Last Seen" value={formatTime(incident.last_seen_at)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/45 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-semibold text-foreground">{value}</div>
    </div>
  );
}
