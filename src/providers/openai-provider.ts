import {
  providerCapabilitiesSchema,
  providerRequestSchema,
  providerResponseSchema,
  type ModelProvider,
  type ProviderRequest,
} from "./provider-types.ts";
import { defaultAssistantIdentity } from "./default-assistant-identity.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CreateOpenAIProviderInput = {
  id?: string;
  apiKey: string;
  baseURL?: string;
  fetch?: FetchLike;
};

type OpenAIResponsesPayload = {
  model?: string;
  output_text?: string;
  status?: string;
};

function getFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  return fetch;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
}

function toOpenAIInput(messages: ProviderRequest["messages"]): Array<{ role: string; content: string }> {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
    role: message.role === "system" ? "developer" : message.role,
    content: message.content,
    }));
}

function toOpenAIInstructions(messages: ProviderRequest["messages"]): string {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  if (instructions.length > 0) {
    return instructions;
  }

  return defaultAssistantIdentity;
}

export function createOpenAIProvider(input: CreateOpenAIProviderInput): ModelProvider {
  const fetchImpl = getFetch(input.fetch);
  const providerId = input.id ?? "openai";
  const baseURL = normalizeBaseURL(input.baseURL ?? "https://api.openai.com/v1");
  const capabilities = providerCapabilitiesSchema.parse({
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    supportsVision: false,
  });

  return {
    id: providerId,
    capabilities,
    async complete(request) {
      const parsedRequest = providerRequestSchema.parse(request);
      const response = await fetchImpl(`${baseURL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        ...(request.signal ? { signal: request.signal } : {}),
        body: JSON.stringify({
          model: parsedRequest.model,
          instructions: toOpenAIInstructions(parsedRequest.messages),
          input: toOpenAIInput(parsedRequest.messages),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `OpenAI request failed with status ${response.status}: ${errorBody}`,
        );
      }

      const payload = (await response.json()) as OpenAIResponsesPayload;

      return providerResponseSchema.parse({
        providerId,
        model: payload.model ?? parsedRequest.model,
        outputText: payload.output_text ?? "",
        stopReason: payload.status ?? "completed",
      });
    },
  };
}
