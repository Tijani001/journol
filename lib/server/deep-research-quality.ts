import "server-only";

export const EVIDENCE_STATUSES = [
  "Documented",
  "Attributed",
  "Analytical inference",
  "Disputed",
  "Unverified",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type ResearchSourceCard = {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string | null;
  snippet: string;
  sourceType: "official" | "court_or_legal" | "academic" | "civil_society" | "journalism" | "other";
  evidenceMode: "search_snippet";
  limitations: string[];
  likelyRepeatedSourceIds: string[];
  institutionCategory?: string;
  contentRole?: string;
  originatingClaimSourceId?: string | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * A malformed correction response must not erase an earlier structured report.
 * The caller still validates the retained candidate fully, so this is a
 * resilience guard rather than an acceptance of invalid research.
 */
export function selectResearchRepairCandidate(
  primaryCandidate: Record<string, unknown> | null,
  repairedCandidate: unknown,
):
  | { report: Record<string, unknown>; usedRepair: true }
  | { report: Record<string, unknown> | null; usedRepair: false } {
  if (record(repairedCandidate)) return { report: repairedCandidate, usedRepair: true };
  return { report: primaryCandidate, usedRepair: false };
}

function normalized(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

function sourceReferencesAreGrounded(value: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((reference) => {
    if (!record(reference) || typeof reference.sourceId !== "string" || typeof reference.excerpt !== "string") return false;
    const source = sources.get(reference.sourceId);
    const excerpt = normalized(reference.excerpt);
    return Boolean(source && excerpt.length >= 12 && normalized(source.snippet).includes(excerpt));
  });
}

function sourceIdsAreKnown(value: unknown, sources: Map<string, ResearchSourceCard>) {
  return Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "string" && sources.has(id));
}

function evidenceStatusIsSafe(value: unknown, sourceIds: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!EVIDENCE_STATUSES.includes(value as EvidenceStatus)) return false;
  // A Tavily result card is a useful lead, but it is not a substitute for
  // reviewing the underlying document. Do not let a snippet alone become a
  // strong verification label.
  if (value === "Documented" && Array.isArray(sourceIds) && sourceIds.some((id) => sources.get(String(id))?.evidenceMode === "search_snippet")) return false;
  return true;
}

function findingIsGrounded(value: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!record(value)) return false;
  return sourceIdsAreKnown(value.sourceIds, sources)
    && sourceReferencesAreGrounded(value.evidence, sources)
    && evidenceStatusIsSafe(value.evidenceStatus, value.sourceIds, sources)
    && typeof value.claim === "string"
    && value.claim.trim().length > 0
    && typeof value.evidenceExplanation === "string";
}

export type FindingValidationStatus = "valid" | "repairable" | "unsupported" | "unsafe";

/**
 * Classifies a finding after synthesis or the single bounded correction pass.
 * This is an evidence-structure assessment, not independent fact checking:
 * it decides whether the finding can safely remain tied to the supplied
 * excerpts, never whether the underlying claim is true.
 */
export function classifyResearchFinding(value: unknown, sourceCards: ResearchSourceCard[]): FindingValidationStatus {
  const sources = new Map(sourceCards.map((source) => [source.id, source]));
  if (!record(value)) return "repairable";
  if (!sourceIdsAreKnown(value.sourceIds, sources)) return "unsafe";
  if (!doesNotOverstate(value, sources)) return "unsafe";
  if (!sourceReferencesAreGrounded(value.evidence, sources)) return "unsupported";
  if (!evidenceStatusIsSafe(value.evidenceStatus, value.sourceIds, sources)) return "repairable";
  if (typeof value.claim !== "string" || !value.claim.trim() || typeof value.evidenceExplanation !== "string") return "repairable";
  return "valid";
}

const FINDING_SECTIONS = [
  "keyFindings",
  "relatedIncidents",
  "patternsAndTrends",
  "institutionalResponses",
  "contradictionsAndGaps",
] as const;

