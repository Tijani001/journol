import "server-only";

import OpenAI from "openai";
import type { StructuredModel } from "@/lib/engine/run";

export const DEFAULT_MODEL = "gpt-4.1-mini";

export function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export class ModelOutputError extends Error {}

/** OpenAI Responses API with strict JSON-schema output. Server-only: the key never reaches the browser. */
export function createOpenAiModel(): StructuredModel {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 40_000, maxRetries: 1 });
  const model = modelName();
  return async (request) => {
    const response = await client.responses.create({
      model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      text: { format: { type: "json_schema", name: request.name, strict: true, schema: request.schema } },
    });
    const text = response.output_text?.trim();
    if (!text) throw new ModelOutputError("EMPTY_MODEL_OUTPUT");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ModelOutputError("INVALID_MODEL_OUTPUT");
    }
  };
}
