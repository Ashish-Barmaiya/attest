# Threat Model & Security Guarantees

## Threat Model

Attest assumes a "trust but verify" relationship with the service operator, and is designed so that verification does not require trusting the operator at verification time. The design assumes the database and the application server can be fully compromised.

### What We Defend Against

| Attack Vector | Description | Detection Mechanism |
| :--- | :--- | :--- |
| **History Rewrite** | Attacker modifies past events and recomputes the chain. | **Detected during verification.** The recomputed chain hash will not match the externally stored anchor. |
| **History Truncation** | Attacker deletes the most recent N events (rollback). | **Detected during verification.** The anchor will reference a sequence number that no longer exists or has a different hash. |
| **Split-View (Forking)** | Attacker shows one history to Auditor A and another to Auditor B. | **Detected during verification.** Auditors comparing their anchored state will see a divergence. |
| **Silent Corruption** | Bit rot or accidental database modification. | **Detected during verification.** Internal hash chain verification will fail. |

### What We Do NOT Defend Against

| Attack Vector | Description | Mitigation |
| :--- | :--- | :--- |
| **API Key Theft** | Attacker steals a valid API key and appends malicious events. | **Out of Scope.** Attest guarantees the integrity of the log, not the correctness or legitimacy of events submitted by a compromised client. Rotate keys immediately if compromised. |
| **Denial of Service** | Attacker deletes the entire database. | **Out of Scope.** Attest guarantees *tamper-evidence*, not *availability*. Use standard backup/replication strategies. |
| **Pre-Ingestion Tampering** | The application sends false data to Attest. | **Out of Scope.** "Garbage in, garbage out." Attest proves the data hasn't changed *since* ingestion. |

### Anchor Integrity
Anchors are protected against:
- **Silent Deletion/Rewriting**: Each anchor references the previous anchor's commit hash. Verification checks that the anchor file's declared previous commit matches the actual Git history.
- **Time Spoofing**: Anchors are bound to Git commits, which provide a rough timestamp.
- **Execution Consistency**: Anchor runs are logged in the database and cross-referenced during verification.

### Anchor Compromise Model
If an attacker gains access to the **Anchor Writer credentials** (e.g., SSH keys for the Git repo):
-   **Risk**: They can publish a valid anchor for a *forked* history.
-   **Mitigation**:
    -   **Detection**: If the legitimate cron job runs, it will fail to push (non-fast-forward) or create a divergent commit history in Git. This is audible via standard Git monitoring.
    -   **Recovery**: The Git reflog and previous commits are immutable (SHA-1/SHA-256). The attacker cannot erase previous valid anchors without force-pushing, which should be disabled on the remote.

### Constraints
To maintain these guarantees, the system adheres to strict constraints:
1.  **Deterministic Execution**: Anchoring scripts must produce identical output for identical DB states.
2.  **No Background Threads**: We avoid complex in-memory buffering that could be lost on crash.
3.  **No Hidden State**: All state is in the DB or the Anchor Repo. There is no Redis/Memcached layer that affects integrity.

### Anchoring Trust Boundaries

The security of the anchoring process depends on the execution mode:

1.  **Development Mode (Insecure)**:
    -   The anchor script runs on the same host/container as the database.
    -   It connects directly to the DB via Prisma.
    -   **Risk**: If the host is compromised, the attacker has access to both the DB credentials and the anchor signing keys (Git credentials). They can rewrite history and publish a valid anchor.
    -   **Use Case**: Local development, CI/CD testing only.

2.  **Production Mode (Secure)**:
    -   The anchor script runs on a **separate, isolated host** (e.g., a serverless function or a dedicated worker VM).
    -   It has **NO** database access. It can only read the chain head via the public API.
    -   **Trust Boundary**: The API is the trust boundary. The anchor worker trusts the API to report the current head, but the API cannot force the anchor worker to sign an invalid history (because the anchor worker validates the hash chain continuity from the previous anchor).
    -   **Risk Mitigation**: Even if the database server is fully compromised, the attacker cannot force the isolated anchor worker to overwrite previous history in the external Git repo, provided the anchor worker's credentials are not stored on the database server.

### Anchor History as Tamper Evidence
The `anchor_runs` table provides a secondary audit log of the anchoring process itself.
-   **If an attacker deletes the anchor history**: The absence of logs during a known operational period is evidence of tampering.
-   **If an attacker modifies the anchor history**: The `gitCommit` hash in the DB would no longer match the actual Git history in the external repo.
-   **Dual Compromise Required**: To successfully hide an attack, an attacker must:
    1.  Rewrite the `audit_events` table.
    2.  Rewrite the `chain_head` table.
    3.  Rewrite the external Git repository history (requires Anchor Writer credentials).
    4.  Rewrite the `anchor_runs` table to match the new Git commit hashes.

This high bar for successful compromise is the core security value of Attest.

## Rate Limiting and Audit Integrity

Rate limiting is a security control for availability, but it interacts with integrity:

1.  **Explicit Failure**: When a rate limit is exceeded, Attest returns `HTTP 429`. It **never** partially writes data or silently drops it.
2.  **No Gaps**: A 429 response means the chain was not touched. There are no "missing" sequence numbers caused by rate limiting.
3.  **Client Responsibility**: The security guarantee is that *if* Attest confirms a write (HTTP 201), it is permanently in the chain. If Attest rejects a write (HTTP 429), the client must decide whether to retry or halt.
4.  **Integrity over throughput**: Attest prioritizes correctness and verifiability over ingestion speed. This ensures audit history remains defensible during forensic reviews.

### Trust Model alignment

Rate limiting protects against:
-   Abuse
-   Accidental overload
-   Denial-of-service amplification 

It does not:
-   Validate client intent
-   Prevent API key misuse
-   Guarantee delivery

Those responsibilties remain with the caller.

## Trust Assumptions

1.  **External Anchor Integrity**: We assume the external anchoring system (e.g., GitHub, S3 Object Lock) is not compromised by the same attacker who compromised the Attest database.
2.  **Client Honesty**: We assume the client possesses the correct API key; Attest does not attempt to judge the truthfulness of submitted events.
3.  **Verification Frequency**: We assume the user performs verification during audits or incidents. Attest does not actively push alerts.

## Non-Goals and Design Constraints

To maintain simplicity and security focus, Attest explicitly excludes the following:

-   **No Blockchain**: Attest is a centralized service with decentralized verification. It does not use consensus algorithms, tokens, or distributed ledgers.
-   **No Built-in UI**: There is no dashboard. Attest is an API-first infrastructure component.
-   **No "Right to be Forgotten"**: The data structure is strictly append-only. Deletion requests must be handled by deleting the encryption keys for the payload (crypto-shredding) or deleting the entire project, not by modifying the log.
-   **No Complex Querying**: Attest is not an analytics engine. It supports retrieving events by sequence or range. For complex queries, stream events to a secondary data warehouse.
