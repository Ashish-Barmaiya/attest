# System Architecture

## High-Level Design

Attest operates on a strict separation of concerns between **ingestion**, **storage**, and **verification**.

1.  **Ingestion (Writer)**:
    -   Clients submit events via HTTP API.
    -   The service authenticates the request via API Key.
    -   The service computes the cryptographic hash of the event payload and links it to the previous chain hash.
    -   The event is appended to the database.

2.  **Storage (Database)**:
    -   **`audit_events`**: Stores the ordered log of events. Columns: `projectId`, `sequence`, `payloadJson`, `payloadHash`, `prevChainHash`, `chainHash`.
    -   **`chain_head`**: Stores the pointer to the latest event (`lastSequence`, `lastChainHash`) for optimistic locking and quick lookups.

3.  **Anchoring (External)**:
    -   A background process periodically reads the `chain_head` of all projects.
    -   It writes an immutable summary (Anchor) to an external, append-only medium (e.g., a Git repository).
    -   This creates a checkpoint that cannot be altered by the database operator.

4.  **Verification (Reader)**:
    -   Clients or auditors download the full event log from the service.
    -   They independently recompute the hash chain to verify internal consistency.
    -   They fetch the latest anchor from the external source.
    -   They verify that the local chain matches the anchored state.

## Verification Model

Verification is the core value proposition of Attest. It consists of two layers:

### 1. Internal Consistency (`verifyChain`)
This step ensures that the database has not been corrupted by random bit rot or naive tampering.
-   Iterate through all events `e[0]` to `e[n]`.
-   Verify `e[i].prevChainHash == e[i-1].chainHash`.
-   Verify `e[i].chainHash == SHA256(e[i].prevChainHash + SHA256(e[i].payload))`.

**Guarantee**: If this passes, the log is internally consistent. However, it does *not* prove that the history hasn't been rewritten by a sophisticated attacker who recomputed all hashes.

### 2. Anchor Verification (`verifyAgainstAnchor`)
This step defends against "split-view" attacks and history rewriting.
-   Fetch the trusted anchor for the project (e.g., from a separate Git repo).
-   The anchor contains `{ lastSequence: N, lastChainHash: H }`.
-   Locate event `N` in the local log.
-   Verify that `event[N].chainHash === H`.

**Guarantee**: If this passes, the log provided by the service matches the state that was previously committed to the external anchor.

## Anchoring: Design and Proof

### Why Anchoring is Necessary
A standard hash chain only proves that the current state is derived from *some* history. It does not prove that it is the *original* history. An attacker with database access can:
1.  Delete the last 10 events.
2.  Append 10 new malicious events.
3.  Recompute all subsequent hashes.
4.  Update the `chain_head`.

To a verifier, this rewritten chain looks perfectly valid. Anchoring solves this by publishing checkpoints to a system the attacker does not control.

### Adversarial Testing
We validated this design against a "Strong Attacker" model. The attacker:
1.  Gained full access to the database.
2.  Modified a historical event (sequence 3).
3.  Recomputed the hash chain for all subsequent events.
4.  Updated the `chain_head` table.

**Results:**
-   **Internal Verification**: PASSED. The attacker successfully forged a valid hash chain.
-   **Anchor Verification**: FAILED. The recomputed chain hash at the anchor point did not match the hash stored in the external anchor file.

**Conclusion**: To successfully rewrite history, an attacker must compromise **both** the Attest database and the external anchoring system (e.g., rewrite Git history) simultaneously.
