"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CheckCircle2,
  Command,
  Database,
  Gauge,
  Moon,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";

import { AgentCommandCenter } from "@/components/agent-command-center";
import { LiveTelemetry } from "@/components/live-telemetry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL, fetchHealth, type DependencyHealth, type HealthResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const dependencyMeta = {
  sqlite: {
    label: "SQLite",
    description: "Local audit database",
    icon: Database,
  },
  redis: {
    label: "Redis/Memurai",
    description: "Real-time event backbone",
    icon: RadioTower,
  },
} as const;

const demoFlow = [
  "Live telemetry",
  "Incident detection",
  "Gemini agents",
  "Approval gate",
  "Mock recovery",
  "AI postmortem",
];

type DashboardView = "command" | "telemetry" | "systems";
type ThemeMode = "light" | "dark";

function statusTone(status: HealthResponse["status"] | DependencyHealth["status"]) {
  if (status === "healthy") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "degraded") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

export function HealthDashboard() {
  const [view, setView] = useState<DashboardView>("command");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("sentinelops-theme") as ThemeMode | null;
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(savedTheme ?? preferredTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("sentinelops-theme", theme);
  }, [theme]);

  const health = healthQuery.data;
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  const healthStatus = health?.status ?? "checking";
  const statusLabel = health?.status === "healthy" ? "Systems nominal" : "Watching dependencies";

  const viewTitle = useMemo(() => {
    if (view === "telemetry") {
      return "Realtime telemetry fabric";
    }
    if (view === "systems") {
      return "System readiness";
    }
    return "Agentic incident command";
  }, [view]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-shell text-shell-foreground lg:flex lg:flex-col">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 shadow-glow">
                <Command className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <div className="text-base font-semibold">SentinelOps</div>
                <div className="mt-0.5 text-xs text-white/55">Incident command OS</div>
              </div>
            </div>
          </div>

          <nav className="space-y-1 p-3">
            <RailButton active={view === "command"} icon={Bot} label="AI Command" onClick={() => setView("command")} />
            <RailButton active={view === "telemetry"} icon={Gauge} label="Live Telemetry" onClick={() => setView("telemetry")} />
            <RailButton active={view === "systems"} icon={Database} label="Systems" onClick={() => setView("systems")} />
          </nav>

          <div className="mt-2 px-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                Demo Pipeline
              </div>
              <div className="mt-4 space-y-3">
                {demoFlow.map((item, index) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-[11px] text-white/65">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-white/10 p-5">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Safety bounded
              </div>
              <p className="mt-2 text-xs leading-5 text-white/60">
                Mock executor only updates demo state. No shell remediation.
              </p>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/80 bg-background/88 backdrop-blur-xl">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card lg:hidden">
                  <Command className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">SentinelOps</div>
                  <div className="truncate text-xs text-muted-foreground">{viewTitle}</div>
                </div>
              </div>

              <div className="hidden min-w-0 flex-1 justify-center md:flex">
                <div className="flex h-10 w-full max-w-xl items-center gap-3 rounded-lg border border-border bg-card/80 px-3 text-sm text-muted-foreground shadow-sm">
                  <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="truncate">Trigger outage, run agents, approve recovery, generate postmortem</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={statusTone(health?.status ?? "degraded")}>{healthStatus}</Badge>
                <IconButton
                  label="Refresh health"
                  onClick={() => void healthQuery.refetch()}
                  active={healthQuery.isFetching}
                  icon={RefreshCw}
                />
                <button
                  type="button"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[1540px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
            <section className="overflow-hidden rounded-lg border border-border/80 bg-card/95 shadow-panel backdrop-blur">
              <div className="grid gap-0 lg:grid-cols-[1fr_420px]">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-primary/30 bg-primary/10 text-primary">Live MVP</Badge>
                    <Badge className="border-accent/30 bg-accent/10 text-accent">Agentic workflow</Badge>
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      Human approval
                    </Badge>
                  </div>
                  <div className="mt-5">
                    <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-5xl">
                      SentinelOps
                    </h1>
                    <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
                      A real-time incident command center where telemetry, agents, runbooks,
                      approvals, mock execution, and postmortems stay in one focused workspace.
                    </p>
                  </div>
                </div>

                <div className="border-t border-border bg-muted/35 p-5 lg:border-l lg:border-t-0">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <CompactMetric icon={Activity} label="API" value={statusLabel} />
                    <CompactMetric icon={RadioTower} label="Stream" value="Redis Streams + SSE" />
                    <CompactMetric icon={Bot} label="Agents" value="Gemini with fallback" />
                    <CompactMetric icon={ShieldCheck} label="Guardrail" value="Approve before execute" />
                  </div>
                </div>
              </div>
            </section>

            <nav className="grid gap-2 rounded-lg border border-border/80 bg-card/90 p-2 shadow-panel backdrop-blur sm:grid-cols-3 lg:hidden">
              <ViewButton active={view === "command"} icon={Bot} label="AI Command" onClick={() => setView("command")} />
              <ViewButton active={view === "telemetry"} icon={Gauge} label="Live Telemetry" onClick={() => setView("telemetry")} />
              <ViewButton active={view === "systems"} icon={Database} label="Systems" onClick={() => setView("systems")} />
            </nav>

            <div className="hidden grid-cols-3 gap-3 lg:grid">
              <ViewButton active={view === "command"} icon={Bot} label="AI Command" onClick={() => setView("command")} />
              <ViewButton active={view === "telemetry"} icon={Gauge} label="Live Telemetry" onClick={() => setView("telemetry")} />
              <ViewButton active={view === "systems"} icon={Database} label="Systems" onClick={() => setView("systems")} />
            </div>

            {view === "command" ? <AgentCommandCenter /> : null}
            {view === "telemetry" ? <LiveTelemetry /> : null}

            {view === "systems" ? (
              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>Backend Health</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">API target: {API_BASE_URL}</p>
                    </div>
                    <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {health ? (
                      <>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge className={statusTone(health.status)}>{health.status}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {health.service} v{health.version} in {health.environment}
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Metric label="Service" value={health.service} />
                          <Metric label="Version" value={health.version} />
                          <Metric label="Checked" value={generatedAt} />
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                        {healthQuery.isLoading
                          ? "Checking backend health..."
                          : healthQuery.error instanceof Error
                            ? healthQuery.error.message
                            : "Unable to reach the backend health endpoint."}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Demo Flow</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                    {demoFlow.map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            ) : null}

            {view === "systems" ? (
              <section className="grid gap-4 md:grid-cols-2">
                {Object.entries(dependencyMeta).map(([key, meta]) => {
                  const dependency = health?.dependencies[key];
                  const Icon = meta.icon;

                  return (
                    <Card key={key}>
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle>{meta.label}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
                        </div>
                        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Badge className={statusTone(dependency?.status ?? "unhealthy")}>
                          {dependency?.status ?? "unknown"}
                        </Badge>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {dependency?.detail ?? "Waiting for backend health data."}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function RailButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary",
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-white/65 hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-white/50")} aria-hidden="true" />
      {label}
    </button>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
        active
          ? "border-primary/30 bg-primary text-primary-foreground shadow-glow"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof RefreshCw;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
      aria-label={label}
      title={label}
    >
      <Icon className={cn("h-4 w-4", active && "animate-spin")} aria-hidden="true" />
    </button>
  );
}

function CompactMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card/70 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/45 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
