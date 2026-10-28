import { ANGLE_TYPE_LABELS, type Angle, type RelatedReport } from "@/lib/engine/types";
import { isPastedUrl, reportCredit } from "@/lib/format";

/** A plain-text reporting brief a journalist can paste into an email or notes. */
export function reportingBrief(input: {
  angle: Angle;
  story: { title: string; publisher: string; url: string };
  related: RelatedReport[];
}): string {
  const { angle, story } = input;
  const byId = new Map(input.related.map((report) => [report.id, report]));
  const cited = [...new Set([...angle.relatedIds, ...angle.coverageIds])]
    .map((id) => byId.get(id))
    .filter((report): report is RelatedReport => Boolean(report));
  const lines = [
    `ANGLE: ${angle.headline}`,
    `Type: ${ANGLE_TYPE_LABELS[angle.type]}`,
    "",
    `Question: ${angle.question}`,
    "",
    `Why it's worth chasing: ${angle.why}`,
    "",
    `From: "${story.title}" — ${story.publisher}`,
    ...(isPastedUrl(story.url) ? [] : [story.url]),
  ];
  if (angle.storyExcerpts.length) {
    lines.push("", "What the story says:", ...angle.storyExcerpts.map((excerpt) => `  “${excerpt}”`));
  }
  if (angle.steps.length) {
    lines.push("", "First steps:", ...angle.steps.map((step, index) => `  ${index + 1}. ${step.title}${step.detail ? ` — ${step.detail}` : ""}`));
  }
  if (angle.whereToLook.length) {
    lines.push("", "Where to look:", ...angle.whereToLook.map((item) => `  • ${item.name}${item.what ? ` — ${item.what}` : ""}`));
  }
  if (angle.whoToAsk.length) {
    lines.push("", "Who to ask:", ...angle.whoToAsk.map((item) => `  • ${item.who}${item.what ? ` — ${item.what}` : ""}`));
  }
  if (angle.coverageNote || cited.length) {
    lines.push("", "Has anyone reported it?");
    if (angle.coverageNote) lines.push(`  ${angle.coverageNote}`);
    lines.push(...cited.map((report) => `  • ${report.title} (${reportCredit(report)}) ${report.url}`));
  }
  lines.push("", "Found with Journol. Verify every detail before publishing.");
  return lines.join("\n");
}
