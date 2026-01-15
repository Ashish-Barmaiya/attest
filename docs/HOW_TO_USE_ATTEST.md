# HOW TO USE ATTEST
## A Practical Guide for Developers

Attest is a self-hosted, tamper-evident audit logging service. It provides cryptographic proof that audit history has not been modified, reordered, truncated, or silently rewritten — even by an attacker with full database access.

This guide explains how a developer actually uses Attest in a real system, from deployment to verification.

## 1. What Attest Is (and Is Not)

### Attest IS:
*   A self-hosted infrastructure component
*   An append-only audit log
*   Multi-tenant (isolated projects)
*   Cryptographically verifiable
*   Designed for security-critical systems

### Attest IS NOT:
*   A hosted SaaS or managed service
*   A general logging system
*   An analytics platform
*   A UI-driven dashboard
*   A blockchain

Attest assumes you control your infrastructure and care about provable audit integrity, not convenience.

## 2. Core Concepts

### Project
A project is an isolation boundary.
Each project has:
*   Its own audit log
*   Its own hash chain
*   Its own API keys
*   Its own anchoring history

Projects never share state.

### Audit Event
An immutable JSON object describing a security-relevant action.
Each event includes:
*   A sequence number
*   A payload
*   A payload hash
*   A cryptographic link to the previous event

Once written, events cannot be changed without detection.

### Hash Chain
Each event’s hash depends on:
`SHA256(previousChainHash + SHA256(payload))`

This ensures that modifying any past event invalidates all future events unless the attacker recomputes the entire chain.

### Chain Head
The sequence number and hash of the most recent event in a project.

### Anchoring
Anchoring periodically commits the current chain head to an external, append-only system (e.g., Git).
Anchoring prevents:
*   History rewrites
*   Rollbacks
*   Forked views
*   Split-brain attacks

## 3. Deployment Model
Attest is self-hosted.
You deploy it:
*   On a VM or container platform
*   Using Docker Compose or a standard Node.js runtime

You are the operator of the Attest service.

## 4. Environment Setup (Docker Compose)
The easiest way to run Attest is with Docker Compose.

1.  Create a `docker-compose.yml` (or use the provided one).
2.  Start the services:

```bash
docker-compose up -d
```

This starts:
*   **Postgres**: Database for storing events.
*   **Attest Server**: The API server listening on port 3000.

Configuration is handled via environment variables in `docker-compose.yml`.

## 5. Environment Setup (Manual)
If you prefer running without Docker:

Set the following environment variables:

```bash
ATTEST_ADMIN_TOKEN=<high-entropy-secret>
DATABASE_URL=postgres://...
ANCHOR_DIR=/path/to/anchors
```

Start the service:

```bash
npm run build
npm start
```

Attest now listens for:
*   Admin requests (`/admin/*`)
*   Application audit events (`/events`)

The Docker Compose setup is intended for local development, testing, and self-hosted production deployments.

## 6. Control Plane vs Data Plane
Attest has two distinct interfaces.

### Control Plane (Operator Only)
Used by the person who deployed Attest.
The Control Plane is not exposed to application code and should never be accessible from untrusted environments.

**Capabilities:**
*   Create projects
*   Create API keys
*   Revoke API keys
*   Export events
*   Run verification

**Authentication:**
*   `ATTEST_ADMIN_TOKEN`

### Data Plane (Applications)
Used by your application code.

**Capabilities:**
*   Append audit events
*   Verify integrity

**Authentication:**
*   Project-scoped API keys

## 7. Using the Attest CLI (Operator)

### Configure CLI
```bash
export ATTEST_API_URL=http://localhost:3000
export ATTEST_ADMIN_TOKEN=<your-admin-token>
```

### Create a Project
```bash
attest project create my-app-prod
```

Response:
```json
{
  "projectId": "...",
  "name": "my-app-prod"
}
```

### Create an API Key
```bash
attest key create <projectId>
```

Response:
```json
{
  "apiKey": "RAW_SECRET_KEY",
  "keyId": "key-uuid"
}
```
> [!WARNING]
> The raw key is shown once. Store it securely.

### Revoke an API Key
```bash
attest key revoke <keyId>
```
Revocation prevents future writes but preserves history.

## 8. Integrating Attest into Your Application

### Application Environment Variables
```bash
ATTEST_API_URL=http://attest.internal
ATTEST_API_KEY=RAW_SECRET_KEY
```

### Appending an Audit Event
Every security-relevant action should produce an event.

Example:
```javascript
await fetch(`${process.env.ATTEST_API_URL}/events`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ATTEST_API_KEY
  },
  body: JSON.stringify({
    action: "USER_LOGIN",
    actor: { type: "user", id: "u123" },
    resource: { type: "session", id: "s456" },
    metadata: {
      ip: "1.2.3.4",
      success: true
    }
  })
});
```
Applications should treat Attest as write-only infrastructure and should not attempt to interpret or mutate stored audit data.

Attest responds with:
```json
{
  "sequence": 42,
  "chainHash": "..."
}
```
Your application does not need to store this response.

## 9. Anchoring (Operator Responsibility)
Anchoring should run periodically.

Example:
```bash
export ANCHOR_DIR=/var/attest/anchors
npx tsx src/scripts/anchor-writer.ts
cd /var/attest/anchors
git commit -am "anchor: checkpoint"
git push
```
Anchors must live in a separate repository.
Anchoring is intentionally asynchronous and does not block event ingestion.

## 10. Verifying Audit History
Verification is done during:
*   Incidents
*   Audits
*   Compliance reviews

```bash
attest verify <projectId> --anchors /var/attest/anchors
```

Verification checks:
*   Full hash chain integrity
*   Anchor consistency
*   Rollback detection
*   Rewrite detection

If verification fails, tampering occurred.

## 11. Security Guarantees

### Attest guarantees:
*   Detection of malicious operators
*   Cryptographic integrity
*   Append-only history
*   Multi-tenant isolation
*   Tamper evidence

### Attest does not guarantee:
*   Data correctness
*   Availability
*   Protection against API key leakage

## 12. Threat Model (Summary)

### Attest defends against:
*   History rewrite
*   Silent rollback
*   Forked audit views
*   Database-level tampering

### Attest assumes:
*   You control deployment
*   You protect admin credentials
*   You run verification when needed

Attest assumes that attackers may have long-term access to the database.

## 13. Typical Usage Pattern
1.  Deploy Attest
2.  Create project
3.  Issue API key
4.  Wire app to `/events`
5.  Anchor periodically
6.  Verify when needed

That’s it.

## 14. When You Should Use Attest

### Use Attest if:
*   Audit integrity matters
*   You cannot fully trust your own infrastructure
*   You need post-incident proof

### Do not use Attest if:
*   You want dashboards
*   You want mutable logs
*   You want SaaS convenience

## Final Note
Attest is intentionally minimal.

It exists to answer one question — with cryptographic certainty:

**“Has this audit history ever been altered?”**

If the answer matters to your system, Attest belongs in your architecture.
