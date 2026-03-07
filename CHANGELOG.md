# Changelog

## [1.1.0] - 2026-03-07
### Added
- **Security**: Strict Zod schema validation for all Admin Control Plane endpoints (#3).
- **Security**: Redis-backed rate limiting for production-grade DoS protection (#2).
- **Stability**: Atomic project/chain_head creation using Prisma Transactions (#1).
- **Integrity**: Enforced Foreign Key constraints at the database level (#10).
- **CI/CD**: GitHub Actions workflow for enforced linting and test gates (#8).

### Changed
- **BREAKING**: Admin API now strictly validates UUIDs for all `projectId` and `keyId` parameters.
- **BREAKING**: Project names now require a minimum of 3 characters and a maximum of 255 characters.
- **Testing**: Replaced legacy standalone test scripts with a unified Jest integration suite (#11).

### Fixed
- Fixed memory leaks caused by unbounded in-memory rate limit stores.
- Resolved race conditions in project initialization.
- Fixed anchor report ingestion dropping payloads with empty git commit strings.
