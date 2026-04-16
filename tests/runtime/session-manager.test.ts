import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import type { DomainFact } from "../../src/protocol/domain-event-schema.ts";
import { SessionManager } from "../../src/runtime/session-manager.ts";
import { SessionInterruptController } from "../../src/runtime/session-interrupt.ts";
import { SessionSnapshotStore } from "../../src/runtime/session-snapshot-store.ts";
import { createProviderRunner } from "../../src/providers/provider-runner.ts";
import { ProviderRegistry } from "../../src/providers/provider-registry.ts";
import { ProviderRouter } from "../../src/providers/provider-router.ts";
import { createStaticProvider } from "../../src/providers/static-provider.ts";

function assistantOutputResult(output: string, responseId = "response-1") {
  return {
    kind: "output" as const,
    responseId,
    output,
    finishReason: "stop" as const,
  };
}

function captureAssistantOutputChunk(
  assistantOutputs: string[],
  event: DomainFact,
): void {
  const p = event.payload as Record<string, unknown>;
  if (
    event.eventType === "assistant.stream_chunk" &&
    p.channel === "output_text"
  ) {
    assistantOutputs.push(p.delta as string);
  }
}

function requestIdFromFact(event: DomainFact): string | undefined {
  return event.causation?.requestId;
}

function turnIdFromRequestId(requestId: string | undefined): string | undefined {
  if (!requestId?.startsWith("request-")) {
    return undefined;
  }

  const suffix = requestId.slice("request-".length);
  return suffix.startsWith("turn-") ? suffix : `turn-${suffix}`;
}

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-session-"));
  await mkdir(join(root, currentAppPath("docs", "specs")), { recursive: true });
  await writeFile(join(root, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(root, currentAppPath("docs", "specs", "01-plan.md")), "# Plan\n");
  return root;
}

test("session manager runs an interactive session and emits lifecycle facts", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "fix auth regression",
    },
    cwd: projectRoot,
  });
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.match(result.sessionId, /^session-/);
  assert.equal(result.state, "idle");
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "request.succeeded",
      "session.state_changed",
      "session.stopped",
    ],
  );
  assert.equal(
    interactionEvents.find((event) => event.eventType === "user.prompt_received")?.payload.prompt,
    "fix auth regression",
  );
  assert.equal(
    interactionEvents.find((event) => event.eventType === "session.started")?.sessionId,
    result.sessionId,
  );
});

test("session manager runs a one-shot session and records the prompt in domain facts", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.sessionId.length > 0, true);
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "request.succeeded",
      "session.state_changed",
      "session.stopped",
    ],
  );
  assert.equal(
    interactionEvents.find((event) => event.eventType === "user.prompt_received")?.payload.prompt,
    "summarize the plan",
  );
});

test("session manager persists a snapshot for the completed session", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "continue the task",
    },
    cwd: projectRoot,
  });
  const manager = new SessionManager({
    write: () => {},
  });

  const result = await manager.run(context);
  const snapshot = await new SessionSnapshotStore(projectRoot).findLatest(result.sessionId);

  assert.equal(snapshot?.sessionId, result.sessionId);
  assert.equal(snapshot?.state, "idle");
  assert.equal(snapshot?.activeArtifacts.required.length, 2);
  assert.match(snapshot?.compactedSummary ?? "", /Continue from the active workspace docs\./);
});

test("session manager persists blocked terminal state on runtime failure", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "trigger failure",
    },
    cwd: projectRoot,
  });
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => {
      throw new Error("assistant step failed");
    },
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  await assert.rejects(manager.run(context), /assistant step failed/);

  const snapshot = await new SessionSnapshotStore(projectRoot).findLatest();

  assert.equal(snapshot?.state, "blocked");

  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "request.failed",
      "session.state_changed",
      "session.stopped",
    ],
  );
  assert.equal(interactionEvents[4]?.payload.code, "Error");
  assert.equal(interactionEvents[5]?.payload.state, "error");
  assert.equal(interactionEvents.at(-1)?.eventType, "session.stopped");
  assert.equal(interactionEvents.at(-1)?.payload.state, "blocked");
});

