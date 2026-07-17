# SentinelOps Demo Script

Target length: 60 to 90 seconds.

## Click Path

1. Open `http://localhost:3000`.
2. Show the SentinelOps command center.
3. Go to Systems and confirm backend, SQLite, and Redis are healthy.
4. Go to Live Telemetry and show service metrics updating.
5. Go to AI Command.
6. Click Trigger Demo Outage.
7. Select the active payment-service incident.
8. Click Run AI Agents.
9. Show RCA, runbook retrieval, remediation plan, and safety review.
10. Click Propose Action.
11. Click Approve.
12. Click Execute Mock.
13. Click Generate Postmortem.
14. Show summary, impact, root cause, resolution, timeline, and follow-up items.

## Voiceover Script

SentinelOps is a real-time agentic cloud incident commander built to simulate how modern engineering teams detect, reason about, and safely respond to production incidents.

The system uses a Next.js command center on the frontend and a FastAPI backend with Redis Streams for real-time telemetry, Server-Sent Events for live updates, and SQLite for audit persistence.

Here, the system is healthy and live telemetry is streaming across payment, checkout, database, and cache services.

Now I will trigger a controlled payment-service outage. This injects a synthetic 5xx error spike into the Redis telemetry stream. SentinelOps uses deterministic detection rules to open an incident, so the AI is not deciding whether an outage exists. The AI reasons over a verified incident.

Next, I run the AI incident agents. The RCA agent identifies likely root cause, the runbook retrieval agent pulls relevant Markdown runbook context, the remediation planner proposes a safe recovery path, and the safety agent reviews risk and enforces human approval.

The system then proposes a demo-only remediation action through a registered tool. Execution is blocked until a human approves it. After approval, the mock executor updates only local demo state. It never runs shell commands, never touches cloud infrastructure, and preserves an audit trail.

Finally, SentinelOps generates an AI postmortem from the incident, telemetry, agent traces, approval record, and execution result.

This project demonstrates event-driven architecture, real-time observability, LLM orchestration, retrieval-based reasoning, human-in-the-loop safety, and production-inspired incident response design in one end-to-end workflow.

## What To Emphasize

- The incident is opened by deterministic rules, not by an LLM.
- Agents provide reasoning, context, planning, and safety review.
- Human approval is mandatory.
- The executor is mock-only and safe.
- Every stage is auditable.
- The postmortem is generated from real stored incident context.
