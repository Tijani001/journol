export type LeadValidationIssue = {
  category: "schema" | "grounding";
  code: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validates the durable lead shape and rejects dates unsupported by source text. */
export function validateLead(lead: unknown, sourceMaterial = ""): LeadValidationIssue | null {
  if (!isRecord(lead)) return { category: "schema", code: "NOT_OBJECT", message: "The response is not a valid lead object." };
  const sourceYears = new Set(sourceMaterial.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const outputYears = JSON.stringify(lead).match(/\b(?:19|20)\d{2}\b/g) ?? [];
  if (outputYears.some((year) => !sourceYears.has(year))) return { category: "grounding", code: "UNSUPPORTED_DATE", message: "The lead introduced a date not present in the supplied material." };
  for (const field of ["primaryLead", "leadRationale", "firstAction", "scope"]) {
    if (!nonEmptyString(lead[field])) return { category: "schema", code: "MISSING_REQUIRED_FIELD", message: `The lead is missing a valid ${field} field.` };
  }
  for (const field of ["evidencePath", "missingInformation", "excludedQuestions"]) {
    if (!Array.isArray(lead[field]) || !lead[field].every((item) => typeof item === "string")) return { category: "schema", code: "INVALID_LIST", message: `The lead contains an invalid ${field} list.` };
  }
  const validation = lead.validation;
  if (!isRecord(validation) || !["factualBasis", "target", "scope", "evidencePath", "practicalFirstAction", "answerability"].every((field) => typeof validation[field] === "boolean") || !nonEmptyString(validation.explanation)) return { category: "schema", code: "INVALID_VALIDATION", message: "The lead contains invalid validation results." };
  const event = lead.event;
  if (!isRecord(event) || !nonEmptyString(event.name) || typeof event.date !== "string" || !["completed", "upcoming", "unclear"].includes(String(event.eventStatus)) || !nonEmptyString(event.basis)) return { category: "schema", code: "INVALID_EVENT", message: "The lead contains invalid event details." };
  if (!["low", "medium", "high"].includes(String(lead.confidence))) return { category: "schema", code: "INVALID_CONFIDENCE", message: "The lead contains an invalid confidence rating." };
  if (!["lead", "insufficient_evidence"].includes(String(lead.outcome))) return { category: "schema", code: "INVALID_OUTCOME", message: "The lead contains an invalid outcome." };
  if (lead.outcome === "insufficient_evidence" && validation.factualBasis === true) return { category: "schema", code: "INCONSISTENT_OUTCOME", message: "The lead outcome conflicts with its factual-basis assessment." };
  return null;
}
