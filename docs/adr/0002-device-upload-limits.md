# ADR-0002 — Admin-controlled device upload limits

Date: 2026-10-15 · Status: Accepted

## Context

Dogfooding agents share a claimed device token and repeatedly exhaust the
200/day upload allowance despite ample account storage. Repeated counter resets
are temporary; increasing every account's default would broaden the change.

## Decision

Add nullable `devices.daily_upload_limit`, constrained to positive integers.
Only claimed devices use the override; other tiers retain their limits. Admins
set it directly in D1. No device-authenticated endpoint can change it. Expose
the effective limit and window through device status. HTTP, multipart and MCP
uploads continue using the shared upload gate and existing device counters.

## Consequences

An allowance increase takes effect immediately without resetting usage or
changing storage limits. NULL restores 200/day. New devices retain defaults;
revocation still denies access. Apply migration 0006 before deploying code
that selects the new column. The additive migration permits code rollback.
