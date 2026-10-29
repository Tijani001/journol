import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as analyse } from "@/app/api/analyses/route";
import { POST as moreAngles } from "@/app/api/analyses/[analysisId]/angles/route";
import { PATCH as patchAngle } from "@/app/api/angles/[angleId]/route";
import { PUT as rateAngle } from "@/app/api/angles/[angleId]/feedback/route";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { POST as writePitchRoute, PUT as editPitchRoute } from "@/app/api/angles/[angleId]/pitch/route";
import { ArticleReadError } from "@/lib/server/article-reader";
import { setIdentityForTesting } from "@/lib/server/auth";
import { getDatabasePool } from "@/lib/server/database";
import { setEngineServicesForTesting } from "@/lib/server/engine";
import { feedbackFor, getAnalysis, getAngle, listAnalyses, listSavedAngles, mergeGuestInto, ownerOverview, upsertUser } from "@/lib/server/store";
import { GUEST_COOKIE, verifyGuestToken } from "@/lib/server/guest";
import { vi } from "vitest";
import { PLAN, RAW_ANALYSIS, RAW_MORE_ANGLES, STORY, coverage, fakeModel, rawAngle, rawPitch } from "@/test/fixtures";

/**
 * Route tests against a real PostgreSQL database. Set TEST_DATABASE_URL to an
 * empty database with the migrations applied; the tests skip without it.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

let identity: { issuer: string; subject: string; guest?: boolean } | null = { issuer: "test", subject: "alice" };

function request(url: string, init: RequestInit = {}) {
  return new Request(`http://localhost${url}`, init);
}

async function events(response: Response) {
  const text = await response.text();
  return text.trim().split("\n").map((line) => JSON.parse(line));
}

function useEngine(answers: Record<string, unknown> = { search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: RAW_MORE_ANGLES }, readStory = async () => STORY) {
  const fake = fakeModel(answers);
  setEngineServicesForTesting({ model: fake.model, search: async () => coverage(), readStory, modelName: "fake" });
  return fake;
}

async function analyseStory(url = STORY.url) {
  return analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url }) }));
}

suite("routes", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl;
    setIdentityForTesting(async () => identity);
  });
  beforeEach(async () => {
    identity = { issuer: "test", subject: "alice" };
    delete process.env.JOURNOL_DAILY_LIMIT;
    delete process.env.JOURNOL_GLOBAL_DAILY_LIMIT;
    delete process.env.JOURNOL_GUEST_DAILY_LIMIT;
    delete process.env.JOURNOL_GUEST_CONNECTION_LIMIT;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    await getDatabasePool().query("TRUNCATE users, articles, analyses, angles, usage_events, angle_feedback, failures CASCADE");
  });
  afterEach(() => setEngineServicesForTesting(null));
  afterAll(async () => {
    setIdentityForTesting(null);
    await getDatabasePool().end();
    globalThis.__journolPostgresPool = undefined;
  });

  it("asks a signed-out visitor to sign in when guest mode is off", async () => {
    identity = null;
    process.env.JOURNOL_GUEST_MODE = "off";
    const response = await analyseStory();
    delete process.env.JOURNOL_GUEST_MODE;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Sign in to find angles." });
  });

  it("rejects something that isn't a link", async () => {
    useEngine();
    const response = await analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url: "not a link" }) }));
    expect(response.status).toBe(400);
  });

  it("streams progress, saves the analysis, and reuses it for the same story", async () => {
    const fake = useEngine();
    const streamed = await events(await analyseStory());
    expect(streamed.slice(0, 3)).toEqual([{ stage: "reading" }, { stage: "searching" }, { stage: "thinking" }]);
    const { analysisId } = streamed[3];
    expect(analysisId).toMatch(/^[0-9a-f-]{36}$/);

    const userId = await upsertUser("test", "alice");
    const analysis = await getAnalysis(userId, analysisId);
    expect(analysis?.article.title).toBe(STORY.title);
    expect(analysis?.gaps).toHaveLength(4);
    expect(analysis?.summary?.story).toContain("12 clinics");
    expect(analysis?.related.map((report) => report.id)).toEqual(["R1", "R2", "R3"]);
    expect(analysis?.angles.map((angle) => [angle.round, angle.headline])).toEqual([
      [1, "Who is behind Acme?"],
      [1, "What happened to Acme's last clinics?"],
      [1, "Will the clinics be ready by December?"],
    ]);

    const calls = fake.calls.length;
    const again = await events(await analyseStory());
    expect(again).toEqual([{ analysisId }]);
    expect(fake.calls.length).toBe(calls);
  });

  it("keeps each journalist's work private", async () => {
    useEngine();
    const [, , , { analysisId }] = await events(await analyseStory());
    const alice = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(alice, analysisId))!.angles[0].id;

    identity = { issuer: "test", subject: "bob" };
    const bob = await upsertUser("test", "bob");
    expect(await getAnalysis(bob, analysisId)).toBeNull();
    expect(await getAngle(bob, angleId)).toBeNull();
    const patch = await patchAngle(request(`/api/angles/${angleId}`, { method: "PATCH", body: JSON.stringify({ saved: true }) }), { params: Promise.resolve({ angleId }) });
    expect(patch.status).toBe(404);
    const more = await moreAngles(request(`/api/analyses/${analysisId}/angles`, { method: "POST" }), { params: Promise.resolve({ analysisId }) });
    expect(more.status).toBe(404);
  });

  it("saves an angle, tracks its status and steps, and lists it in My angles", async () => {
    useEngine();
    const [, , , { analysisId }] = await events(await analyseStory());
    const userId = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(userId, analysisId))!.angles[0].id;
    const send = (body: unknown) => patchAngle(request(`/api/angles/${angleId}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ angleId }) });

    expect((await send({ saved: true })).status).toBe(200);
    expect((await send({ status: "reporting", stepsDone: [true, false, false] })).status).toBe(200);
    expect((await send({ status: "filed" })).status).toBe(400);
    expect((await send({ stepsDone: "yes" })).status).toBe(400);

    const [saved] = await listSavedAngles(userId);
    expect(saved).toMatchObject({ id: angleId, headline: "Who is behind Acme?", storyTitle: STORY.title, status: "reporting", stepsDone: 1, stepsTotal: 3 });

    await send({ saved: false });
    expect(await listSavedAngles(userId)).toEqual([]);
  });

  it("finds a different round of angles, up to three rounds", async () => {
    useEngine({ search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: [RAW_MORE_ANGLES, { angles: [rawAngle({ question: "Round three?", gap_numbers: [3], coverage_ids: [] })] }] });
    const [, , , { analysisId }] = await events(await analyseStory());
    const call = () => moreAngles(request(`/api/analyses/${analysisId}/angles`, { method: "POST" }), { params: Promise.resolve({ analysisId }) });

    const second = await call();
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.round).toBe(2);
    expect(body.angles.map((angle: { headline: string }) => angle.headline)).toEqual(["Who decides where the clinics go?"]);

    expect((await call()).status).toBe(200);
    const fourth = await call();
    expect(fourth.status).toBe(409);
  });

  it("stops at the daily limit", async () => {
    process.env.JOURNOL_DAILY_LIMIT = "1";
    useEngine();
    await events(await analyseStory());
    const response = await analyseStory("https://sentinel.example/another-story");
    expect(response.status).toBe(429);
  });

  it("doesn't count a story it couldn't read against the limit", async () => {
    process.env.JOURNOL_DAILY_LIMIT = "1";
    useEngine(undefined, async () => { throw new ArticleReadError("BLOCKED", "The website didn't let Journol read this story. Try another link."); });
    const streamed = await events(await analyseStory());
    expect(streamed).toEqual([{ stage: "reading" }, { error: "The website didn't let Journol read this story. Try another link.", canPaste: true }]);
    useEngine();
    const ok = await events(await analyseStory());
    expect(ok.at(-1)).toHaveProperty("analysisId");
  });

  it("says so when no angle passes the checks, and saves nothing", async () => {
    const empty = { ...RAW_ANALYSIS, angles: [rawAngle({ gap_numbers: [], related_ids: [] })] };
    useEngine({ search_plan: PLAN, story_angles: empty, more_angles: RAW_MORE_ANGLES });
    const streamed = await events(await analyseStory());
    expect(streamed.at(-1)).toEqual({ error: "Journol couldn't find angles it could stand behind in this story. Try another story." });
    const count = await getDatabasePool().query("SELECT count(*)::int AS n FROM analyses");
    expect(count.rows[0].n).toBe(0);
  });

  it("analyses pasted text, and never offers a link for it", async () => {
    const fake = useEngine(undefined, async () => { throw new Error("must not fetch pasted stories"); });
    const text = `${STORY.title}\n\n${STORY.paragraphs.join("\n\n")}`;
    const streamed = await events(await analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ text }) })));
    const { analysisId } = streamed.at(-1);
    expect(analysisId).toBeTruthy();
    const userId = await upsertUser("test", "alice");
    const analysis = await getAnalysis(userId, analysisId);
    expect(analysis?.article.url).toMatch(/^pasted:/);
    expect(analysis?.article.title).toBe(STORY.title);
    expect(fake.calls.some((call) => call.name === "story_angles")).toBe(true);
    expect((await listAnalyses(userId)).map((story) => story.title)).toEqual([STORY.title]);
  });

  it("offers to paste the text when a link can't be read, and records the failure", async () => {
    useEngine(undefined, async () => { throw new ArticleReadError("BLOCKED", "The website didn't let Journol read this story. Try another link."); });
    const streamed = await events(await analyseStory("https://www.punchng.com/blocked-story"));
    expect(streamed.at(-1)).toMatchObject({ canPaste: true });
    const overview = await ownerOverview();
    expect(overview.failures[0]).toMatchObject({ kind: "read", code: "BLOCKED", host: "punchng.com" });
  });

  it("stops everyone at the overall daily cap", async () => {
    process.env.JOURNOL_GLOBAL_DAILY_LIMIT = "1";
    useEngine();
    await events(await analyseStory());
    identity = { issuer: "test", subject: "bob" };
    const response = await analyseStory("https://sentinel.example/another-story");
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("paused new stories");
  });

  it("records ratings only on the journalist's own angles", async () => {
    useEngine();
    const [, , , { analysisId }] = await events(await analyseStory());
    const alice = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(alice, analysisId))!.angles[0].id;
    const rate = (verdict: unknown) => rateAngle(request(`/api/angles/${angleId}/feedback`, { method: "PUT", body: JSON.stringify({ verdict }) }), { params: Promise.resolve({ angleId }) });
    expect((await rate("useful")).status).toBe(200);
    expect(await feedbackFor(alice, [angleId])).toEqual({ [angleId]: "useful" });
    expect((await rate("brilliant")).status).toBe(400);
    expect((await rate(null)).status).toBe(200);
    expect(await feedbackFor(alice, [angleId])).toEqual({});
    identity = { issuer: "test", subject: "bob" };
    expect((await rate("not_useful")).status).toBe(404);
  });

  it("deletes everything when a journalist deletes their account", async () => {
    useEngine();
    await events(await analyseStory());
    const bad = await deleteAccount(request("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: "yes" }) }));
    expect(bad.status).toBe(400);
    const done = await deleteAccount(request("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) }));
    expect(done.status).toBe(200);
    const left = await getDatabasePool().query("SELECT (SELECT count(*) FROM analyses)::int AS a, (SELECT count(*) FROM angles)::int AS g, (SELECT count(*) FROM articles)::int AS r, (SELECT count(*) FROM users)::int AS u");
    expect(left.rows[0]).toEqual({ a: 0, g: 0, r: 0, u: 0 });
  });

  it("writes a pitch, saves edits, and keeps it private", async () => {
    useEngine({ search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: RAW_MORE_ANGLES, story_pitch: rawPitch() });
    const [, , , { analysisId }] = await events(await analyseStory());
    const alice = await upsertUser("test", "alice");
    const angleId = (await getAnalysis(alice, analysisId))!.angles[0].id;
    const params = { params: Promise.resolve({ angleId }) };

    const written = await writePitchRoute(request(`/api/angles/${angleId}/pitch`, { method: "POST", body: JSON.stringify({ pitchingTo: "Premium Times" }) }), params);
    expect(written.status).toBe(200);
    const { pitch } = await written.json();
    expect(pitch).toMatchObject({ title: expect.stringContaining("Zamfara"), edited: false });
    expect((await getAngle(alice, angleId))?.pitch?.body).toBe(pitch.body);

    const edited = await editPitchRoute(request(`/api/angles/${angleId}/pitch`, { method: "PUT", body: JSON.stringify({ title: "My title", body: "My own words." }) }), params);
    expect(edited.status).toBe(200);
    expect((await getAngle(alice, angleId))?.pitch).toMatchObject({ title: "My title", body: "My own words.", edited: true });

    const runs = await getDatabasePool().query("SELECT count(*)::int AS n FROM usage_events WHERE kind = 'pitch'");
    expect(runs.rows[0].n).toBe(1);

    identity = { issuer: "test", subject: "bob" };
    expect((await writePitchRoute(request(`/api/angles/${angleId}/pitch`, { method: "POST" }), params)).status).toBe(404);
    expect((await editPitchRoute(request(`/api/angles/${angleId}/pitch`, { method: "PUT", body: JSON.stringify({ body: "x" }) }), params)).status).toBe(404);
  });

  async function startAsGuest(url = STORY.url, headers: Record<string, string> = {}) {
    identity = null;
    const response = await analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url }), headers }));
    const cookie = response.headers.get("set-cookie") ?? "";
    const token = cookie.match(new RegExp(`${GUEST_COOKIE}=([^;]+)`))?.[1];
    const subject = verifyGuestToken(token);
    return { response, subject };
  }

  it("lets someone without an account start as a guest", async () => {
    useEngine();
    const { response, subject } = await startAsGuest();
    expect(subject).toBeTruthy();
    const streamed = await events(response);
    const { analysisId } = streamed.at(-1);
    const guestRow = await getDatabasePool().query("SELECT id, is_guest FROM users WHERE auth_issuer = 'journol-guest' AND auth_subject = $1", [subject]);
    expect(guestRow.rows[0].is_guest).toBe(true);
    expect(await getAnalysis(guestRow.rows[0].id, analysisId)).not.toBeNull();
  });

  it("gives guests their own smaller daily allowance", async () => {
    process.env.JOURNOL_GUEST_DAILY_LIMIT = "1";
    useEngine();
    const { response, subject } = await startAsGuest();
    await events(response);
    identity = { issuer: "journol-guest", subject: subject!, guest: true };
    const second = await analyseStory("https://sentinel.example/another-story");
    expect(second.status).toBe(429);
    expect((await second.json()).error).toContain("free stories as a guest");
  });

  it("limits guests per connection, so clearing cookies doesn't help", async () => {
    process.env.JOURNOL_GUEST_CONNECTION_LIMIT = "1";
    useEngine();
    const first = await startAsGuest(STORY.url, { "cf-connecting-ip": "102.89.10.10" });
    await events(first.response);
    const fresh = await startAsGuest("https://sentinel.example/another-story", { "cf-connecting-ip": "102.89.10.10" });
    expect(fresh.response.status).toBe(429);
    const elsewhere = await startAsGuest("https://sentinel.example/third-story", { "cf-connecting-ip": "41.58.0.1" });
    expect(elsewhere.response.status).toBe(200);
  });

  it("asks a new guest to pass the human check when it's switched on", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    useEngine();
    const blocked = await startAsGuest();
    expect(blocked.response.status).toBe(403);
    expect(await blocked.response.json()).toMatchObject({ needsHumanCheck: true });
    expect(blocked.subject).toBeNull();

    vi.stubGlobal("fetch", async () => Response.json({ success: true }));
    identity = null;
    const passed = await analyse(request("/api/analyses", { method: "POST", body: JSON.stringify({ url: STORY.url, humanToken: "ok" }) }));
    vi.unstubAllGlobals();
    expect(passed.status).toBe(200);
    expect(passed.headers.get("set-cookie")).toContain(GUEST_COOKIE);
  });

  it("keeps pitches for accounts", async () => {
    useEngine({ search_plan: PLAN, story_angles: RAW_ANALYSIS, more_angles: RAW_MORE_ANGLES, story_pitch: rawPitch() });
    const { response, subject } = await startAsGuest();
    const { analysisId } = (await events(response)).at(-1);
    identity = { issuer: "journol-guest", subject: subject!, guest: true };
    const guestId = await upsertUser("journol-guest", subject!, true);
    const angleId = (await getAnalysis(guestId, analysisId))!.angles[0].id;
    const blocked = await writePitchRoute(request(`/api/angles/${angleId}/pitch`, { method: "POST" }), { params: Promise.resolve({ angleId }) });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ needsAccount: true });
  });

  it("moves a guest's work into their account when they sign up", async () => {
    useEngine();
    const { response, subject } = await startAsGuest();
    const { analysisId } = (await events(response)).at(-1);
    const alice = await upsertUser("test", "alice");
    expect(await mergeGuestInto(alice, "journol-guest", subject!)).toBe(true);
    expect((await getAnalysis(alice, analysisId))?.angles.length).toBe(3);
    const left = await getDatabasePool().query("SELECT count(*)::int AS n FROM users WHERE is_guest");
    expect(left.rows[0].n).toBe(0);
    expect(await mergeGuestInto(alice, "journol-guest", subject!)).toBe(false);
  });
});
