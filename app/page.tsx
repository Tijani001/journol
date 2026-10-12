"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readApiResponse } from "@/lib/client/api";
import { AuthControls } from "@/app/auth-controls";
import { contextualSuggestions, filterArticles } from "@/lib/news-discovery";
import { countActiveFilters, nextFilterPopoverState, toggleFilterSelection } from "@/lib/editorial-radar-filters";
import { normalizeStoryUrl } from "@/lib/story-url";
type NewsArticle = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  description: string;
};
type Story = {
  id?: string;
  title: string;
  description: string;
  source: string;
  url: string;
  location: string;
  time: string;
  category: string;
  signal: string;
  evidence: number;
  score: number;
  color: string;
  accent: string;
  publishedAt?: string | null;
  summary?: string;
};
type LegacyAnalysis = { summary?: string; significance?: string; reportedClaims?: string[]; independentlyVerified?: string[]; unverifiedClaims?: string[]; inferences?: string[]; investigativeAngle?: Record<string, string>; questions?: string[]; evidenceToSeek?: string[]; verificationPlan?: Array<string | { source?: string; action?: string; possibleFindings?: string }>; evidenceGaps?: string[]; alternativeExplanations?: string[]; confidence?: string; limitations?: string[]; analyzedFullArticle?: boolean; articleRetrievalNote?: string };
type LeadProposal = Record<string, unknown> & { leadId: string; primaryLead: string; leadRationale: string; evidencePath: string[]; firstAction: string; confidence: string; validation: Record<string, unknown>; scope: string; missingInformation: string[] };
type PlanItem = { claim: string; status: string };
type EvidenceItem = { evidence: string; purpose: string; possibleSource: string };
type VerificationItem = { action: string; evidenceSought: string; source: string; claimTested: string; method: string; possibleFindings: string; nextStep: string };
type LimitationItem = { issue: string; whyItMatters: string; howToResolve: string; ifUnresolved: string };
type InvestigationPlan = { approvedLead: string; investigativeObjective: string; firstAction: string; knownInformation: PlanItem[]; keyQuestions: string[]; evidenceRequirements: EvidenceItem[]; verificationPlan: VerificationItem[]; alternativeExplanations: string[]; limitations: LimitationItem[]; editorialSafeguards: string[]; confidence: { investigability: string; startingEvidence: string; explanation: string }; confidenceExplanation?: string };
type SavedStoryRecord = { id: string; canonicalUrl: string; originalUrl: string; title: string; publisher: string | null; publishedAt: string | null; description: string | null; savedAt: string };


function discoverLeads(articles: NewsArticle[]) {
  return articles.map((article) => {
    const text = (
      (article.title || "") +
      " " +
      (article.description || "")
    ).toLowerCase();

    let category = "GENERAL";
    let signal = "Potential story opportunity";
    let investigativeAngle =
      `Examine the development reported in "${article.title}", identify who is affected, and establish what additional evidence could reveal its wider significance.`;

    let questions: string[] = [
      `What new information does "${article.title}" reveal?`,
      "Who is directly affected by this development?",
      "What independent sources or documents could verify the key details?",
      "What important perspectives or unanswered questions are missing from the report?",
    ];

    let evidenceGaps: string[] = [
      "Key details should be checked against the original report and independent sources.",
      "The perspectives of people directly affected may need to be obtained.",
      "The wider significance of the development requires further reporting.",
    ];

    if (
      /procurement|public funds|government contract|misappropriation|embezzlement|corruption|budget fraud|abandoned project/.test(
        text,
      )
    ) {
      category = "GOVERNANCE";
      signal = "Public accountability";

      investigativeAngle =
        "Examine the decisions, public resources, and institutions involved. Establish what the available records show and whether the reported claims can be independently verified.";

      questions = [
        "Which public institution, official, contractor, or other party is involved?",
        "What contracts, budget records, audit reports, or official documents could clarify the issue?",
        "Can the reported figures or allegations be independently verified?",
        "What explanation have the relevant institutions and individuals provided?",
      ];

      evidenceGaps = [
        "Original contracts, expenditure records, or audit documents may be needed.",
        "The reported allegations and figures require independent verification.",
        "The responses of the parties concerned should be obtained before drawing conclusions.",
      ];
    } else if (
      /flood|oil spill|toxic waste|illegal mining|pollution|deforestation|climate change|erosion|water contamination/.test(
        text,
      )
    ) {
      category = "ENVIRONMENT";
      signal = "Environmental impact";

      investigativeAngle =
        "Establish the location and scale of the reported environmental issue, document its effects on affected communities, and investigate the evidence behind its suspected causes.";

      questions = [
        "Where did the incident occur, and which communities or ecosystems are affected?",
        "What evidence establishes the scale and duration of the reported damage?",
        "What do affected residents, independent experts, and official records reveal?",
        "What action have the responsible authorities or organisations taken?",
      ];

      evidenceGaps = [
        "The location, extent, and duration of the reported impact need verification.",
        "Independent observations, scientific assessments, or affected residents' accounts may provide corroboration.",
        "The causes and responsibilities should be established using evidence.",
      ];
    } else if (
      /inflation|food prices|cost of living|fuel price|unemployment|poverty|currency depreciation|interest rate|economic growth|tax increase|cost of transport/.test(
        text,
      )
    ) {
      category = "ECONOMY";
      signal = "Economic pressure";

      investigativeAngle =
        "Investigate how the reported economic development affects households, workers, or businesses, and compare the claims with reliable economic data.";

      questions = [
        "What specific economic change is reported, and over what period?",
        "Which groups are most affected, and how has their situation changed?",
        "What official statistics or independent data confirm the reported trend?",
        "How do the explanations offered compare with the experiences of affected people?",
      ];

      evidenceGaps = [
        "Comparable data over time is needed to establish the scale of the change.",
        "The impact on different households, workers, or businesses needs investigation.",
        "Potential explanations should be tested against reliable evidence.",
      ];
    } else if (
      /hospital|healthcare|disease outbreak|epidemic|vaccination|maternal health|medical supplies|public health|patient care/.test(
        text,
      )
    ) {
      category = "HEALTH";
      signal = "Public health";

      investigativeAngle =
        "Investigate the people affected, the scale of the reported health issue, and whether the available evidence supports the explanations and responses being reported.";

      questions = [
        "Who is affected, and how widespread is the reported health issue?",
        "What do health records or qualified medical experts say about the situation?",
        "Are the reported causes, risks, or outcomes supported by reliable evidence?",
        "What response have health authorities and relevant institutions provided?",
      ];

      evidenceGaps = [
        "The scale and details of the reported health issue need verification.",
        "Health claims should be checked against reliable medical evidence.",
        "The response of relevant health authorities needs to be established.",
      ];
    } else if (
      /school|university|student|teacher|education|scholarship|tuition|examination|graduation|academic|learning/.test(
        text,
      )
    ) {
      category = "EDUCATION";
      signal = "Education and opportunity";

      investigativeAngle =
        "Explore what the development reveals about educational opportunities, the experiences of the people involved, and its implications for students, institutions, or the wider education system.";

      questions = [
        "Who is directly involved, and what does this development mean for them?",
        "What circumstances or decisions led to the reported development?",
        "What do students, educators, or relevant institutions say about its significance?",
        "Are there wider trends or comparable cases that could provide useful context?",
      ];

      evidenceGaps = [
        "The background and circumstances of the development may need further verification.",
        "The experiences of students, educators, or other affected people may be missing.",
        "Evidence is needed before drawing conclusions about wider educational trends.",
      ];
    } else if (
      /football|soccer|athlete|sport|tournament|league|coach|player|championship|olympic/.test(
        text,
      )
    ) {
      category = "SPORTS";
      signal = "Sports and leadership";

      investigativeAngle =
        "Explore the people, decisions, and wider developments behind the sports story, including its implications for athletes, teams, institutions, or the future of the sport.";

      questions = [
        "What does this development reveal about the person, team, or institution involved?",
        "What circumstances or decisions led to this outcome?",
        "How do people directly involved explain the development?",
        "Does this connect to a wider trend in athlete development, sports management, or the business of sport?",
      ];

      evidenceGaps = [
        "The background and key details of the development need confirmation.",
        "Relevant participants or independent experts may offer additional perspectives.",
        "Any claim about wider trends should be supported by comparable examples or data.",
      ];
    } else if (
      /kidnap|bandit|terror|armed attack|insurgency|communal clash|violent attack|security forces|murder|insecurity/.test(
        text,
      )
    ) {
      category = "SECURITY";
      signal = "Public safety";

      investigativeAngle =
        "Establish what is known about the reported security incident, who has been affected, and how official accounts compare with independently verified information.";

      questions = [
        "What details of the incident have been independently confirmed?",
        "Who has been affected, and what reliable information is available about the impact?",
        "What do official statements and independently obtained accounts establish?",
        "What response or assistance has been provided to affected people?",
      ];

      evidenceGaps = [
        "The circumstances, location, and impact of the incident need verification.",
        "Conflicting accounts should be checked against independent evidence.",
        "The responses of relevant authorities and the needs of affected people may require further reporting.",
      ];
    } else if (
      /electricity|power outage|water supply|road collapse|road construction|public transport|waste collection|infrastructure/.test(
        text,
      )
    ) {
      category = "PUBLIC SERVICES";
      signal = "Infrastructure and service delivery";

      investigativeAngle =
        "Establish how the reported infrastructure or service issue affects the public, what caused the problem, and what evidence exists about the response.";

      questions = [
        "Which community or group is affected, and what service is involved?",
        "How long has the problem existed, and what evidence establishes its scale?",
        "What records or independent observations could clarify the causes?",
        "What response have the responsible authorities or service providers offered?",
      ];

      evidenceGaps = [
        "The scale and duration of the reported problem need confirmation.",
        "The causes and responsibilities require supporting evidence.",
        "The experiences of affected people and the response of responsible organisations need further examination.",
      ];
    }
        // Preliminary lead score based on observable signals.
    // This is a heuristic, not an AI assessment or verification of claims.
    let score = 20;

    // 1. Topic classification: does the story match a recognised topic?
    if (category !== "GENERAL") {
      score += 10;
    }

    // 2. Public-interest signals.
    const publicInterestPattern =
      /public|community|residents|children|patients|workers|students|farmers|households|displaced|victims|citizens|consumer|human rights|livelihood/;

    if (publicInterestPattern.test(text)) {
      score += 15;
    }

    // 3. Specific events, incidents, or reported developments.
    const concreteDevelopmentPattern =
      /killed|injured|arrested|detained|discovered|reveals|announced|approved|rejected|closed|opened|suspended|resigned|travelled|crossed|strike|outbreak|crash|explosion|evacuated|destroyed|missing|alleged|investigation|report finds|records show/;

    if (concreteDevelopmentPattern.test(text)) {
      score += 20;
    }

    // 4. Potential for accountability reporting.
    const accountabilityPattern =
      /official|authority|authorities|government|agency|minister|police|military|company|contractor|institution|regulator|responsible|accountability|oversight|negligence|failure|cover-up|procurement|audit|investigation/;

    if (accountabilityPattern.test(text)) {
      score += 15;
    }

    // 5. Potential evidence sources or verifiable details.
    const evidencePotentialPattern =
      /document|record|data|study|survey|court|filing|contract|budget|audit|statistics|witness|expert|statement|report|figures|video|photograph|dataset|official figures/;

    if (evidencePotentialPattern.test(text)) {
      score += 15;
    }

    // 6. Indicators of wider impact or unresolved questions.
    const widerImpactPattern =
      /first time|unprecedented|across|undetected|despite|previously|repeated|rising|surge|shortage|dispute|controversy|unanswered|questions remain|why|how|impact|consequences|affected|among those/;

    if (widerImpactPattern.test(text)) {
      score += 15;
    }

    // Keep the score within the 0–100 range.
    score = Math.min(100, Math.max(0, score));
    return {
      category,
      source: article.source,
      url: article.url,
      location: "Location not yet verified",
      time: article.publishedAt
        ? new Date(article.publishedAt).toLocaleDateString()
        : "Recently published",
      publishedAt: article.publishedAt,
      title: article.title || "Untitled article",
      description:
        article.description ||
        "The original article needs further review before its significance can be established.",
      signal,
      investigativeAngle,
      questions,
      evidenceGaps,
      score,
      evidence: questions.length,
      color: "#E8E9FF",
      accent: "#5558C9",
    };
  });
}
const navigation = [
  { label: "Discover", icon: "⌕" },
];

const workspace = [
  { label: "Saved stories", icon: "♡" },
  { label: "Saved investigations", icon: "◎" },
];

