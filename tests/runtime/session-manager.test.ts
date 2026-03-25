import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import { EventLogStore } from "../../src/runtime/event-log-store.ts";
import { SessionManager } from "../../src/runtime/session-manager.ts";
import { SessionInterruptController } from "../../src/runtime/session-interrupt.ts";
import { SessionSnapshotStore } from "../../src/runtime/session-snapshot-store.ts";
import { createProviderRunner } from "../../src/providers/provider-runner.ts";
import { ProviderRegistry } from "../../src/providers/provider-registry.ts";
import { ProviderRouter } from "../../src/providers/provider-router.ts";
import { createStaticProvider } from "../../src/providers/static-provider.ts";

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

      return {
        output: "assistant: bootstrap placeholder",
      };
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
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
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
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
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
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 0);
  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.some((line) => line.includes("branch: no-git")));
  assert.deepEqual(executionItems, [
    {
      summary: "Read git branch",
      body: "$ git rev-parse --abbrev-ref HEAD\nno-git",
    },
  ]);
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
  assert.deepEqual(executionItems, [
    {
      summary: "Read git branch",
      body: "$ git rev-parse --abbrev-ref HEAD\nno-git",
    },
  ]);
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
  assert.deepEqual(executionItems, [
    {
      summary: "Read git branch",
      body: "$ git rev-parse --abbrev-ref HEAD\nno-git",
    },
  ]);
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
  });

  const runPromise = manager.run(context);

  await assistantStarted;
  interruptController.interruptCurrentTurn();

  const result = await runPromise;

  assert.equal(aborted, true);
  assert.deepEqual(interruptedPrompts, ["inspect auth"]);
  assert.ok(runtimeStates.includes("streaming"));
  assert.ok(runtimeStates.includes("interrupted"));
  assert.equal(result.turnCount, 0);
});
