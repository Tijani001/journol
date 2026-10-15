import { describe, expect, it } from "vitest";
import { attachSourceExcerpts, calculateResearchFigure, classifyResearchFinding, enrichNumericalAnalysis, qualifiedIntelligenceSummary, removeInvalidResearchFindings, selectResearchRepairCandidate, summaryValidationDiagnostic, validateResearchReport, type ResearchSourceCard } from "@/lib/server/deep-research-quality";

const source: ResearchSourceCard = {
  id: "source-1",
  title: "Official response",
  url: "https://records.example/response",
  publisher: "records.example",
  publishedAt: null,
  snippet: "The ministry said the allocation was approved after a public review.",
  sourceType: "official",
  evidenceMode: "search_snippet",
  limitations: ["Snippet only."],
  likelyRepeatedSourceIds: [],
};

const evidence = [{ sourceId: "source-1", excerpt: "The ministry said the allocation was approved" }];
const finding = { claim: "The ministry said the allocation was approved.", evidenceStatus: "Attributed", alignmentStatus: "attributed_statement", sourceIds: ["source-1"], evidence, evidenceExplanation: "The retrieved snippet attributes this statement to the ministry." };

function report(overrides: Record<string, unknown> = {}) {
  return {
    executiveSummary: { text: "The available material records an official statement.", sourceIds: ["source-1"], evidence },
    keyFindings: [finding],
    historicalTimeline: [{ period: "Not established", event: "An official statement was reported.", location: "Not established", whyItMatters: "It provides context.", relationship: "A reporting question, not a demonstrated connection.", sourceIds: ["source-1"], evidence }],
    relatedIncidents: [],
    patternsAndTrends: [],
    institutionalResponses: [],
    contradictionsAndGaps: [],
    numericalAnalysis: [],
    actionableInvestigativeLeads: [{ investigativeQuestion: "What records support the approval?", whyItMatters: "The record may clarify accountability.", existingEvidence: "The ministry's attributed statement.", evidenceGaps: "The underlying review record is unavailable.", recordsToObtain: "The public review and approval record.", recordAccessibility: "formal_request", accessibilityRationale: "Availability has not been established.", peopleOrInstitutionsToContact: "The ministry and reviewing body.", suggestedReportingSteps: ["Request the review record."], verificationRequirements: "Obtain and verify the underlying record.", potentialObstacles: "The record may not be public.", safetyEthicalLegalConcerns: "Use lawful request channels.", sourceIds: ["source-1"], evidence }],
    suggestedReportingQuestions: ["Which record establishes the approval?"],
    limitations: ["Only a search-result snippet was reviewed."],
    ...overrides,
  };
}

