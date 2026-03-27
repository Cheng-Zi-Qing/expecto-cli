import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import {
  interactionEventSchema,
  type InteractionEvent,
} from "../../src/contracts/interaction-event-schema.ts";
import { EventLogStore } from "../../src/runtime/event-log-store.ts";
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

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-session-"));
  await mkdir(join(root, ".beta-agent", "docs"), { recursive: true });
  await writeFile(join(root, ".beta-agent", "docs", "00-requirements.md"), "# Requirements\n");
  await writeFile(join(root, ".beta-agent", "docs", "01-plan.md"), "# Plan\n");
  return root;
}

test("session manager runs an interactive session and persists lifecycle events", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "fix auth regression",
    },
    cwd: projectRoot,
  });
  let output = "";
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
  });

  const result = await manager.run(context);
  const events = await new EventLogStore(projectRoot).list(result.sessionId);

  assert.match(result.sessionId, /^session-/);
  assert.equal(result.state, "idle");
  assert.deepEqual(
    events.map((event) => event.type),
    ["session:start", "turn:start", "turn:end", "session:stop"],
  );
  assert.equal(events[1]?.payload.prompt, "fix auth regression");
  assert.match(output, /beta interactive session/);
  assert.match(output, new RegExp(`session: ${result.sessionId}`));
});

test("session manager runs a one-shot session and records the prompt in turn payload", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  let output = "";
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
  });

  const result = await manager.run(context);
  const events = await new EventLogStore(projectRoot).list(result.sessionId);

  assert.equal(events[1]?.type, "turn:start");
  assert.equal(events[1]?.payload.prompt, "summarize the plan");
  assert.equal(events[2]?.type, "turn:end");
  assert.match(output, /beta one-shot session/);
  assert.match(output, /prompt: summarize the plan/);
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
  assert.equal(snapshot?.activeArtifacts.length, 2);
  assert.match(snapshot?.compactedSummary ?? "", /required docs:/);
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
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => {
      throw new Error("assistant step failed");
    },
  });

  await assert.rejects(manager.run(context), /assistant step failed/);

  const snapshot = await new SessionSnapshotStore(projectRoot).findLatest();

  assert.equal(snapshot?.state, "blocked");

  const events = await new EventLogStore(projectRoot).list(snapshot?.sessionId ?? "");

  assert.deepEqual(
    events.map((event) => event.type),
    ["session:start", "turn:start", "turn:end", "session:stop"],
  );
  assert.equal(events[2]?.payload.state, "blocked");
  assert.equal(events.at(-1)?.type, "session:stop");
  assert.equal(events.at(-1)?.payload.state, "blocked");
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
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    assistantStep: async (input) => {
      observedPrompt = input.prompt ?? "";

      return assistantOutputResult("assistant: bootstrap placeholder");
    },
  });

  const result = await manager.run(context);

  assert.equal(observedPrompt, "summarize the plan");
  assert.match(output, /assistant: bootstrap placeholder/);
  assert.match(output, new RegExp(`session: ${result.sessionId}`));
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

test("session manager emits assistant lifecycle envelopes and request_completed for one-shot results", async () => {
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
    onInteractionEvent: (event) => {
      eventTypes.push(event.eventType);
    },
  });

  await manager.run(context);

  assert.deepEqual(eventTypes, [
    "assistant_response_started",
    "assistant_stream_chunk",
    "assistant_response_completed",
    "request_completed",
  ]);
});

test("session manager normalizes malformed assistant output results before emitting interaction events", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const interactionEvents: InteractionEvent[] = [];
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
    onInteractionEvent: (event) => {
      interactionEvents.push(event);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "assistant_response_started",
      "assistant_stream_chunk",
      "assistant_response_completed",
      "request_completed",
    ],
  );
  const startedPayload = interactionEvents[0]?.payload as
    | { responseId?: unknown }
    | undefined;
  const completedPayload = interactionEvents[2]?.payload as
    | { finishReason?: unknown; usage?: unknown }
    | undefined;
  assert.equal(startedPayload?.responseId, "response-turn-1");
  assert.equal(completedPayload?.finishReason, "stop");
  assert.equal("usage" in (completedPayload ?? {}), false);

  for (const event of interactionEvents) {
    assert.doesNotThrow(() => interactionEventSchema.parse(event));
  }
});

