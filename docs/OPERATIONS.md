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

### Setup & Configuration

**1. Anchor Directory (Git)**
The anchoring system requires a local Git repository to store anchor files.
1.  Create a new Git repository (e.g., on GitHub/GitLab).
2.  Clone it to the server running Attest.
3.  Set the environment variables:
    ```bash
    ANCHOR_DIR=/path/to/attest-anchors
    ANCHOR_GIT_REMOTE=origin
    ANCHOR_GIT_BRANCH=main
    ANCHOR_GIT_AUTHOR_NAME="Attest Bot"
    ANCHOR_GIT_AUTHOR_EMAIL="bot@attest.internal"
    ```
4.  Ensure the user running the cron job has write/commit access to this directory and SSH keys configured for the remote.

**2. Cron Job**
Anchoring must be triggered externally via system cron. It does not run inside the main API process.

Example `crontab` entry (runs every hour):
```bash
# See scripts/attest-anchor.cron for the template
0 * * * * cd /path/to/attest && npm run anchor >> /var/log/attest-anchor.log 2>&1
```

> [!IMPORTANT]
> The `scripts/attest-anchor.cron` file is provided as a template. You must uncomment the line in the file (or your crontab) to enable the anchor job.


**Why External Cron?**
-   **Isolation**: Anchoring failures do not crash the API.
-   **Resource Control**: Anchoring happens independently of API load.
-   **Simplicity**: No complex internal job schedulers or distributed locks.

### Anchoring Lifecycle
1.  **Trigger**: Cron fires `npm run anchor`.
2.  **Read**: Script reads the latest `ChainHead` for all projects from the DB.
3.  **Write**: Script writes a JSON file to `$ANCHOR_DIR/YYYY-MM-DD-HH.json`.
4.  **Commit**: Script executes `git add .` and `git commit` in `$ANCHOR_DIR`.
5.  **Push**: Script executes `git push` to the configured remote.
6.  **Log**: Success or failure is recorded in the `anchor_runs` database table.

### Monitoring & Recovery

**Inspecting Anchor Logs**
Use the CLI to view the history of anchor runs:
```bash
attest anchor logs 20
```

Output:
```text
TIME                     STATUS    PROJECTS   COMMIT         ERROR
2026-01-17 12:00         success   6          a81f3c9
2026-01-17 11:00         failed    6                         git push failed
```

Note: `COMMIT` shows the Git commit hash of the anchor run. Verification ensures these commits form a continuous chain.

**Handling Failed Anchors**
If an anchor run fails (e.g., due to git push failure):
1.  Check the logs: `attest anchor logs`
2.  Check the system logs: `/var/log/attest-anchor.log`
3.  Fix the underlying issue (e.g., network outage, permission denied).
4.  Manually trigger the anchor: `npm run anchor`
5.  Verify the run succeeded: `attest anchor logs`

## Key Rotation

-   **API Keys**: Should be rotated periodically. Revoking a key prevents *future* writes but does not invalidate *past* events.
-   **Anchor Keys**: The credentials used by the Anchor Writer to push to the external source must be tightly controlled. If these are compromised, the attacker can rewrite history and publish a matching anchor, defeating external verification.

## Operator Responsibility

Attest provides tamper-evidence, not automatic enforcement. Operators are responsible for:
- Running anchoring jobs reliably
- Protecting anchor credentials
- Preserving anchor history
- Performing verification during audits or incidents

## Rate Limiting Configuration

Attest uses a multi-layered rate limiting strategy to protect availability.

### Default Limits
If environment variables are not set, Attest defaults to:
-   **Global**: 100 RPS (`ATTEST_GLOBAL_RPS`)
-   **Per-Project**: 10 RPS (`ATTEST_PROJECT_RPS`)
-   **Per-Key**: 5 RPS (`ATTEST_KEY_RPS`)

### Tuning Guidance
-   **Small Teams**: Defaults are usually sufficient.
-   **Large Organizations**: Increase `ATTEST_GLOBAL_RPS` based on the number of active projects.
-   **High-Volume Projects**: If a project requires >10 RPS, consider:
    1.  Batching multiple actions into one event.
    2.  Increasing `ATTEST_PROJECT_RPS` (at the cost of higher DB contention).
    3.  Use Redis or another shared store.

> [!WARNING]
> **Do not disable rate limits entirely.**
> Unbounded writes can degrade the performance of the anchoring worker and verification processes.