function useBrowserSearchParam(name: string) {
  const search = useSyncExternalStore(
    () => () => undefined,
    () => window.location.search,
    () => "",
  );
  return new URLSearchParams(search).get(name);
}

export default function Home() {
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
const [newsLoading, setNewsLoading] = useState(true);
const [newsError, setNewsError] = useState("");
  // Search parameters only exist in the browser. Begin with the same state on
  // server and client, then read the current investigation after hydration.
  const investigationId = useBrowserSearchParam("investigationId");
  const [createdInvestigationId, setCreatedInvestigationId] = useState<string | null>(null);
  // A newly created or reopened investigation must take precedence over a
  // stale URL parameter from the previously viewed article.
  const currentInvestigationId = createdInvestigationId || investigationId;
  const [investigationSourceUrl, setInvestigationSourceUrl] = useState<string | null>(null);
  const [activePlanInvestigationId, setActivePlanInvestigationId] = useState<string | null>(null);
  const requestedView = useBrowserSearchParam("view");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedContinents, setSelectedContinents] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedInvestigations, setSavedInvestigations] = useState<Array<Record<string, unknown>> | null>(null);
  const [investigationSaved, setInvestigationSaved] = useState(false);
  const [savingInvestigation, setSavingInvestigation] = useState(false);
  const activeInvestigationRef = useRef<string | null>(null);
  const workflowRequestId = useRef(0);
  const savedListRequestId = useRef(0);
  const savedStoryListRequestId = useRef(0);
  const storySaveRequests = useRef(new Set<string>());
  const planOpenRequestId = useRef(0);
  const filtersPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
async function loadNews() {
try {
const response = await fetch("/api/news");
    const data = await readApiResponse(response, "Story discovery");
    const articles = Array.isArray(data.articles) ? data.articles as NewsArticle[] : [];
    setNewsArticles(articles);
    if (!articles.length) {
      setNewsError("No news articles are currently available.");
    }
  } catch {
    setNewsError("Unable to load news. Please try again later.");
  } finally {
    setNewsLoading(false);
  }
}
loadNews();

}, []);
  useEffect(() => {
    if (!filtersOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!filtersPopoverRef.current?.contains(event.target as Node)) {
        setFiltersOpen((open) => nextFilterPopoverState(open, "outside-pointer"));
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen((open) => nextFilterPopoverState(open, "escape"));
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);
  const [activeNav, setActiveNav] = useState("Discover");
  const showingSavedInvestigations = activeNav === "Saved investigations" || requestedView === "saved";
  const [savedStories, setSavedStories] = useState<SavedStoryRecord[] | null>(null);
  const [savingStoryUrls, setSavingStoryUrls] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [customStoryUrl, setCustomStoryUrl] = useState("");
  const [isSubmittingCustomStory, setIsSubmittingCustomStory] = useState(false);
  const [customStoryError, setCustomStoryError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Story | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<LegacyAnalysis | null>(null);
  const [proposedLead, setProposedLead] = useState<LeadProposal | null>(null);
  const [leadApproved, setLeadApproved] = useState(false);
  const [investigationPlan, setInvestigationPlan] = useState<InvestigationPlan | null>(null);
  const [isBuildingInvestigation, setIsBuildingInvestigation] = useState(false);
  const [investigationError, setInvestigationError] = useState("");
  const [libraryError, setLibraryError] = useState("");
  const [retrievedArticleText, setRetrievedArticleText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const analysisRequestId = useRef(0);

  useEffect(() => {
    activeInvestigationRef.current = currentInvestigationId;
    if (!currentInvestigationId) {
      return;
    }
    const persistedInvestigationId = currentInvestigationId;
    const requestId = ++workflowRequestId.current;
    let cancelled = false;

    async function loadPersistedWorkflow() {
      // Do not allow the previous plan's saved status or workflow records to
      // flash while a different investigation is loading.
      setInvestigationSaved(false);
      setActivePlanInvestigationId(null);
      setInvestigationPlan(null);
      setProposedLead(null);
      setLeadApproved(false);
      try {
        const response = await fetch(`/api/investigations/${encodeURIComponent(persistedInvestigationId)}`, { cache: "no-store" });
        const data = await readApiResponse(response, "Loading investigation state");
        if (cancelled || requestId !== workflowRequestId.current || !data.workflow || typeof data.workflow !== "object") return;
        const workflow = data.workflow as Record<string, unknown>;
        const lead = workflow.lead as Record<string, unknown> | null;
        const plan = workflow.plan as Record<string, unknown> | null;

        if (lead && typeof lead.id === "string" && lead.content && typeof lead.content === "object") {
          setProposedLead({ ...(lead.content as Record<string, unknown>), leadId: lead.id } as LeadProposal);
          setLeadApproved(lead.status === "approved");
        }
        const source = data.source as Record<string, unknown> | null;
        setInvestigationSourceUrl(typeof source?.originalUrl === "string" ? source.originalUrl : null);
        if (plan?.content && typeof plan.content === "object") {
          setInvestigationPlan(plan.content as InvestigationPlan);
          setActivePlanInvestigationId(persistedInvestigationId);
        }
        setInvestigationSaved(data.saved === true);
      } catch (error) {
        if (!cancelled && requestId === workflowRequestId.current) {
          setInvestigationError(error instanceof Error ? error.message : "Unable to load the investigation state.");
        }
      }
    }

    void loadPersistedWorkflow();
    return () => { cancelled = true; };
  }, [currentInvestigationId]);

  const refreshSavedInvestigations = async () => {
    const requestId = ++savedListRequestId.current;
    const response = await fetch("/api/investigations/saved", { cache: "no-store" });
    const data = await readApiResponse(response, "Saved investigations");
    if (requestId === savedListRequestId.current) {
      setSavedInvestigations(Array.isArray(data.saved) ? data.saved as Array<Record<string, unknown>> : []);
    }
  };

  const refreshSavedStories = async () => {
    const requestId = ++savedStoryListRequestId.current;
    const response = await fetch("/api/stories/saved", { cache: "no-store" });
    const data = await readApiResponse(response, "Saved stories");
    if (requestId === savedStoryListRequestId.current) {
      setSavedStories(Array.isArray(data.saved) ? data.saved as SavedStoryRecord[] : []);
    }
  };

  useEffect(() => {
    if (showingSavedInvestigations || activeNav === "Saved stories") {
      void refreshSavedInvestigations().catch(() => setSavedInvestigations([]));
      void refreshSavedStories().catch(() => setSavedStories([]));
    }
  }, [showingSavedInvestigations, activeNav]);
  useEffect(() => {
    const handleAuthChange = () => {
      // Never retain one account's private library while another session is
      // becoming active. New values are loaded only from private, no-store APIs.
      savedListRequestId.current += 1;
      savedStoryListRequestId.current += 1;
      setSavedInvestigations(null);
      setSavedStories(null);
      setInvestigationSaved(false);
      if (showingSavedInvestigations || activeNav === "Saved stories") {
        void refreshSavedInvestigations().catch(() => setSavedInvestigations([]));
        void refreshSavedStories().catch(() => setSavedStories([]));
      }
    };
    window.addEventListener("journol-auth-change", handleAuthChange);
    return () => window.removeEventListener("journol-auth-change", handleAuthChange);
  }, [showingSavedInvestigations, activeNav]);
  useEffect(() => {
    void refreshSavedInvestigations().catch(() => setSavedInvestigations([]));
    void refreshSavedStories().catch(() => setSavedStories([]));
  }, []);
  const analyzeLead = async (
    lead: Story,
    rejectedLead?: string,
    suppliedArticle?: { text: string; title?: string }
  ) => {
    const requestId = ++analysisRequestId.current;
    const isCurrent = () => requestId === analysisRequestId.current;
  
    setIsAnalyzing(true);
    setAnalysisError("");
    setAiAnalysis(null);
    setRetrievedArticleText("");
    setProposedLead(null);
    setLeadApproved(false);
    setInvestigationPlan(null);

  let articleText = "";
  let articleRetrievalNote = "";
  let sourceArticleId = "";
  
  try {
  let activeInvestigationId = currentInvestigationId;
  // A discovery selection is its own persistent investigation unless it is
  // explicitly the same source already open in the current investigation.
  // This prevents a stale URL/state value from attaching a new article to the
  // prior article's saved library record.
  if (!activeInvestigationId || investigationSourceUrl !== lead.url) {
    const response = await fetch("/api/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: lead.title.slice(0, 200) }),
    });
    const data = await readApiResponse(response, "Saving investigation");
    const investigation = data.investigation;
    if (!investigation || typeof investigation !== "object" || typeof (investigation as Record<string, unknown>).id !== "string") {
      throw new Error("Journol could not save this investigation.");
    }
    activeInvestigationId = (investigation as Record<string, string>).id;
    setCreatedInvestigationId(activeInvestigationId);
    setActivePlanInvestigationId(activeInvestigationId);
    setInvestigationSourceUrl(lead.url);
    setInvestigationSaved(false);
    window.history.replaceState(null, "", `/?investigationId=${encodeURIComponent(activeInvestigationId)}`);
  }
  // Step 1: Retrieve the full article.
  if (suppliedArticle?.text?.trim()) {
    articleText = suppliedArticle.text;
    if (isCurrent()) setRetrievedArticleText(suppliedArticle.text);
    articleRetrievalNote =
      "Article text was retrieved. Its completeness has not been independently established.";
  } else if (lead.url) {
  try {
  const articleResponse = await fetch("/api/article", {
  method: "POST",
  headers: {
  "Content-Type": "application/json",
  },
  body: JSON.stringify({
  url: lead.url,
  investigationId: activeInvestigationId,
  }),
  });
  
      const articleData = await readApiResponse(articleResponse, "Article retrieval");
      if (
        articleData.success &&
        typeof articleData.text === "string"
      ) {
        articleText = articleData.text;
        if (isCurrent()) setRetrievedArticleText(articleData.text);
        if (articleData.sourceArticle && typeof articleData.sourceArticle === "object") {
          const source = articleData.sourceArticle as Record<string, unknown>;
          sourceArticleId = typeof source.id === "string" ? source.id : "";
        }
      } else {
        articleRetrievalNote = typeof articleData.error === "string"
          ? articleData.error
          : "The full article could not be retrieved.";
      }
    } catch {
      articleRetrievalNote =
        "Journol could not connect to the article reader.";
    }
  } else {
    articleRetrievalNote =
      "No article URL is available. Only the available description can be analysed.";
  }
  // The article route retrieves and persists the source in one server-side
  // operation; the browser never submits the extracted text as authority.
  if (!articleText.trim() || !sourceArticleId) {
    throw new Error(
      "Journol could not retrieve and save this article for the investigation.",
    );
  }

  // Step 2: Select the investigative lead using the server-side source.
  const selectionResponse = await fetch("/api/select-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      investigationId: activeInvestigationId,
      sourceArticleId,
      rejectedLead: rejectedLead || "",
    }),
  });

  const selectionData = await readApiResponse(selectionResponse, "Lead selection");
  if (!isCurrent()) {
    return;
  }
  if (
    !selectionData ||
    typeof selectionData.primaryLead !== "string" ||
    !selectionData.primaryLead.trim()
  ) {
    throw new Error(
      "Journol did not return a valid investigative question. Please try again."
    );
  }
  
  if (
    typeof selectionData.leadRationale !== "string" ||
    !selectionData.leadRationale.trim() ||
    !Array.isArray(selectionData.evidencePath) ||
    typeof selectionData.firstAction !== "string" ||
    !selectionData.firstAction.trim()
  ) {
    throw new Error(
      "Journol returned an incomplete investigative lead. Please try again."
    );
  }
  if (!isCurrent()) return;
  const validLead = selectionData as unknown as LeadProposal;
  setProposedLead({
    ...validLead,
    articleTextAvailable: Boolean(articleText.trim()),
    articleRetrievalNote: articleRetrievalNote || (
      articleText.trim()
        ? "Article text was retrieved, but completeness has not been independently established."
        : "Full article text is unavailable. The analysis relies on the supplied headline, description, and other available context."
    ),
  });
  return;
  
  
  } catch (error) {
  if (isCurrent()) {
    setAnalysisError(
      error instanceof Error
        ? error.message
        : "Journol could not analyse this story."
    );
  }
  } 
  finally {
    if (requestId === analysisRequestId.current) {
      setIsAnalyzing(false);
    }
  }
  };
  const handleCustomStorySubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
  
    const submittedUrl = customStoryUrl.trim();
  
    if (!submittedUrl) {
      setCustomStoryError("Please paste a story URL.");
      return;
    }
  
    let parsedUrl: URL;
  
    try {
      parsedUrl = new URL(submittedUrl);
    } catch {
      setCustomStoryError("Please enter a valid article URL.");
      return;
    }
  
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      setCustomStoryError("Please enter an HTTP or HTTPS article URL.");
      return;
    }
  
    setCustomStoryError("");
    setIsSubmittingCustomStory(true);
  
    try {
      const submittedStory = {
        id: `custom-${parsedUrl.toString()}`,
        title: "Journalist-submitted story",
        source: parsedUrl.hostname.replace(/^www\./, ""),
        url: parsedUrl.toString(),
        description: "Journol will retrieve and store this source before proposing a lead.",
        summary: "Journalist-submitted article URL",
        publishedAt: null,
        time: "Submitted by you",
        category: "Submitted story",
        location: "Not specified",
        signal: "Journalist-submitted source",
        evidence: 0,
        score: 0,
        color: "#eef2ff",
        accent: "#3730a3",
      };
  
      setSelectedLead(submittedStory);
      setShowLeadDetails(true);
      setCustomStoryUrl("");
  
      await analyzeLead(submittedStory);
    } catch (error) {
      setCustomStoryError(
        error instanceof Error
          ? error.message
          : "Journol could not analyse this story."
      );
    } finally {
      setIsSubmittingCustomStory(false);
    }
  };
