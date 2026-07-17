"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Gauge, RadioTower, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { telemetryStreamUrl, type ServiceName, type TelemetryEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

const SERVICES: ServiceName[] = ["payment-service", "checkout-api", "database", "cache"];

const SERVICE_LABELS: Record<ServiceName, string> = {
  "payment-service": "Payment Service",
  "checkout-api": "Checkout API",
  database: "Database",
  cache: "Cache",
};

function connectionTone(state: ConnectionState) {
  if (state === "connected") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (state === "connecting" || state === "reconnecting") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
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

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function LiveTelemetry() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const source = new EventSource(telemetryStreamUrl());

    source.onopen = () => {
      setConnectionState("connected");
    };

    source.addEventListener("telemetry", (message) => {
      const event = JSON.parse(message.data as string) as TelemetryEvent;
      setConnectionState("connected");
      setEvents((current) => [event, ...current].slice(0, 40));
    });

    source.addEventListener("error", () => {
      setConnectionState("reconnecting");
    });

    source.onerror = () => {
      setConnectionState(source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    };

    return () => {
      source.close();
      setConnectionState("disconnected");
    };
  }, []);

  const latestByService = useMemo(() => {
    return SERVICES.map((service) => ({
      service,
      event: events.find((event) => event.service === service),
    }));
  }, [events]);

  const averageLatency = useMemo(() => {
    if (events.length === 0) {
      return 0;
    }

    return Math.round(
      events.reduce((total, event) => total + event.latency_ms, 0) / events.length,
    );
  }, [events]);

  const Icon = connectionState === "connected" ? Wifi : WifiOff;

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Live Telemetry</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Synthetic payment-domain service metrics streaming through Redis and SSE.
            </p>
          </div>
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={connectionTone(connectionState)}>{connectionState}</Badge>
            <span className="text-sm text-muted-foreground">
              {events.length} events buffered in this browser session
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={Activity} label="Stream" value="telemetry:events" />
            <Metric icon={Gauge} label="Average Latency" value={`${averageLatency} ms`} />
            <Metric icon={Clock3} label="Latest Event" value={formatTime(events[0]?.timestamp)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        {latestByService.map(({ service, event }) => (
          <ServiceTelemetryCard key={service} service={service} event={event} />
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Recent Events</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Most recent telemetry received by the browser.
            </p>
          </div>
          <RadioTower className="h-5 w-5 text-primary" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Time</th>
                  <th className="py-2 pr-3 font-semibold">Service</th>
                  <th className="py-2 pr-3 font-semibold">Latency</th>
                  <th className="py-2 pr-3 font-semibold">Code</th>
                  <th className="py-2 pr-3 font-semibold">Error Rate</th>
                  <th className="py-2 pr-3 font-semibold">RPM</th>
                  <th className="py-2 pr-3 font-semibold">CPU</th>
                  <th className="py-2 font-semibold">Memory</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((event) => (
                  <tr key={event.event_id} className="border-b border-border/70 transition hover:bg-muted/45">
                    <td className="py-2 pr-3 text-muted-foreground">{formatTime(event.timestamp)}</td>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {SERVICE_LABELS[event.service]}
                    </td>
                    <td className="py-2 pr-3">{event.latency_ms} ms</td>
                    <td className="py-2 pr-3">{event.status_code}</td>
                    <td className="py-2 pr-3">{percent(event.error_rate)}</td>
                    <td className="py-2 pr-3">{event.requests_per_minute}</td>
                    <td className="py-2 pr-3">{event.cpu_percent.toFixed(1)}%</td>
                    <td className="py-2">{event.memory_percent.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {events.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/45 p-4 text-sm text-muted-foreground">
              Waiting for the first telemetry event.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ServiceTelemetryCard({
  service,
  event,
}: {
  service: ServiceName;
  event?: TelemetryEvent;
}) {
  const latency = event?.latency_ms ?? 0;
  const latencyWidth = Math.min(Math.round((latency / 250) * 100), 100);

  return (
    <Card className="transition hover:border-primary/40">
      <CardHeader>
        <CardTitle>{SERVICE_LABELS[service]}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{event ? formatTime(event.timestamp) : "-"}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            {event?.health ?? "waiting"}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{event?.status_code ?? "-"}</span>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Latency</span>
            <span className="font-semibold text-foreground">{event ? `${latency} ms` : "-"}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${latencyWidth}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <SmallStat label="RPM" value={event ? String(event.requests_per_minute) : "-"} />
          <SmallStat label="Errors" value={event ? percent(event.error_rate) : "-"} />
          <SmallStat label="CPU" value={event ? `${event.cpu_percent.toFixed(1)}%` : "-"} />
          <SmallStat label="Memory" value={event ? `${event.memory_percent.toFixed(1)}%` : "-"} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-muted/45 p-3">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/45 p-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}
