# Journol

Journol helps journalists find new angles and leads in stories that are already published.

Paste a link, or pick one of today's stories. Journol then:

1. **Reads the story** and keeps its paragraphs.
2. **Searches the web** for related coverage: other outlets on the same event, earlier reporting on the people and companies named, and how similar promises turned out. Copies of the same report or press release count once.
3. **Finds what the story leaves open.** These are numbered gaps, each tied to the story's own words or to a related report.
4. **Suggests three angles to chase.** Each one says why it matters and gives three first steps, where to look, who to ask, and whether anyone has already reported it. "Show different angles" gives up to two more sets.

Journalists can save angles to **My angles**, tick off steps, and mark each angle as New, Reporting or Published.

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
| `app/api/analyses` | Reads, searches and analyses a story, streaming progress |
| `app/api/analyses/[id]/angles` | A different set of angles |
| `app/api/angles/[id]` | Saving an angle, its status and its steps |
| `lib/engine` | The angle engine: prompts, related-coverage search and grounding checks |
| `lib/server` | Article reader (SSRF-safe), database, sign-in and the daily allowance |
| `db/migrations` | Database schema |

API keys stay on the server. Every analysis and angle is tied to the journalist who is signed in.
