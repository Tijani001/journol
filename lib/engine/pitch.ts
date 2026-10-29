import { storyBlock } from "@/lib/engine/prompts";
import type { StructuredModel } from "@/lib/engine/run";
import { ANGLE_TYPE_LABELS, type Angle, type RelatedReport, type StoryGap, type StoryInput } from "@/lib/engine/types";
import { reportCredit } from "@/lib/format";

/**
 * Writes a standard ~250-word story pitch to an editor from one angle. The
 * pitch may only use facts from the story, the angle and the reports the
 * angle cites; anything the journalist must supply is left as a [placeholder].
 */

export type Pitch = { title: string; body: string; createdAt: string; edited: boolean };

export const PITCH_TARGET_WORDS = 250;
const MIN_WORDS = 200;
const MAX_WORDS = 300;

export const PITCH_SCHEMA = {
  type: "object",
  properties: {
    working_title: { type: "string" },
    pitch: { type: "string" },
  },
  required: ["working_title", "pitch"],
  additionalProperties: false,
} as const;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function pitchInstructions(today: Date): string {
  return `You help a journalist pitch a story to an editor. Today is ${today.toISOString().slice(0, 10)}.
Write a standard journalism story pitch of about ${PITCH_TARGET_WORDS} words (between 230 and 270 words), based on the angle given.

Structure, as short paragraphs in this order:
1. Greeting: "Dear [Editor's name]," (or the editor or outlet given).
2. The hook: one or two sentences that make an editor care, built on what was recently reported. Name the outlet that reported it.
3. What we know: the key facts from the original story and the related reports, attributed to the outlet that reported them.
4. The question: what nobody has answered yet, and why it matters to readers now.
5. How I'll report it: the specific records to check and people to ask.
6. Format and timing: a suggested format and length (for example a 1,200-word investigative feature), and "[timeline]" for when it can be filed.
7. About me: one line using what the journalist gave about themselves, or "[Your name], [one line about your reporting experience]".
8. Sign-off: "Best regards," then "[Your name]".

Rules:
- Use only facts from the story, the angle and the related reports provided. Never invent names, figures, dates, quotes, outcomes or sources.
- Present what isn't yet known as questions to answer, not as findings.
- Put anything the journalist must fill in inside square brackets, e.g. [Editor's name].
- Do not mention a year unless it appears in the material provided or is the current year.
- Plain, confident, professional English. No hype, no clichés, no headings, no bullet points.
- working_title: a sharp working headline of at most 12 words.`;
}

export type PitchContext = {
  story: StoryInput;
  angle: Angle;
  gaps: StoryGap[];
  related: RelatedReport[];
  pitchingTo?: string;
  aboutMe?: string;
};

function citedReports(context: PitchContext): RelatedReport[] {
  const ids = new Set([...context.angle.relatedIds, ...context.angle.coverageIds]);
  return context.related.filter((report) => ids.has(report.id));
}

export function pitchInput(context: PitchContext): string {
  const { angle } = context;
  const gaps = context.gaps.filter((gap) => angle.gapNumbers.includes(gap.number));
  const reports = citedReports(context);
  return [
    "ORIGINAL STORY",
    storyBlock(context.story),
    "",
    "THE ANGLE",
    `Type: ${ANGLE_TYPE_LABELS[angle.type]}`,
    `Headline: ${angle.headline}`,
    `Question: ${angle.question}`,
    `Why it matters: ${angle.why}`,
    angle.storyExcerpts.length ? `Story lines it rests on: ${angle.storyExcerpts.map((excerpt) => `"${excerpt}"`).join("; ")}` : "",
    gaps.length ? `What the story leaves open: ${gaps.map((gap) => gap.question).join(" ")}` : "",
    angle.whereToLook.length ? `Records to check: ${angle.whereToLook.map((item) => `${item.name} (${item.what})`).join("; ")}` : "",
    angle.whoToAsk.length ? `People to ask: ${angle.whoToAsk.map((item) => `${item.who} (${item.what})`).join("; ")}` : "",
    angle.coverageNote ? `Existing coverage: ${angle.coverageNote}` : "",
    "",
    "RELATED REPORTS THIS ANGLE CITES",
    reports.length
      ? reports.map((report) => `- ${report.title} (${reportCredit(report)}): ${report.snippet}`).join("\n")
      : "(none)",
    "",
    "ABOUT THE PITCH",
    `Pitching to: ${context.pitchingTo?.trim() || "(not given; use [Editor's name])"}`,
    `About the journalist: ${context.aboutMe?.trim() || "(not given; use the placeholder)"}`,
  ].filter((line) => line !== "").join("\n");
}

const YEAR = /\b(?:19|20)\d{2}\b/g;

function allowedYears(context: PitchContext, today: Date): Set<string> {
  const sources = [
    context.story.title,
    ...context.story.paragraphs,
    context.pitchingTo ?? "",
    context.aboutMe ?? "",
    ...citedReports(context).flatMap((report) => [report.title, report.snippet, report.publishedAt ?? ""]),
  ];
  const years = new Set(sources.flatMap((text) => text.match(YEAR) ?? []));
  years.add(String(today.getUTCFullYear()));
  if (context.story.publishedAt) years.add(String(new Date(context.story.publishedAt).getUTCFullYear()));
  return years;
}

export type PitchCheck = { pitch: { title: string; body: string } } | { problem: string };

/** Keeps the pitch to length and free of years that nothing supports. */
export function checkPitch(raw: unknown, context: PitchContext, today: Date): PitchCheck {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = typeof value.working_title === "string" ? value.working_title.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  const body = typeof value.pitch === "string"
    ? value.pitch.replace(/\r\n?/g, "\n").replace(/\s*\[?\bR\d+\b\]?(?=[\s.,;)])/g, "").replace(/\n{3,}/g, "\n\n").trim()
    : "";
  if (!title || !body) return { problem: "The pitch came back empty." };
  const words = wordCount(body);
  if (words < MIN_WORDS || words > MAX_WORDS) return { problem: `The pitch was ${words} words; it must be between 230 and 270.` };
  const allowed = allowedYears(context, today);
  const stray = [...`${title} ${body}`.matchAll(YEAR)].map((match) => match[0]).filter((year) => !allowed.has(year));
  if (stray.length) return { problem: `The pitch mentioned ${[...new Set(stray)].join(", ")}, which isn't in the material.` };
  return { pitch: { title, body } };
}

export class PitchError extends Error {}

/** Writes the pitch, with one corrected retry if the first draft fails the checks. */
export async function writePitch(context: PitchContext, deps: { model: StructuredModel; today?: Date }): Promise<{ title: string; body: string }> {
  const today = deps.today ?? new Date();
  const request = {
    name: "story_pitch",
    instructions: pitchInstructions(today),
    input: pitchInput(context),
    schema: PITCH_SCHEMA,
    maxOutputTokens: 1_200,
  };
  const first = checkPitch(await deps.model(request), context, today);
  if ("pitch" in first) return first.pitch;
  const second = checkPitch(
    await deps.model({ ...request, instructions: `${request.instructions}\n\nYour previous draft was rejected: ${first.problem} Fix that.` }),
    context,
    today,
  );
  if ("pitch" in second) return second.pitch;
  throw new PitchError(second.problem);
}