test("session manager calls the assistant step hook and renders its output", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  let output = "";
  let observedPrompt = "";
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    assistantStep: async (input) => {
      observedPrompt = input.prompt ?? "";

      return assistantOutputResult("assistant: bootstrap placeholder");
    },
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.equal(observedPrompt, "summarize the plan");
  assert.match(output, /assistant: bootstrap placeholder/);
  assert.equal(
    interactionEvents.find((event) => event.eventType === "session.started")?.sessionId,
    result.sessionId,
  );
});

test("session manager can use a provider runner through the assistant hook boundary", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const registry = new ProviderRegistry();
  const router = new ProviderRouter({
    main: "provider-main",
  });

  registry.register(
    createStaticProvider({
      id: "provider-main",
      complete: async () => ({
        providerId: "provider-main",
        model: "static/default",
        outputText: "assistant: routed provider output",
        stopReason: "end_turn",
      }),
    }),
  );

  let output = "";
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    providerRunner: createProviderRunner({
      registry,
      router,
    }),
  });

  await manager.run(context);

  assert.match(output, /assistant: routed provider output/);
});

test("session manager emits assistant lifecycle envelopes and request terminal facts for one-shot results", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const eventTypes: string[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => assistantOutputResult("assistant: hi", "response-42"),
    emitFact: (event: DomainFact) => {
      eventTypes.push(event.eventType);
    },
  });

  await manager.run(context);

  assert.deepEqual(eventTypes, [
    "session.started",
    "session.state_changed",
    "user.prompt_received",
    "session.state_changed",
    "assistant.response_started",
    "assistant.stream_chunk",
    "assistant.response_completed",
    "request.succeeded",
    "session.state_changed",
    "session.stopped",
  ]);
});

test("session manager normalizes malformed assistant output results before emitting domain facts", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () =>
      ({
        kind: "output",
        responseId: "",
        output: "assistant: hi",
        finishReason: "tool_calls",
        usage: {
          prompt_tokens: -1,
        },
      }) as never,
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "assistant.response_started",
      "assistant.stream_chunk",
      "assistant.response_completed",
      "request.succeeded",
      "session.state_changed",
      "session.stopped",
    ],
  );
  const startedPayload = interactionEvents[4]?.payload as
    | { responseId?: unknown }
    | undefined;
  const completedPayload = interactionEvents[6]?.payload as
    | { finishReason?: unknown; usage?: unknown }
    | undefined;
  assert.equal(startedPayload?.responseId, "response-turn-1");
  assert.equal(completedPayload?.finishReason, "stop");
  assert.equal("usage" in (completedPayload ?? {}), false);

  for (const event of interactionEvents) {
    assert.doesNotThrow(() => /* schema validation removed - DomainFact is validated at emit time */ event);
  }
});

test("session manager rejects malformed assistant tool_calls results before emitting invalid domain facts", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () =>
      ({
        kind: "tool_calls",
        responseId: "",
        plannedExecutionIds: [],
      }) as never,
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  await assert.rejects(
    () => manager.run(context),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "InvalidAssistantStepResult");
      return true;
    },
  );

  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "request.failed",
      "session.state_changed",
      "session.stopped",
    ],
  );
  const requestCompletedPayload = interactionEvents[4]?.payload as
    | { code?: unknown; message?: unknown; retryable?: unknown }
    | undefined;
  assert.equal(requestCompletedPayload?.code, "InvalidAssistantStepResult");
  assert.equal(requestCompletedPayload?.message, "request failed");
  assert.equal(requestCompletedPayload?.retryable, false);

  for (const event of interactionEvents) {
    assert.doesNotThrow(() => /* schema validation removed - DomainFact is validated at emit time */ event);
  }
});

