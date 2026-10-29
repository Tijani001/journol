# Journol

Journol helps journalists find new angles and leads in stories that are already published.

Paste a link, or pick one of today's stories. Journol then:

1. **Reads the story** and keeps its paragraphs.
2. **Searches the web** for related coverage: other outlets on the same event, earlier reporting on the people and companies named, and how similar promises turned out. Copies of the same report or press release count once.
3. **Finds what the story leaves open.** These are numbered gaps, each tied to the story's own words or to a related report.
4. **Suggests three angles to chase.** Each one says why it matters and gives three first steps, where to look, who to ask, and whether anyone has already reported it. "More angles" adds up to two more sets below.

Journalists can save angles to **My angles**, tick off steps, and mark each angle as New, Reporting or Published. **My stories** lists every story they've run. If a link can't be read (a paywall, or a site that blocks automatic reading), they can paste the story text instead. Each angle has a 👍/👎 rating, and **Write a pitch** turns it into a standard ~250-word story pitch to an editor (counts as one run; editable and copyable).

Journol installs as an app (Android, iPhone, computers) from **`/app`**: a web app manifest, icons and a service worker that only caches an offline page, never journalists' work.

Visitors who aren't signed in see a front page explaining what Journol does and how it works. Terms and a privacy policy (written for the Nigeria Data Protection Act 2023) are at `/terms` and `/privacy`, and journalists can delete their account and all their data at `/account`.

## For the owner

- **`/admin`**: journalists, stories, runs against the overall daily cap, what's failing (by website), and how angles are rated. Set `JOURNOL_ADMIN_USER_IDS` to your Clerk user ID, which is shown on `/account`.
- **`/api/health`**: a public status check (database, today's stories, AI and search configured) for an uptime monitor.
- **Spending:** each journalist gets `JOURNOL_DAILY_LIMIT` runs a day (default 25), and everyone together gets `JOURNOL_GLOBAL_DAILY_LIMIT` (default 200).

## What keeps the angles honest

The server checks every model answer before anyone sees it (`lib/engine/grounding.ts`):

- A quotation must appear in the story, and is shown in the story's own wording.
- A gap or angle must rest on the story or on a report the search actually found. Angles that cite made-up report ids are dropped.
- An angle can't mention a year unless it appears in the story, in a report the angle cites, or is the current year.
- **"Not yet reported"** only appears when the web search ran. **"Partly covered"** needs a linked report. If the search couldn't run, neither label is shown.
- A new set of angles can't repeat a question already shown.

## Run it locally

```bash
npm ci
cp .env.example .env.local   # fill in the keys
npm run db:migrate
npm run dev
```

Without Clerk keys, set `JOURNOL_DEV_USER_ID=anything` in `.env.local` to use the app as a local user (development only).

## Checks

```bash
npm run lint
npx tsc --noEmit
npm test                                   # unit tests
TEST_DATABASE_URL=postgres://… npm test    # also runs route tests against an empty, migrated database
npm run build
```

## Layout

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Discover: paste a link, or start from today's stories (publisher RSS feeds, cached 15 minutes) |
| `app/read` | Shows progress while a story is analysed |
| `app/story/[analysisId]` | The story with numbered gaps, related sources and angles |
| `app/angle/[angleId]` | One angle: steps, where to look, who to ask, coverage, and the reporting brief |
| `app/angles` | My angles |
| `app/stories` | My stories |
| `app/account`, `app/admin` | The journalist's account page; the owner dashboard |
| `app/terms`, `app/privacy` | Terms of use and privacy policy |
| `app/api/analyses` | Reads, searches and analyses a story, streaming progress |
| `app/api/analyses/[id]/angles` | A different set of angles |
| `app/api/angles/[id]` | Saving an angle, its status and its steps |
| `app/api/angles/[id]/pitch` | Writing (POST) and editing (PUT) a pitch |
| `app/app`, `app/manifest.ts`, `public/sw.js` | Installing Journol as an app |
| `lib/engine` | The angle engine: prompts, related-coverage search and grounding checks |
| `lib/server` | Article reader (SSRF-safe), database, sign-in and the daily allowance |
| `db/migrations` | Database schema |

API keys stay on the server. Every analysis and angle is tied to the journalist who is signed in.