describe("Deep Research quality controls", () => {
  it("retains the validated primary candidate when a bounded repair is not a structured object", () => {
    const primary = { keyFindings: [] };
    expect(selectResearchRepairCandidate(primary, null)).toEqual({ report: primary, usedRepair: false });
    expect(selectResearchRepairCandidate(primary, "not a report")).toEqual({ report: primary, usedRepair: false });
    expect(selectResearchRepairCandidate(primary, { keyFindings: ["repaired"] })).toEqual({ report: { keyFindings: ["repaired"] }, usedRepair: true });
  });

  it("accepts a carefully attributed claim with a matching retrieved excerpt", () => {
    expect(validateResearchReport(report(), [source])).toEqual({ valid: true, reason: null, category: null });
  });

  it("rejects a strong documented label when only a search snippet is available", () => {
    const invalid = report({ keyFindings: [{ ...finding, evidenceStatus: "Documented" }] });
    expect(validateResearchReport(invalid, [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects fabricated quotations and unknown citations", () => {
    const fabricated = report({ keyFindings: [{ ...finding, evidence: [{ sourceId: "source-2", excerpt: "Invented quotation." }] }] });
    expect(validateResearchReport(fabricated, [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("classifies unsupported and unsafe findings without weakening source checks", () => {
    expect(classifyResearchFinding({ ...finding, evidence: [{ sourceId: "source-1", excerpt: "Words not present in the source." }] }, [source])).toBe("unsupported");
    expect(classifyResearchFinding({ ...finding, sourceIds: ["source-does-not-exist"] }, [source])).toBe("unsafe");
    expect(classifyResearchFinding({ ...finding, evidenceStatus: "Documented" }, [source])).toBe("repairable");
  });

  it("removes one unsupported finding while preserving a source-grounded core report", () => {
    const unsafe = { ...finding, claim: "The ministry spent the allocation.", evidenceStatus: "Attributed" };
    const candidate = report({ keyFindings: [finding, unsafe] });
    const recovered = removeInvalidResearchFindings(candidate, [source]);
    expect(recovered).toMatchObject({ evaluated: 2, removed: 1, recoverable: true });
    expect((recovered.report?.keyFindings as unknown[])).toEqual([finding]);
  });

  it("keeps independently grounded timeline and lead sections while replacing the summary after a finding is removed", () => {
    const candidate = report({ keyFindings: [finding, { ...finding, claim: "The ministry spent the allocation." }] });
    const recovered = removeInvalidResearchFindings(candidate, [source]);
    const coherent = attachSourceExcerpts({
      ...recovered.report,
      executiveSummary: qualifiedIntelligenceSummary({ originalTitle: "Ministry review", sourceCards: [source] }),
      limitations: ["One generated finding was removed because it could not be safely validated."],
    }, [source]);
    const summary = coherent.executiveSummary as { text: string };
    expect(summary.text).not.toContain("spent");
    expect(validateResearchReport(coherent, [source])).toEqual({ valid: true, reason: null, category: null });
  });

  it("keeps every supporting source when a qualified summary retains a later numeric finding", () => {
    const sources = Array.from({ length: 8 }, (_, index) => ({
      ...source,
      id: `source-${index + 1}`,
      snippet: index === 7
        ? "The agency said its 2026 report was published after a public review."
        : `The agency said report ${index + 1} was published after a public review.`,
    }));
    const findings = [0, 2, 4, 6].map((index, findingIndex) => {
      const primary = sources[index];
      const supporting = sources[index + 1];
      const claim = findingIndex === 3
        ? "The agency said its 2026 report was published after a public review."
        : `The agency said report ${index + 1} was published after a public review.`;
      return {
        claim,
        evidenceStatus: "Attributed",
        alignmentStatus: "attributed_statement",
        sourceIds: [primary.id, supporting.id],
        evidence: [{ sourceId: findingIndex === 3 ? supporting.id : primary.id, excerpt: findingIndex === 3 ? supporting.snippet : primary.snippet }],
        evidenceExplanation: "The retrieved excerpt attributes this statement to the agency.",
      };
    });
    const summary = qualifiedIntelligenceSummary({
      originalTitle: "Agency report",
      sourceCards: sources,
      report: report({ keyFindings: findings }),
    });

    const enriched = attachSourceExcerpts({ executiveSummary: summary }, sources);
    expect(summary.sourceIds).toHaveLength(8);
    expect(summaryValidationDiagnostic(enriched, sources)).toBe("valid");
  });

  it("does not recover a report when removing invalid findings leaves no supported core finding", () => {
    const candidate = report({ keyFindings: [{ ...finding, claim: "The ministry spent the allocation." }] });
    const recovered = removeInvalidResearchFindings(candidate, [source]);
    expect(recovered).toMatchObject({ evaluated: 1, removed: 1, recoverable: false });
  });

  it("does not recover a report when most proposed core findings are unsupported", () => {
    const invalidOne = { ...finding, claim: "The ministry spent the allocation." };
    const invalidTwo = { ...finding, evidence: [{ sourceId: "source-1", excerpt: "Words not present in the source." }] };
    const candidate = report({ keyFindings: [finding, invalidOne, invalidTwo] });
    const recovered = removeInvalidResearchFindings(candidate, [source]);
    expect(recovered).toMatchObject({ evaluated: 3, removed: 2, recoverable: false });
  });

  it("calculates sourced numerical comparisons deterministically", () => {
    const analysis = { operation: "percentage_change", inputs: [{ value: 100 }, { value: 125 }] };
    expect(calculateResearchFigure(analysis)).toBe(25);
    expect(enrichNumericalAnalysis({ numericalAnalysis: [analysis] }).numericalAnalysis).toEqual([expect.objectContaining({ calculatedResult: 25 })]);
  });

  it("attaches inspectable excerpts from the retained source card instead of trusting model quotations", () => {
    const raw = report({
      executiveSummary: { text: "An attributed statement was found.", sourceIds: ["source-1"] },
      keyFindings: [{ ...finding, evidence: undefined }],
      historicalTimeline: [],
      actionableInvestigativeLeads: [],
    });
    const enriched = attachSourceExcerpts(raw, [source]);
    const summary = enriched.executiveSummary as Record<string, unknown>;
    const keyFinding = (enriched.keyFindings as Array<Record<string, unknown>>)[0];
    expect(summary.evidence).toEqual([{ sourceId: "source-1", excerpt: source.snippet }]);
    expect(keyFinding.evidence).toEqual([{ sourceId: "source-1", excerpt: source.snippet }]);
  });

  it("rejects numerical claims that lack evidence or use an invalid operation", () => {
    const invalid = report({ numericalAnalysis: [{ label: "Unsupported", inputs: [{ label: "A", value: 1, units: "votes", qualification: "Reported", evidence }], operation: "forecast", assumption: "None", interpretation: "None", sourceIds: ["source-1"] }] });
    expect(validateResearchReport(invalid, [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("retains a sourced figure when the report explicitly says no safe comparison can be calculated", () => {
    const tracingSource = { ...source, snippet: "The ICRC said it received more than 1,800 tracing requests from families." };
    const limited = report({ executiveSummary: {
      text: "The ICRC said it received more than 1,800 tracing requests from families.",
      sourceIds: ["source-1"],
      evidence: [{ sourceId: "source-1", excerpt: tracingSource.snippet }],
    }, keyFindings: [], historicalTimeline: [], actionableInvestigativeLeads: [], numericalAnalysis: [{
      label: "Reported tracing requests",
      inputs: [{
        label: "Family tracing requests",
        value: 1800,
        units: "requests",
        quantityKind: "requests",
        period: "Not established in the retrieved excerpt",
        geographicScope: "Not established in the retrieved excerpt",
        reportingInstitution: "ICRC",
        qualification: "More than 1,800 requests; this is not a count of confirmed missing people.",
        sourceIds: ["source-1"],
        evidence: [{ sourceId: "source-1", excerpt: tracingSource.snippet }],
      }],
      compatibility: "insufficient_data",
      operation: "none",
      assumption: "No compatible comparator was available in the retrieved material.",
      interpretation: "The figure is an attributed administrative count, not a calculation or confirmed count of people.",
      sourceIds: ["source-1"],
    }] });
    expect(validateResearchReport(limited, [tracingSource])).toEqual({ valid: true, reason: null, category: null });
  });

  it("still rejects a single input presented as a compatible calculation", () => {
    const invalid = report({ numericalAnalysis: [{
      label: "Unsupported comparison",
      inputs: [{
        label: "One figure",
        value: 1,
        units: "requests",
        quantityKind: "requests",
        period: "2026",
        geographicScope: "Unknown",
        reportingInstitution: "Unknown",
        qualification: "Reported.",
        sourceIds: ["source-1"],
        evidence,
      }],
      compatibility: "compatible",
      operation: "difference",
      assumption: "None",
      interpretation: "Unsupported.",
      sourceIds: ["source-1"],
    }] });
    expect(validateResearchReport(invalid, [source])).toEqual(expect.objectContaining({ valid: false, category: "numerical" }));
  });

  it("does not turn tracing requests into a count of disappeared people", () => {
    const tracingSource = { ...source, snippet: "ICRC said it received more than 1,800 tracing requests from families." };
    const unsafe = report({ keyFindings: [{ ...finding, claim: "More than 1,800 people disappeared.", evidence: [{ sourceId: "source-1", excerpt: tracingSource.snippet }] }] });
    expect(validateResearchReport(unsafe, [tracingSource])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("does not turn families searching for relatives into enforced disappearance findings", () => {
    const missingSource = { ...source, snippet: "Families are searching for missing relatives after the fighting." };
    const unsafe = report({ keyFindings: [{ ...finding, claim: "Conflict parties committed enforced disappearances.", evidence: [{ sourceId: "source-1", excerpt: missingSource.snippet }] }] });
    expect(validateResearchReport(unsafe, [missingSource])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("treats allocated money as distinct from money spent", () => {
    const unsafe = report({ keyFindings: [{ ...finding, claim: "The ministry spent the allocation.", evidenceStatus: "Analytical inference" }] });
    expect(validateResearchReport(unsafe, [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects public-access recommendations for confidential tracing records", () => {
    const unsafeLead = { ...report().actionableInvestigativeLeads[0] as Record<string, unknown>, recordsToObtain: "The confidential humanitarian tracing database.", recordAccessibility: "publicly_available" };
    expect(validateResearchReport(report({ actionableInvestigativeLeads: [unsafeLead] }), [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("accepts an exact date and attributed figure when both appear in the retained source evidence", () => {
    const dated = { ...source, snippet: "On 7 September 2026, the ministry said it approved a ₦10 billion allocation for the 2026 programme. The ministry said the allocation was approved after a public review." };
    const datedEvidence = [{ sourceId: "source-1", excerpt: dated.snippet }];
    const summary = { text: "On 7 September 2026, the ministry said it approved a ₦10 billion allocation for the 2026 programme.", sourceIds: ["source-1"], evidence: datedEvidence };
    expect(validateResearchReport(report({ executiveSummary: summary }), [dated])).toEqual({ valid: true, reason: null, category: null });
  });

  it("accepts equivalent date, separator, percentage, and currency formatting without accepting a new figure", () => {
    const formatted = { ...source, snippet: "On 7 September 2026, the ministry said a ₦10,000 allocation represented a 12.5% increase. The ministry said the allocation was approved after a public review." };
    const summary = { text: "On September 7, 2026, the ministry said the NGN 10,000 allocation represented a 12.5% increase.", sourceIds: ["source-1"], evidence: [{ sourceId: "source-1", excerpt: formatted.snippet }] };
    expect(validateResearchReport(report({ executiveSummary: summary }), [formatted])).toEqual({ valid: true, reason: null, category: null });
  });

  it("rejects a currency that is absent from the cited source", () => {
    const formatted = { ...source, snippet: "The ministry said a ₦10,000 allocation was approved. The ministry said the allocation was approved after a public review." };
    const summary = { text: "The ministry said a USD 10,000 allocation was approved.", sourceIds: ["source-1"], evidence: [{ sourceId: "source-1", excerpt: formatted.snippet }] };
    expect(validateResearchReport(report({ executiveSummary: summary }), [formatted])).toEqual(expect.objectContaining({ valid: false, category: "summary" }));
  });

  it("rejects an unsupported exact date or number in the Intelligence Summary", () => {
    const summary = { text: "On 7 September 2026, the ministry approved ₦12 billion.", sourceIds: ["source-1"], evidence };
    expect(validateResearchReport(report({ executiveSummary: summary }), [source])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("preserves the meaning of tracing requests, allocations, arrests, and estimates in the summary", () => {
    const quantities = { ...source, snippet: "The ICRC said it received more than 1,800 tracing requests. The ministry allocated ₦10 billion. Police reported 50 arrests and an estimated loss of ₦2 billion. The ministry said the allocation was approved after a public review." };
    const unsafe = { text: "More than 1,800 confirmed missing people were recorded, ₦10 billion was spent, and 50 convictions confirmed a verified ₦2 billion loss.", sourceIds: ["source-1"], evidence: [{ sourceId: "source-1", excerpt: quantities.snippet }] };
    expect(validateResearchReport(report({ executiveSummary: unsafe }), [quantities])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("does not let repeated reporting become independent corroboration in the summary", () => {
    const repeated = { ...source, likelyRepeatedSourceIds: ["source-0"], snippet: "The agency said it would publish the review. The ministry said the allocation was approved after a public review." };
    const summary = { text: "Two independent reports confirmed the agency would publish the review.", sourceIds: ["source-1"], evidence: [{ sourceId: "source-1", excerpt: repeated.snippet }] };
    expect(validateResearchReport(report({ executiveSummary: summary }), [repeated])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("does not borrow a precise date or figure from an uncited source", () => {
    const additionalSource = {
      ...source,
      id: "source-2",
      snippet: "On 7 September 2026, the agency reported a ₦10 billion allocation.",
    };
    const summary = { text: "On 7 September 2026, the ministry approved a ₦10 billion allocation.", sourceIds: ["source-1"], evidence };
    expect(validateResearchReport(report({ executiveSummary: summary }), [source, additionalSource])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("does not describe syndication as two independent reports", () => {
    const originating = { ...source, id: "source-0", snippet: "The agency said it would publish the review." };
    const repeated = { ...source, likelyRepeatedSourceIds: ["source-0"], snippet: "The agency said it would publish the review. The ministry said the allocation was approved after a public review." };
    const summary = {
      text: "Two independent reports confirmed the agency would publish the review.",
      sourceIds: ["source-0", "source-1"],
      evidence: [{ sourceId: "source-0", excerpt: originating.snippet }, { sourceId: "source-1", excerpt: repeated.snippet }],
    };
    expect(validateResearchReport(report({ executiveSummary: summary }), [originating, repeated])).toEqual(expect.objectContaining({ valid: false }));
  });

  it("rejects generic, unsupported summaries and summaries that drift away from the original investigation", () => {
    const generic = { text: "This raises serious concerns and has far-reaching implications.", sourceIds: ["source-1"], evidence };
    expect(validateResearchReport(report({ executiveSummary: generic }), [source], { title: "Yemen tracing requests", text: "Families asked the ICRC for tracing support in Yemen." })).toEqual(expect.objectContaining({ valid: false }));
    const unrelated = { text: "The ministry said the allocation was approved after a public review.", sourceIds: ["source-1"], evidence };
    expect(validateResearchReport(report({ executiveSummary: unrelated }), [source], { title: "Yemen tracing requests", text: "Families asked the ICRC for tracing support in Yemen." })).toEqual(expect.objectContaining({ valid: false }));
  });

  it("provides a privacy-safe summary validation category without retaining summary content in diagnostics", () => {
    const generic = report({ executiveSummary: { text: "This raises serious concerns and has far-reaching implications.", sourceIds: ["source-1"], evidence } });
    expect(summaryValidationDiagnostic(generic, [source], { title: "Ministry review", text: "The ministry issued a statement." })).toBe("generic_language");
    const dated = { ...source, snippet: "On 7 September 2026, the ministry said it approved a ₦10 billion allocation." };
    const unsupportedDate = report({ executiveSummary: { text: "On 8 September 2026, the ministry said it approved a ₦10 billion allocation.", sourceIds: ["source-1"], evidence: [{ sourceId: "source-1", excerpt: dated.snippet }] } });
    expect(summaryValidationDiagnostic(unsupportedDate, [dated])).toBe("unsupported_date");
  });

  it("accepts a shorter, qualified summary when limited evidence is all that is available", () => {
    const summary = { text: "The ministry said the allocation was approved after a public review; the underlying review record was not available in the retrieved material.", sourceIds: ["source-1"], evidence };
    expect(validateResearchReport(report({ executiveSummary: summary }), [source])).toEqual({ valid: true, reason: null, category: null });
  });

  it("provides a cautious, source-cited replacement when only the Intelligence Summary is editorially weak", () => {
    const original = report({ executiveSummary: { text: "This raises serious concerns and has far-reaching implications.", sourceIds: ["source-1"], evidence } });
    expect(validateResearchReport(original, [source], { title: "Ministry review", text: "The ministry issued a statement." })).toEqual(expect.objectContaining({ valid: false, category: "summary" }));
    const replacement = attachSourceExcerpts({ ...original, executiveSummary: qualifiedIntelligenceSummary({ originalTitle: "Ministry review", sourceCards: [source], report: original }) }, [source]);
    expect(validateResearchReport(replacement, [source], { title: "Ministry review", text: "The ministry issued a statement." })).toEqual({ valid: true, reason: null, category: null });
  });

  it("preserves supported specific findings when rebuilding a weak Intelligence Summary", () => {
    const dated = { ...source, snippet: "On 7 September 2026, the ministry said the ₦10 billion allocation was approved after a public review." };
    const specificFinding = {
      ...finding,
      claim: "On 7 September 2026, the ministry said the ₦10 billion allocation was approved after a public review.",
      evidence: [{ sourceId: "source-1", excerpt: dated.snippet }],
      evidenceExplanation: "The retained excerpt attributes the dated allocation statement to the ministry.",
    };
    const original = report({ keyFindings: [specificFinding], executiveSummary: { text: "This raises serious concerns.", sourceIds: ["source-1"], evidence: specificFinding.evidence } });
    const replacement = attachSourceExcerpts({ ...original, executiveSummary: qualifiedIntelligenceSummary({ originalTitle: "Ministry review", sourceCards: [dated], report: original }) }, [dated]);
    expect(replacement.executiveSummary).toEqual(expect.objectContaining({ text: expect.stringContaining("7 September 2026") }));
    expect(validateResearchReport(replacement, [dated], { title: "Ministry review", text: "The ministry issued a statement." })).toEqual({ valid: true, reason: null, category: null });
  });

  it("reconstructs a substantive, attributed Adeleke fixture summary from supported chronology and institutional context", () => {
    // Fixture-only text: these are not assertions about any real person or event.
    const chronology = { ...source, snippet: "On 17 July 2022, fixture reporting said Ademola Adeleke was declared winner of a fictional Osun election after an electoral commission announcement." };
    const institution = { ...source, id: "source-2", snippet: "The fixture electoral commission said it would publish a detailed breakdown after the fictional Osun election, while the result remained subject to the established legal process." };
    const firstFinding = { ...finding, claim: "On 17 July 2022, fixture reporting said Ademola Adeleke was declared winner after an electoral commission announcement.", evidence: [{ sourceId: "source-1", excerpt: chronology.snippet }], evidenceExplanation: "The fixture excerpt attributes the chronology to reporting about the commission announcement." };
    const institutionalFinding = { ...finding, claim: "The fixture electoral commission said it would publish a detailed breakdown while the result remained subject to the established legal process.", sourceIds: ["source-2"], evidence: [{ sourceId: "source-2", excerpt: institution.snippet }], evidenceExplanation: "The fixture excerpt attributes this procedural statement to the commission." };
    const original = report({
      executiveSummary: { text: "This raises serious concerns.", sourceIds: ["source-1"], evidence: firstFinding.evidence },
      keyFindings: [firstFinding],
      institutionalResponses: [institutionalFinding],
      historicalTimeline: [{ period: "17 July 2022", event: "Fixture reporting described an electoral commission announcement involving Ademola Adeleke.", location: "Fictional Osun", whyItMatters: "It supplies dated context.", relationship: "Direct fixture context.", sourceIds: ["source-1"], evidence: firstFinding.evidence }],
    });
    const replacement = attachSourceExcerpts({ ...original, executiveSummary: qualifiedIntelligenceSummary({ originalTitle: "Adeleke fixture", sourceCards: [chronology, institution], report: original }) }, [chronology, institution]);
    const text = (replacement.executiveSummary as { text: string }).text;
    expect(text).toContain("17 July 2022");
    expect(text).toContain("Ademola Adeleke");
    expect(text).toContain("electoral commission");
    expect(text).not.toContain("The original story concerns");
    expect(validateResearchReport(replacement, [chronology, institution], { title: "Adeleke fixture", text: "Fixture reporting concerns an Osun election." })).toEqual({ valid: true, reason: null, category: null });
  });

  it("reconstructs a specific NSCDC mast-vandalism fixture without inventing a recurring pattern", () => {
    // Fixture-only text: names and events below are mocked, not reported facts.
    const arrest = { ...source, snippet: "On 14 October 2026, the NSCDC said it arrested Chinedu Example in Anambra State after officers recovered cables and cutting tools from a telecommunications mast site." };
    const response = { ...source, id: "source-2", snippet: "In the fixture statement, the NSCDC said its investigation into the reported Anambra mast incident was continuing and gave no finding about other incidents." };
    const arrestFinding = { ...finding, claim: "On 14 October 2026, the NSCDC said it arrested Chinedu Example in Anambra State after officers recovered cables and cutting tools from a telecommunications mast site.", evidence: [{ sourceId: "source-1", excerpt: arrest.snippet }], evidenceExplanation: "The fixture excerpt attributes the arrest and recovered items to the NSCDC." };
    const responseFinding = { ...finding, claim: "The NSCDC said its investigation into the reported Anambra mast incident was continuing and gave no finding about other incidents.", sourceIds: ["source-2"], evidence: [{ sourceId: "source-2", excerpt: response.snippet }], evidenceExplanation: "The fixture excerpt attributes the continuing investigation to the NSCDC." };
    const original = report({
      executiveSummary: { text: "The original story concerns NSCDC arrests man for vandalising telecom mast in Anambra.", sourceIds: ["source-1"], evidence: arrestFinding.evidence },
      keyFindings: [arrestFinding],
      institutionalResponses: [responseFinding],
      patternsAndTrends: [],
      relatedIncidents: [],
    });
    const replacement = attachSourceExcerpts({ ...original, executiveSummary: qualifiedIntelligenceSummary({ originalTitle: "NSCDC arrests man for vandalising telecom mast in Anambra", sourceCards: [arrest, response], report: original }) }, [arrest, response]);
    const text = (replacement.executiveSummary as { text: string }).text;
    expect(text).toContain("Chinedu Example");
    expect(text).toContain("Anambra State");
    expect(text).toContain("cables and cutting tools");
    expect(text).toContain("investigation");
    expect(text).not.toContain("pattern");
    expect(text).not.toContain("The original story concerns");
    expect(validateResearchReport(replacement, [arrest, response], { title: "NSCDC fixture", text: "A mocked Anambra mast incident." })).toEqual({ valid: true, reason: null, category: null });
  });
});
