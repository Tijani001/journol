import type { RawAnalysis, RawAngle } from "@/lib/engine/prompts";
import type { RelatedCoverage } from "@/lib/engine/related";
import type { StructuredRequest } from "@/lib/engine/run";
import type { RelatedReport, StoryInput } from "@/lib/engine/types";

/** An invented story, outlets and reports used across tests and local previews. */
export const STORY: StoryInput = {
  url: "https://sentinel.example/news/fg-to-build-12-clinics-in-zamfara",
  title: "FG to build 12 clinics in Zamfara mining communities",
  publisher: "The Sentinel",
  publishedAt: "2026-10-26T08:00:00.000Z",
  paragraphs: [
    "The Federal Government says it will build 12 primary health clinics in mining communities across Zamfara State, at a cost of ₦4.5 billion.",
    "The Minister of Mines told reporters in Abuja on Monday that the contract had been awarded to Acme Construction Ltd and that the clinics would be ready by December.",
    "He said the clinics would serve communities affected by lead poisoning from artisanal gold mining, which has killed hundreds of children since 2010.",
    "“This is a promise we intend to keep,” the minister said. He did not say how many of the clinics had been started.",
    "Residents of Anka said they had not been consulted about where the clinics would be built.",
  ],
};

export const REPORTS: RelatedReport[] = [
  {
    id: "R1",
    title: "Zamfara clinic contract signed",
    url: "https://ledger.example/zamfara-clinic-contract",
    publisher: "ledger.example",
    publishedAt: "2026-10-20T00:00:00.000Z",
    snippet: "The ministry signed a ₦4.5 billion contract with Acme Construction Ltd for clinics in Zamfara mining areas.",
    note: "",
    copies: [],
  },
  {
    id: "R2",
    title: "Acme's unfinished clinics in Sokoto",
    url: "https://ledger.example/acme-sokoto-clinics",
    publisher: "ledger.example",
    publishedAt: "2024-03-12T00:00:00.000Z",
    snippet: "Two years after Acme Construction Ltd was paid to build six clinics in Sokoto in 2022, four remain unfinished, residents say.",
    note: "",
    copies: [],
  },
  {
    id: "R3",
    title: "Lead poisoning: Anka families wait for help",
    url: "https://courier.example/anka-lead-poisoning",
    publisher: "courier.example",
    publishedAt: "2026-09-02T00:00:00.000Z",
    snippet: "Families in Anka say promised treatment for lead poisoning has not arrived, and the state's only clinic in the area closed last year.",
    note: "",
    copies: [],
  },
];

export function coverage(overrides: Partial<RelatedCoverage> = {}): RelatedCoverage {
  return { status: "searched", reports: REPORTS, repeatedCount: 2, ...overrides };
}

export function rawAngle(overrides: Partial<RawAngle> = {}): RawAngle {
  return {
    type: "who_benefits",
    headline: "Who is behind Acme?",
    question: "Who owns Acme Construction Ltd, and how did it win a ₦4.5 billion contract?",
    why: "A ₦4.5 billion contract went to a company the story never explains.",
    gap_numbers: [1],
    related_ids: [],
    coverage: "not_yet_reported",
    coverage_note: "Two reports mention Acme; neither asks who owns it.",
    coverage_ids: ["R1"],
    story_excerpts: ["the contract had been awarded to Acme Construction Ltd"],
    where_to_look: [{ name: "CAC company search", what: "Directors and shareholders" }],
    who_to_ask: [{ who: "Ministry of Mines spokesperson", what: "How Acme was selected" }],
    steps: [
      { title: "Look up Acme on the CAC register", detail: "Note its directors." },
      { title: "Find the award on NOCOPO", detail: "Check whether it was openly tendered." },
      { title: "Ask the ministry how Acme was chosen", detail: "Put the findings to them in writing." },
    ],
    ...overrides,
  };
}