const [showLeadDetails, setShowLeadDetails] = useState(false);
const selectedLocations = [...selectedContinents, ...selectedCountries];
const filteredStories = discoverLeads(filterArticles(newsArticles, {
  query: search,
  topics: selectedTopics,
  locations: selectedLocations,
}));
  const suggestedFilters = contextualSuggestions(newsArticles, search);
  const suggestedTopics = [...new Set([...selectedTopics, ...suggestedFilters.topics])];
  const suggestedContinents = [...new Set([...selectedContinents, ...suggestedFilters.continents])];
  const suggestedCountries = [...new Set([...selectedCountries, ...suggestedFilters.countries])];
  const activeFilterCount = countActiveFilters(selectedTopics, selectedContinents, selectedCountries);
  const isDiscoveryView = !showingSavedInvestigations && activeNav !== "Saved stories";
  const clearDiscoveryFilters = () => {
    setSelectedTopics([]);
    setSelectedContinents([]);
    setSelectedCountries([]);
  };
  const toggleFilterValue = (
    value: string,
    setter: (updater: (values: string[]) => string[]) => void,
  ) => {
    setter((values) => toggleFilterSelection(values, value));
  };
  const savedInvestigationCount = savedInvestigations?.length ?? 0;
  const savedStoryCount = savedStories?.length ?? 0;
  const savedStoriesByUrl = new Map((savedStories ?? []).map((story) => [story.canonicalUrl, story]));
  const savedStoryCards: Story[] = (savedStories ?? []).map((story) => ({
    id: story.id,
    title: story.title,
    source: story.publisher || "Publisher not recorded",
    url: story.originalUrl,
    description: story.description || "Saved story",
    location: story.publisher || "Publisher not recorded",
    time: story.publishedAt ? new Date(story.publishedAt).toLocaleDateString() : `Saved ${new Date(story.savedAt).toLocaleDateString()}`,
    category: "SAVED",
    signal: "Saved for later",
    evidence: 0,
    score: 0,
    color: "#eef2ff",
    accent: "#3730a3",
  }));
  const visibleStories =
    activeNav === "Saved stories"
      ? savedStoryCards
      : showAll
        ? filteredStories
        : filteredStories.slice(0, 3);

  function savedStoryFor(story: Story) {
    try { return savedStoriesByUrl.get(normalizeStoryUrl(story.url)) ?? null; } catch { return null; }
  }

  async function toggleSaveStory(story: Story) {
    let canonicalUrl: string;
    try { canonicalUrl = normalizeStoryUrl(story.url); } catch { setLibraryError("This story does not have a valid URL to save."); return; }
    if (storySaveRequests.current.has(canonicalUrl)) return;
    storySaveRequests.current.add(canonicalUrl);
    setSavingStoryUrls((urls) => [...urls, canonicalUrl]);
    const existing = savedStoriesByUrl.get(canonicalUrl);
    try {
      setLibraryError("");
      const response = existing
        ? await fetch(`/api/stories/saved/${encodeURIComponent(existing.id)}`, { method: "DELETE", cache: "no-store" })
        : await fetch("/api/stories/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ url: story.url, title: story.title, publisher: story.source, publishedAt: story.publishedAt ?? null, description: story.description }),
        });
      const data = await readApiResponse(response, existing ? "Removing saved story" : "Saving story");
      if (existing) {
        savedStoryListRequestId.current += 1;
        setSavedStories((items) => items?.filter((item) => item.id !== existing.id) ?? []);
      } else if (data.story && typeof data.story === "object") {
        const confirmed = data.story as SavedStoryRecord;
        setSavedStories((items) => items ? [confirmed, ...items.filter((item) => item.canonicalUrl !== confirmed.canonicalUrl)] : [confirmed]);
      }
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Unable to update the saved story.");
    } finally {
      storySaveRequests.current.delete(canonicalUrl);
      setSavingStoryUrls((urls) => urls.filter((url) => url !== canonicalUrl));
    }
  }

  async function setLibrarySaved(investigationToUpdate: string, shouldSave: boolean) {
    if (savingInvestigation) return;
    setSavingInvestigation(true);
    setInvestigationError("");
    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigationToUpdate)}/save`, {
        method: shouldSave ? "POST" : "DELETE",
        cache: "no-store",
      });
      await readApiResponse(response, shouldSave ? "Saving investigation" : "Removing saved investigation");
      if (investigationToUpdate === activeInvestigationRef.current) {
        setInvestigationSaved(shouldSave);
      }
      if (!shouldSave) {
        // Invalidate an older list request that could otherwise reinsert the
        // removed card after this confirmed DELETE response.
        savedListRequestId.current += 1;
        setSavedInvestigations((items) => items?.filter((item) => (item.investigation as Record<string, unknown> | undefined)?.id !== investigationToUpdate) ?? []);
      } else {
        await refreshSavedInvestigations();
      }
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to update the saved investigation.");
    } finally {
      setSavingInvestigation(false);
    }
  }

  async function openSavedInvestigation(investigationToOpen: string, fallbackTitle: string) {
    const requestId = ++planOpenRequestId.current;
    try {
      const data = await readApiResponse(await fetch(`/api/investigations/${encodeURIComponent(investigationToOpen)}`, { cache: "no-store" }), "Saved investigation");
      if (requestId !== planOpenRequestId.current) return;
      const workflow = data.workflow as Record<string, unknown>;
      const lead = workflow.lead as Record<string, unknown> | null;
      const plan = workflow.plan as Record<string, unknown> | null;
      const source = data.source as Record<string, unknown> | null;
      if (source) {
        setSelectedLead({
          title: typeof source.title === "string" ? source.title : fallbackTitle,
          source: typeof source.publisher === "string" ? source.publisher : "Unknown publisher",
          url: typeof source.originalUrl === "string" ? source.originalUrl : "",
          description: "Saved source article",
          location: "Location not verified",
          time: "Saved",
          category: "SAVED",
          signal: "Saved investigation",
          evidence: 0,
          score: 0,
          color: "#eef2ff",
          accent: "#3730a3",
        });
      }
      if (lead?.content && typeof lead.id === "string") setProposedLead({ ...(lead.content as Record<string, unknown>), leadId: lead.id } as LeadProposal);
      if (plan?.content) setInvestigationPlan(plan.content as InvestigationPlan);
      setCreatedInvestigationId(investigationToOpen);
      setInvestigationSourceUrl(typeof source?.originalUrl === "string" ? source.originalUrl : null);
      setActivePlanInvestigationId(investigationToOpen);
      setInvestigationSaved(data.saved === true);
      setShowLeadDetails(true);
    } catch (error) {
      setInvestigationError(error instanceof Error ? error.message : "Unable to open the saved investigation.");
    }
  }

  return (
    <main className="journol-app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setActiveNav("Discover");
          }}
        >
          <span className="brand-mark">j.</span>
          <span>
            <strong>journol</strong>
            <small>NEWSROOM INTELLIGENCE</small>
          </span>
        </a>
    <div className="workspace-label">DISCOVER</div>
    <nav className="nav-list">
      {navigation.map((item) => (
        <button
          key={item.label}
          className={`nav-item ${activeNav === item.label ? "active" : ""}`}
          onClick={() => setActiveNav(item.label)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
    <div className="workspace-label second-label">YOUR LIBRARY</div>
    <nav className="nav-list">
      {workspace.map((item) => (
        <button
          key={item.label}
          className={`nav-item ${activeNav === item.label ? "active" : ""}`}
          onClick={() => setActiveNav(item.label)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
          {item.label === "Saved stories" && <span className="nav-count">{savedStoryCount}</span>}
          {item.label === "Saved investigations" && <span className="nav-count">{savedInvestigationCount}</span>}
        </button>
      ))}
    </nav>
    <div className="sidebar-bottom">
      <div className="upgrade-card">
        <span className="upgrade-spark">✳</span>
        <strong>Curiosity deserves a lead.</strong>
        <p>Find the stories hiding beneath the headlines.</p>
      </div>
    </div>
  </aside>
  <section className="main-panel">
    <header className="topbar">
      <div className="breadcrumb">
        <span>Journol</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{activeNav}</strong>
      </div>
      <div className="topbar-right">
        <span className="live-indicator">
          <span /> {currentInvestigationId ? "ACTIVE INVESTIGATION" : "DISCOVERY"}
        </span>
        <button
          className="icon-button"
          aria-label="Notifications"
          onClick={() => window.alert("You're all caught up.")}
        >
          ♧
        </button>
        <AuthControls />
      </div>
    </header>
    <div className="dashboard-content">
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            JOURNOL DISCOVERY <span className="eyebrow-line" />
            SIGNALS FOR REPORTING
          </div>
          <h1>
            See beyond
            <br />
            the <span>headlines.</span>
          </h1>
          <p className="welcome-description">
            The next big story might not be breaking news. Let&apos;s find it.
          </p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-core">j.</div>
          <span className="art-star star-one">✳</span>
          <span className="art-star star-two">✳</span>
          <span className="art-dot dot-one" />
          <span className="art-dot dot-two" />
        </div>
      </section>
      <section
  style={{
    marginBottom: "32px",
    padding: "28px",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    background: "#ffffff",
  }}
>
  <div style={{ marginBottom: "18px" }}>
    <div
      style={{
        fontSize: "11px",
        fontWeight: 800,
        letterSpacing: "1.5px",
        color: "#6562c8",
        marginBottom: "8px",
      }}
    >
      YOUR STORY, YOUR INVESTIGATION
    </div>
<h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px" }}>
  Investigate a Story
</h2>
<p style={{ fontSize: "13px", color: "#64748b", margin: 0, lineHeight: 1.7 }}>
  Found a story that deserves a closer look? Paste its link and let Journol
  help you identify an investigative lead.
</p>
  </div>
  <form
    onSubmit={handleCustomStorySubmit}
    style={{
      display: "flex",
      gap: "12px",
      alignItems: "stretch",
      flexWrap: "wrap",
    }}
  >
    <input
      type="url"
      value={customStoryUrl}
      onChange={(event) => setCustomStoryUrl(event.target.value)}
      placeholder="Paste the article URL here..."
      aria-label="Article URL to investigate"
      required
      style={{
        flex: "1 1 300px",
        minWidth: 0,
        padding: "14px 16px",
        border: "1px solid #dbe1ea",
        borderRadius: "8px",
        fontSize: "13px",
        outlineOffset: "2px",
      }}
    />
<button
  type="submit"
  disabled={isSubmittingCustomStory}
  style={{
    padding: "14px 22px",
    border: "none",
    borderRadius: "8px",
    background: isSubmittingCustomStory ? "#9998ce" : "#6562c8",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: isSubmittingCustomStory ? "wait" : "pointer",
  }}
>
  {isSubmittingCustomStory ? "Analysing story..." : "Analyse Story →"}
</button>
  </form>

{customStoryError && (
<p
role="alert"
style={{
  margin: "12px 0 0",
  color: "#b42318",
  fontSize: "13px",
}}
>
{customStoryError}
</p>
)}

  <p style={{ margin: "12px 0 0", fontSize: "11px", color: "#94a3b8" }}>
    Journol will attempt to retrieve the article before proposing an
    investigative lead. Some publishers may restrict access.
  </p>
</section>
      <section className="discovery-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker">YOUR EDITORIAL RADAR</div>
            <h2>
              {showingSavedInvestigations
                ? "Saved investigations"
                : activeNav === "Saved stories"
                ? "Your saved stories"
                : "Stories worth a closer look"}
            </h2>
            <p>Early signals. Unanswered questions. Room to investigate.</p>
          </div>
          <button
            className="text-button"
            onClick={() => setShowAll((previous) => !previous)}
          >
            {showAll ? "Show less" : "View all discoveries"} <span>→</span>
          </button>
        </div>
        {isDiscoveryView && <>
          <div className="filter-row" ref={filtersPopoverRef}>
            <div className="search-box">
              <span>⌕</span>
              <input
                aria-label="Search story opportunities"
                placeholder="Search leads, topics or locations..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ F</kbd>
            </div>
            <button
              type="button"
              className="filter-button"
              aria-expanded={filtersOpen}
              aria-controls="editorial-radar-filters"
              onClick={() => setFiltersOpen((open) => nextFilterPopoverState(open, "toggle"))}
            >
              <span aria-hidden="true">⚙</span>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {filtersOpen && <div
              id="editorial-radar-filters"
              className="filters-popover"
              role="dialog"
              aria-label="Editorial Radar filters"
            >
              <div className="filters-popover-heading">
                <span>Filters</span>
                <button type="button" className="text-button" onClick={clearDiscoveryFilters} disabled={activeFilterCount === 0}>Clear all</button>
              </div>
              <section className="filter-section" aria-labelledby="topic-filter-heading">
                <h3 id="topic-filter-heading">Topics</h3>
                {suggestedTopics.length > 0 ? <div className="filter-options">
                  {suggestedTopics.map((topic) => <label className="filter-check" key={topic}>
                    <input type="checkbox" checked={selectedTopics.includes(topic)} onChange={() => toggleFilterValue(topic, setSelectedTopics)} />
                    <span>{topic}</span>
                  </label>)}
                </div> : <p className="suggestion-empty">No topic signals in the current results.</p>}
              </section>
              <section className="filter-section" aria-labelledby="location-filter-heading">
                <h3 id="location-filter-heading">Locations</h3>
                <div className="location-filter-group">
                  <h4>Continents</h4>
                  {suggestedContinents.length > 0 ? <div className="filter-options">
                    {suggestedContinents.map((continent) => <label className="filter-check" key={continent}>
                      <input type="checkbox" checked={selectedContinents.includes(continent)} onChange={() => toggleFilterValue(continent, setSelectedContinents)} />
                      <span>{continent}</span>
                    </label>)}
                  </div> : <p className="suggestion-empty">No continent mentions in the current results.</p>}
                </div>
                <div className="location-filter-group">
                  <h4>Countries</h4>
                  {suggestedCountries.length > 0 ? <div className="filter-options">
                    {suggestedCountries.map((country) => <label className="filter-check" key={country}>
                      <input type="checkbox" checked={selectedCountries.includes(country)} onChange={() => toggleFilterValue(country, setSelectedCountries)} />
                      <span>{country}</span>
                    </label>)}
                  </div> : <p className="suggestion-empty">No country mentions in the current results.</p>}
                </div>
              </section>
              <p className="filter-help">Topics and locations are discovery signals from the current feed. Location mentions do not verify where an event occurred.</p>
            </div>}
          </div>
          {activeFilterCount > 0 && <div className="active-filter-chips" aria-label="Active filters">
            {[...selectedTopics.map((value) => ({ value, type: "topic", setter: setSelectedTopics })), ...selectedContinents.map((value) => ({ value, type: "continent", setter: setSelectedContinents })), ...selectedCountries.map((value) => ({ value, type: "country", setter: setSelectedCountries }))].map(({ value, type, setter }) => <button type="button" className="active-filter-chip" key={`${type}-${value}`} onClick={() => toggleFilterValue(value, setter)} aria-label={`Remove ${type} filter ${value}`}>
              {value} <span aria-hidden="true">×</span>
            </button>)}
            <button type="button" className="text-button compact-clear" onClick={clearDiscoveryFilters}>Clear all</button>
          </div>}
          <p className="filter-help">Suggestions are drawn from the current feed and search results. They are keyword-based discovery aids, not verified classifications.</p>
        </>}
        {libraryError && <p className="filter-help" style={{ color: "#b42318" }}>{libraryError}</p>}
        {showingSavedInvestigations ? (
          <div className="story-list">
            {savedInvestigations === null && <div className="empty-state"><h3>Loading saved investigations…</h3></div>}
            {savedInvestigations?.map((entry) => {
              const investigation = entry.investigation as Record<string, unknown> | undefined;
              const id = typeof investigation?.id === "string" ? investigation.id : "";
              const source = entry.source as Record<string, unknown> | null;
              const lead = entry.lead as Record<string, unknown> | null;
              const title = typeof source?.title === "string" ? source.title : typeof investigation?.title === "string" ? investigation.title : "Untitled investigation";
              const publisher = typeof source?.publisher === "string" ? source.publisher : "Publisher not recorded";
              const preview = typeof lead?.primaryLead === "string" ? lead.primaryLead : "Open the saved investigation plan.";
              const savedAt = typeof entry.savedAt === "string" ? new Date(entry.savedAt).toLocaleDateString() : "Recently";
              return <article className="story-card" key={id}>
                <div className="story-index">♥</div>
                <div className="story-illustration saved-investigation-illustration" aria-hidden="true"><span className="illustration-symbol">◎</span></div>
                <button className="story-main text-left" onClick={() => void openSavedInvestigation(id, title)}>
                  <div className="story-meta"><span className="category-pill">SAVED</span><span className="meta-dot">·</span><span>{publisher}</span><span className="meta-dot">·</span><span>Saved {savedAt}</span></div>
                  <h3>{title}</h3>
                  <p className="saved-investigation-preview">{preview}</p>
                </button>
                <div className="story-actions"><button className="save-button is-saved" disabled={savingInvestigation} onClick={() => void setLibrarySaved(id, false)}>{savingInvestigation ? "Removing…" : "♥ Remove"}</button></div>
              </article>;
            })}
            {savedInvestigations?.length === 0 && <div className="empty-state"><span>◎</span><h3>No saved investigations</h3><p>Save an investigation plan to keep it in your library.</p></div>}
          </div>
        ) : <div className="story-list">
          {visibleStories.map((story, index) => (
            <article className="story-card" key={story.url}>
              <div className="story-index">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div
                className="story-illustration"
                style={{
                  background: story.color,
                  color: story.accent,
                }}
              >
                <span className="illustration-orbit" />
                <span className="illustration-symbol">
                  {index === 0 ? "⌘" : index === 1 ? "↗" : "⌖"}
                </span>
                <span className="illustration-dot" />
              </div>
              <div className="story-main">
                <div className="story-meta">
                  <span
                    className="category-pill"
                    style={{
                      background: story.color,
                      color: story.accent,
                    }}
                  >
                    {story.category}
                  </span>
                  <span className="meta-dot">·</span>
                  <span>{story.location}</span>
                  <span className="meta-dot">·</span>
                  <span>{story.time}</span>
                </div>
                <h3>{story.title}</h3>
                <p>{story.description}</p>
                <div className="story-bottom">
                  <span className="signal-tag">
                    <span className="signal-icon">✳</span>
                    {story.signal}
                  </span>
                  <span className="evidence-count">
                    {story.evidence} research prompts
                  </span>
                </div>
              </div>
              <div className="story-actions">
                <div className="score-label">LEAD SCORE</div>
                <div className="score-number">{story.score}</div>
                <div className="score-track">
                  <span style={{ width: `${story.score}%` }} />
                </div>
                <button
                  className={`save-button ${savedStoryFor(story) ? "is-saved" : ""}`}
                  disabled={(() => { try { return savingStoryUrls.includes(normalizeStoryUrl(story.url)); } catch { return false; } })()}
                  onClick={() => void toggleSaveStory(story)}
                >
                  {(() => { try { return savingStoryUrls.includes(normalizeStoryUrl(story.url)); } catch { return false; } })() ? "Saving…" : savedStoryFor(story) ? "♥ Saved" : "♡ Save"}
                </button>
                <button
                  className="explore-button"
                  onClick={() => {
                    setSelectedLead(story);
                    setShowLeadDetails(true);
                    analyzeLead(story);
                  }}
                >
                  Explore lead ↗
                </button>
              </div>
            </article>
          ))}
          {visibleStories.length === 0 && (
            <div className="empty-state">
              <span>⌕</span>
              <h3>{activeFilterCount > 0 ? "No stories match your filters" : "No stories found"}</h3>
              <p>{activeFilterCount > 0 ? "Try changing your search or removing some filters." : "Try another search or explore the full discovery feed."}</p>
              <button
                className="text-button"
                onClick={() => {
                  if (activeFilterCount > 0) clearDiscoveryFilters();
                  else setSearch("");
                  setActiveNav("Discover");
                }}
              >
                {activeFilterCount > 0 ? "Clear filters →" : "Reset discovery feed →"}
              </button>
            </div>
          )}
        </div>}
        {showLeadDetails && selectedLead && (
  <div
    onClick={() => setShowLeadDetails(false)}
    style={{
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      background: "rgba(15, 18, 35, 0.65)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "16px",
      boxSizing: "border-box",
    }}
  >
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: "760px",
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "24px",
        background: "#ffffff",
        border: "1px solid #ececf2",
        borderRadius: "16px",
        boxShadow: "0 24px 80px rgba(0, 0, 0, 0.25)",
        position: "relative",
      }}
    >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    color: "#5b5bc7",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "2px",
                  }}
                >
                  INVESTIGATIVE LEAD
                </p>

                <h2 style={{ fontSize: "24px", margin: "8px 0" }}>
                  Lead Details
                </h2>
              </div>

              <button
                onClick={() => setShowLeadDetails(false)}
                style={{
                  padding: "10px 14px",
                  border: "1px solid #ececf2",
                  borderRadius: "8px",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <h3 style={{ fontSize: "19px", marginTop: "24px" }}>
              {selectedLead.title}
            </h3>

            <p style={{ color: "#85869c", fontSize: "13px" }}>
              {selectedLead.source || selectedLead.location}
              {" · "}
              {selectedLead.time}
            </p>

            <div style={{ marginTop: "24px" }}>
  {isAnalyzing && (
    <div
      style={{
        padding: "24px",
        background: "#F7F7FC",
        borderRadius: "10px",
        textAlign: "center",
      }}
    >
      <h3>Analysing this story...</h3>
      <p style={{ color: "#85869c", lineHeight: 1.8 }}>
        Journol is examining the available information and developing
        investigative questions, evidence requirements, and verification steps.
      </p>
    </div>
  )}

  {analysisError && (
    <div
      style={{
        padding: "16px",
        background: "#fff1f0",
        borderRadius: "10px",
        color: "#b42318",
      }}
    >
      <h3>Analysis unsuccessful</h3>
      <p>{analysisError}</p>
      <button
        onClick={() => analyzeLead(selectedLead)}
        style={{
          padding: "10px 14px",
          background: "#5b5bc7",
          color: "#ffffff",
          border: 0,
          borderRadius: "8px",
        }}
      >
        Try again
      </button>
    </div>
  )}
{proposedLead && (
  <div
    style={{
      marginBottom: "24px",
      padding: "20px",
      borderRadius: "12px",
      background: "#eef2ff",
      border: "1px solid #c7d2fe",
    }}
  >
    <h3 style={{ marginTop: 0 }}>Proposed Investigative Lead</h3>

    <p style={{ fontSize: "17px", fontWeight: 600, lineHeight: 1.6 }}>
      {proposedLead.primaryLead}
    </p>

    <p style={{ lineHeight: 1.7 }}>
      <strong>Why it matters:</strong> {proposedLead.leadRationale}
    </p>

    <p style={{ lineHeight: 1.7 }}>
      <strong>Scope:</strong> {proposedLead.scope}
    </p>

    <p style={{ lineHeight: 1.7 }}>
      <strong>First action:</strong> {proposedLead.firstAction}
    </p>

    <p>
      <strong>Confidence:</strong> {proposedLead.confidence}
    </p>

    {proposedLead.missingInformation?.length > 0 && (
      <div>
        <strong>Information still needed:</strong>
        <ul>
          {proposedLead.missingInformation.map(
            (item: string, index: number) => (
              <li key={index} style={{ marginTop: "6px" }}>
                {item}
              </li>
            )
          )}
        </ul>
      </div>
    )}

<div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" }}>
  <button
    onClick={async () => {
      const validation = proposedLead?.validation;

const validationChecks = [
  { key: "factualBasis", label: "Factual basis" },
  { key: "target", label: "Clear investigative target" },
  { key: "scope", label: "Manageable scope" },
  { key: "evidencePath", label: "Evidence and verification path" },
  { key: "practicalFirstAction", label: "Practical first action" },
  { key: "answerability", label: "Question can be answered" },
] as const;

const failedChecks = validationChecks.filter(
  (check) => validation?.[check.key] !== true
);

if (failedChecks.length > 0) {
  setLeadApproved(false);

  const failedLabels = failedChecks
    .map((check) => check.label)
    .join(", ");

  const explanation =
    typeof validation?.explanation === "string"
      ? validation.explanation
      : "";

  setInvestigationError(
    `This lead needs further review. Failed checks: ${failedLabels}.` +
      (explanation ? ` Explanation: ${explanation}` : "")
  );

  return;
}

      setIsBuildingInvestigation(true);
      setInvestigationError("");
      setInvestigationPlan(null);

      try {
        if (!currentInvestigationId) {
          throw new Error(
            "An investigation must be selected before approving the lead."
          );
        }

        if (!proposedLead?.leadId) {
          throw new Error(
            "The investigative lead is missing its server record."
          );
        }

        const approvalData = leadApproved
          ? { success: true }
          : await (async () => {
            const approvalResponse = await fetch(
              `/api/investigations/${encodeURIComponent(currentInvestigationId)}/leads/${encodeURIComponent(proposedLead.leadId)}/approve`,
              { method: "POST", headers: { "Content-Type": "application/json" } },
            );
            return readApiResponse(approvalResponse, "Lead approval");
          })();

        if (!approvalData.success) throw new Error("Journol could not approve the investigative lead.");
        // Only update the UI after the database-backed approval succeeds.
        setLeadApproved(true);

        const assessmentResponse = await fetch(
          `/api/investigations/${encodeURIComponent(currentInvestigationId)}/evidence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              leadId: proposedLead.leadId,
            }),
          },
        );
        
        const assessmentData = await readApiResponse(assessmentResponse, "Evidence assessment");
        if (!assessmentData.success) throw new Error("Journol could not assess the available evidence.");
        const assessment = assessmentData.assessment;

