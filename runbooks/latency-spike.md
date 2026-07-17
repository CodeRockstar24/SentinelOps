# Latency Spike

## Symptoms

- Service latency exceeds normal baseline.
- Requests still succeed, but response time degrades.
- Users may see slow checkout, delayed payment confirmation, or timeout risk.

## Likely Causes

- Dependency slowness.
- Cache hit rate drop.
- CPU or memory saturation.
- Retry amplification between services.

## Triage

1. Compare service latency against recent telemetry.
2. Check status code and error-rate trends.
3. Identify whether the spike is isolated or shared across services.
4. Look for correlated cache or database degradation.

## Safe Remediation Candidates

- Prepare a cache warmup proposal.
- Prepare a temporary traffic shaping proposal.
- Prepare a rollback proposal if latency follows a deploy.
- Do not execute commands without approval.