export const RAW_ANALYSIS: RawAnalysis = {
  story_summary: "The Federal Government says it will build 12 clinics in Zamfara mining communities for ₦4.5 billion, with Acme Construction Ltd as contractor and a December deadline.",
  findings_summary: "The story never says who owns Acme or how many clinics have started. Daily Ledger [R2] reported in 2024 that Acme left four of six clinics in Sokoto unfinished.",
  gaps: [
    { kind: "unexplained_actor", question: "Who owns Acme Construction Ltd?", excerpt: "the contract had been awarded to Acme Construction Ltd", related_id: null },
    { kind: "promise_or_deadline", question: "Can 12 clinics really be ready by December?", excerpt: "the clinics would be ready by December", related_id: null },
    { kind: "missing_voice", question: "Why weren't Anka residents consulted?", excerpt: "had not been consulted about where the clinics would be built", related_id: null },
    { kind: "unsourced_figure", question: "This excerpt is invented and must be dropped", excerpt: "the clinics will cost ten trillion naira", related_id: null },
    { kind: "missing_context", question: "What happened to the area's only clinic, which closed last year?", excerpt: null, related_id: "R3" },
  ],
  related_notes: [
    { id: "R1", note: "Confirms the contract but says nothing about Acme's owners." },
    { id: "R2", note: "Acme left four of six Sokoto clinics unfinished." },
  ],
  angles: [
    rawAngle(),
    rawAngle({
      type: "has_it_happened_before",
      headline: "What happened to Acme's last clinics?",
      question: "Did Acme Construction Ltd finish the clinics it was paid to build in Sokoto?",
      why: "Another outlet found four of six Acme clinics in Sokoto unfinished in 2024.",
      gap_numbers: [],
      related_ids: ["R2"],
      coverage: "partly_covered",
      coverage_ids: ["R2"],
      story_excerpts: [],
    }),
    rawAngle({
      type: "promise_vs_delivery",
      headline: "Will the clinics be ready by December?",
      question: "How many of the 12 Zamfara clinics have been started, and can they be ready by December?",
      why: "The minister gave a deadline but not a progress report.",
      gap_numbers: [2],
      coverage_ids: [],
      story_excerpts: ["He did not say how many of the clinics had been started"],
    }),
  ],
};

export const RAW_MORE_ANGLES = {
  angles: [
    rawAngle({
      type: "missing_voices",
      headline: "Who decides where the clinics go?",
      question: "Who chose the sites for the 12 clinics, and why weren't Anka residents consulted?",
      why: "Residents say nobody asked them.",
      gap_numbers: [3],
      coverage_ids: [],
      story_excerpts: ["Residents of Anka said they had not been consulted"],
    }),
    // A repeat of an angle already shown; must be dropped.
    rawAngle(),
  ],
};

/** A fake model that answers each named request from the given table. */
export function fakeModel(answers: Record<string, unknown | unknown[]>) {
  const calls: StructuredRequest[] = [];
  const queues = new Map(Object.entries(answers).map(([name, value]) => [name, Array.isArray(value) && name !== "search_plan" ? [...value] : [value]]));
  const model = async (request: StructuredRequest) => {
    calls.push(request);
    const queue = queues.get(request.name);
    if (!queue || !queue.length) throw new Error(`No fake answer for ${request.name}`);
    return queue.length > 1 ? queue.shift() : queue[0];
  };
  return { model, calls };
}

export const PLAN = { key_names: ["Acme Construction Ltd", "Anka"], search_queries: ["Acme Construction Ltd clinics", "Zamfara clinics contract"] };

/** A ~250-word pitch, as the model might return it. */
export function rawPitch(overrides: { words?: number; extra?: string } = {}) {
  const opening = "Dear [Editor's name], The Sentinel reported that the Federal Government will build 12 clinics in Zamfara mining communities for ₦4.5 billion, with Acme Construction Ltd as contractor. Daily Ledger [R2] found Acme left four of six clinics in Sokoto unfinished.";
  const filler = "I will check the CAC register and the NOCOPO award notice and ask the ministry how Acme was chosen.";
  const words = overrides.words ?? 250;
  const parts = [opening, overrides.extra ?? ""];
  let text = parts.join(" ").trim();
  while (text.split(/\s+/).length < words) text += ` ${filler}`;
  text = text.split(/\s+/).slice(0, words).join(" ");
  return { working_title: "Who is behind the ₦4.5bn Zamfara clinics contractor?", pitch: `${text}\n\nBest regards,\n[Your name]` };
}
