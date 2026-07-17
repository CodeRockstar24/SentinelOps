# SentinelOps Project Brief

## Tagline

Real-time agentic cloud incident commander.

## Summary

SentinelOps is a full-stack AI operations platform that simulates the lifecycle of a cloud service incident. It streams telemetry, detects service degradation, coordinates multiple AI agents, retrieves runbooks, enforces human approval, executes safe mock remediation, and generates an incident postmortem.

## Problem

Incident response often requires engineers to jump between telemetry dashboards, logs, runbooks, tickets, chat threads, and postmortem tools. AI can help, but it must be bounded by deterministic detection, approval workflows, and auditability.

## Solution

SentinelOps centralizes the incident workflow into one command center:

- Real-time telemetry establishes current system state.
- Deterministic rules open verified incidents.
- AI agents reason over incident context.
- Local runbooks ground recommendations.
- Humans approve or reject proposed actions.
- A mock executor performs safe demo-state recovery.
- AI generates a postmortem from stored audit records.

## Technical Highlights

- Event-driven telemetry with Redis Streams.
- Live frontend updates with Server-Sent Events.
- FastAPI backend with modular routers and SQLAlchemy persistence.
- Multi-agent AI workflow using Gemini structured outputs.
- Deterministic fallback when LLM quota is unavailable.
- Markdown runbook retrieval abstraction.
- Human-in-the-loop safety gate.
- Mock executor with no shell command execution.
- SQLite audit trail for incidents, agent traces, actions, and postmortems.
- Dark-mode Next.js command center.

## Safety Boundaries

SentinelOps is designed to show responsible AI automation patterns:

- AI agents cannot execute actions directly.
- Human approval is required for every remediation action.
- The executor only changes local demo state.
- Shell commands are never executed.
- Cloud infrastructure is never modified.
- Every output and action is auditable.

## What Makes It Resume-Worthy

SentinelOps combines real-time systems, backend API design, frontend product engineering, database modeling, AI orchestration, retrieval-based reasoning, safety controls, and incident-response workflow design into a complete end-to-end product.
