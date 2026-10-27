import "server-only";

import { searchRelatedCoverage } from "@/lib/engine/related";
import type { RelatedSearch, StructuredModel } from "@/lib/engine/run";
import type { StoryInput } from "@/lib/engine/types";
import { readStory } from "@/lib/server/article-reader";
import { createOpenAiModel, isOpenAiConfigured, modelName } from "@/lib/server/openai-model";

export type EngineServices = {
  model: StructuredModel;
  search: RelatedSearch;
  readStory: (url: string) => Promise<StoryInput>;
  modelName: string;
};

let overrides: Partial<EngineServices> | null = null;

/** Test-only: replace the model, search or story reader. */
export function setEngineServicesForTesting(value: Partial<EngineServices> | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Not available in production.");
  overrides = value;
}

export function engineConfigured(): boolean {
  return Boolean(overrides?.model) || isOpenAiConfigured();
}

export function engineServices(): EngineServices {
  return {
    model: overrides?.model ?? createOpenAiModel(),
    search: overrides?.search ?? ((queries, story) => searchRelatedCoverage(queries, {
      apiKey: process.env.TAVILY_API_KEY,
      excludeUrl: story.url,
      excludeTitle: story.title,
    })),
    readStory: overrides?.readStory ?? readStory,
    modelName: overrides?.modelName ?? modelName(),
  };
}
