# Journol

Journol turns supplied news material into a proposed investigative lead, an evidence assessment, and a practical verification plan. A lead is never proof of the underlying claim.

## Local development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

Create a local environment file without committing it. `OPENAI_API_KEY` is required only for the AI workflow; never expose it to the browser.

## Authentication and persistence

Story discovery is available from the landing page. Creating an investigation,
retrieving a source for it, and progressing through the staged editorial
workflow require an authenticated Clerk session and PostgreSQL. Clerk supplies
verified session identity; Supabase is used only as managed PostgreSQL. See
[Clerk and PostgreSQL setup](docs/clerk-postgres-setup.md) for the required
environment variable names, setup steps, and migration workflow.

The browser now uses the investigation-scoped workflow routes. The older
`/api/assess-evidence` and `/api/build-investigation` routes remain only as
backward-compatible, access-guarded legacy handlers while downstream callers
are retired; new UI work must not call them.

## Deep Research

After Journol has retrieved an article and generated its initial investigative
lead, journalists can optionally open **Deep Research** in the same lead
dialogue. It searches a bounded set of external, public result metadata,
then produces a source-attributed report covering historical context, related
incidents, evidence status, contradictions, auditable numerical comparisons,
evidence gaps, and reporting opportunities. It never runs automatically and
never treats search snippets as verified facts. A matching citation proves
only that a finding is linked to retrieved material; journalists must inspect
the original source before treating it as independently established.

Deep Research requires the server-only `TAVILY_API_KEY` in addition to
`OPENAI_API_KEY`. Without a configured search provider, Journol shows a clear
configuration message and does not fabricate a research report. Completed
reports are tied to the authenticated user's investigation and source article,
and are reused for the same source and research instructions.

For a closed beta, configure Clerk in **Restricted** sign-up mode and invite
each journalist. The investigation-scoped AI routes use the verified Clerk
session and server-side ownership checks; no browser-supplied identity or
shared bearer token authorizes them. Configure a shared Redis-compatible rate
limiter using `JOURNOL_RATE_LIMIT_REDIS_URL`,
`JOURNOL_RATE_LIMIT_REDIS_TOKEN`, and
`JOURNOL_REQUIRE_SHARED_RATE_LIMIT=true`. Production fails closed without the
shared limiter. Set `JOURNOL_TRUST_PROXY=true` only for a proxy deployment
whose forwarding headers are trusted.

Before deployment, configure the production Clerk application and database,
set an OpenAI project hard spend limit, deploy behind HTTPS, configure
observability, and run lint, type checks, tests, and a production build in CI.
See [the closed-beta deployment guide](docs/deployment-beta.md).

## Checks

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

The mocked test suite covers validation, SSRF safeguards, rate limiting,
identity mapping, ownership, workflow handoff, idempotency, and defensive
client response parsing. Extend it alongside each new workflow transition.

## Learn more

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
