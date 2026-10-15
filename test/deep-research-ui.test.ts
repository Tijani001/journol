import { describe, expect, it } from "vitest";
import {
  DEEP_RESEARCH_SOURCE_REQUIRED_MESSAGE,
  nextDeepResearchPanelState,
  persistedSourceState,
} from "@/lib/deep-research-ui";

describe("Deep Research panel state", () => {
  it("opens with an actionable message instead of silently disabling Deep Research when no source is stored", () => {
    expect(nextDeepResearchPanelState({ isOpen: false, hasStoredSource: false })).toEqual({
      isOpen: true,
      error: DEEP_RESEARCH_SOURCE_REQUIRED_MESSAGE,
    });
  });

  it("toggles normally after article retrieval has stored a source", () => {
    expect(nextDeepResearchPanelState({ isOpen: false, hasStoredSource: true })).toEqual({ isOpen: true, error: "" });
    expect(nextDeepResearchPanelState({ isOpen: true, hasStoredSource: true })).toEqual({ isOpen: false, error: "" });
  });

  it("does not turn an earlier empty workflow snapshot into a source-state reset", () => {
    expect(persistedSourceState(null)).toBeNull();
    expect(persistedSourceState({ originalUrl: "https://example.test/story" })).toBeNull();
    expect(persistedSourceState({ id: "source-1", originalUrl: "https://example.test/story" })).toEqual({
      sourceArticleId: "source-1",
      originalUrl: "https://example.test/story",
    });
  });
});
