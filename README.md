# Attest: Tamper-Evident Audit Service

Attest is a production-grade, multi-tenant audit logging system designed to provide cryptographic proof of history integrity. It combines internal hash chaining with external anchoring to detect any modification, reordering, or deletion of audit logs, even by a malicious operator with full database access.

It solves the "who watches the watcher" problem by ensuring that once an event is acknowledged and anchored, its history cannot be rewritten without detection.

## Who This Is For

**Intended Users:**
- Developers building high-assurance systems (e.g., financial ledgers, access control systems, healthcare records).
- Security engineers requiring non-repudiation for administrative actions.
- Security and compliance teams who need independently verifiable proof that audit history has not been rewritten

**Non-Intended Users:**
- General application logging (use ELK, Splunk, etc.).
- High-volume analytics or clickstream tracking.
- Systems requiring mutable history or "right to be forgotten" (Attest is strictly append-only).

## Core Concepts

- **Project**: A logical isolation boundary. Each project has its own independent hash chain.
- **Audit Event**: An immutable record containing a JSON payload. Each event is cryptographically linked to the previous one.
- **Hash Chaining**: The mechanism where `CurrentHash = SHA256(PreviousHash + SHA256(Payload))`. This ensures that changing any historical event invalidates all subsequent hashes.
- **Chain Head**: The sequence number and hash of the most recent event in a project.
- **Anchoring**: The process of periodically publishing the Chain Head to a trusted external system (e.g., an append-only Git repository). This prevents "split-view" attacks where an operator forks the history.

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
