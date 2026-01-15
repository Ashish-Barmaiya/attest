# Operational Model

## Anchoring Strategy

Anchoring is the process of committing a cryptographic summary of the current audit history (the chain head) to an external source of truth.

### Frequency
Anchoring is performed asynchronously by a background worker. It is **not** performed synchronously on every write request to avoid latency penalties and external dependency bottlenecks.

This design trades immediate detection for operational simplicity and write throughput.

Recommended frequency depends on the "Time to Detection" requirement:
-   **High Security**: Every 1 minute or every 100 events.
-   **Standard**: Every 1 hour.

### Failure Modes

**1. Anchor Service Unavailable**
If the external anchor destination (e.g., Git) is down:
-   **Ingestion**: Continues normally. The API does not block.
-   **Verification**: Clients can still verify internal consistency (`verifyChain`) up to the last successful anchor.
-   **Risk**: During the outage window, a sophisticated attacker could rewrite the unanchored tail of the log without immediate detection. This does not affect already anchored history.

**2. Database Restore**
If the database is lost and restored from a backup:
-   The service will resume from the backup's state.
-   **Detection**: The next anchor attempt will likely fail or fork because the backup's `ChainHead` might be behind the previously published external anchor. This is a feature, not a bug—it alerts operators that data loss has occurred. This prevents silent rollback to an earlier, seemingly valid state.

## Key Rotation

-   **API Keys**: Should be rotated periodically. Revoking a key prevents *future* writes but does not invalidate *past* events.
-   **Anchor Keys**: The credentials used by the Anchor Writer to push to the external source must be tightly controlled. If these are compromised, the attacker can rewrite history and publish a matching anchor, defeating external verification.

## Operator Responsibility

Attest provides tamper-evidence, not automatic enforcement. Operators are responsible for:
- Running anchoring jobs reliably
- Protecting anchor credentials
- Preserving anchor history
- Performing verification during audits or incidents

