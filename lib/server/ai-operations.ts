import type { AiOperation, AiOperationStage, Id, UsageStatus, User } from "@/lib/domain/types";
import type { JournolRepository } from "@/lib/server/repository";

export type BeginAiOperationInput = {
  user: User;
  investigationId: Id;
  stage: AiOperationStage;
  idempotencyKey: string;
  model: string;
};

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
};

/**
 * Coordinates an AI operation without importing the OpenAI SDK. Callers own
 * model invocation; this service owns idempotency and auditable lifecycle
 * records. Quota reservation is intentionally a future PostgreSQL service.
 */
export class AiOperationService {
  constructor(private readonly repository: JournolRepository) {}

  async begin(input: BeginAiOperationInput): Promise<{ operation: AiOperation; reused: boolean }> {
    const existing = await this.repository.findAiOperation(input.user.id, input.idempotencyKey);
    if (existing) {
      if (existing.status === "pending") {
        // Routes have a 55s maximum duration and provider calls a 25s
        // deadline. A two-minute lease permits recovery from a terminated
        // process without taking over a normally running request.
        const staleBefore = new Date(Date.now() - 120_000);
        const restarted = await this.repository.restartStalePendingAiOperation(existing.id, staleBefore);
        if (restarted) return { operation: restarted, reused: false };
        return { operation: existing, reused: true };
      }
      if (existing.status === "succeeded") return { operation: existing, reused: true };

      // Only one simultaneous retry may reclaim a failed operation. A caller
      // that loses the atomic transition sees the pending/succeeded operation
      // on the next read and must not invoke the provider again.
      const restarted = await this.repository.restartFailedAiOperation(existing.id);
      if (restarted) return { operation: restarted, reused: false };
      const current = await this.repository.findAiOperation(input.user.id, input.idempotencyKey);
      if (current) return { operation: current, reused: true };
    }

    try {
      const operation = await this.repository.createAiOperation({
        userId: input.user.id,
        investigationId: input.investigationId,
        stage: input.stage,
        idempotencyKey: input.idempotencyKey,
        model: input.model,
      });
      return { operation, reused: false };
    } catch (error) {
      // PostgreSQL enforces (user_id, idempotency_key). A concurrent request
      // may win between the initial read and insert; reuse its operation.
      if (isUniqueViolation(error)) {
        const concurrent = await this.repository.findAiOperation(input.user.id, input.idempotencyKey);
        if (concurrent) return { operation: concurrent, reused: true };
      }
      throw error;
    }
  }

  async succeed(operation: AiOperation, usage: AiUsage, providerRequestId?: string) {
    await this.repository.finishAiOperation({ operationId: operation.id, status: "succeeded", providerRequestId });
    return this.recordUsage(operation, "succeeded", usage);
  }

  async fail(operation: AiOperation, errorCode: string, usage: AiUsage = {}) {
    await this.repository.finishAiOperation({ operationId: operation.id, status: "failed", errorCode });
    return this.recordUsage(operation, "failed", usage);
  }

  private async recordUsage(operation: AiOperation, status: UsageStatus, usage: AiUsage) {
    return this.repository.recordUsage({
      userId: operation.userId,
      operationId: operation.id,
      stage: operation.stage,
      model: operation.model,
      status,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      estimatedCostMicros: usage.estimatedCostMicros ?? null,
    });
  }
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}
