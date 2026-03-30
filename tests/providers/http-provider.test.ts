import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_ASSISTANT_IDENTITY } from "../../src/core/brand.ts";
import { createAnthropicProvider } from "../../src/providers/anthropic-provider.ts";
import { createOpenAIProvider } from "../../src/providers/openai-provider.ts";
import { createProviderRunnerFromEnv } from "../../src/providers/provider-bootstrap.ts";

function readHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;

  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found?.[1] ?? null;
  }

  const value = (headers as Record<string, string | undefined>)[name];
  return value ?? (headers as Record<string, string | undefined>)[name.toLowerCase()] ?? null;
}

test("openai provider calls the responses api and returns output_text", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const provider = createOpenAIProvider({
    apiKey: "test-openai-key",
    baseURL: "https://api.openai.test/v1",
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        init,
      });

      return new Response(
        JSON.stringify({
          model: "gpt-5",
          output_text: "hello from openai",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await provider.complete({
    role: "main",
    mode: "balanced",
    model: "gpt-5",
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
  });

  assert.equal(calls[0]?.url, "https://api.openai.test/v1/responses");
  assert.equal(readHeader(calls[0]?.init, "Authorization"), "Bearer test-openai-key");
  const requestBody = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(requestBody.instructions, DEFAULT_ASSISTANT_IDENTITY);
  assert.equal(result.outputText, "hello from openai");
  assert.equal(result.model, "gpt-5");
});

test("openai provider promotes system messages into top-level instructions", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const provider = createOpenAIProvider({
    apiKey: "test-openai-key",
    baseURL: "https://api.openai.test/v1",
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        init,
      });

      return new Response(
        JSON.stringify({
          model: "gpt-5",
          output_text: "ok",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  await provider.complete({
    role: "main",
    mode: "balanced",
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: "Answer in one sentence.",
      },
      {
        role: "user",
        content: "say hello",
      },
    ],
  });

  const requestBody = JSON.parse(String(calls[0]?.init?.body));

  assert.equal(requestBody.instructions, "Answer in one sentence.");
  assert.deepEqual(requestBody.input, [
    {
      role: "user",
      content: "say hello",
    },
  ]);
});

test("openai provider forwards AbortSignal to fetch", async () => {
  const calls: Array<{ init: RequestInit | undefined }> = [];
  const controller = new AbortController();
  const provider = createOpenAIProvider({
    apiKey: "test-openai-key",
    baseURL: "https://api.openai.test/v1",
    fetch: async (_url, init) => {
      calls.push({
        init,
      });

      return new Response(
        JSON.stringify({
          model: "gpt-5",
          output_text: "ok",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  await provider.complete({
    role: "main",
    mode: "balanced",
    model: "gpt-5",
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
    signal: controller.signal,
  });

  assert.equal(calls[0]?.init?.signal, controller.signal);
});

test("openai provider includes response body details on non-2xx errors", async () => {
  const provider = createOpenAIProvider({
    apiKey: "test-openai-key",
    baseURL: "https://api.openai.test/v1",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "unsupported model",
          },
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  });

  await assert.rejects(
    () =>
      provider.complete({
        role: "main",
        mode: "balanced",
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
      }),
    /OpenAI request failed with status 400.*unsupported model/,
  );
});

test("anthropic provider calls the messages api and flattens text blocks", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const provider = createAnthropicProvider({
    apiKey: "test-anthropic-key",
    baseURL: "https://api.anthropic.test/v1",
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        init,
      });

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "hello from anthropic",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await provider.complete({
    role: "main",
    mode: "balanced",
    model: "claude-sonnet-4-20250514",
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
  });

  assert.equal(calls[0]?.url, "https://api.anthropic.test/v1/messages");
  assert.equal(readHeader(calls[0]?.init, "x-api-key"), "test-anthropic-key");
  assert.equal(readHeader(calls[0]?.init, "anthropic-version"), "2023-06-01");
  const requestBody = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(
    requestBody.system,
    DEFAULT_ASSISTANT_IDENTITY,
  );
  assert.equal(result.outputText, "hello from anthropic");
  assert.equal(result.model, "claude-sonnet-4-20250514");
});

test("anthropic provider appends /v1/messages for gateway-style base urls", async () => {
  let observedUrl = "";
  const provider = createAnthropicProvider({
    apiKey: "test-anthropic-key",
    baseURL: "https://code.newcli.com/claude",
    fetch: async (url) => {
      observedUrl = String(url);

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "gateway ok",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await provider.complete({
    role: "main",
    mode: "balanced",
    model: "claude-sonnet-4-20250514",
    messages: [
      {
        role: "user",
        content: "hi",
      },
    ],
  });

  assert.equal(observedUrl, "https://code.newcli.com/claude/v1/messages");
  assert.equal(result.outputText, "gateway ok");
});

test("anthropic provider forwards AbortSignal to fetch", async () => {
  const calls: Array<{ init: RequestInit | undefined }> = [];
  const controller = new AbortController();
  const provider = createAnthropicProvider({
    apiKey: "test-anthropic-key",
    baseURL: "https://api.anthropic.test/v1",
    fetch: async (_url, init) => {
      calls.push({
        init,
      });

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "ok",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  await provider.complete({
    role: "main",
    mode: "balanced",
    model: "claude-sonnet-4-20250514",
    messages: [
      {
        role: "user",
        content: "say hello",
      },
    ],
    signal: controller.signal,
  });

  assert.equal(calls[0]?.init?.signal, controller.signal);
});

test("provider bootstrap creates an openai runner from environment variables", async () => {
  const runner = createProviderRunnerFromEnv({
    env: {
      EXPECTO_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "gpt-5",
      OPENAI_BASE_URL: "https://api.openai.test/v1",
    },
    fetch: async () =>
      new Response(
        JSON.stringify({
          model: "gpt-5",
          output_text: "bootstrapped openai",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
  });

  const result = await runner?.complete({
    role: "main",
    mode: "balanced",
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  });

  assert.equal(result?.outputText, "bootstrapped openai");
});

test("provider bootstrap accepts anthropic auth token aliases and custom base urls", async () => {
  const runner = createProviderRunnerFromEnv({
    env: {
      EXPECTO_PROVIDER: "anthropic",
      ANTHROPIC_AUTH_TOKEN: "test-anthropic-token",
      ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
      ANTHROPIC_BASE_URL: "https://code.newcli.com/claude",
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "https://code.newcli.com/claude/v1/messages");
      assert.equal(readHeader(init, "x-api-key"), "test-anthropic-token");

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "bootstrapped anthropic",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await runner?.complete({
    role: "main",
    mode: "balanced",
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  });

  assert.equal(result?.outputText, "bootstrapped anthropic");
});

test("provider bootstrap supports unified EXPECTO env vars for openai-compatible gateways", async () => {
  const runner = createProviderRunnerFromEnv({
    env: {
      EXPECTO_PROVIDER: "openai-compatible",
      EXPECTO_API_KEY: "gateway-key",
      EXPECTO_MODEL: "gpt-4.1-mini",
      EXPECTO_BASE_URL: "https://gateway.example.com/openai/v1/",
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "https://gateway.example.com/openai/v1/responses");
      assert.equal(readHeader(init, "Authorization"), "Bearer gateway-key");
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(
        requestBody.instructions,
        DEFAULT_ASSISTANT_IDENTITY,
      );

      return new Response(
        JSON.stringify({
          model: "gpt-4.1-mini",
          output_text: "gateway response",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await runner?.complete({
    role: "main",
    mode: "balanced",
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  });

  assert.equal(result?.outputText, "gateway response");
});

test("provider bootstrap ignores removed BETA env vars for openai-compatible gateways", async () => {
  const runner = createProviderRunnerFromEnv({
    env: {
      BETA_PROVIDER: "openai-compatible",
      BETA_API_KEY: "gateway-key",
      BETA_MODEL: "gpt-4.1-mini",
      BETA_BASE_URL: "https://gateway.example.com/openai/v1/",
    },
  });
  assert.equal(runner, null);
});

test("provider bootstrap supports neo-style aliases for model, provider, and key", async () => {
  const runner = createProviderRunnerFromEnv({
    env: {
      model_provider: "neo",
      model: "gpt-5.4",
      NEO_KEY: "neo-key",
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "https://crs.us.bestony.com/openai/responses");
      assert.equal(readHeader(init, "Authorization"), "Bearer neo-key");

      return new Response(
        JSON.stringify({
          model: "gpt-5.4",
          output_text: "neo response",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
  });

  const result = await runner?.complete({
    role: "main",
    mode: "balanced",
    messages: [
      {
        role: "user",
        content: "hello",
      },
    ],
  });

  assert.equal(result?.outputText, "neo response");
});
