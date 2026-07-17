# Payment Service 500s

## Symptoms

- `payment-service` returns elevated HTTP 500 responses.
- Checkout attempts fail after payment authorization starts.
- Error rate rises above 10% for more than one telemetry interval.
- Latency may rise if the service retries database or provider calls.

## Likely Causes

- Database timeout while creating payment authorization records.
- Downstream provider dependency is degraded.
- Recent deploy introduced request validation or serialization errors.
- Cache miss storm increased pressure on payment dependencies.

## Triage

1. Confirm the error rate, status codes, and latency trend.
2. Check whether `database` telemetry is also slow or returning errors.
3. Compare the incident start time with recent deploy or config changes.
4. Inspect related `checkout-api` telemetry for correlated failures.

## Safe Remediation Candidates

- Prepare a rollback proposal for the last payment-service deploy.
- Prepare a traffic reduction or circuit-breaker proposal.
- Prepare a dependency failover proposal if the provider is degraded.
- Keep all execution behind human approval.