export type FindingRecoveryResult = {
  report: Record<string, unknown> | null;
  evaluated: number;
  removed: number;
  statuses: Record<FindingValidationStatus, number>;
  recoverable: boolean;
};

/**
 * Removes individual findings that remain invalid after the sole repair pass.
 * Recovery requires a retained, source-grounded core finding; otherwise the
 * surviving fragments could distort the central investigation.
 */
export function removeInvalidResearchFindings(value: unknown, sourceCards: ResearchSourceCard[]): FindingRecoveryResult {
  const statuses: Record<FindingValidationStatus, number> = {
    valid: 0,
    repairable: 0,
    unsupported: 0,
    unsafe: 0,
  };
  if (!record(value)) return { report: null, evaluated: 0, removed: 0, statuses, recoverable: false };

  const originalCoreFindingCount = Array.isArray(value.keyFindings) ? value.keyFindings.length : 0;
  let evaluated = 0;
  let removed = 0;
  const report: Record<string, unknown> = { ...value };
  for (const section of FINDING_SECTIONS) {
    const entries = Array.isArray(value[section]) ? value[section] : [];
    const retained = entries.filter((entry) => {
      evaluated += 1;
      const status = classifyResearchFinding(entry, sourceCards);
      statuses[status] += 1;
      if (status === "valid") return true;
      removed += 1;
      return false;
    });
    report[section] = retained;
  }

  // A report with no retained core finding—or where most proposed core
  // findings were removed—cannot safely be presented as a Deep Research
  // report merely because peripheral sections survived. This is a minimum
  // evidence rule centred on the investigation, not a percentage of every
  // decorative section in the schema.
  const coreFindings = report.keyFindings;
  const recoverable = evaluated > 0
    && statuses.valid > 0
    && Array.isArray(coreFindings)
    && coreFindings.length > 0
    && coreFindings.length >= Math.ceil(originalCoreFindingCount / 2);
  return { report, evaluated, removed, statuses, recoverable };
}

function textOf(value: unknown) { return typeof value === "string" ? value : ""; }

const GENERIC_SUMMARY_LANGUAGE = [
  "raises serious concerns", "highlights the complex situation", "underscores the urgent need",
  "remains a significant challenge", "has far-reaching implications", "in an increasingly volatile environment",
  "stakeholders have expressed concern",
];

const MONTH_NAME = "january|february|march|april|may|june|july|august|september|october|november|december";

function selectedSourceText(sourceIds: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!Array.isArray(sourceIds)) return "";
  return sourceIds
    .map((sourceId) => typeof sourceId === "string" ? sources.get(sourceId)?.snippet ?? "" : "")
    .join(" ")
    .toLowerCase();
}

function claimedIndependentSourceCount(text: string) {
  const match = text.match(/\b(two|three|four|multiple) independent (?:reports|sources|accounts)\b/i);
  if (!match) return null;
  return match[1].toLowerCase() === "two" ? 2 : match[1].toLowerCase() === "three" ? 3 : match[1].toLowerCase() === "four" ? 4 : 2;
}

function independentSourceCount(sourceIds: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!Array.isArray(sourceIds)) return 0;
  // A card can identify the originating source or a likely repeated source.
  // This is deliberately conservative: it prevents syndicated coverage from
  // being described as independent corroboration, without asserting that two
  // different publishers necessarily are independent.
  return new Set(sourceIds.flatMap((sourceId) => {
    const source = typeof sourceId === "string" ? sources.get(sourceId) : null;
    if (!source) return [];
    return [source.originatingClaimSourceId ?? source.likelyRepeatedSourceIds[0] ?? source.id];
  })).size;
}

