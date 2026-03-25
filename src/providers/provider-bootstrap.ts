import { createAnthropicProvider } from "./anthropic-provider.ts";
import { createOpenAIProvider } from "./openai-provider.ts";
import { ProviderRegistry } from "./provider-registry.ts";
import { ProviderRouter } from "./provider-router.ts";
import { createProviderRunner, type ProviderRunner } from "./provider-runner.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CreateProviderRunnerFromEnvInput = {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
};

function requireEnv(
  value: string | undefined,
  keyDescription: string,
  provider: string,
): string {
  if (!value) {
    throw new Error(`${provider} provider requires ${keyDescription}`);
  }

  return value;
}

function selectProvider(
  env: Record<string, string | undefined>,
): "openai" | "anthropic" | "openai-compatible" | "neo" | null {
  const requested = readFirst(env, ["BETA_PROVIDER", "MODEL_PROVIDER", "model_provider"]);

  if (
    requested === "openai" ||
    requested === "anthropic" ||
    requested === "openai-compatible" ||
    requested === "neo"
  ) {
    return requested;
  }

  if (env.OPENAI_API_KEY) {
    return "openai";
  }

  if (env.NEO_KEY) {
    return "neo";
  }

  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) {
    return "anthropic";
  }

  return null;
}

function readFirst(env: Record<string, string | undefined>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function createProviderRunnerFromEnv(
  input: CreateProviderRunnerFromEnvInput = {},
): ProviderRunner | null {
  const env = input.env ?? process.env;
  const selectedProvider = selectProvider(env);

  if (!selectedProvider) {
    return null;
  }

  const registry = new ProviderRegistry();

  if (
    selectedProvider === "openai" ||
    selectedProvider === "openai-compatible" ||
    selectedProvider === "neo"
  ) {
    const providerId = selectedProvider;
    const model =
      selectedProvider === "neo"
        ? readFirst(env, ["BETA_MODEL", "MODEL", "model"]) ?? "gpt-5.4"
        : readFirst(env, ["BETA_MODEL", "OPENAI_MODEL", "MODEL", "model"]) ?? "gpt-5";
    const apiKey = requireEnv(
      selectedProvider === "neo"
        ? readFirst(env, ["BETA_API_KEY", "NEO_KEY"])
        : readFirst(env, ["BETA_API_KEY", "OPENAI_API_KEY"]),
      selectedProvider === "neo"
        ? "BETA_API_KEY or NEO_KEY"
        : "BETA_API_KEY or OPENAI_API_KEY",
      providerId,
    );
    const baseURL =
      selectedProvider === "neo"
        ? readFirst(env, ["BETA_BASE_URL", "NEO_BASE_URL"]) ?? "https://crs.us.bestony.com/openai"
        : readFirst(env, ["BETA_BASE_URL", "OPENAI_BASE_URL"]);

    registry.register(
      createOpenAIProvider({
        id: providerId,
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(input.fetch ? { fetch: input.fetch } : {}),
      }),
    );

    return createProviderRunner({
      registry,
      router: new ProviderRouter({
        main: `${providerId}:${model}`,
      }),
    });
  }

  const model = readFirst(env, ["BETA_MODEL", "ANTHROPIC_MODEL"]) ?? "claude-sonnet-4-20250514";
  const apiKey = requireEnv(
    readFirst(env, ["BETA_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]),
    "BETA_API_KEY or ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN",
    "anthropic",
  );
  const baseURL = readFirst(env, ["BETA_BASE_URL", "ANTHROPIC_BASE_URL"]);

  registry.register(
    createAnthropicProvider({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      ...(input.fetch ? { fetch: input.fetch } : {}),
    }),
  );

  return createProviderRunner({
    registry,
    router: new ProviderRouter({
      main: `anthropic:${model}`,
    }),
  });
}
