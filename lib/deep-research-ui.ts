export const DEEP_RESEARCH_SOURCE_REQUIRED_MESSAGE =
  "Journol couldn’t access the original article needed for this research. Please reopen the story or provide a working article link.";

/**
 * The panel is always safe to open. A missing source must be explained in the
 * interface rather than silently turning the entry button into a dead control.
 */
export function nextDeepResearchPanelState(input: {
  isOpen: boolean;
  hasStoredSource: boolean;
}) {
  if (!input.hasStoredSource) {
    return { isOpen: true, error: DEEP_RESEARCH_SOURCE_REQUIRED_MESSAGE };
  }

  return { isOpen: !input.isOpen, error: "" };
}

/**
 * An investigation can be loaded while its article/lead workflow is still in
 * progress. In that case the API correctly has no source yet, but that empty
 * snapshot must not clear a source retrieved by the active browser request.
 */
export function persistedSourceState(value: unknown): {
  sourceArticleId: string;
  originalUrl: string | null;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  return {
    sourceArticleId: source.id,
    originalUrl: typeof source.originalUrl === "string" ? source.originalUrl : null,
  };
}
