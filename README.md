# Attest: Tamper-Evident Audit Service

Attest is a multi-tenant, append-only audit logging service designed to provide cryptographic proof that audit history has not been silently rewritten. Each tenant (project) maintains an independent, isolated audit log with its own hash chain and anchoring history. The system combines internal hash chaining with external anchoring to detect modification, reordering, truncation, or rollback of audit events—even in the presence of a malicious operator with full database access.

Traditional audit logs can prove internal consistency, but they cannot prove that the history itself is original. A sufficiently powerful attacker can rewrite past events, recompute all hashes, and present a forged yet internally valid log. Attest addresses this gap by periodically publishing immutable checkpoints of each project’s audit history to an external, append-only system. These checkpoints bind a project’s audit state to an external source of truth, making history rewrites detectable without requiring trust in the service operator.

Attest is built for systems where audit integrity matters more than convenience: security-sensitive applications, access control systems, financial or administrative workflows, and any environment where audit logs must remain verifiable long after they are written. It is intentionally API-first and verification-centric, treating audit ingestion, storage, and independent verification as separate concerns.

## Who This Is For

### Intended Users

* Developers building security-sensitive or high-assurance systems.
* Security and compliance teams who require independently verifiable proof that audit history has not been rewritten.
* Operators who want tamper-evidence without running complex cryptographic infrastructure. 

### Not Intended Users

* General application logging or analytics.
* High-volume telemetry or clickstream data.
* Systems requiring mutable history or “right to be forgotten” semantics.

## Core Concepts

- **Project**: A logical isolation boundary. Each project has its own independent hash chain.
- **Audit Event**: An immutable record containing a JSON payload. Each event is cryptographically linked to the previous one.
- **Hash Chaining**: The mechanism where `CurrentHash = SHA256(PreviousHash + SHA256(Payload))`. This ensures that changing any historical event invalidates all subsequent hashes.
- **Chain Head**: The sequence number and hash of the most recent event in a project.
- **Anchoring**: The process of periodically publishing the Chain Head to a trusted external system (e.g., an append-only Git repository). This prevents "split-view" attacks where an operator forks the history.

## Documentation
- [Architecture](./docs/ARCHITECTURE.md)
- [Security Model](./docs/SECURITY.md)
- [Operations](./docs/OPERATIONS.md)
- [Control Plane & CLI](./docs/CONTROL_PLANE.md)

## Developer Usage

### 1. Create a Project
```bash
# Returns projectId and apiKey
curl -X POST http://localhost:3000/projects
```

### 2. Append an Event
The project context is derived exclusively from the API key. Client-supplied project identifiers are ignored.

```bash
curl -X POST http://localhost:3000/events \
  -H "x-api-key: <YOUR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "login",
    "actor": { "type": "user", "id": "alice" },
    "resource": { "type": "session", "id": "web" }
  }'
```

### 3. Verify History
In the event of a security incident, you verify the integrity of the log against the external anchor.

```bash
# Verifies hash chain integrity AND checks against the latest external anchor
npx tsx src/scripts/verify-with-anchor.ts <PROJECT_ID>
```

## Summary of Guarantees

- **Integrity**: It is computationally infeasible to modify an event without invalidating the hash chain.
- **Isolation**: Cross-tenant contamination is impossible; each project has a distinct genesis and chain.
- **Authority**: Write access is strictly controlled via API keys; no client-supplied identity is trusted without authentication.
- **Tamper-Evidence**: Any attempt to rewrite history (including "correctly" recomputing hashes) is detected if the history has been anchored externally.
