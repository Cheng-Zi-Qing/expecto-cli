import test from "node:test";
import assert from "node:assert/strict";

import { createProviderRunner } from "../../src/providers/provider-runner.ts";
import { ProviderRegistry } from "../../src/providers/provider-registry.ts";
import { ProviderRouter } from "../../src/providers/provider-router.ts";
import { createStaticProvider } from "../../src/providers/static-provider.ts";
import { modelRoleSchema } from "../../src/providers/provider-types.ts";

test("provider roles accept the v1 routed role names", () => {
  const parsed = modelRoleSchema.parse("main");

  assert.equal(parsed, "main");
});

test("provider runner resolves a provider by role and returns its completion text", async () => {
  const registry = new ProviderRegistry();
  const router = new ProviderRouter({
    main: "test-static:test-model",
  });

  registry.register(
    createStaticProvider({
      id: "test-static",
      complete: async (request) => ({
        providerId: "test-static",
        model: request.model,
        outputText: `echo:${request.messages.at(-1)?.content ?? ""}`,
        stopReason: "end_turn",
      }),
    }),
  );

  const runner = createProviderRunner({
    registry,
    router,
  });
  const result = await runner.complete({
    role: "main",
    mode: "balanced",
    messages: [
      {
        role: "user",
        content: "summarize the plan",
      },
    ],
  });

  assert.equal(result.providerId, "test-static");
  assert.equal(result.model, "test-model");
  assert.equal(result.outputText, "echo:summarize the plan");
});

test("provider runner converts assistant-step input into a routed completion request", async () => {
  const registry = new ProviderRegistry();
  const router = new ProviderRouter({
    main: "step-provider:step-model",
  });
  let observedPrompt = "";

  registry.register(
    createStaticProvider({
      id: "step-provider",
      complete: async (request) => {
        observedPrompt = request.messages.at(-1)?.content ?? "";

        return {
          providerId: "step-provider",
          model: request.model,
          outputText: "assistant: provider output",
          stopReason: "end_turn",
        };
      },
    }),
  );

  const runner = createProviderRunner({
    registry,
    router,
  });
  const assistantStep = runner.createAssistantStep();
  const result = await assistantStep({
    sessionId: "session-1",
    turnId: "turn-1",
    prompt: "fix auth regression",
    messages: [
      {
        role: "user",
        content: "fix auth regression",
      },
    ],
    context: {
      projectRoot: "/tmp/project",
      mode: "balanced",
      entry: {
        kind: "interactive",
        initialPrompt: "fix auth regression",
      },
      instructions: [],
      memory: [],
      activeArtifacts: {
        required: [],
        optional: [],
        onDemand: [],
      },
      loadedArtifacts: {
        required: [],
        optional: [],
      },
      sessionSummary: "required docs: none",
    },
  });

  assert.equal(observedPrompt, "fix auth regression");
  assert.deepEqual(result, {
    kind: "output",
    responseId: "response-turn-1",
    output: "assistant: provider output",
    finishReason: "stop",
  });
});

test("provider runner uses message history when assistant-step input has no prompt field", async () => {
  const registry = new ProviderRegistry();
  const router = new ProviderRouter({
    main: "history-provider:history-model",
  });
  let observedLastMessage = "";

  registry.register(
    createStaticProvider({
      id: "history-provider",
      complete: async (request) => {
        observedLastMessage = request.messages.at(-1)?.content ?? "";

        return {
          providerId: "history-provider",
          model: request.model,
          outputText: "assistant: history output",
          stopReason: "end_turn",
        };
      },
    }),
  );

  const runner = createProviderRunner({
    registry,
    router,
  });
  const assistantStep = runner.createAssistantStep();
  const result = await assistantStep({
    sessionId: "session-1",
    turnId: "turn-2",
    messages: [
      {
        role: "user",
        content: "continue from history",
      },
    ],
    context: {
      projectRoot: "/tmp/project",
      mode: "balanced",
      entry: {
        kind: "continue",
      },
      instructions: [],
      memory: [],
      activeArtifacts: {
        required: [],
        optional: [],
        onDemand: [],
      },
      loadedArtifacts: {
        required: [],
        optional: [],
      },
      sessionSummary: "required docs: none",
    },
  });

  assert.equal(observedLastMessage, "continue from history");
  assert.deepEqual(result, {
    kind: "output",
    responseId: "response-turn-2",
    output: "assistant: history output",
    finishReason: "stop",
  });
});

test("provider router falls back to the main route and exposes provider id plus model", () => {
  const router = new ProviderRouter({
    main: "openai:gpt-5",
  });

  const route = router.resolve("reviewer");

  assert.equal(route.providerId, "openai");
  assert.equal(route.model, "gpt-5");
});