if (
  !assessment ||
  typeof assessment !== "object" ||
  Array.isArray(assessment)
) {
  throw new Error(
    "Journol returned an invalid evidence assessment."
  );
}

const assessmentRecord = assessment as Record<string, unknown>;

if (assessmentRecord.approvedLead !== proposedLead.primaryLead) {
  throw new Error(
    "The evidence assessment does not match the approved investigative question."
  );
}

const requiredAssessmentArrays = [
  "reportedClaims",
  "establishedInformation",
  "unknowns",
  "evidenceGaps",
];

for (const field of requiredAssessmentArrays) {
  if (!Array.isArray(assessmentRecord[field])) {
    throw new Error(
      `The evidence assessment is incomplete: ${field} is missing or invalid.`
    );
  }
}

const startingEvidenceAssessment = assessmentRecord.startingEvidenceAssessment;
const startingEvidenceLevel = startingEvidenceAssessment && typeof startingEvidenceAssessment === "object"
  ? (startingEvidenceAssessment as Record<string, unknown>).level
  : null;
if (!["low", "medium", "high"].includes(typeof startingEvidenceLevel === "string" ? startingEvidenceLevel : "")) {
  throw new Error(
    "The evidence assessment is missing a valid starting-evidence rating."
  );
}
        const response = await fetch(
          `/api/investigations/${encodeURIComponent(currentInvestigationId)}/plan`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              leadId: proposedLead.leadId,
              evidenceAssessmentId: assessmentData.assessmentId,
            }),
          },
        );
    
        const data = await readApiResponse(response, "Investigation builder");
        if (!data.success || !data.plan || typeof data.plan !== "object") {
          throw new Error("Journol returned an invalid persisted investigation plan.");
        }

        setInvestigationPlan(data.plan as InvestigationPlan);
        setActivePlanInvestigationId(currentInvestigationId);
      } catch (error) {
        setInvestigationError(
          error instanceof Error
            ? error.message
            : "Something went wrong while building the investigation plan."
        );
      } finally {
        setIsBuildingInvestigation(false);
      }
    }}
    disabled={isBuildingInvestigation}
    style={{
      padding: "10px 14px",
      background: leadApproved ? "#15803d" : "#3730a3",
      color: "#ffffff",
      border: 0,
      borderRadius: "8px",
      cursor: isBuildingInvestigation ? "wait" : "pointer",
    }}
  >
    {leadApproved ? "Retry evidence & plan" : "Approve lead & build plan"}
  </button>

  <button
    onClick={() => {
      const rejectedQuestion = proposedLead?.primaryLead;
    
      setProposedLead(null);
      setLeadApproved(false);
      setAiAnalysis(null);
    
      analyzeLead(selectedLead, rejectedQuestion);
    }}
    style={{
      padding: "10px 14px",
      background: "#ffffff",
      color: "#3730a3",
      border: "1px solid #a5b4fc",
      borderRadius: "8px",
      cursor: "pointer",
    }}
  >
    Reject / Clear Lead
  </button>
