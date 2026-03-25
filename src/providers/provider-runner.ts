import type { AssistantStepInput, AssistantStepResult } from "../runtime/runtime-session.ts";
import type { SessionMode } from "../runtime/bootstrap-context.ts";
import { ProviderRegistry } from "./provider-registry.ts";
import { ProviderRouter } from "./provider-router.ts";
import {
  providerRequestSchema,
  type ModelRole,
  type ProviderMessage,
  type ProviderResponse,
} from "./provider-types.ts";

export type ProviderRunnerOptions = {
  registry: ProviderRegistry;
  router: ProviderRouter;
};

export type ProviderCompletionInput = {
  role: ModelRole;
  mode: SessionMode;
  messages: ProviderMessage[];
  signal?: AbortSignal;
};

function defaultModelName(providerId: string): string {
  return `${providerId}/default`;
}

export class ProviderRunner {
  private readonly registry: ProviderRegistry;
  private readonly router: ProviderRouter;

  constructor(options: ProviderRunnerOptions) {
    this.registry = options.registry;
    this.router = options.router;
  }

  async complete(input: ProviderCompletionInput): Promise<ProviderResponse> {
    const route = this.router.resolve(input.role);
    const provider = this.registry.get(route.providerId);
    const request = providerRequestSchema.parse({
      role: input.role,
      mode: input.mode,
      model: route.model || defaultModelName(route.providerId),
      messages: input.messages,
    });

    return provider.complete({
      ...request,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }

  createAssistantStep(): (input: AssistantStepInput) => Promise<AssistantStepResult | null> {
    return async (input) => {
      if (!input.prompt) {
        return null;
      }

      const response = await this.complete({
        role: "main",
        mode: input.context.mode,
        messages: input.messages,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      return {
        output: response.outputText,
      };
    };
  }
}

export function createProviderRunner(options: ProviderRunnerOptions): ProviderRunner {
  return new ProviderRunner(options);
}
