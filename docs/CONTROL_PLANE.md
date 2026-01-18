# Control Plane & Operations

Attest provides a **Control Plane** for operators to manage projects and API keys. This is separate from the **Data Plane** used by applications to append events.

In a typical deployment, the "Admin" is the person or team operating the Attest service itself, not the end users of an application.

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

**Tombstone a Project**
```bash
attest project tombstone <projectId> --confirm
```
*Permanently closes the project. No further writes are allowed. This action is irreversible.*

#### Manage API Keys

**Create an API Key**
```bash
attest key create <projectId>
```
*Returns the raw API key once. Store it safely.*

**Rotate an API Key**
```bash
attest key rotate <projectId>
```
*Creates a new key without revoking the old one. Allows for staged migration.*

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

### `POST /admin/projects/:projectId/keys` (Rotate)
Rotate an API key (same endpoint as create).
- **Response**: `{ "apiKey": "...", "keyId": "..." }`

### `DELETE /admin/keys/:keyId`
Revoke an API key.


### `POST /admin/projects/:projectId/tombstone`
Permanently close a project.
- **Response**: `{ "message": "Project tombstoned", "tombstonedAt": "..." }`

### `GET /verify`
Verify the integrity of the audit chain for a project.
- **Headers**: `Authorization: Bearer <API_KEY>`
- **Response**: `{ "projectId": "...", "eventCount": 123, "isValid": true }`

## Admin Token Risk

Compromise of the Admin Token grants full Control Plane authority, including project and key management. It does not allow undetectable history rewriting unless the external anchoring system is also compromised, at which point all trust assumptions are already broken. Operators must protect this token with the same rigor as database credentials.

## Design Constraints

Attest intentionally excludes the following:

* User authentication systems.
* Web-based dashboards or UI.
* Sessions and cookies.
* Blockchain and consensus protocols.

These constraints keep the trust surface small and auditable.

## Operator Responsibility

The Control Plane is intentionally powerful and minimal. Operators are responsible for protecting the Admin Token, managing anchor credentials, and enforcing operational discipline around verification.