</div>
  </div>
)}
{isBuildingInvestigation && (

<div style={{ padding: "20px", marginTop: "20px" }}>
  <p>Journol is building your investigation plan...</p>
</div>
)}

{investigationError && (

<div
  style={{
    padding: "16px",
    marginTop: "20px",
    border: "1px solid #dc2626",
    borderRadius: "8px",
    color: "#dc2626",
  }}
>
  <strong>Investigation Builder Error</strong>
  <p>{investigationError}</p>
</div>
)}

{investigationPlan && (

<div
  style={{
    padding: "24px",
    marginTop: "24px",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111827",
    lineHeight: 1.7,
  }}
>
<section className="investigation-plan">
  <div className="investigation-header">
    <div>
      <p className="investigation-eyebrow">JOURNOL INTELLIGENCE</p>
      <h2>Investigation Plan</h2>
      <p className="investigation-subtitle">
        A structured roadmap for verifying the story and developing the evidence.
      </p>
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span className="investigation-status">PLAN READY</span>
      <button
        className={`save-button ${investigationSaved ? "is-saved" : ""}`}
        disabled={savingInvestigation || !(activePlanInvestigationId || currentInvestigationId)}
        onClick={() => {
          const investigationToUpdate = activePlanInvestigationId || currentInvestigationId;
          if (investigationToUpdate) void setLibrarySaved(investigationToUpdate, !investigationSaved);
        }}
      >{savingInvestigation ? (investigationSaved ? "Removing…" : "Saving…") : investigationSaved ? "♥ Saved" : "♡ Save investigation"}</button>
    </div>
  </div>

  <div
    className={`article-status ${
      retrievedArticleText ? "article-status-success" : "article-status-warning"
    }`}
  >
    <span className="status-indicator" />
    <div>
      <strong>
        {retrievedArticleText
          ? "Article text retrieved"
          : "Full article text unavailable"}
      </strong>
      <p>
        {retrievedArticleText
          ? `${retrievedArticleText.split(/\s+/).filter(Boolean).length} words available for analysis. Retrieval does not guarantee that the entire article was captured.`
          : "The plan may rely on the article description and available lead context."}
      </p>
    </div>
  </div>

  <div className="approved-lead-card">
  <div className="plan-section-heading">
    <span className="plan-section-number">01</span>
    <div>
      <h3>Approved Investigative Lead</h3>
      <p>The central question this investigation will examine.</p>
    </div>
  </div>

  <p>{investigationPlan.approvedLead}</p>
</div>

<div className="first-action-card">
  <span className="plan-section-number">02</span>
  <div className="first-action-content">
    <h3>Start Here</h3>
    <p>{investigationPlan.firstAction}</p>
  </div>
</div>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">03</span>
      <div>
        <h3>Investigative Objective</h3>
        <p>What this investigation aims to establish.</p>
      </div>
    </div>
    <p className="plan-body">{investigationPlan.investigativeObjective}</p>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">04</span>
      <div>
        <h3>Known Information</h3>
        <p>What the available material currently tells us.</p>
      </div>
    </div>

    <div className="plan-card-list">
      {investigationPlan.knownInformation?.map(
        (item: PlanItem, index: number) => (
          <article className="plan-item-card" key={index}>
            <p>{item.claim}</p>
            <span className="plan-status-label">
              {item.status || "Status not specified"}
            </span>
          </article>
        )
      )}
    </div>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">05</span>
      <div>
        <h3>Key Questions</h3>
        <p>The questions the reporting should answer.</p>
      </div>
    </div>

    <div className="plan-card-list">
      {investigationPlan.keyQuestions?.map(
        (item: string, index: number) => (
          <div className="plan-question" key={index}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{item}</p>
          </div>
        )
      )}
    </div>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">06</span>
      <div>
        <h3>Evidence Requirements</h3>
        <p>What to obtain, why it matters, and where to look.</p>
      </div>
    </div>

    <div className="plan-card-grid">
      {investigationPlan.evidenceRequirements?.map(
        (item: EvidenceItem, index: number) => (
          <article className="plan-item-card" key={index}>
            <span className="plan-item-number">
              EVIDENCE {String(index + 1).padStart(2, "0")}
            </span>
            <h4>{item.evidence}</h4>
            <div className="plan-detail">
              <strong>Purpose</strong>
              <p>{item.purpose}</p>
            </div>
            <div className="plan-detail">
              <strong>Possible source</strong>
              <p>{item.possibleSource}</p>
            </div>
          </article>
        )
      )}
    </div>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">07</span>
      <div>
        <h3>Verification Plan</h3>
        <p>A sequence of practical steps to test the key claims.</p>
      </div>
    </div>

    <div className="verification-timeline">
      {investigationPlan.verificationPlan?.map(
        (item: VerificationItem, index: number) => (
          <article className="verification-step" key={index}>
            <div className="verification-step-marker">
              {String(index + 1).padStart(2, "0")}
            </div>

            <div className="verification-step-content">
              <span className="plan-item-number">
                VERIFICATION STEP {String(index + 1).padStart(2, "0")}
              </span>
              <h4>{item.action}</h4>

              <div className="plan-detail">
                <strong>Evidence sought</strong>
                <p>{item.evidenceSought || "Not specified in the plan."}</p>
              </div>

              <div className="plan-detail">
                <strong>Source</strong>
                <p>{item.source}</p>
              </div>

              <div className="plan-detail">
                <strong>Claim being tested</strong>
                <p>{item.claimTested}</p>
              </div>

              <div className="plan-detail">
                <strong>Method</strong>
                <p>{item.method || "Not specified in the plan."}</p>
              </div>

              <div className="plan-detail">
                <strong>Possible findings</strong>
                <p>{item.possibleFindings}</p>
              </div>

              <div className="plan-next-step">
                <strong>What happens next</strong>
                <p>{item.nextStep || "Determine the next step from the evidence obtained."}</p>
              </div>
            </div>
          </article>
        )
      )}
    </div>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">08</span>
      <div>
        <h3>Alternative Explanations</h3>
        <p>Other plausible explanations to consider before drawing conclusions.</p>
      </div>
    </div>

    <ul className="plan-bullet-list">
      {investigationPlan.alternativeExplanations?.map(
        (item: string, index: number) => (
          <li key={index}>{item}</li>
        )
      )}
    </ul>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">09</span>
      <div>
        <h3>Limitations</h3>
        <p>Constraints that could affect the investigation or its conclusions.</p>
      </div>
    </div>

    <div className="plan-card-list">
      {investigationPlan.limitations?.map(
        (item: LimitationItem, index: number) => (
          <article className="plan-item-card" key={index}>
            {typeof item === "string" ? (
              <p>{item}</p>
            ) : (
              <>
                <h4>{item.issue}</h4>
                <div className="plan-detail">
                  <strong>Why it matters</strong>
                  <p>{item.whyItMatters}</p>
                </div>
                <div className="plan-detail">
                  <strong>How to resolve it</strong>
                  <p>{item.howToResolve}</p>
                </div>
                <div className="plan-detail">
                  <strong>If unresolved</strong>
                  <p>{item.ifUnresolved}</p>
                </div>
              </>
            )}
          </article>
        )
      )}
    </div>
  </section>

  <section className="plan-section">
    <div className="plan-section-heading">
      <span className="plan-section-number">10</span>
      <div>
        <h3>Editorial Safeguards</h3>
        <p>Standards to protect accuracy, fairness, and responsible reporting.</p>
      </div>
    </div>

    <div className="safeguard-list">
      {investigationPlan.editorialSafeguards?.map(
        (item: string, index: number) => (
          <div className="safeguard-item" key={index}>
            <span aria-hidden="true">✓</span>
            <p>{item}</p>
          </div>
        )
      )}
    </div>
  </section>

  <section className="plan-section confidence-card">
    <div className="plan-section-heading">
      <span className="plan-section-number">11</span>
      <div>
        <h3>Planning Confidence</h3>
        <p>An assessment of the proposed investigation, not proof of its claims.</p>
      </div>
    </div>

    {typeof investigationPlan.confidence === "object" &&
    investigationPlan.confidence !== null ? (
      <>
        <div className="confidence-grid">
          <div className="confidence-metric">
            <span>INVESTIGABILITY</span>
            <strong>
              {investigationPlan.confidence.investigability}
            </strong>
          </div>
          <div className="confidence-metric">
            <span>STARTING EVIDENCE</span>
            <strong>
              {investigationPlan.confidence.startingEvidence}
            </strong>
          </div>
        </div>

        <p className="plan-body">
          {investigationPlan.confidence.explanation}
        </p>
      </>
    ) : (
      <p className="plan-body">
        {investigationPlan.confidence}:{" "}
        {investigationPlan.confidenceExplanation}
      </p>
    )}
      </section>
</section>
</div>
)}