function summaryDatesAreSupported(text: string, sourceMaterial: string) {
  const dates = [
    ...text.matchAll(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAME})(?:\\s+\\d{4})?\\b`, "gi")),
    ...text.matchAll(new RegExp(`\\b(?:${MONTH_NAME})\\s+\\d{1,2}(?:,?\\s+\\d{4})?\\b`, "gi")),
    ...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
  ].map((match) => match[0].toLowerCase());
  const sourceDates = [
    ...sourceMaterial.matchAll(new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_NAME})(?:\\s+\\d{4})?\\b`, "gi")),
    ...sourceMaterial.matchAll(new RegExp(`\\b(?:${MONTH_NAME})\\s+\\d{1,2}(?:,?\\s+\\d{4})?\\b`, "gi")),
    ...sourceMaterial.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
  ].map((match) => match[0].toLowerCase());
  const normalizeDate = (date: string) => {
    const timestamp = Date.parse(date);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
  };
  return dates.every((date) => sourceDates.some((sourceDate) => sourceDate === date || (normalizeDate(date) !== null && normalizeDate(date) === normalizeDate(sourceDate))));
}

function summaryNumbersAreSupported(text: string, sourceMaterial: string) {
  // This checks that a material numeric token appears in retained source
  // material. It is not proof that the surrounding natural-language claim is
  // true; the model still has to preserve the figure's meaning and attribute it.
  const numbers = [...text.matchAll(/(?<![A-Za-z])\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => match[0].replaceAll(",", ""))
    .filter((number) => number.length > 0);
  const normalizedSource = sourceMaterial.replaceAll(",", "");
  return numbers.every((number) => normalizedSource.includes(number));
}

function currencyFamily(token: string) {
  if (token === "₦" || /^ngn$/i.test(token)) return "NGN";
  if (token === "$" || /^usd$/i.test(token)) return "USD";
  if (token === "€" || /^eur$/i.test(token)) return "EUR";
  if (token === "£" || /^gbp$/i.test(token)) return "GBP";
  return token.toUpperCase();
}

function summaryCurrenciesAreSupported(text: string, sourceMaterial: string) {
  const currencyPattern = /₦|\$|€|£|\b(?:NGN|USD|EUR|GBP)\b/gi;
  const summaryCurrencies = [...text.matchAll(currencyPattern)].map((match) => currencyFamily(match[0]));
  const sourceCurrencies = new Set([...sourceMaterial.matchAll(currencyPattern)].map((match) => currencyFamily(match[0])));
  return summaryCurrencies.every((currency) => sourceCurrencies.has(currency));
}

function summaryIsAnchoredToStory(text: string, originalStory?: { title?: string; text?: string }) {
  if (!originalStory) return true;
  const stopWords = new Set(["about", "after", "against", "among", "from", "their", "there", "these", "those", "with", "will", "were", "this", "that", "into", "over", "under"]);
  const candidates = `${originalStory.title ?? ""} ${originalStory.text ?? ""}`
    .toLowerCase().match(/[\p{L}\p{N}]{5,}/gu)?.filter((word) => !stopWords.has(word)) ?? [];
  if (!candidates.length) return true;
  const summary = normalized(text);
  return candidates.slice(0, 120).some((word) => summary.includes(normalized(word)));
}

export type SummaryValidationDiagnostic = "valid" | "missing_summary" | "unknown_source" | "unmatched_excerpt" | "overstatement" | "unsupported_date" | "unsupported_number" | "unsupported_currency" | "unsupported_independence" | "generic_language" | "story_anchor";

/**
 * Returns a privacy-safe quality category, never the summary text or source
 * content. It is a structural and editorial diagnostic, not fact checking.
 */
export function summaryValidationDiagnostic(value: unknown, sourceCards: ResearchSourceCard[], originalStory?: { title?: string; text?: string }): SummaryValidationDiagnostic {
  const sources = new Map(sourceCards.map((source) => [source.id, source]));
  if (!record(value) || !record(value.executiveSummary)) return "missing_summary";
  const summary = value.executiveSummary;
  if (typeof summary.text !== "string" || summary.text.trim().length < 20) return "missing_summary";
  if (!sourceIdsAreKnown(summary.sourceIds, sources)) return "unknown_source";
  if (!sourceReferencesAreGrounded(summary.evidence, sources)) return "unmatched_excerpt";
  const text = summary.text.trim();
  if (!doesNotOverstate(summary, sources)) return "overstatement";
  const material = selectedSourceText(summary.sourceIds, sources);
  if (!summaryDatesAreSupported(text, material)) return "unsupported_date";
  if (!summaryNumbersAreSupported(text, material)) return "unsupported_number";
  if (!summaryCurrenciesAreSupported(text, material)) return "unsupported_currency";
  const claimedIndependentSources = claimedIndependentSourceCount(text);
  if (claimedIndependentSources !== null && independentSourceCount(summary.sourceIds, sources) < claimedIndependentSources) return "unsupported_independence";
  const hasSpecificDetail = /\d|[$₦€£]|\b(?:according to|reported|stated|said|records show)\b/i.test(text);
  if (GENERIC_SUMMARY_LANGUAGE.some((phrase) => text.toLowerCase().includes(phrase)) && !hasSpecificDetail) return "generic_language";
  if (!summaryIsAnchoredToStory(text, originalStory)) return "story_anchor";
  return "valid";
}

function executiveSummaryIsGrounded(value: unknown, sources: Map<string, ResearchSourceCard>, originalStory?: { title?: string; text?: string }) {
  // Preserve the existing internal signature for report validation while the
  // exported helper above provides a safe, actionable diagnostic to routes.
  const sourceCards = [...sources.values()];
  return summaryValidationDiagnostic({ executiveSummary: value }, sourceCards, originalStory) === "valid";
}

/**
 * A safe, deliberately modest summary used only when the model's narrative
 * cannot be tied to the retained excerpts. It makes no new factual claim
 * about the story; it preserves a useful report whose findings have passed
 * the normal citation and quantity checks.
 */
export function qualifiedIntelligenceSummary(input: {
  originalTitle: string;
  originalText?: string;
  sourceCards: ResearchSourceCard[];
  report?: unknown;
}) {
  const candidate = record(input.report) ? attachSourceExcerpts(input.report, input.sourceCards) : null;
  const sources = new Map(input.sourceCards.map((source) => [source.id, source]));
  const claims: Array<{ claim: string; sourceIds: string[]; section: "core" | "institutional" | "related" }> = [];
  const seen = new Set<string>();

  // Reuse only findings that already pass the same source/excerpt checks used
  // elsewhere in the report. This preserves useful specificity without
  // upgrading any claim from a search snippet into an established fact.
  for (const section of ["keyFindings", "institutionalResponses", "relatedIncidents", "contradictionsAndGaps"] as const) {
    const entries = candidate && Array.isArray(candidate[section]) ? candidate[section] : [];
    for (const entry of entries) {
      if (classifyResearchFinding(entry, input.sourceCards) !== "valid" || !record(entry) || typeof entry.claim !== "string") continue;
      const claim = entry.claim.trim().replace(/\s+/g, " ");
      const key = normalized(claim);
      if (!claim || seen.has(key)) continue;
      seen.add(key);
      claims.push({
        claim: claim.slice(0, 600),
        sourceIds: Array.isArray(entry.sourceIds) ? entry.sourceIds.filter((id): id is string => typeof id === "string") : [],
        section: section === "keyFindings" ? "core" : section === "institutionalResponses" ? "institutional" : "related",
      });
      if (claims.length === 4) break;
    }
    if (claims.length === 4) break;
  }

  const timeline = candidate && Array.isArray(candidate.historicalTimeline)
    ? candidate.historicalTimeline.find((entry) => {
      if (!record(entry) || typeof entry.period !== "string" || typeof entry.event !== "string") return false;
      if (/^not established$/i.test(entry.period.trim())) return false;
      if (!sourceIdsAreKnown(entry.sourceIds, sources) || !sourceReferencesAreGrounded(entry.evidence, sources) || !doesNotOverstate(entry, sources)) return false;
      const material = selectedSourceText(entry.sourceIds, sources);
      const timelineText = `${entry.period} ${entry.event}`;
      return summaryDatesAreSupported(timelineText, material)
        && summaryNumbersAreSupported(timelineText, material)
        && summaryCurrenciesAreSupported(timelineText, material);
    })
    : null;
  const timelineSourceIds = timeline && Array.isArray(timeline.sourceIds)
    ? timeline.sourceIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  // The reconstructed text can contain a figure from any retained finding.
  // Keep every cited source rather than truncating this list for presentation:
  // truncation could remove the only excerpt containing a retained number,
  // causing the fallback itself to fail the same grounding check it is meant
  // to satisfy. Source cards are already bounded by the research workflow.
  const sourceIds = [...new Set([...claims.flatMap((item) => item.sourceIds), ...timelineSourceIds])];
  if ((claims.length || timeline) && sourceIds.length) {
    const core = claims.filter((item) => item.section === "core").map((item) => item.claim);
    const institutional = claims.filter((item) => item.section === "institutional").map((item) => item.claim);
    const related = claims.filter((item) => item.section === "related").map((item) => item.claim);
    const paragraphs = [
      core.length ? `Retrieved reporting attributes the central development as follows: ${core.join(" ")}` : "",
      institutional.length ? `The available institutional context is limited to attributed reporting: ${institutional.join(" ")}` : "",
      related.length ? `Related reporting in the retrieved material adds this context: ${related.join(" ")}` : "",
      timeline ? `A dated point in the available record is ${timeline.period}: ${timeline.event}` : "",
    ].filter(Boolean);
    return {
      // This is a reconstruction from findings that have already passed the
      // normal source/excerpt and quantity safeguards. It is deliberately
      // specific, but does not portray search snippets as independent proof.
      text: paragraphs.join("\n\n"),
      sourceIds,
    };
  }

  // If no model finding survives, preserve short source material rather than
  // repeating the headline or introducing a generic disclaimer. The report's
  // existing limitations section explains the constrained evidence base.
  const excerpts = input.sourceCards.slice(0, 2).map((source) => `${source.publisher || "A retrieved source"} reports: ${source.snippet.slice(0, 420).trim()}`);
  const excerptSourceIds = input.sourceCards.slice(0, 2).map((source) => source.id);
  return {
    text: excerpts.join(" "),
    sourceIds: excerptSourceIds,
  };
}

/** Conservative semantic tripwires for common, editorially harmful upgrades. */
function doesNotOverstate(value: Record<string, unknown>, sources: Map<string, ResearchSourceCard>) {
  const sourceText = (Array.isArray(value.sourceIds) ? value.sourceIds : []).map((id) => sources.get(String(id))?.snippet ?? "").join(" ").toLowerCase();
  const claim = `${textOf(value.claim)} ${textOf(value.text)} ${textOf(value.event)}`.toLowerCase();
  if (/tracing requests?/.test(sourceText) && /\b(people|individuals?) (disappeared|were disappeared|remain missing)\b/.test(claim)) return false;
  if (/tracing requests?/.test(sourceText) && /\b(confirmed|verified) missing (people|persons|individuals?)\b/.test(claim)) return false;
  if (/families?.{0,50}(searching|looking).{0,50}missing/.test(sourceText) && /(enforced disappearance|committed disappearances?)/.test(claim)) return false;
  if (/\ballocat(ed|ion)\b/.test(sourceText) && /\b(spent|disbursed)\b/.test(claim)) return false;
  if (/(arrest|detained)/.test(sourceText) && /\bconvict(ed|ion)\b/.test(claim)) return false;
  if (/\b(estimate|estimated)\b/.test(sourceText) && /\b(confirmed|verified|audited)\b/.test(claim)) return false;
  return true;
}

function calculationIsSound(value: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!record(value) || !Array.isArray(value.inputs) || value.inputs.length === 0) return false;
  if (!sourceIdsAreKnown(value.sourceIds, sources)) return false;
  if (!value.inputs.every((input) => record(input)
    && typeof input.label === "string"
    && typeof input.value === "number"
    && Number.isFinite(input.value)
    && typeof input.quantityKind === "string"
    && sourceReferencesAreGrounded(input.evidence, sources)
    // A numerical value must be present in the linked excerpt. This remains
    // structural validation, not independent verification, but stops an
    // otherwise well-formed item from introducing a new figure.
    && (() => {
      const material = selectedSourceText(input.sourceIds, sources).replaceAll(",", "");
      return material.includes(String(input.value).replaceAll(",", ""));
    })())) return false;
  // A single, sourced figure can be useful reporting context even when there
  // is no compatible comparator. It must remain explicitly non-calculative:
  // do not discard the entire report merely because the model correctly says
  // that an arithmetic comparison cannot be made.
  if (value.compatibility === "incompatible" || value.compatibility === "insufficient_data") {
    return value.operation === "none";
  }
  if (value.compatibility !== "compatible" || value.inputs.length < 2) return false;
  const kinds = new Set(value.inputs.map((input) => record(input) ? input.quantityKind : null));
  return kinds.size === 1 && ["sum", "difference", "ratio", "percentage_change"].includes(String(value.operation));
}

