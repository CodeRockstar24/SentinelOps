# Database Timeout

## Symptoms

- `database` latency rises sharply.
- Application services report timeout-like errors.
- Request queues or retries may increase CPU and memory usage.

## Likely Causes

- Slow query or missing index under load.
- Connection pool saturation.
- Lock contention from a write-heavy workload.
- Local demo state simulating a dependency slowdown.

## Triage

1. Confirm whether database latency is above the warning or critical threshold.
2. Check which services show correlated latency.
3. Review recent telemetry for CPU, memory, and request volume shifts.
4. Identify whether errors are isolated to one service or system-wide.

## Safe Remediation Candidates

- Prepare a connection-pool reset proposal for the mock executor.
- Prepare a read-only degradation mode proposal.
- Prepare a rollback proposal if the spike follows a deploy.
- Require human approval before any state-changing action.