test("session manager rejects malformed assistant tool_calls results before emitting invalid interaction events", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "print",
      prompt: "summarize the plan",
    },
    cwd: projectRoot,
  });
  const interactionEvents: InteractionEvent[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () =>
      ({
        kind: "tool_calls",
        responseId: "",
        plannedExecutionIds: [],
      }) as never,
    onInteractionEvent: (event) => {
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
    ["request_completed"],
  );
  const requestCompletedPayload = interactionEvents[0]?.payload as
    | { status?: unknown; errorCode?: unknown }
    | undefined;
  assert.equal(requestCompletedPayload?.status, "error");
  assert.equal(requestCompletedPayload?.errorCode, "InvalidAssistantStepResult");

  for (const event of interactionEvents) {
    assert.doesNotThrow(() => interactionEventSchema.parse(event));
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
    turnId: string;
    requestId: string;
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
    onInteractionEvent: (event) => {
      events.push({
        eventType: event.eventType,
        turnId: event.turnId,
        requestId: event.requestId,
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
      "assistant_response_started",
      "assistant_response_completed",
      "execution_item_started",
      "execution_item_chunk",
      "execution_item_completed",
      "execution_item_started",
      "execution_item_completed",
      "assistant_response_started",
      "assistant_stream_chunk",
      "assistant_response_completed",
      "request_completed",
    ],
  );

  const requestIds = new Set(events.map((event) => event.requestId));
  assert.equal(requestIds.size, 1);
  assert.equal(events[0]?.requestId, `request-${assistantInputs[0]?.turnId}`);
  assert.equal(events[1]?.payload.finishReason, "tool_calls");
  assert.equal(events[1]?.payload.continuation, "awaiting_execution");
  assert.deepEqual(events[1]?.payload.plannedExecutionIds, ["execution-1", "execution-2"]);
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
    status: unknown;
    errorCode?: unknown;
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
    onInteractionEvent: (event) => {
      if (event.eventType === "request_completed") {
        requestCompletedEvents.push({
          status: event.payload.status,
          ...(event.payload.errorCode ? { errorCode: event.payload.errorCode } : {}),
        });
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.equal(assistantCalls, 2);
  assert.deepEqual(requestCompletedEvents, [
    {
      status: "error",
      errorCode: "AGENT_LOOP_LIMIT_EXCEEDED",
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
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onInteractionEvent: (event) => {
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
      "assistant_response_started",
      "assistant_stream_chunk",
      "assistant_response_completed",
      "request_completed",
    ],
  );
  assert.equal(interactionEvents[1]?.payload.delta, "");
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
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    onUserPrompt: (prompt) => {
      userPrompts.push(prompt);
    },
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onRuntimeStateChange: (state) => {
      runtimeStates.push(state);
    },
    onSystemLine: (line) => {
      systemLines.push(line);
    },
    onConversationCleared: () => {
      clears += 1;
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
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => assistantOutputResult(`assistant: ${input.prompt}`),
    onUserPrompt: (prompt) => {
      userPrompts.push(prompt);
    },
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onSystemLine: (line) => {
      systemLines.push(line);
    },
  });

  await manager.run(context);

  assert.deepEqual(userPrompts, ["hello"]);
  assert.deepEqual(assistantOutputs, ["assistant: hello"]);
  assert.ok(systemLines.some((line) => line.includes("mode: balanced")));
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
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
  const executionItems: Array<{ summary: string; body?: string }> = [];
  const systemLines: string[] = [];
  const interactionEvents: Array<{
    eventType: string;
    turnId: string;
    requestId: string;
    payload: Record<string, unknown>;
  }> = [];
  const inputs = ["/branch", "/exit"];
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    onUserPrompt: (prompt) => {
      userPrompts.push(prompt);
    },
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onSystemLine: (line) => {
      systemLines.push(line);
    },
    // NOTE: this is intentionally not part of the user/assistant streams.
    onExecutionItem: (item) => {
      executionItems.push(item);
    },
    onInteractionEvent: (event) => {
      if (event.eventType.startsWith("execution_item_") || event.eventType === "request_completed") {
        interactionEvents.push(event);
      }
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.equal(executionItems.length, 1);
  assert.equal(executionItems[0]?.summary, "Read git branch");
  assert.match(executionItems[0]?.body ?? "", /no-git/);
  assert.deepEqual(
    interactionEvents.map((event) => event.eventType),
    [
      "execution_item_started",
      "execution_item_chunk",
      "execution_item_completed",
      "request_completed",
    ],
  );
  assert.equal(interactionEvents[0]?.requestId, interactionEvents[1]?.requestId);
  assert.equal(interactionEvents[1]?.requestId, interactionEvents[2]?.requestId);
  assert.equal(interactionEvents[2]?.requestId, interactionEvents[3]?.requestId);
  assert.match(interactionEvents[0]?.requestId ?? "", /^request-command-\d+$/);
  assert.match(interactionEvents[0]?.turnId ?? "", /^turn-command-\d+$/);
  assert.equal(interactionEvents[0]?.payload.executionKind, "command");
  assert.equal(interactionEvents[0]?.payload.title, "Read git branch");
  assert.equal(interactionEvents[1]?.payload.stream, "system");
  assert.match(String(interactionEvents[1]?.payload.output ?? ""), /no-git/);
  assert.equal(interactionEvents[2]?.payload.status, "success");
  assert.equal(interactionEvents[2]?.payload.summary, "Read git branch");
  assert.equal(/[\r\n]/.test(String(interactionEvents[2]?.payload.summary ?? "")), false);
  assert.equal(interactionEvents[3]?.payload.status, "completed");
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
  const executionItems: Array<{ summary: string; body?: string }> = [];
  const systemLines: string[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    onUserPrompt: (prompt) => {
      userPrompts.push(prompt);
    },
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onSystemLine: (line) => {
      systemLines.push(line);
    },
    onExecutionItem: (item) => {
      executionItems.push(item);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.equal(executionItems.length, 1);
  assert.equal(executionItems[0]?.summary, "Read git branch");
  assert.match(executionItems[0]?.body ?? "", /no-git/);
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
  const executionItems: Array<{ summary: string; body?: string }> = [];
  const systemLines: string[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => {
      throw new Error("assistantStep should not be called for built-in slash commands");
    },
    onUserPrompt: (prompt) => {
      userPrompts.push(prompt);
    },
    onAssistantOutput: (output) => {
      assistantOutputs.push(output);
    },
    onSystemLine: (line) => {
      systemLines.push(line);
    },
    onExecutionItem: (item) => {
      executionItems.push(item);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.equal(executionItems.length, 1);
  assert.equal(executionItems[0]?.summary, "Read git branch");
  assert.match(executionItems[0]?.body ?? "", /no-git/);
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
    onPromptInterrupted: (prompt) => {
      interruptedPrompts.push(prompt);
    },
    onRuntimeStateChange: (state) => {
      runtimeStates.push(state);
    },
    onInteractionEvent: (event) => {
      if (event.eventType === "request_completed") {
        requestCompletionStatuses.push(event.payload.status);
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
  assert.deepEqual(requestCompletionStatuses, ["interrupted"]);
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
    onInteractionEvent: (event) => {
      if (event.eventType === "request_completed") {
        completedRequests.push({
          turnId: event.turnId,
          requestId: event.requestId,
          status: event.payload.status,
        });
      }
    },
  });

  const runPromise = manager.run(context);

  await assistantStarted;
  interruptController.interruptCurrentTurn();

  const result = await runPromise;
  const events = await new EventLogStore(projectRoot).list(result.sessionId);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(observedTurnIds, ["turn-1", "turn-2"]);
  assert.deepEqual(
    completedRequests.map((request) => request.status),
    ["interrupted", "completed"],
  );
  assert.equal(completedRequests[0]?.turnId, "turn-1");
  assert.equal(completedRequests[1]?.turnId, "turn-2");
  assert.notEqual(completedRequests[0]?.requestId, completedRequests[1]?.requestId);
  assert.deepEqual(
    events
      .filter((event) => event.type === "turn:start")
      .map((event) => event.payload.turnId),
    ["turn-1", "turn-2"],
  );
});