/**
 * Derives the result on the server so the model cannot quietly invent
 * arithmetic. Null means the supplied operation cannot be calculated safely.
 */
export function calculateResearchFigure(value: unknown): number | null {
  if (!record(value) || !Array.isArray(value.inputs)) return null;
  const inputs = value.inputs.map((input) => record(input) && typeof input.value === "number" ? input.value : Number.NaN);
  if (inputs.length < 2 || inputs.some((input) => !Number.isFinite(input))) return null;
  switch (value.operation) {
    case "sum": return inputs.reduce((total, input) => total + input, 0);
    case "difference": return inputs[0] - inputs[1];
    case "ratio": return inputs[1] === 0 ? null : inputs[0] / inputs[1];
    case "percentage_change": return inputs[0] === 0 ? null : ((inputs[1] - inputs[0]) / Math.abs(inputs[0])) * 100;
    default: return null;
  }
}

export function enrichNumericalAnalysis(report: Record<string, unknown>) {
  const analyses = Array.isArray(report.numericalAnalysis) ? report.numericalAnalysis : [];
  return {
    ...report,
    numericalAnalysis: analyses.map((analysis) => record(analysis)
      ? { ...analysis, calculatedResult: calculateResearchFigure(analysis) }
      : analysis),
  };
}

function evidenceFor(sourceIds: unknown, sources: Map<string, ResearchSourceCard>) {
  if (!Array.isArray(sourceIds)) return [];
  return sourceIds.flatMap((sourceId) => {
    const source = typeof sourceId === "string" ? sources.get(sourceId) : null;
    // This is copied from retained provider material, never generated by the
    // model. It gives journalists an inspectable basis for each citation.
    return source ? [{ sourceId, excerpt: source.snippet.slice(0, 700) }] : [];
  });
}