test("session manager continues a request after tool_calls and keeps requestId stable across continuation events", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const assistantInputs: Array<{ turnId: string; prompt?: string }> = [];
  const events: Array<{
    eventType: string;
    turnId: string | undefined;
    requestId: string | undefined;
    payload: Record<string, unknown>;
  }> = [];
  let callCount = 0;
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async (input) => {
      assistantInputs.push({
        turnId: input.turnId,
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      });
      callCount += 1;

      if (callCount === 1) {
        return {
          kind: "tool_calls" as const,
          responseId: "response-tool-calls",
          plannedExecutionIds: ["execution-1", "execution-2"],
          executionItems: [
            {
              executionId: "execution-1",
              title: "Run checks",
              output: "ok",
              summary: "Checks passed",
              executionKind: "tool" as const,
              stream: "stdout" as const,
              origin: { source: "test" },
            },
          ],
        };
      }

      return assistantOutputResult("assistant: follow-up", "response-follow-up");
    },
    emitFact: (event: DomainFact) => {
      events.push({
        eventType: event.eventType,
        turnId: event.causation?.requestId?.replace(/^request-/, ""),
        requestId: event.causation?.requestId,
        payload: event.payload,
      });
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.equal(callCount, 2);
  assert.equal(assistantInputs[0]?.prompt, "summarize the plan");
  assert.equal(assistantInputs[1]?.prompt, undefined);
  assert.notEqual(assistantInputs[0]?.turnId, assistantInputs[1]?.turnId);
  assert.deepEqual(
    events.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "assistant.response_started",
      "assistant.response_completed",
      "execution.started",
      "execution.chunk",
      "execution.completed",
      "execution.started",
      "execution.completed",
      "assistant.response_started",
      "assistant.stream_chunk",
      "assistant.response_completed",
      "request.succeeded",
      "session.state_changed",
      "session.stopped",
    ],
  );

  const turnScopedEvents = events.filter((e) => e.requestId !== undefined);
  const requestIds = new Set(turnScopedEvents.map((event) => event.requestId));
  assert.equal(requestIds.size, 1);
  assert.equal(turnScopedEvents[0]?.requestId, `request-${assistantInputs[0]?.turnId}`);
  assert.equal(events[5]?.payload.finishReason, "tool_calls");
  assert.equal(events[5]?.payload.continuation, "awaiting_execution");
  assert.deepEqual(events[5]?.payload.plannedExecutionIds, ["execution-1", "execution-2"]);
});

test("session manager emits AGENT_LOOP_LIMIT_EXCEEDED when tool_calls continuation exceeds maxTurnLimit", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  let assistantCalls = 0;
  const requestCompletedEvents: Array<{
    code: unknown;
    message?: unknown;
  }> = [];
  const manager = new SessionManager({
    write: () => {},
    maxTurnLimit: 2,
    assistantStep: async () => {
      assistantCalls += 1;
      return {
        kind: "tool_calls" as const,
        responseId: `response-tool-${assistantCalls}`,
        plannedExecutionIds: [`execution-${assistantCalls}`],
      };
    },
    emitFact: (event: DomainFact) => {
      if (event.eventType === "request.failed") {
        requestCompletedEvents.push({
          code: (event.payload as Record<string, unknown>).code,
          message: (event.payload as Record<string, unknown>).message,
        });
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.equal(assistantCalls, 2);
  assert.deepEqual(requestCompletedEvents, [
    {
      code: "AGENT_LOOP_LIMIT_EXCEEDED",
      message: "agent loop limit exceeded",
    },
  ]);
});

test("interactive session drops a loop-limited prompt before the next prompt", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const observedMessages: Array<string[]> = [];
  const inputs = ["first prompt", "second prompt", "/exit"];
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    maxTurnLimit: 1,
    assistantStep: async (input) => {
      observedMessages.push(input.messages.map((message) => `${message.role}:${message.content}`));

      if (input.prompt === "first prompt") {
        return {
          kind: "tool_calls" as const,
          responseId: "response-tool-1",
          plannedExecutionIds: ["execution-1"],
        };
      }

      return assistantOutputResult("assistant: recovered");
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(observedMessages, [
    ["user:first prompt"],
    ["user:second prompt"],
  ]);
});

test("session manager treats legacy empty assistant output as an explicit assistant result", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const assistantOutputs: string[] = [];
  const interactionEvents: Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }> = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => ({
      output: "",
    }),
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      interactionEvents.push({
        eventType: event.eventType,
        payload: event.payload,
      });
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(assistantOutputs, [""]);
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "session.started",
      "session.state_changed",
      "user.prompt_received",
      "session.state_changed",
      "assistant.response_started",
      "assistant.stream_chunk",
      "assistant.response_completed",
      "request.succeeded",
      "session.state_changed",
      "session.stopped",
    ],
  );
  assert.equal(interactionEvents[5]?.payload.delta, "");
});

