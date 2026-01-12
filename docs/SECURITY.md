# Threat Model & Security Guarantees

## Threat Model

Attest assumes a "trust but verify" relationship with the service operator. The design assumes the database and the application server can be fully compromised.

### What We Defend Against

| Attack Vector | Description | Detection Mechanism |
| :--- | :--- | :--- |
| **History Rewrite** | Attacker modifies past events and recomputes the chain. | **Detected.** The recomputed chain hash will not match the externally stored anchor. |
| **History Truncation** | Attacker deletes the most recent N events (rollback). | **Detected.** The anchor will reference a sequence number that no longer exists or has a different hash. |
| **Split-View (Forking)** | Attacker shows one history to Auditor A and another to Auditor B. | **Detected.** Auditors comparing their anchored state will see a divergence. |
| **Silent Corruption** | Bit rot or accidental database modification. | **Detected.** Internal hash chain verification will fail. |

### What We Do NOT Defend Against

| Attack Vector | Description | Mitigation |
| :--- | :--- | :--- |
| **API Key Theft** | Attacker steals a valid API key and appends malicious events. | **Out of Scope.** Attest guarantees the *integrity* of the log, not the *validity* of the client. Rotate keys immediately if compromised. |
| **Denial of Service** | Attacker deletes the entire database. | **Out of Scope.** Attest guarantees *tamper-evidence*, not *availability*. Use standard backup/replication strategies. |
| **Pre-Ingestion Tampering** | The application sends false data to Attest. | **Out of Scope.** "Garbage in, garbage out." Attest proves the data hasn't changed *since* ingestion. |

## Trust Assumptions

1.  **External Anchor Integrity**: We assume the external anchoring system (e.g., GitHub, S3 Object Lock) is not compromised by the same attacker who compromised the Attest database.
2.  **Client Honesty**: We assume the client possesses the correct API key and intends to log truthful events.
3.  **Verification Frequency**: We assume the user performs verification during audits or incidents. Attest does not actively push alerts.

## Non-Goals and Design Constraints

To maintain simplicity and security focus, Attest explicitly excludes the following:

-   **No Blockchain**: Attest is a centralized service with decentralized verification. It does not use consensus algorithms, tokens, or distributed ledgers.
-   **No Built-in UI**: There is no dashboard. Attest is an API-first infrastructure component.
-   **No "Right to be Forgotten"**: The data structure is strictly append-only. Deletion requests must be handled by deleting the encryption keys for the payload (crypto-shredding) or deleting the entire project, not by modifying the log.
-   **No Complex Querying**: Attest is not an analytics engine. It supports retrieving events by sequence or range. For complex queries, stream events to a secondary data warehouse.