function addEvidence(value: unknown, sources: Map<string, ResearchSourceCard>) {
  return record(value) ? { ...value, evidence: evidenceFor(value.sourceIds, sources) } : value;
}

/** Adds preserved, source-card excerpts after the model has selected source IDs. */
export function attachSourceExcerpts(report: Record<string, unknown>, sourceCards: ResearchSourceCard[]) {
  const sources = new Map(sourceCards.map((source) => [source.id, source]));
  const mapFindings = (key: string) => Array.isArray(report[key]) ? report[key].map((item) => addEvidence(item, sources)) : report[key];
  const numericalAnalysis = Array.isArray(report.numericalAnalysis)
    ? report.numericalAnalysis.map((analysis) => record(analysis)
      ? { ...analysis, inputs: Array.isArray(analysis.inputs) ? analysis.inputs.map((input) => addEvidence(input, sources)) : analysis.inputs }
      : analysis)
    : report.numericalAnalysis;
  return {
    ...report,
    executiveSummary: addEvidence(report.executiveSummary, sources),
    keyFindings: mapFindings("keyFindings"),
    historicalTimeline: mapFindings("historicalTimeline"),
    relatedIncidents: mapFindings("relatedIncidents"),
    patternsAndTrends: mapFindings("patternsAndTrends"),
    institutionalResponses: mapFindings("institutionalResponses"),
    contradictionsAndGaps: mapFindings("contradictionsAndGaps"),
    actionableInvestigativeLeads: mapFindings("actionableInvestigativeLeads"),
    numericalAnalysis,
  };
}

