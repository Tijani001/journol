import { ANGLE_TYPES, GAP_KINDS, type AngleType, type GapKind, type StoryGap } from "@/lib/lead-angles";

/**
 * Browser-side parsing of angle sets returned by /api/select-lead and by the
 * investigation endpoint (as workflow.leadOptions). Leads stored before
 * angle sets existed arrive as a single angle with no gaps.
 */

export type ClientAngle = Record<string, unknown> & {
  leadId: string;
  status: string;
  angleType: AngleType | null;
  headline: string;
  primaryLead: string;
  leadRationale: string;
  builtOnGaps: number[];
  evidencePath: string[];
  firstAction: string;
  scope: string;
  missingInformation: string[];
  confidence: string;
  outcome: "lead" | "insufficient_evidence";
};

export type ClientAngleSet = {
  outcome: "angles" | "insufficient_evidence";
  storyGaps: StoryGap[];
  angles: ClientAngle[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseStoryGaps(value: unknown): StoryGap[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((gap) => {
    if (!isRecord(gap) || !GAP_KINDS.includes(gap.kind as GapKind) || !str(gap.observation).trim()) return [];
    return [{ kind: gap.kind as GapKind, observation: str(gap.observation), excerpt: str(gap.excerpt) }];
  });
}

/** Accepts a lead content object carrying its leadId; returns null when unusable. */
export function parseAngle(value: unknown): ClientAngle | null {
  if (!isRecord(value) || !str(value.leadId) || !str(value.primaryLead).trim()) return null;
  const angleType = ANGLE_TYPES.includes(value.angleType as AngleType) ? value.angleType as AngleType : null;
  return {
    ...value,
    leadId: str(value.leadId),
    status: str(value.status) || "proposed",
    angleType,
    headline: str(value.headline),
    primaryLead: str(value.primaryLead),
    leadRationale: str(value.leadRationale),
    builtOnGaps: Array.isArray(value.builtOnGaps) ? value.builtOnGaps.filter((item): item is number => Number.isInteger(item) && item >= 0) : [],
    evidencePath: strings(value.evidencePath),
    firstAction: str(value.firstAction),
    scope: str(value.scope),
    missingInformation: strings(value.missingInformation),
    confidence: str(value.confidence),
    outcome: value.outcome === "insufficient_evidence" ? "insufficient_evidence" : "lead",
  };
}

/** Parses the /api/select-lead response. Throws when it holds no usable angle. */
export function angleSetFromSelectionResponse(data: Record<string, unknown>): ClientAngleSet {
  const angles = (Array.isArray(data.angles) ? data.angles : []).map(parseAngle).filter((angle): angle is ClientAngle => angle !== null);
  if (!angles.length) throw new Error("Journol did not return any usable angles. Please try again.");
  return {
    outcome: data.outcome === "insufficient_evidence" || angles[0].outcome === "insufficient_evidence" ? "insufficient_evidence" : "angles",
    storyGaps: parseStoryGaps(data.storyGaps),
    angles,
  };
}

/**
 * Rebuilds the angle set of a reopened investigation. Returns the set and the
 * angle the journalist had chosen (an approved lead), if any.
 */
export function angleSetFromWorkflow(workflow: Record<string, unknown>): { set: ClientAngleSet; chosen: ClientAngle | null } | null {
  const lead = isRecord(workflow.lead) ? workflow.lead : null;
  const options = Array.isArray(workflow.leadOptions) && workflow.leadOptions.length
    ? workflow.leadOptions
    : lead && isRecord(lead.content) ? [{ ...lead.content, leadId: lead.id, status: lead.status }] : [];
  const angles = options.map(parseAngle).filter((angle): angle is ClientAngle => angle !== null);
  if (!angles.length) return null;
  const currentId = lead && typeof lead.id === "string" ? lead.id : null;
  const chosen = angles.find((angle) => angle.leadId === currentId && angle.status === "approved") ?? null;
  return {
    set: {
      outcome: angles[0].outcome === "insufficient_evidence" ? "insufficient_evidence" : "angles",
      storyGaps: parseStoryGaps(angles[0].storyGaps),
      angles,
    },
    chosen,
  };
}

/** Deep Research instructions that point it at the chosen angle. */
export function deepResearchFocusFor(angle: Pick<ClientAngle, "primaryLead">) {
  return `Focus on this angle: ${angle.primaryLead}`.slice(0, 2_000);
}