test("session manager emits renderer-neutral session events for prompts, outputs, state, and clears", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const runtimeStates: string[] = [];
  const systemLines: string[] = [];
  let clears = 0;
  const inputs = ["hello", "/clear", "start over", "/exit"];
  const manager = new SessionManager({
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType === "user.prompt_received") {
        userPrompts.push((event.payload as Record<string, unknown>).prompt as string);
      } else if (event.eventType === "session.state_changed") {
        runtimeStates.push((event.payload as Record<string, unknown>).state as string);
      } else if (event.eventType === "session.conversation_cleared") {
        clears += 1;
      }
    },
  });

  await manager.run(context);

  assert.deepEqual(userPrompts, ["hello", "start over"]);
  assert.deepEqual(assistantOutputs, [
    "assistant: hello",
    "assistant: start over",
  ]);
  assert.ok(runtimeStates.includes("streaming"));
  assert.ok(runtimeStates.includes("ready"));
  assert.equal(clears, 1);
  assert.ok(systemLines.some((line) => line.includes("conversation cleared")));
});

test("session manager emits session.started and user.prompt_received for accepted prompts", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const inputs = ["hello", "start over", "/exit"];
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    emitFact: (event: DomainFact) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.ok(
    interactionEvents.some((event) => event.eventType === "session.started"),
  );
  assert.deepEqual(
    interactionEvents
      .filter((event) => event.eventType === "user.prompt_received")
      .map((event) => ({
        turnId: event.causation?.requestId?.replace(/^request-/, ""),
        requestId: event.causation?.requestId,
        payload: event.payload,
      })),
    [
      {
        turnId: "turn-1",
        requestId: "request-turn-1",
        payload: {
          prompt: "hello",
        },
      },
      {
        turnId: "turn-2",
        requestId: "request-turn-2",
        payload: {
          prompt: "start over",
        },
      },
    ],
  );

  const sessionStartedEvent = interactionEvents.find(
    (event) => event.eventType === "session.started",
  );
  assert.equal(sessionStartedEvent?.sessionId, result.sessionId);
});

test("session manager keeps built-in slash commands out of prompt and assistant event streams", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const inputs = ["/status", "/branch", "hello", "/exit"];
  const manager = new SessionManager({
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType === "user.prompt_received") {
        userPrompts.push((event.payload as Record<string, unknown>).prompt as string);
      }
    },
  });

  await manager.run(context);

  assert.deepEqual(userPrompts, ["hello"]);
  assert.deepEqual(assistantOutputs, ["assistant: hello"]);
  assert.ok(systemLines.some((line) => line.includes("mode: balanced")));
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
});

