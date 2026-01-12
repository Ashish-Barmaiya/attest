# Operational Model

## Anchoring Strategy

Anchoring is the process of committing the current state of the database to an external source of truth.

### Frequency
Anchoring is performed asynchronously by a background worker. It is **not** performed synchronously on every write request to avoid latency penalties and external dependency bottlenecks.

Recommended frequency depends on the "Time to Detection" requirement:
-   **High Security**: Every 1 minute or every 100 events.
-   **Standard**: Every 1 hour.

### Failure Modes

**1. Anchor Service Unavailable**
If the external anchor destination (e.g., Git) is down:
-   **Ingestion**: Continues normally. The API does not block.
-   **Verification**: Clients can still verify internal consistency (`verifyChain`) up to the last successful anchor.
-   **Risk**: During the outage window, a sophisticated attacker could rewrite the unanchored tail of the log without immediate detection. Once the service recovers and a new anchor is published, the history is locked again.

**2. Database Restore**
If the database is lost and restored from a backup:
-   The service will resume from the backup's state.
-   **Detection**: The next anchor attempt will likely fail or fork because the backup's `ChainHead` might be behind the previously published external anchor. This is a feature, not a bug—it alerts operators that data loss has occurred.

## Key Rotation

-   **API Keys**: Should be rotated periodically. Revoking a key prevents *future* writes but does not invalidate *past* events.
-   **Anchor Keys**: The credentials used by the Anchor Writer to push to the external source must be tightly controlled. If these are compromised, the attacker can rewrite history and publish a valid matching anchor (a "split-view" attack).
