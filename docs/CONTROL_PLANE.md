# Control Plane & Operations

Attest provides a **Control Plane** for operators to manage projects and API keys. This is separate from the **Data Plane** used by applications to append events.

## Admin Authentication

The Control Plane is protected by a single high-entropy **Admin Token**.
This token represents operator authority and must be kept secret.

### Configuration
Set the `ATTEST_ADMIN_TOKEN` environment variable on the server:

```bash
ATTEST_ADMIN_TOKEN=your-high-entropy-secret-token
```

All requests to `/admin/*` endpoints must include this token in the Authorization header:

```
Authorization: Bearer <ATTEST_ADMIN_TOKEN>
```

Token comparison is performed in constant time, and all failures return a uniform 401 Unauthorized.

## CLI Tool

The primary interface to the Control Plane is a CLI.

The CLI reads the Admin Token from environment variables and communicates with the service over HTTP. No user accounts, sessions, or browser-based authentication are involved.

### Setup
Configure the CLI with your admin token and server URL:

```bash
export ATTEST_ADMIN_TOKEN=your-high-entropy-secret-token
export ATTEST_API_URL=http://localhost:3000
```

### Commands

#### Manage Projects

**Create a Project**
```bash
attest project create <name>
```

**List Projects**
```bash
attest project list
```

#### Manage API Keys

**Create an API Key**
```bash
attest key create <projectId>
```
*Returns the raw API key once. Store it safely.*

**Revoke an API Key**
```bash
attest key revoke <keyId>
```
*Revoked keys can no longer append events, but historical data remains verifiable.*

#### Verification

**Verify a Project**
```bash
attest verify <projectId> --anchors <path-to-anchor-file>
```
*Verifies the cryptographic integrity of the audit chain and checks against an external anchor.*

The CLI recomputes the entire hash chain locally and verifies it against external anchors. Verification does not rely on trusting the running service.

## API Reference

### `POST /admin/projects`
Create a new project.
- **Body**: `{ "name": "string" }`
- **Response**: `{ "projectId": "...", "name": "...", "createdAt": "..." }`

### `GET /admin/projects`
List all projects.
- **Response**: `[ { "projectId": "...", "name": "...", "createdAt": "..." } ]`

### `POST /admin/projects/:projectId/keys`
Create a new API key.
- **Response**: `{ "apiKey": "...", "keyId": "..." }`

### `DELETE /admin/keys/:keyId`
Revoke an API key.
- **Response**: `204 No Content`

The CLI recomputes the entire hash chain locally and verifies it against external anchors. Verification does not rely on trusting the running service.

## Admin Token Risk

Compromise of the Admin Token grants full Control Plane authority, including project and key management. It does not allow undetectable history rewriting unless the external anchoring system is also compromised. Operators must protect this token with the same rigor as database credentials.

## Design Constraints

Attest intentionally excludes the following:

* User authentication systems.
* Web-based dashboards or UI.
* Sessions and cookies.
* Blockchain and consensus protocols.

These constraints keep the trust surface small and auditable.