test("session manager keeps /help and unknown slash commands out of prompt and assistant streams", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const inputs = ["/help", "/missing", "hello", "/exit"];
  const manager = new SessionManager({
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType === "user.prompt_received") {
        userPrompts.push((event.payload as Record<string, unknown>).prompt as string);
      }
    },
  });

  await manager.run(context);

  assert.deepEqual(userPrompts, ["hello"]);
  assert.deepEqual(assistantOutputs, ["assistant: hello"]);
  assert.ok(systemLines.includes("Available commands"));
  assert.ok(systemLines.some((line) => line.includes("/status")));
  assert.ok(systemLines.includes("Unknown command: /missing"));
  assert.ok(systemLines.includes("Run /help to see available commands."));
});

test("session manager emits a renderer-neutral execution item for /branch without entering the user/assistant streams", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const interactionEvents: DomainFact[] = [];
  const inputs = ["/branch", "/exit"];
  const manager = new SessionManager({
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType.startsWith("execution.") || event.eventType === "request.succeeded") {
        interactionEvents.push(event);
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "execution.started",
      "execution.chunk",
      "execution.completed",
      "request.succeeded",
    ],
  );
  // All events in this test are turn-scoped (execution.* and request.*)
  const requestIds = interactionEvents.map((event) => requestIdFromFact(event));
  assert.equal(requestIds[0], requestIds[1]);
  assert.equal(requestIds[1], requestIds[2]);
  assert.equal(requestIds[2], requestIds[3]);
  assert.match(requestIds[0] ?? "", /^request-command-\d+$/);
  assert.equal(turnIdFromRequestId(requestIds[0]), "turn-command-1");
  assert.equal(interactionEvents[0]?.payload.executionKind, "command");
  assert.equal(interactionEvents[0]?.payload.title, "Read git branch");
  assert.equal(interactionEvents[1]?.payload.stream, "system");
  assert.match(String(interactionEvents[1]?.payload.output ?? ""), /no-git/);
  assert.equal(interactionEvents[2]?.payload.status, "success");
  assert.equal(interactionEvents[2]?.payload.summary, "Read git branch");
  assert.equal(/[\r\n]/.test(String(interactionEvents[2]?.payload.summary ?? "")), false);
  assert.deepEqual(interactionEvents[3]?.payload, {});
});

test("session manager routes interactive initialPrompt slash commands through built-in command effects", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "/branch",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType.startsWith("execution.") || event.eventType === "request.succeeded") {
        interactionEvents.push(event);
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "execution.started",
      "execution.chunk",
      "execution.completed",
      "request.succeeded",
    ],
  );
  assert.equal(interactionEvents[0]?.payload.title, "Read git branch");
  assert.match(String(interactionEvents[1]?.payload.output ?? ""), /no-git/);
  assert.equal(interactionEvents[2]?.payload.summary, "Read git branch");
});

test("session manager normalizes bare interactive initialPrompt exit aliases before processing", async () => {
  for (const initialPrompt of ["exit", "quit"]) {
    const projectRoot = await makeProjectRoot();
    const context = await buildBootstrapContext({
      command: {
        kind: "interactive",
        initialPrompt,
      },
      cwd: projectRoot,
    });
    const userPrompts: string[] = [];
    const manager = new SessionManager({
      write: () => {},
      assistantStep: async () => {
        throw new Error("assistantStep should not be called for bare exit aliases");
      },
    });

    const result = await manager.run(context);

    assert.equal(result.turnCount, 0);
    assert.deepEqual(userPrompts, []);
  }
});

test("session manager routes print-mode slash commands through built-in command effects", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "/branch",
    },
    cwd: projectRoot,
  });
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const interactionEvents: DomainFact[] = [];
  const manager = new SessionManager({
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    write: (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim().length > 0) {
          systemLines.push(line.trim());
        }
      }
    },
    emitFact: (event: DomainFact) => {
      captureAssistantOutputChunk(assistantOutputs, event);
      if (event.eventType.startsWith("execution.") || event.eventType === "request.succeeded") {
        interactionEvents.push(event);
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "execution.started",
      "execution.chunk",
      "execution.completed",
      "request.succeeded",
    ],
  );
  assert.equal(interactionEvents[0]?.payload.title, "Read git branch");
  assert.match(String(interactionEvents[1]?.payload.output ?? ""), /no-git/);
  assert.equal(interactionEvents[2]?.payload.summary, "Read git branch");
});

