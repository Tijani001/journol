/** Shared angle-set fixtures: a short Zamfara clinics story and a model reply built on it. */

export const ARTICLE = "The Federal Government on Tuesday said it would build 12 primary health centres in mining communities in Zamfara State at a cost of ₦4.5 billion. The Minister of Mines and Steel Development said the contract had been awarded to Acme Construction Ltd and that the clinics would be completed by December. Residents of Anka were not consulted, according to a local councillor.";
export const SOURCE = `FG to build 12 clinics in Zamfara mining communities\nPremium Times\n${ARTICLE}`;

export const validation = { factualBasis: true, target: true, scope: true, evidencePath: true, practicalFirstAction: true, answerability: true, explanation: "The story names the contractor, sum and deadline." };

export function angle(overrides: Record<string, unknown> = {}) {
  return {
    angleType: "follow_the_money",
    headline: "Who is Acme Construction?",
    primaryLead: "How was Acme Construction Ltd selected for the ₦4.5 billion clinics contract?",
    leadRationale: "The story names the contractor but not how it was chosen.",
    builtOnGaps: [0],
    evidencePath: ["Procurement records on NOCOPO", "CAC company search"],
    firstAction: "Search the Bureau of Public Procurement portal for the award.",
    scope: "The award process only, not construction progress.",
    missingInformation: ["The procurement method used"],
    validation,
    confidence: "high",
    ...overrides,
  };
}

export function angleSet(overrides: Record<string, unknown> = {}) {
  return {
    storyGaps: [
      { kind: "unexplained_actor", observation: "The contractor is named but never explained.", excerpt: "the contract had been awarded to Acme Construction Ltd" },
      { kind: "missing_voice", observation: "Residents were not heard.", excerpt: "Residents of Anka were not consulted" },
      { kind: "unsourced_figure", observation: "The cost has no source document.", excerpt: "a quote that is not in the story" },
    ],
    event: { name: "Clinic project announcement", date: "", eventStatus: "completed", basis: "The government announced the project." },
    outcome: "angles",
    insufficientExplanation: "",
    angles: [
      angle(),
      angle({ angleType: "promise_vs_delivery", headline: "Will 12 clinics be ready?", primaryLead: "Is construction of the 12 clinics on course for the December completion date?", builtOnGaps: [2] }),
      angle({ angleType: "missing_voices", headline: "What Anka residents say", primaryLead: "What do Anka residents say about how the clinic sites were chosen?", builtOnGaps: [1, 9] }),
    ],
    ...overrides,
  };
}
