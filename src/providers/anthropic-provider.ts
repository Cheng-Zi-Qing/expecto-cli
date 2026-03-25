import {
  providerCapabilitiesSchema,
  providerRequestSchema,
  providerResponseSchema,
  type ModelProvider,
  type ProviderRequest,
} from "./provider-types.ts";
import { defaultAssistantIdentity } from "./default-assistant-identity.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CreateAnthropicProviderInput = {
  apiKey: string;
  baseURL?: string;
  fetch?: FetchLike;
};

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessagesPayload = {
  model?: string;
  stop_reason?: string;
  content?: AnthropicContentBlock[];
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

function messagesEndpoint(baseURL: string): string {
  return baseURL.endsWith("/v1") ? `${baseURL}/messages` : `${baseURL}/v1/messages`;
}

function splitAnthropicMessages(messages: ProviderRequest["messages"]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: (message.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: message.content,
    }));
  const system = systemMessages.length > 0
    ? systemMessages.join("\n\n")
    : defaultAssistantIdentity;

  return {
    system,
    messages: conversation.length > 0 ? conversation : [{ role: "user", content: systemMessages.join("\n\n") }],
  };
}

export function createAnthropicProvider(input: CreateAnthropicProviderInput): ModelProvider {
  const fetchImpl = getFetch(input.fetch);
  const baseURL = normalizeBaseURL(input.baseURL ?? "https://api.anthropic.com/v1");
  const capabilities = providerCapabilitiesSchema.parse({
    supportsTools: false,
    supportsStreaming: false,
    supportsStructuredOutput: false,
    supportsVision: false,
  });

  return {
    id: "anthropic",
    capabilities,
    async complete(request) {
      const parsedRequest = providerRequestSchema.parse(request);
      const anthropicMessages = splitAnthropicMessages(parsedRequest.messages);
      const response = await fetchImpl(messagesEndpoint(baseURL), {
        method: "POST",
        headers: {
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        ...(request.signal ? { signal: request.signal } : {}),
        body: JSON.stringify({
          model: parsedRequest.model,
          max_tokens: 1024,
          ...anthropicMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as AnthropicMessagesPayload;

      return providerResponseSchema.parse({
        providerId: "anthropic",
        model: payload.model ?? parsedRequest.model,
        outputText: (payload.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join(""),
        stopReason: payload.stop_reason ?? "completed",
      });
    },
  };
}