{aiAnalysis && (
  <>
    <div
      style={{
        marginBottom: "20px",
        padding: "14px 16px",
        borderRadius: "8px",
        background: aiAnalysis.analyzedFullArticle
          ? "#e8f5e9"
          : "#fff3e0",
        border: `1px solid ${
          aiAnalysis.analyzedFullArticle ? "#a5d6a7" : "#ffcc80"
        }`,
      }}
    >
      <strong>
        {aiAnalysis.analyzedFullArticle
          ? "Full article retrieved"
          : "Summary only"}
      </strong>

      <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
        {aiAnalysis.analyzedFullArticle
          ? "Journol retrieved the article text and sent it for AI analysis."
          : aiAnalysis.articleRetrievalNote ||
            "Journol could not retrieve the full article. The analysis may rely on the available headline and summary."}
      </p>
    </div>

    <section style={{ marginBottom: "24px" }}>
      <h3>Story Analysis</h3>
      <p style={{ lineHeight: 1.8 }}>
        {aiAnalysis.summary}
      </p>
      <h4>Why it matters</h4>
      <p style={{ lineHeight: 1.8 }}>
        {aiAnalysis.significance}
      </p>
    </section>

    <section style={{ marginBottom: "24px" }}>
  <h3>What the Article Reports</h3>
  <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
    {(aiAnalysis.reportedClaims || []).map(
      (item: string, index: number) => (
        <li key={index}>{item}</li>
      )
    )}
  </ul>
</section>

<section style={{ marginBottom: "24px" }}>
  <h3>Independently Verified</h3>
  {(aiAnalysis.independentlyVerified ?? []).length > 0 ? (
    <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
      {(aiAnalysis.independentlyVerified ?? []).map(
        (item: string, index: number) => (
          <li key={index}>{item}</li>
        )
      )}
    </ul>
  ) : (
    <p style={{ lineHeight: 1.8 }}>
      Journol has not independently verified any claims in this
      analysis. Further evidence is needed to confirm the reported
      information.
    </p>
  )}
</section>

<section style={{ marginBottom: "24px" }}>
  <h3>What Remains Unverified</h3>
  <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
    {(aiAnalysis.unverifiedClaims || []).map(
      (item: string, index: number) => (
        <li key={index}>{item}</li>
      )
    )}
  </ul>
</section>

<section style={{ marginBottom: "24px" }}>
  <h3>Investigative Angle</h3>

  {typeof aiAnalysis.investigativeAngle === "string" ? (
    <p style={{ lineHeight: 1.8 }}>
      {aiAnalysis.investigativeAngle}
    </p>
  ) : (
    <div style={{ lineHeight: 1.8 }}>
      {[
        { key: "LEAD", label: "Lead" },
        { key: "BASIS", label: "Basis" },
        { key: "PUBLIC INTEREST", label: "Public Interest" },
        { key: "FIRST ACTION", label: "First Action" },
      ].map(({ key, label }) => {
        const value = aiAnalysis.investigativeAngle?.[key];

        return value ? (
          <div key={key} style={{ marginBottom: "16px" }}>
            <h4 style={{ marginBottom: "6px" }}>{label}</h4>
            <p style={{ marginTop: 0 }}>{value}</p>
          </div>
        ) : null;
      })}
    </div>
  )}
</section>

      <section
        style={{
          marginBottom: "24px",
          padding: "18px",
          background: "#F7F7FC",
          borderRadius: "10px",
        }}
      >
        <h3>Evidence to Seek</h3>
        <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
          {(aiAnalysis.evidenceToSeek || []).map(
            (item: string, index: number) => (
              <li key={index}>{item}</li>
            )
          )}
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h3>Verification Plan</h3>
        <ol style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
          {(aiAnalysis.verificationPlan || []).map(
            (item: { source?: string; action?: string; possibleFindings?: string } | string, index: number) => (
              <li key={index} style={{ marginBottom: "18px" }}>
                {typeof item === "string" ? (
                  item
                ) : (
                  <div>
                    {item.source && (
                      <p>
                        <strong>Source:</strong> {item.source}
                      </p>
                    )}
                    {item.action && (
                      <p>
                        <strong>Action:</strong> {item.action}
                      </p>
                    )}
                    {item.possibleFindings && (
                      <p>
                        <strong>Possible Findings:</strong>{" "}
                        {item.possibleFindings}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          )}
        </ol>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h3>Evidence Gaps</h3>
        <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
          {(aiAnalysis.evidenceGaps || []).map(
            (item: string, index: number) => (
              <li key={index}>{item}</li>
            )
          )}
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h3>Alternative Explanations</h3>
        <ul style={{ lineHeight: 1.9, paddingLeft: "22px" }}>
          {(aiAnalysis.alternativeExplanations || []).map(
            (item: string, index: number) => (
              <li key={index}>{item}</li>
            )
          )}
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
  <p
    style={{
      color: "#85869c",
      fontSize: "12px",
      marginTop: "16px",
    }}
  >
    AI assessment confidence: {aiAnalysis.confidence || "Not specified"}.
    These are investigative leads, not verified findings.
  </p>
</section>
    </>
  )}

  {!isAnalyzing && !analysisError && !aiAnalysis && !proposedLead && !investigationPlan && (
    <p style={{ color: "#85869c", lineHeight: 1.8 }}>
      No investigative lead has been generated for this story yet.
    </p>
  )}
</div>

            {selectedLead.url && (
              <a
                href={selectedLead.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: "24px",
                  padding: "12px 18px",
                  background: "#5b5bc7",
                  color: "#ffffff",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                Read Original Article ↗
              </a>
            )}
          </div>
        </div>
      )}
      <div className="demo-notice">
          <span>ⓘ</span>
          <p>
            <strong>Discovery signals are not verified reporting.</strong> Story
            scores and prompts identify possible reporting directions; they do
            not establish claims or wrongdoing.
          </p>
        </div>
      </section>
      <section style={{ marginTop: "36px", marginBottom: "36px" }}>
        <div style={{ marginBottom: "20px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "2px",
              color: "#5b5bc7",
            }}
          >
            LIVE NEWS MONITOR
          </p>

          <h2 style={{ fontSize: "26px", margin: "8px 0" }}>
            Latest News
          </h2>

          <p style={{ color: "#85869c", fontSize: "14px" }}>
            News articles retrieved from monitored sources.
          </p>
        </div>

        {newsLoading && <p>Loading news articles...</p>}

        {!newsLoading && newsError && (
          <p style={{ color: "#b42318" }}>{newsError}</p>
        )}

        {!newsLoading && !newsError && (
          <>
            <p style={{ color: "#85869c", fontSize: "13px" }}>
              {newsArticles.length} articles retrieved
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
                marginTop: "16px",
              }}
            >
              {newsArticles.slice(0, 12).map((article) => (
                <article
                  key={article.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #ececf2",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <p
                    style={{
                      color: "#5b5bc7",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {article.source}
                  </p>

                  <h3
                    style={{
                      fontSize: "16px",
                      lineHeight: 1.5,
                      margin: "10px 0",
                    }}
                  >
                    {article.title}
                  </h3>

                  <p
                    style={{
                      color: "#85869c",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    {article.description || "No description available."}
                  </p>

                  {article.publishedAt && (
                    <p style={{ color: "#85869c", fontSize: "12px" }}>
                      {new Date(article.publishedAt).toLocaleDateString()}
                    </p>
                  )}

                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        marginTop: "12px",
                        color: "#5b5bc7",
                        fontSize: "13px",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Read original article ↗
                    </a>
                  )}
                </article>
              ))}
            </div>

            <p
              style={{
                color: "#85869c",
                fontSize: "12px",
                marginTop: "18px",
              }}
            >
              Headlines and descriptions come from the original feeds.
              Verify information against the source article before relying
              on it.
            </p>
          </>
        )}
      </section>
      <footer className="page-footer">
        <span>journol © 2026</span>
        <span>Built for curious newsrooms.</span>
        <span>See beyond the headlines. ↗</span>
      </footer>
    </div>
  </section>
  <style>{`
    @import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap");
    :root {
      color-scheme: light;
      --ink: #22233b;
      --muted: #85869c;
      --line: #ececf2;
      --purple: #5b5bc7;
      --background: #fafafe;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--background);
      color: var(--ink);
      font-family: "DM Sans", sans-serif;
      font-size: 13px;
      -webkit-font-smoothing: antialiased;
    }
    button,
    input {
      font: inherit;
    }
    button {
      cursor: pointer;
    }
    .journol-app {
      min-height: 100vh;
      display: flex;
    }
    .sidebar {
      width: 244px;
      flex-shrink: 0;
      min-height: 100vh;
      padding: 28px 17px 18px;
      background: #fff;
      border-right: 1px solid #eeeef4;
      display: flex;
      flex-direction: column;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 0 7px;
      margin-bottom: 49px;
      text-decoration: none;
      color: var(--ink);
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 39px;
      height: 39px;
      border-radius: 13px;
      background: #5b5bc7;
      color: white;
      font: 800 25px "Manrope", sans-serif;
      letter-spacing: -2px;
      padding: 0 4px 4px 0;
      box-shadow: 0 5px 12px #5b5bc726;
    }
    .brand strong {
      display: block;
      font: 800 22px "Manrope", sans-serif;
      letter-spacing: -1.1px;
    }
    .brand small {
      display: block;
      margin-top: 2px;
      color: #9696ab;
      font-size: 8px;
      letter-spacing: 1.15px;
      font-weight: 700;
    }
    .workspace-label {
      margin: 0 10px 12px;
      font-size: 9px;
      font-weight: 700;
      color: #a1a1b3;
      letter-spacing: 1.3px;
    }
    .nav-list {
      display: grid;
      gap: 4px;
    }
    .nav-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 12px;
      border: 0;
      border-radius: 9px;
      text-align: left;
      background: transparent;
      color: #77788f;
      font-size: 12px;
      transition: background 0.15s, color 0.15s;
    }
    .nav-item:hover {
      background: #f7f7fc;
      color: var(--ink);
    }
    .nav-item.active {
      background: #efeffd;
      color: #5555b7;
      font-weight: 700;
    }
    .nav-icon {
      width: 17px;
      font-size: 17px;
      text-align: center;
    }
    .nav-count {
      margin-left: auto;
      padding: 3px 7px;
      border-radius: 5px;
      background: #fff;
      color: #6464bd;
      font-size: 10px;
    }
    .second-label {
      margin-top: 35px;
    }
    .sidebar-bottom {
      margin-top: auto;
    }
    .upgrade-card {
      margin: 25px 2px 18px;
      padding: 16px 13px;
      border-radius: 12px;
      background: linear-gradient(145deg, #f2f0ff, #faf7ff);
      border: 1px solid #eeebff;
    }
    .upgrade-spark {
      display: block;
      margin-bottom: 12px;
      color: #6460c8;
      font-size: 20px;
    }
    .upgrade-card strong {
      font: 700 12px "Manrope", sans-serif;
    }
    .upgrade-card p {
      margin: 7px 0 0;
      color: #88879e;
      font-size: 11px;
      line-height: 1.7;
    }
    .profile-button {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 13px 3px 0;
      border: 0;
      border-top: 1px solid var(--line);
      background: white;
      text-align: left;
    }
    .avatar,
    .top-avatar {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: #e8e7fb;
      color: #5c59b8;
      font-size: 10px;
      font-weight: 700;
    }
    .profile-text {
      display: grid;
      gap: 4px;
    }
    .profile-text strong {
      font-size: 11px;
    }
    .profile-text small {
      color: #9a9aad;
      font-size: 10px;
    }
    .profile-dots {
      margin-left: auto;
      color: #9292a8;
      font-size: 21px;
    }
    .main-panel {
      min-width: 0;
      flex: 1;
    }
    .topbar {
      height: 73px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 43px;
      background: #fff;
      border-bottom: 1px solid #eeeef4;
    }
    .breadcrumb {
      display: flex;
      gap: 12px;
      align-items: center;
      color: #9a9aad;
      font-size: 11px;
    }
    .breadcrumb-divider {
      color: #d2d2df;
    }
    .breadcrumb strong {
      color: #40415d;
      font-weight: 600;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .live-indicator {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 9px;
      color: #8c8ca0;
      letter-spacing: 0.7px;
      font-weight: 700;
    }
    .live-indicator span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #b1b0c9;
    }
    .icon-button {
      border: 0;
      background: transparent;
      color: #77788f;
      font-size: 21px;
    }
    .top-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
    }
    .dashboard-content {
      width: 100%;
      max-width: 1380px;
      padding: 39px 43px 24px;
      margin: 0 auto;
    }
    .welcome-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 204px;
      overflow: hidden;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 19px;
      color: #8b8ba2;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .eyebrow-line {
      width: 18px;
      height: 1px;
      background: #c9c8dd;
    }
    h1 {
      margin: 0;
      color: #25253f;
      font: 800 clamp(36px, 4vw, 53px) / 1.08 "Manrope", sans-serif;
      letter-spacing: -2.6px;
    }
    h1 span {
      color: #6260ca;
    }
    .welcome-description {
      margin: 15px 0 0;
      color: #85869c;
      font-size: 12px;
    }
    .welcome-art {
      position: relative;
      width: 220px;
      height: 200px;
      flex-shrink: 0;
      margin-right: 8%;
    }
    .orbit {
      position: absolute;
      border: 1px solid #e0def8;
      border-radius: 50%;
      transform: rotate(-24deg);
    }
    .orbit-one {
      inset: 17px 5px;
    }
    .orbit-two {
      inset: 33px -6px;
      transform: rotate(38deg);
    }
    .orbit-three {
      inset: 0 35px;
      transform: rotate(54deg);
    }
    .art-core {
      position: absolute;
      top: 65px;
      left: 79px;
      display: grid;
      place-items: center;
      width: 65px;
      height: 65px;
      border-radius: 23px;
      background: linear-gradient(145deg, #7673df, #4e4bb6);
      box-shadow: 0 12px 30px #615cc82e;
      color: white;
      font: 800 39px "Manrope", sans-serif;
      letter-spacing: -4px;
      padding: 0 6px 6px 0;
      transform: rotate(-8deg);
    }
    .art-star {
      position: absolute;
      color: #8884e4;
      font-size: 23px;
    }
    .star-one {
      top: 24px;
      right: 37px;
    }
    .star-two {
      bottom: 20px;
      left: 36px;
      font-size: 15px;
    }
    .art-dot {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #e0a8c8;
    }
    .dot-one {
      top: 48px;
      left: 36px;
    }
    .dot-two {
      right: 18px;
      bottom: 45px;
      background: #a5a1ec;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 15px;
      margin: 24px 0 41px;
    }
    .stat-card {
      padding: 19px 20px 17px;
      border: 1px solid #eeeef5;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 3px 12px #28284a03;
    }
    .stat-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: #9292a8;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.7px;
    }
    .stat-icon {
      display: grid;
      place-items: center;
      width: 29px;
      height: 29px;
      border-radius: 9px;
      font-size: 16px;
    }
    .purple-icon {
      background: #f0efff;
      color: #625ec7;
    }
    .green-icon {
      background: #e4f6ed;
      color: #348565;
    }
    .orange-icon {
      background: #fff0e2;
      color: #c27c39;
    }
    .stat-number {
      margin: 12px 0 6px;
      font: 800 32px "Manrope", sans-serif;
      letter-spacing: -1.3px;
    }
    .stat-foot {
      color: #9393a7;
      font-size: 10px;
    }
    .stat-trend {
      margin-right: 4px;
      color: #27865f;
      font-weight: 700;
    }
    .section-heading {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 22px;
    }
    .section-kicker {
      margin-bottom: 9px;
      color: #7775c9;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.2px;
    }
    h2 {
      margin: 0;
      font: 800 22px "Manrope", sans-serif;
      letter-spacing: -0.7px;
    }
    .section-heading p {
      margin: 8px 0 0;
      color: #9191a6;
      font-size: 11px;
    }
    .text-button {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      padding: 9px 0;
      border: 0;
      background: transparent;
      color: #5d5bc2;
      font-size: 11px;
      font-weight: 700;
    }
    .text-button span {
      font-size: 17px;
    }
    .filter-row {
      position: relative;
      display: flex;
      gap: 9px;
      margin-bottom: 14px;
    }
    .filter-panel {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0 16px;
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #fafafe;
    }
    .filter-panel input {
      width: 100%;
      border: 1px solid #dbe1ea;
      border-radius: 7px;
      padding: 8px 10px;
      font: inherit;
    }
    .filter-help { margin: -4px 0 14px; color: #64748b; font-size: 12px; }
    .suggestion-empty { color: #9191a6; font-size: 11px; }
    .search-box {
      display: flex;
      align-items: center;
      flex: 1;
      gap: 10px;
      min-width: 100px;
      height: 41px;
      padding: 0 12px;
      border: 1px solid #eaeaf2;
      border-radius: 8px;
      background: white;
      color: #8888a0;
    }
    .search-box > span {
      font-size: 20px;
    }
    .search-box input {
      flex: 1;
      width: 100%;
      min-width: 0;
      outline: none;
      border: 0;
      background: transparent;
      color: #36364f;
      font-size: 11px;
    }
    .search-box input::placeholder {
      color: #aaaabd;
    }
    kbd {
      padding: 4px 6px;
      border: 1px solid #ececf3;
      border-radius: 4px;
      background: #fafafd;
      color: #aaaabd;
      font-size: 9px;
      white-space: nowrap;
    }
    .filter-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 0 13px;
      border: 1px solid #eaeaf2;
      border-radius: 8px;
      background: #fff;
      color: #73738b;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .filter-button:hover, .filter-button[aria-expanded="true"] { border-color: #c9c8e9; color: #4e4cad; background: #fafaff; }
    .filter-button:focus-visible, .filter-check:focus-within, .active-filter-chip:focus-visible {
      outline: 2px solid #5d5bc2;
      outline-offset: 2px;
    }
    .filters-popover {
      position: absolute;
      z-index: 25;
      top: calc(100% + 7px);
      right: 0;
      width: min(490px, calc(100vw - 40px));
      max-height: min(560px, calc(100vh - 160px));
      overflow-y: auto;
      padding: 16px;
      border: 1px solid #e3e2f0;
      border-radius: 11px;
      background: #fff;
      box-shadow: 0 16px 40px #25254a1c;
    }
    .filters-popover-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 11px;
      border-bottom: 1px solid #efeff5;
      color: #34334f;
      font: 800 13px "Manrope", sans-serif;
    }
    .filters-popover-heading .text-button { padding: 0; font-size: 10px; }
    .filters-popover-heading .text-button:disabled { color: #aaaabd; cursor: not-allowed; }
    .filter-section { padding-top: 14px; }
    .filter-section h3, .location-filter-group h4 {
      margin: 0;
      color: #7775be;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .filter-section h3 { margin-bottom: 9px; }
    .location-filter-group + .location-filter-group { margin-top: 13px; }
    .location-filter-group h4 { margin-bottom: 7px; color: #9191a6; font-size: 8px; }
    .filter-options { display: flex; flex-wrap: wrap; gap: 7px; }
    .filter-check {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 29px;
      padding: 5px 9px;
      border: 1px solid #dbe1ea;
      border-radius: 999px;
      background: #fff;
      color: #42415b;
      font-size: 11px;
      cursor: pointer;
    }
    .filter-check:has(input:checked) { border-color: #5b5bc7; background: #efefff; color: #3730a3; }
    .filter-check input { width: 13px; height: 13px; margin: 0; accent-color: #5d5bc2; }
    .filters-popover .filter-help { margin: 14px 0 0; line-height: 1.5; }
    .active-filter-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -5px 0 14px; }
    .active-filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 9px;
      border: 1px solid #cbc9ec;
      border-radius: 999px;
      background: #f4f3ff;
      color: #4d4bad;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
    }
    .active-filter-chip span { font-size: 14px; line-height: 10px; }
    .compact-clear { padding: 4px 5px; font-size: 10px; }
    .filter-chevron {
      color: #a3a3b5;
    }
    .story-list {
      display: grid;
      gap: 12px;
    }
    .story-card {
      display: grid;
      grid-template-columns: 22px 92px minmax(0, 1fr) 105px;
      gap: 15px;
      align-items: center;
      padding: 17px 17px 17px 13px;
      border: 1px solid #ececf3;
      border-radius: 11px;
      background: #fff;
      transition: box-shadow 0.2s, transform 0.2s;
    }
    .story-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 24px #25254a08;
    }
    .saved-investigation-illustration { background: #f1f0ff; color: #5d5bc2; }
    .saved-investigation-preview {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    .story-index {
      align-self: start;
      padding-top: 4px;
      color: #b2b2c4;
      font: 600 10px "Manrope", sans-serif;
    }
    .story-illustration {
      position: relative;
      display: grid;
      place-items: center;
      width: 92px;
      height: 105px;
      overflow: hidden;
      border-radius: 8px;
    }
    .illustration-orbit {
      position: absolute;
      width: 82px;
      height: 82px;
      border: 1px solid currentColor;
      border-radius: 50%;
      opacity: 0.25;
    }
    .illustration-symbol {
      z-index: 1;
      font: 500 43px "Manrope", sans-serif;
    }
    .illustration-dot {
      position: absolute;
      top: 22px;
      right: 17px;
      width: 7px;
      height: 7px;
      border: 1px solid currentColor;
      border-radius: 50%;
    }
    .story-main {
      min-width: 0;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    button.story-main {
      border: 0;
      padding: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .story-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      margin-bottom: 9px;
      color: #9191a6;
      font-size: 9px;
    }
    .category-pill {
      padding: 4px 7px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .meta-dot {
      color: #c6c6d3;
    }
    .story-main h3 {
      margin: 0;
      color: #30304a;
      font: 700 13px/1.5 "Manrope", sans-serif;
      letter-spacing: -0.15px;
    }
    .story-main > p {
      margin: 7px 0 12px;
      color: #87879d;
      font-size: 10px;
      line-height: 1.7;
    }
    .story-bottom {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .signal-tag {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #6d6cb9;
      font-size: 9px;
      font-weight: 600;
    }
    .signal-icon {
      font-size: 12px;
    }
    .evidence-count {
      color: #9b9bad;
      font-size: 9px;
    }
    .story-actions {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-end;
      min-width: 0;
    }
    .score-label {
      color: #9b9bad;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .score-number {
      margin: 5px 0;
      font: 800 25px "Manrope", sans-serif;
      letter-spacing: -1px;
    }
    .score-track {
      width: 65px;
      height: 4px;
      margin-bottom: 13px;
      overflow: hidden;
      border-radius: 5px;
      background: #efeff7;
    }
    .score-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: #7774d6;
    }
    .save-button {
      padding: 6px 9px;
      border: 1px solid #e9e8f5;
      border-radius: 6px;
      background: white;
      color: #7775be;
      font-size: 9px;
      white-space: nowrap;
    }
    .save-button.is-saved {
      border-color: #e3dffb;
      background: #f3f1ff;
      color: #5552b7;
    }
    .explore-button {
      margin-top: 7px;
      padding: 4px 0;
      border: 0;
      background: transparent;
      color: #7775be;
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
    }
    .empty-state {
      display: grid;
      justify-items: center;
      padding: 42px 20px;
      border: 1px dashed #dcdceb;
      border-radius: 12px;
      background: white;
      text-align: center;
    }
    .empty-state > span {
      color: #7775be;
      font-size: 29px;
    }
    .empty-state h3 {
      margin: 10px 0 0;
      font: 700 15px "Manrope", sans-serif;
    }
    .empty-state p {
      color: #88889e;
      font-size: 11px;
    }
    .demo-notice {
      display: flex;
      align-items: start;
      gap: 10px;
      margin-top: 18px;
      padding: 13px 15px;
      border: 1px solid #eeeaf9;
      border-radius: 8px;
      background: #f8f6ff;
      color: #85829e;
    }
    .demo-notice > span {
      color: #7771c9;
      font-size: 14px;
    }
    .demo-notice p {
      margin: 0;
      font-size: 10px;
      line-height: 1.7;
    }
    .demo-notice strong {
      color: #5b588f;
    }
    .page-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 32px;
      padding-top: 17px;
      border-top: 1px solid #ececf3;
      color: #a2a2b5;
      font-size: 9px;
    }
          /* Investigation Plan */
    .investigation-plan {
      max-width: 100%;
      margin-top: 28px;
      padding: 30px;
      border: 1px solid #e9e8f2;
      border-radius: 16px;
      background: #fff;
      color: #292943;
      font-size: 13px;
      line-height: 1.75;
      overflow-wrap: anywhere;
    }

    .investigation-plan * {
      min-width: 0;
    }

    .investigation-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 24px;
      border-bottom: 1px solid #ededf5;
    }

    .investigation-eyebrow {
      margin: 0 0 8px;
      color: #6562c8;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1.5px;
    }

    .investigation-header h2 {
      font: 800 27px/1.3 "Manrope", sans-serif;
      letter-spacing: -0.8px;
    }

    .investigation-subtitle {
      margin: 8px 0 0;
      color: #85869c;
      font-size: 12px;
      line-height: 1.7;
    }

    .investigation-status {
      flex-shrink: 0;
      padding: 6px 10px;
      border: 1px solid #d9f0e3;
      border-radius: 20px;
      background: #effaf3;
      color: #28794d;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .article-status {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 20px;
      padding: 15px 17px;
      border: 1px solid #dcefe4;
      border-radius: 10px;
      background: #f5fbf7;
    }

    .article-status-warning {
      border-color: #f2e3bd;
      background: #fffbef;
    }

    .status-indicator {
      flex-shrink: 0;
      width: 9px;
      height: 9px;
      margin-top: 7px;
      border-radius: 50%;
      background: #319b68;
    }

    .article-status-warning .status-indicator {
      background: #c38b25;
    }

    .article-status strong {
      display: block;
      color: #315b43;
      font-size: 12px;
    }

    .article-status-warning strong {
      color: #805e20;
    }

    .article-status p {
      margin: 3px 0 0;
      color: #777b87;
      font-size: 11px;
      line-height: 1.7;
    }

      .approved-lead-card {
      margin-top: 24px;
      padding: 22px;
      border: 1px solid #e3e1fa;
      border-left: 4px solid #6562c8;
      border-radius: 10px;
      background: #f8f7ff;
    }

    .approved-lead-card .plan-section-heading {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 16px;
    }

    .approved-lead-card .plan-section-heading h3 {
      line-height: 1.6;
    }

    .approved-lead-card > p {
      margin: 0;
      color: #373650;
      font: 600 15px/1.85 "Manrope", sans-serif;
    }

    .plan-section-heading {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }

    .plan-section-number {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 31px;
      height: 31px;
      border-radius: 9px;
      background: #efeeff;
      color: #5e5bc1;
      font: 800 11px "Manrope", sans-serif;
    }

    .plan-section-heading h3 {
      margin: 0;
      color: #30304a;
      font: 800 15px/1.5 "Manrope", sans-serif;
    }

    .plan-section-heading p {
      margin: 3px 0 0;
      color: #8b8ba0;
      font-size: 11px;
      line-height: 1.6;
    }

    .approved-lead-card > p {
      margin: 0;
      color: #373650;
      font: 600 15px/1.85 "Manrope", sans-serif;
    }

      .first-action-card {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-top: 14px;
      padding: 20px;
      border: 1px solid #d9e8fb;
      border-radius: 10px;
      background: #f5f9ff;
    }

    .first-action-card .plan-section-number {
      flex-shrink: 0;
      background: #e3edff;
      color: #3867ad;
    }

    .first-action-card h3 {
      margin: 0;
      line-height: 1.6;
      font: 800 14px/1.6 "Manrope", sans-serif;
      color: #2d4771;
    }

    .first-action-card p {
      margin: 7px 0 0;
      color: #4e5f79;
      font-size: 12px;
      line-height: 1.8;
    }

    .plan-section {
      margin-top: 32px;
    }

    .plan-section > .plan-body {
      margin: 0;
      color: #626279;
      font-size: 12px;
      line-height: 1.9;
    }

    .plan-card-list {
      display: grid;
      gap: 12px;
      margin-top: 15px;
    }

    .plan-item-card {
      padding: 18px 20px;
      border: 1px solid #ececf3;
      border-radius: 10px;
      background: #fff;
    }

    .plan-item-card > p {
      margin: 0;
      color: #56566e;
      font-size: 12px;
      line-height: 1.85;
    }

    .plan-status-label {
      display: inline-block;
      margin: 0 0 9px;
      color: #7775c9;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }

    .plan-question {
      margin: 0;
      color: #383850;
      font: 700 12px/1.8 "Manrope", sans-serif;
    }

    .plan-card-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px;
      margin-top: 15px;
    }

    .plan-detail {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid #f0f0f6;
    }

    .plan-detail strong {
      display: block;
      margin-bottom: 4px;
      color: #7775a0;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.4px;
    }

    .plan-detail p {
      margin: 0;
      color: #626279;
      font-size: 11px;
      line-height: 1.8;
    }

    .verification-timeline {
      display: grid;
      gap: 0;
      margin-top: 18px;
    }

    .verification-step {
      display: grid;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 14px;
    }

    .verification-step-marker {
      position: relative;
      display: flex;
      justify-content: center;
    }

    .verification-step-marker::after {
      position: absolute;
      top: 37px;
      bottom: 0;
      width: 1px;
      background: #e5e4f2;
      content: "";
    }

    .verification-step:last-child .verification-step-marker::after {
      display: none;
    }

    .verification-step-marker span {
      display: grid;
      z-index: 1;
      place-items: center;
      width: 34px;
      height: 34px;
      border: 1px solid #deddf8;
      border-radius: 50%;
      background: #f4f3ff;
      color: #5d5ac1;
      font: 800 11px "Manrope", sans-serif;
    }

    .verification-step-content {
      min-width: 0;
      margin-bottom: 20px;
      padding: 18px 20px;
      border: 1px solid #ececf3;
      border-radius: 10px;
      background: #fff;
    }

    .verification-step-content h4 {
      margin: 0;
      color: #33334d;
      font: 800 13px/1.7 "Manrope", sans-serif;
    }

    .verification-step-content > p {
      margin: 8px 0 0;
      color: #626279;
      font-size: 11px;
      line-height: 1.85;
    }

    .plan-next-step {
      margin-top: 13px;
      padding: 12px 14px;
      border-radius: 7px;
      background: #f5f5fc;
      color: #56558f;
      font-size: 11px;
      line-height: 1.8;
    }

    .plan-next-step strong {
      display: block;
      margin-bottom: 3px;
      font-size: 10px;
    }

    .plan-bullet-list {
      display: grid;
      gap: 10px;
      margin: 15px 0 0;
      padding-left: 20px;
      color: #626279;
      font-size: 12px;
      line-height: 1.85;
    }

    .plan-bullet-list li::marker {
      color: #7775c9;
    }

    .safeguard-list {
      display: grid;
      gap: 10px;
      margin-top: 15px;
    }

    .safeguard-item {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      padding: 13px 15px;
      border: 1px solid #e4efe8;
      border-radius: 8px;
      background: #f8fcf9;
      color: #4d6658;
      font-size: 11px;
      line-height: 1.8;
    }

    .safeguard-item > span {
      flex-shrink: 0;
      color: #28865a;
      font-weight: 800;
    }

    .confidence-card {
      margin-top: 15px;
      padding: 22px;
      border: 1px solid #e8e6f6;
      border-radius: 11px;
      background: #faf9ff;
    }

    .confidence-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 17px;
    }

    .confidence-metric {
      padding: 15px;
      border: 1px solid #eceaf8;
      border-radius: 9px;
      background: #fff;
    }

    .confidence-metric > span {
      display: block;
      margin-bottom: 7px;
      color: #8988a0;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.7px;
    }

    .confidence-metric strong {
      display: block;
      color: #514eaa;
      font: 800 16px "Manrope", sans-serif;
      text-transform: uppercase;
    }

    .confidence-card > p {
      margin: 0;
      color: #66657c;
      font-size: 12px;
      line-height: 1.9;
    }

    @media (max-width: 700px) {
      .investigation-plan {
        padding: 18px 14px;
      }

      .investigation-header {
        flex-direction: column;
        gap: 12px;
      }

      .investigation-header h2 {
        font-size: 23px;
      }

      .approved-lead-card,
      .first-action-card,
      .verification-step-content,
      .confidence-card {
        padding: 16px;
      }

      .plan-card-grid,
      .confidence-grid {
        grid-template-columns: 1fr;
      }

      .verification-step {
        grid-template-columns: 30px minmax(0, 1fr);
        gap: 9px;
      }

      .verification-step-marker span {
        width: 29px;
        height: 29px;
      }

      .verification-step-marker::after {
        top: 32px;
      }
    }
    @media (min-width: 1500px) {
      .dashboard-content {
        padding-right: 65px;
        padding-left: 65px;
      }
      .story-card {
        grid-template-columns: 22px 105px minmax(0, 1fr) 110px;
        gap: 20px;
      }
      .story-illustration {
        width: 105px;
        height: 112px;
      }
    }
    @media (max-width: 1150px) {
      .sidebar {
        width: 215px;
      }
      .topbar {
        padding: 0 28px;
      }
      .dashboard-content {
        padding: 32px 28px 22px;
      }
      .welcome-art {
        margin-right: 0;
        transform: scale(0.85);
      }
      .story-card {
        grid-template-columns: 16px 75px minmax(0, 1fr) 86px;
        gap: 10px;
        padding: 13px 12px;
      }
      .story-illustration {
        width: 75px;
        height: 95px;
      }
      .story-main > p {
        font-size: 9px;
      }
    }
    @media (max-width: 850px) {
      .sidebar {
        width: 66px;
        padding: 22px 8px 13px;
      }
      .brand {
        justify-content: center;
        padding: 0;
        margin-bottom: 40px;
      }
      .brand > span:last-child,
      .workspace-label,
      .nav-item > span:not(.nav-icon),
      .upgrade-card,
      .profile-text,
      .profile-dots {
        display: none;
      }
      .nav-item {
        justify-content: center;
        padding: 12px 0;
      }
      .nav-icon {
        font-size: 19px;
      }
      .second-label {
        display: none;
      }
      .profile-button {
        justify-content: center;
      }
      .topbar {
        padding: 0 20px;
      }
      .dashboard-content {
        padding: 28px 20px 20px;
      }
      .welcome-art {
        display: none;
      }
      .story-card {
        grid-template-columns: 15px minmax(0, 1fr) 78px;
      }
      .story-illustration {
        display: none;
      }
      .stats-grid {
        gap: 8px;
      }
      .stat-card {
        padding: 14px 12px;
      }
      .stat-top {
        font-size: 8px;
      }
      .stat-number {
        font-size: 27px;
      }
    }
    @media (max-width: 540px) {
      .sidebar {
        width: 52px;
        padding-right: 5px;
        padding-left: 5px;
      }
      .brand-mark {
        width: 35px;
        height: 35px;
      }
      .topbar {
        height: 58px;
        padding: 0 13px;
      }
      .topbar-right {
        gap: 10px;
      }
      .live-indicator {
        display: none;
      }
      .dashboard-content {
        padding: 25px 13px 18px;
      }
      .eyebrow {
        flex-wrap: wrap;
        font-size: 8px;
      }
      h1 {
        font-size: 40px;
      }
      .welcome-row {
        min-height: auto;
      }
      .stats-grid {
        grid-template-columns: 1fr;
        margin: 24px 0 32px;
      }
      .stat-card {
        padding: 13px 15px;
      }
      .stat-number {
        margin-top: 6px;
        font-size: 25px;
      }
      .section-heading {
        align-items: start;
        flex-direction: column;
        gap: 9px;
      }
      h2 {
        font-size: 19px;
      }
      .filter-row {
        flex-wrap: wrap;
      }
      .search-box {
        flex-basis: 100%;
      }
      .filter-button {
        height: 35px;
      }
      .filters-popover {
        position: fixed;
        top: auto;
        right: 12px;
        bottom: 12px;
        left: 12px;
        width: auto;
        max-height: min(70vh, 560px);
        border-radius: 13px;
      }
      .story-card {
        grid-template-columns: 14px minmax(0, 1fr);
        gap: 9px;
        padding: 13px 10px;
      }
      .story-actions {
        grid-column: 2;
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        flex-wrap: wrap;
        gap: 9px;
        padding-top: 10px;
        border-top: 1px solid #f0f0f6;
      }
      .score-label,
      .score-track {
        display: none;
      }
      .score-number {
        margin: 0;
        font-size: 17px;
      }
      .explore-button {
        margin: 0;
      }
      .story-main h3 {
        font-size: 12px;
      }
      .story-main > p {
        font-size: 10px;
      }
      .page-footer {
        flex-wrap: wrap;
        font-size: 8px;
      }
    }
  `}</style>
</main>

);
}