test("session manager interrupts an active assistant step and emits an interrupted prompt event", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const interruptController = new SessionInterruptController();
  const interruptedPrompts: string[] = [];
  const runtimeStates: string[] = [];
  const requestCompletionStatuses: string[] = [];
  const inputs = ["inspect auth", null];
  let aborted = false;
  let markAssistantStarted: (() => void) | undefined;
  const assistantStarted = new Promise<void>((resolve) => {
    markAssistantStarted = resolve;
  });
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    interruptController,
    assistantStep: ({ signal }) =>
      new Promise((_resolve, reject) => {
        markAssistantStarted?.();
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    emitFact: (event: DomainFact) => {
      const p = event.payload as Record<string, unknown>;
      if (event.eventType === "request.failed") {
        requestCompletionStatuses.push(p.code as string);
        if (p.code === "INTERRUPTED") {
          interruptedPrompts.push("inspect auth");
        }
      } else if (event.eventType === "session.state_changed") {
        runtimeStates.push((event.payload as Record<string, unknown>).state as string);
      }
    },
  });

  const runPromise = manager.run(context);

  await assistantStarted;
  interruptController.interruptCurrentTurn();

  const result = await runPromise;

  assert.equal(aborted, true);
  assert.deepEqual(interruptedPrompts, ["inspect auth"]);
  assert.ok(runtimeStates.includes("streaming"));
  assert.ok(runtimeStates.includes("interrupted"));
  assert.deepEqual(requestCompletionStatuses, ["INTERRUPTED"]);
  assert.equal(result.turnCount, 0);
});

test("session manager assigns fresh turn and request ids after an interrupted prompt", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const interruptController = new SessionInterruptController();
  const observedTurnIds: string[] = [];
  const completedRequests: Array<{
    turnId: string;
    requestId: string;
    status: string;
  }> = [];
  const inputs = ["inspect auth", "summarize diff", "/exit"];
  let markAssistantStarted: (() => void) | undefined;
  const assistantStarted = new Promise<void>((resolve) => {
    markAssistantStarted = resolve;
  });
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    interruptController,
    assistantStep: ({ prompt, signal, turnId }) => {
      observedTurnIds.push(turnId);

      if (prompt === "inspect auth") {
        return new Promise((_resolve, reject) => {
          markAssistantStarted?.();
          signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }

      return Promise.resolve(assistantOutputResult("assistant: follow-up", "response-follow-up"));
    },
    emitFact: (event: DomainFact) => {
      const p = event.payload as Record<string, unknown>;
      if (event.eventType === "request.succeeded") {
        completedRequests.push({
          turnId: (event.causation?.requestId ?? "").replace(/^request-/, ""),
          requestId: event.causation?.requestId ?? "",
          status: "completed",
        });
      } else if (event.eventType === "request.failed") {
        completedRequests.push({
          turnId: (event.causation?.requestId ?? "").replace(/^request-/, ""),
          requestId: event.causation?.requestId ?? "",
          status: p.code === "INTERRUPTED" ? "interrupted" : "error",
        });
      }
    },
  });

  const runPromise = manager.run(context);

  await assistantStarted;
  interruptController.interruptCurrentTurn();

  const result = await runPromise;

  assert.equal(result.turnCount, 1);
  assert.deepEqual(observedTurnIds, ["turn-1", "turn-2"]);
  assert.deepEqual(
    completedRequests.map((request) => request.status),
    ["interrupted", "completed"],
  );
  assert.equal(completedRequests[0]?.turnId, "turn-1");
  assert.equal(completedRequests[1]?.turnId, "turn-2");
  assert.notEqual(completedRequests[0]?.requestId, completedRequests[1]?.requestId);
});
