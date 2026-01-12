# Anchoring Security Model

## Overview
The anchoring system provides a defensive layer against operator or database compromise by periodically checkpointing the cryptographic state of each project's audit chain to an external, immutable-in-practice storage location (e.g., a git repository).

## What it Protects Against
1.  **Silent History Rewrites**: If an attacker gains write access to the database, they cannot rewrite past events without invalidating the externally stored anchor.
2.  **Database Rollbacks**: Restoring the database to an earlier state (e.g., after a compromise) is detectable because the anchor will reference a sequence number higher than the current chain head.
3.  **Chain Forks**: Creating a parallel valid chain is detectable because the anchor binds the project to a specific chain hash at a specific sequence.
4.  **Truncation**: Deleting the entire history or parts of it is detectable if an anchor exists.

## What it Does NOT Protect Against
1.  **Real-time Tampering**: Anchors are periodic (e.g., daily/hourly). Events created *after* the last anchor but *before* the next one are only protected by the database's internal hash chain, not the external anchor.
2.  **Anchor Deletion**: If the attacker has write access to the `ANCHOR_DIR` (and it's not version-controlled or backed up), they can delete or replace anchors. The security relies on `ANCHOR_DIR` being a separate failure domain (e.g., a git repo with restricted push access).
3.  **Key Compromise**: Anchoring does not prevent unauthorized appends if API keys are compromised; it only ensures those appends cannot be retroactively hidden.

## Design Decisions

### Per-Project Anchoring
We anchor each project individually (`project-<id>.json`) rather than a global Merkle tree.
*   **Why**: Simplicity and isolation. Verification of one project does not require data from others. It aligns with the tenant isolation model.
*   **Trade-off**: Slightly more storage files, but avoids complex Merkle proofs.

### Git / Append-Only Storage
We assume `ANCHOR_DIR` is a git repository or similar append-only system.
*   **Why**: Git provides history, signatures, and distribution out of the box. The service simply writes files; the operator manages the commit/push workflow.
*   **Benefit**: No need to build a custom blockchain or ledger.
