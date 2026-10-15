# Closed-beta deployment guide

This guide prepares a small, authenticated Journol beta. It does **not**
deploy the application, create infrastructure, or run a database migration
automatically.

## What the project owner must do

1. Create a Vercel project and connect the Journol GitHub repository. Choose a
   Vercel plan and function configuration that permits at least 55 seconds per
   function invocation. Journol's evidence and plan routes export
   `maxDuration = 55`; they make one 25-second model call and, only for an
   invalid structured result, one bounded repair call.
   Select **Node.js 24.x** in Vercel Project Settings → Build and Deployment
   so the deployment matches Journol's declared runtime.
2. Create or select the Clerk production application. Add the temporary
   Vercel domain as an allowed origin/redirect domain. In Clerk Dashboard,
   enable public sign-up for this beta. Journol's application routes and APIs
   still require a verified Clerk session; hiding a sign-up button is not an
   access-control mechanism.
3. Create or select a Supabase PostgreSQL project. Use its server-only pooled
   PostgreSQL connection string; do not use the Supabase browser client or put
   the connection string in `NEXT_PUBLIC_*` configuration.
4. Use the Upstash Redis HTTPS REST endpoint and its **Standard** REST token.
   This is required for production: Journol fails closed if it is absent. Do
   not use Upstash's Read Only token because the limiter increments and expires
   keys.
5. Create a restricted OpenAI project key and set a low project spend alert or
   hard limit before inviting users.

## Vercel environment variables

Add these values in Vercel Project Settings for the Production environment.
Use separate Preview values only if Preview deployments should access separate
Clerk, database, rate-limit, and OpenAI environments.

| Name | Scope |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser-visible Clerk publishable key |
| `CLERK_SECRET_KEY` | Server-only Clerk secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Set to `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Set to `/` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Set to `/` |
| `DATABASE_URL` | Server-only Supabase pooled PostgreSQL URL |
| `DATABASE_SSL` | Set to `true` for Supabase |
| `DATABASE_SSL_CA_CERT` | Optional Supabase database CA PEM when the runtime does not already trust its chain; use `\n` for line breaks |
| `OPENAI_API_KEY` | Server-only OpenAI project key |
| `TAVILY_API_KEY` | Server-only Tavily API key for optional Deep Research external search |
| `JOURNOL_REQUIRE_SHARED_RATE_LIMIT` | Set to `true` |
| `JOURNOL_RATE_LIMIT_REDIS_URL` | Upstash REST URL from Connect → REST; server-only |
| `JOURNOL_RATE_LIMIT_REDIS_TOKEN` | Upstash Standard REST token; server-only |
| `JOURNOL_TRUST_PROXY` | Set to `true` only for the configured Vercel deployment |

Do not set `JOURNOL_DEV_USER_ID` in Vercel. Do not expose any server-only
variable to browser code. `.env.example` lists placeholder names only.

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is embedded in the browser bundle during
the Vercel build. Add it to the **Production** environment before deploying,
and redeploy after changing it. If it is absent at build time, Journol
intentionally renders no sign-in controls and protected API routes return an
authentication error rather than treating a visitor as a user.

## Database migration procedure

1. Create a fresh production database or take a verified backup of an existing
   one.
2. Review `db/migrations/0001_multi_user_foundation.sql`,
   `0002_saved_investigations.sql`,
   `0003_source_article_publication_date.sql`, and
   `0004_saved_stories.sql`, `0005_deep_research.sql`, and
   `0006_saved_deep_research.sql`.
3. From a secure environment containing the intended production
   `DATABASE_URL` and `DATABASE_SSL=true`, run:

   ```bash
   npm run db:migrate
   ```

4. Confirm the `schema_migrations` table contains all six checksummed files.
   The script applies unapplied numbered migrations in order, rejects a changed
   applied migration, and does not reset or modify existing migration history.
5. Only then deploy the Vercel project. Vercel builds never run migrations.

If the migration host reports `SELF_SIGNED_CERT_IN_CHAIN`, download the
project CA from Supabase **Database Settings → SSL Configuration** and add it
as `DATABASE_SSL_CA_CERT` (PEM with escaped `\n` line breaks). This retains
full certificate and hostname verification; never use a TLS-disable switch to
work around the error.

## Deploy and verify

1. In Vercel, confirm the framework is detected as Next.js and the production
   build command is `npm run build`.
2. Deploy from the selected repository branch through Vercel. This must be an
   explicit owner action.
3. Check `GET /api/health`; it should return only `{ "status": "ok" }`.
4. As a registered Clerk user, test sign-in, investigation creation, article
   retrieval, lead generation, approval, evidence assessment, plan generation,
   saving, and reopening a saved investigation.
5. Confirm a signed-out visitor is redirected to sign in before reaching
   Discover or protected investigation routes. Confirm a second signed-in user cannot open the first
   user's investigation.
6. Check Vercel function logs, Clerk dashboard, Supabase database health, the
   shared limiter dashboard, and OpenAI project usage after the first sessions.

## Operational limits for the initial beta

- The application enforces 20 AI requests per user per 10 minutes, with two
  concurrent AI operations per user. This is a reasonable initial ceiling for
  5–10 journalists; lower it if the OpenAI project budget requires it.
- Article retrieval is limited to 20 requests per client key per 10 minutes,
  with two concurrent retrievals. It retains DNS pinning, redirect validation,
  private-address rejection, content limits, and a 25-second total deadline.
- Public feed aggregation is limited to 60 requests per client key per 10
  minutes, with four concurrent feed loads. Individual RSS failures do not
  discard articles from reachable publishers.
- Model SDK retries are disabled on investigation-scoped evidence and plan
  routes. Each can make one primary call plus one validation repair call at
  most. Existing durable results are reused.

## Known production considerations

- RSS publishers can block cloud-provider egress or change feeds. `/api/news`
  tolerates individual feed failures and reports unavailable publishers, but
  each configured feed must be checked after deployment.
- The health endpoint is liveness-only; it intentionally does not test the
  database, Clerk, Redis, feeds, or OpenAI so it cannot leak configuration or
  create cost.
- The application uses a module-global PostgreSQL pool with `max: 1` per warm
  serverless instance. A Supabase pooled connection URL is still required to
  control total connections across Vercel instances.
