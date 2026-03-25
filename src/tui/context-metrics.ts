import type { ContextMetrics } from "./tui-types.ts";

export type DeriveContextMetricsInput = {
  providerLabel: string;
  modelLabel: string;
  instructions: string[];
  hooksCount: number;
  loadedDocsCount: number;
  sessionSummary: string;
  conversation: string[];
};

function estimateMaxContextTokens(providerLabel: string, modelLabel: string): number {
  const model = `${providerLabel}:${modelLabel}`.toLowerCase();

  if (model.includes("claude")) {
    return 200_000;
  }

  if (model.includes("gpt-5")) {
    return 128_000;
  }

  return 64_000;
}

function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function deriveContextMetrics(input: DeriveContextMetricsInput): ContextMetrics {
  const totalText = [
    ...input.instructions,
    input.sessionSummary,
    ...input.conversation,
  ].join("\n");
  const usedTokens = estimateTokens(totalText);
  const maxTokens = estimateMaxContextTokens(input.providerLabel, input.modelLabel);

  return {
    percent: Math.max(1, Math.min(99, Math.round((usedTokens / maxTokens) * 100))),
    rules: input.instructions.length,
    hooks: input.hooksCount,
    docs: input.loadedDocsCount,
  };
}
