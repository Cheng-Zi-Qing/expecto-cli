import {
  providerCapabilitiesSchema,
  providerRequestSchema,
  providerResponseSchema,
  type ModelProvider,
  type ProviderCapabilities,
  type ProviderRequest,
  type ProviderResponse,
} from "./provider-types.ts";

export type CreateStaticProviderInput = {
  id: string;
  capabilities?: Partial<ProviderCapabilities>;
  complete(request: ProviderRequest): Promise<ProviderResponse> | ProviderResponse;
};

export function createStaticProvider(input: CreateStaticProviderInput): ModelProvider {
  const capabilities = providerCapabilitiesSchema.parse({
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    supportsVision: false,
    ...input.capabilities,
  });

  return {
    id: input.id,
    capabilities,
    async complete(request: ProviderRequest): Promise<ProviderResponse> {
      const parsedRequest = providerRequestSchema.parse(request);
      return providerResponseSchema.parse(await input.complete(parsedRequest));
    },
  };
}