/**
 * This is structural grounding, not fact verification. It ensures a report
 * can only point at supplied source snippets and exposes the limits of that
 * evidence to the journalist.
 */
export type ResearchReportValidationCategory = "summary" | "structure" | "findings" | "timeline" | "leads" | "numerical";
export type ResearchReportValidationResult =
  | { valid: true; reason: null; category: null }
  | { valid: false; reason: string; category: ResearchReportValidationCategory };

export function validateResearchReport(value: unknown, sourceCards: ResearchSourceCard[], originalStory?: { title?: string; text?: string }): ResearchReportValidationResult {
  if (!record(value)) return { valid: false, reason: "Report is not an object.", category: "structure" };
  const sources = new Map(sourceCards.map((source) => [source.id, source]));
  const requiredArrays = [
    "keyFindings",
    "historicalTimeline",
    "relatedIncidents",
    "patternsAndTrends",
    "institutionalResponses",
    "contradictionsAndGaps",
    "actionableInvestigativeLeads",
    "suggestedReportingQuestions",
    "limitations",
    "numericalAnalysis",
  ];
  if (!executiveSummaryIsGrounded(value.executiveSummary, sources, originalStory)) return { valid: false, reason: "Intelligence summary lacks grounded, relevant, or safely qualified detail.", category: "summary" };
  if (!requiredArrays.every((key) => Array.isArray(value[key]))) return { valid: false, reason: "Report is missing a required section.", category: "structure" };
  const evidenceSections = ["keyFindings", "relatedIncidents", "patternsAndTrends", "institutionalResponses", "contradictionsAndGaps"];
  if (!evidenceSections.every((key) => (value[key] as unknown[]).every((item) => findingIsGrounded(item, sources) && record(item) && doesNotOverstate(item, sources)))) return { valid: false, reason: "A finding lacks grounded evidence or overstates it.", category: "findings" };
  if (!(value.historicalTimeline as unknown[]).every((item) => record(item)
    && typeof item.period === "string"
    && typeof item.event === "string"
    && typeof item.whyItMatters === "string"
    && sourceIdsAreKnown(item.sourceIds, sources)
    && sourceReferencesAreGrounded(item.evidence, sources)
    && doesNotOverstate(item, sources))) return { valid: false, reason: "A timeline item lacks grounded evidence.", category: "timeline" };
  if (!(value.actionableInvestigativeLeads as unknown[]).every((item) => record(item)
    && sourceIdsAreKnown(item.sourceIds, sources)
    && sourceReferencesAreGrounded(item.evidence, sources)
    && ["investigativeQuestion", "whyItMatters", "existingEvidence", "evidenceGaps", "recordsToObtain", "accessibilityRationale", "peopleOrInstitutionsToContact", "verificationRequirements", "potentialObstacles", "safetyEthicalLegalConcerns"].every((key) => typeof item[key] === "string")
    && ["publicly_available", "formal_request", "voluntary_disclosure", "restricted_or_confidential", "unknown"].includes(String(item.recordAccessibility))
    && !(/(confidential|medical|humanitarian|tracing).{0,50}(database|records?)/i.test(String(item.recordsToObtain)) && item.recordAccessibility === "publicly_available")
    && Array.isArray(item.suggestedReportingSteps)
    && item.suggestedReportingSteps.every((step) => typeof step === "string"))) return { valid: false, reason: "An investigative lead is incomplete.", category: "leads" };
  if (!(value.numericalAnalysis as unknown[]).every((item) => calculationIsSound(item, sources))) return { valid: false, reason: "Numerical analysis is not auditable.", category: "numerical" };
  return { valid: true, reason: null, category: null };
}
