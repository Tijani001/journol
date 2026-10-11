# Clerk and PostgreSQL setup

Journol uses Clerk only for verified session identity. PostgreSQL remains the source of truth for Journol users, investigations, sources, editorial outputs, and usage records. Supabase is used as managed PostgreSQL, not as the authentication provider.

## Required environment variable names

Copy `.env.example` to a local, uncommitted `.env.local` and obtain values from the relevant dashboards. Do not put credentials in browser code or source control.

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key. This value is intentionally browser-visible.
- `CLERK_SECRET_KEY` — Clerk server secret; server-only.
- `DATABASE_URL` — server-only PostgreSQL connection string from Supabase.
- `DATABASE_SSL=true` — use TLS verification for Supabase-hosted PostgreSQL.
- `DATABASE_SSL_CA_CERT` — optional PEM root certificate authority for a
  Supabase project whose certificate chain is not trusted by the local Node
  runtime. Store line breaks as `\n`; this is a CA certificate, not a secret.
- `JOURNOL_DEV_USER_ID` — optional local-only test seam; it is ignored in production and is not authentication.

Without these values, public story discovery remains available, while
`/workspace`, investigation APIs, and persisted workflow stages fail closed
with a clear configuration or authentication response.

## Clerk setup

1. Create or select a Clerk application.
2. Add the publishable and secret keys to `.env.local` using the names above.
3. Configure allowed local development origins in Clerk.
4. Run `npm run dev`, then use `/sign-up` or `/sign-in`.

For Next.js 16, Clerk uses `proxy.ts`, not the legacy `middleware.ts` convention. Clerk's verified session yields its issuer (`iss`) and user ID (`sub`/`userId`); Journol maps that pair to `users.auth_issuer` and `users.auth_subject`. No browser-supplied user ID participates in this mapping.

## Supabase PostgreSQL setup

1. Create a Supabase project and retrieve its server-side PostgreSQL connection string.
2. Set `DATABASE_URL` and `DATABASE_SSL=true` locally or in your secret manager.
   If Node reports `SELF_SIGNED_CERT_IN_CHAIN`, download the database CA
   certificate from **Database Settings → SSL Configuration** and set
   `DATABASE_SSL_CA_CERT` to the PEM contents (replace literal line breaks
   with `\n`). Do not disable certificate verification or set
   `NODE_TLS_REJECT_UNAUTHORIZED=0`.
3. Review the migration, then run it deliberately:

   ```bash
   npm run db:migrate
   ```

`db:migrate` applies SQL files in lexical order, stores checksums in `schema_migrations`, and refuses to apply a modified migration. It never runs automatically during development, tests, builds, or deployment. Add a new numbered SQL file for each later schema change; do not edit an applied migration.

## Repository and authorization design

`PostgresJournolRepository` is the real adapter for the existing `JournolRepository` contract. It opens a PostgreSQL pool only when a real operation is attempted and throws `DATABASE_NOT_CONFIGURED` when `DATABASE_URL` is absent.

`getOrCreateCurrentUser()` maps a verified Clerk identity to Journol's internal UUID. `requireInvestigationAccess()` remains provider-independent and currently enforces owner-only access. The new `/api/investigations` routes demonstrate create/read operations without accepting an owner ID from the browser.

The active browser workflow uses investigation-scoped persistence. Legacy
non-scoped AI handlers remain access-guarded only for compatibility and should
not be used by new clients.
