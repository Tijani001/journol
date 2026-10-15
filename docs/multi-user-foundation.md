# Multi-user foundation

This document records the original server-only foundation. Clerk, PostgreSQL,
and the investigation-scoped browser workflow have since been integrated; it
does **not** provision Redis or change the staged editorial workflow.

## Domain model

`lib/domain/types.ts` defines the records that will be persisted: users, investigations, source articles, versioned leads, evidence assessments, investigation plans, actions, optional source-attributed Deep Research reports, AI operations and usage records. Each record uses UUIDs and audit timestamps. Leads, assessments, plans, and research reports are immutable versions rather than mutable model output.

`lib/domain/postgres-schema.ts` is a typed PostgreSQL schema contract. It documents table names, foreign keys, uniqueness constraints and likely indexes without opening a connection or applying a migration. A future Drizzle adapter should implement the same contract rather than leak ORM types into routes or components.

## Authentication and authorization

`lib/server/auth.ts` exposes `getCurrentIdentity`, `getCurrentUser`, `getOrCreateCurrentUser`, and `requireCurrentUser`. A future managed provider must supply a verified server session that resolves to an issuer and subject, then maps to Journol's internal `users.id`.

`JOURNOL_DEV_USER_ID` is a local-development-only identity seam. It is ignored in production, is read only on the server, and is not production authentication. Browser payloads must never supply a user ID as an authorization claim.

`lib/server/authorization.ts` currently grants investigation access only to the owner. Its role-shaped API (`owner`, `editor`, `viewer`) is intentional: a future membership table can be added without changing each route's authorization call site.

## Repository and workflow boundaries

`JournolRepository` defines the database operations. `InMemoryJournolRepository` exists for isolated tests and local architecture work only; it is not an application singleton or production persistence. `lib/server/workflow.ts` resolves article, lead, assessment and plan contexts from resource IDs after ownership checks. This is the route migration path:

```text
article URL → server retrieves source → source record + investigation
  → lead ID → evidence-assessment ID → plan ID
```

The active browser workflow now persists source, lead, approval, evidence, and
plan state against an investigation. The legacy non-scoped handlers remain
temporarily for compatibility and must not be used for new browser flows.

## AI operations and usage

`AiOperationService` records a pending operation keyed by authenticated user and idempotency key, then records success/failure and token/cost metadata. It deliberately does not import OpenAI or make model calls. Quota reservation and shared rate limiting must be added around this boundary after PostgreSQL and the chosen Redis provider are available.

## Provider-dependent work remaining

- Production Clerk configuration and server-session verification.
- Production PostgreSQL configuration and migrations.
- Database-backed membership policy and optional row-level security.
- Redis-backed shared rate limiting and cache.
- Transactional quota reservation/counters and deployment observability.
