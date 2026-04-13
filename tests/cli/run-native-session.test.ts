import test from "node:test";
import assert from "node:assert/strict";

import type { CliRoute } from "../../src/cli/route-resolution.ts";
import type { BootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import type { InteractionEvent } from "../../src/contracts/interaction-event-schema.ts";
import type { SessionManagerOptions } from "../../src/runtime/session-manager.ts";
import { runNativeSession } from "../../src/cli/run-native-session.ts";

function makeContext(entry: BootstrapContext["entry"]): BootstrapContext {
  return {
    projectRoot: "/tmp/project",
    mode: "balanced",
    entry,
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
    degradedArtifactIds: [],
    sessionSummary: "",
  };
}

test("runNativeSession enters line-based REPL only for native_repl routes", async () => {
  const interactiveCalls: string[] = [];
  let observedOptions: SessionManagerOptions | undefined;

  const createSessionManager = (options: SessionManagerOptions) => {
    observedOptions = options;
    return {
      run: async () => ({
        sessionId: "session-1",
        state: "ready",
        turnCount: 0,
      }),
    };
  };

  const createInteractiveInput = () => {
    interactiveCalls.push("called");
    return {
      readLine: async () => null,
      close: () => {},
    };
  };

  const streamRoute: CliRoute = {
    kind: "stream_single",
    bootstrapCommand: { kind: "print", prompt: "hello" },
    warnings: [],
  };
  await runNativeSession({
    context: makeContext({ kind: "print", prompt: "hello" }),
    route: streamRoute,
    createSessionManager,
    createInteractiveInput,
  });

  assert.equal(interactiveCalls.length, 0);
  assert.equal(observedOptions?.readLine, undefined);
  assert.equal(observedOptions?.closeInput, undefined);

  const replRoute: CliRoute = {
    kind: "native_repl",
    bootstrapCommand: { kind: "interactive" },
    warnings: [],
  };
  await runNativeSession({
    context: makeContext({ kind: "interactive" }),
    route: replRoute,
    createSessionManager,
    createInteractiveInput,
  });

  assert.equal(interactiveCalls.length, 1);
  assert.equal(typeof observedOptions?.readLine, "function");
  assert.equal(typeof observedOptions?.closeInput, "function");
});

test("runNativeSession creates interactive input for resume routes", async () => {
  const interactiveCalls: string[] = [];
  let observedOptions: SessionManagerOptions | undefined;

  const createSessionManager = (options: SessionManagerOptions) => {
    observedOptions = options;
    return {
      run: async () => ({
        sessionId: "session-resume",
        state: "ready",
        turnCount: 0,
      }),
    };
  };

  const createInteractiveInput = () => {
    interactiveCalls.push("called");
    return {
      readLine: async () => null,
      close: () => {},
    };
  };

  const resumeRoute: CliRoute = {
    kind: "resume",
    bootstrapCommand: { kind: "resume" },
    warnings: [],
  };
  await runNativeSession({
    context: {
      ...makeContext({ kind: "resume" }),
      resumeTarget: {
        snapshot: {
          id: "snapshot-1",
          sessionId: "session-resume",
          state: "executing",
          activeArtifacts: { required: [], optional: [], onDemand: [] },
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
        summary: "session: session-resume",
      },
    },
    route: resumeRoute,
    createSessionManager,
    createInteractiveInput,
  });

  assert.equal(interactiveCalls.length, 1, "interactive input should be created for resume route");
  assert.equal(typeof observedOptions?.readLine, "function", "readLine should be passed to session manager");
  assert.equal(typeof observedOptions?.closeInput, "function", "closeInput should be passed to session manager");
});

test("runNativeSession surfaces presenter output from system and interaction events", async () => {
  let stdout = "";
  let stderr = "";

  const createSessionManager = (options: SessionManagerOptions) => ({
    run: async () => {
      const baseEvent = {
        timestamp: "2024-01-01T00:00:00.000Z",
        sessionId: "session-2",
        turnId: "turn-1",
        requestId: "request-1",
      } as const;

      options.write?.("legacy direct write");
      options.onSystemLine?.("system line");
      options.onInteractionEvent?.({
        ...baseEvent,
        eventType: "assistant_stream_chunk",
        payload: {
          responseId: "response-1",
          channel: "output_text",
          format: "markdown",
          delta: "hello",
        },
      } satisfies InteractionEvent);
      options.onInteractionEvent?.({
        ...baseEvent,
        eventType: "execution_item_chunk",
        payload: {
          executionId: "exec-1",
          stream: "stderr",
          output: "oops",
        },
      } satisfies InteractionEvent);

      return {
        sessionId: "session-2",
        state: "ready",
        turnCount: 1,
      };
    },
  });

  const route: CliRoute = {
    kind: "stream_single",
    bootstrapCommand: { kind: "print", prompt: "hello" },
    warnings: [],
  };

  await runNativeSession({
    context: makeContext({ kind: "print", prompt: "hello" }),
    route,
    createSessionManager,
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  assert.equal(stdout, "system line\nhello");
  assert.equal(stderr, "oops");
});

test("runNativeSession rejects stream routes when the request completes with an error", async () => {
  let stderr = "";

  const createSessionManager = (options: SessionManagerOptions) => ({
    run: async () => {
      options.onInteractionEvent?.({
        timestamp: "2024-01-01T00:00:00.000Z",
        sessionId: "session-3",
        turnId: "turn-1",
        requestId: "request-1",
        eventType: "request_completed",
        payload: {
          status: "error",
          errorCode: "AGENT_LOOP_LIMIT_EXCEEDED",
        },
      } satisfies InteractionEvent);

      return {
        sessionId: "session-3",
        state: "ready",
        turnCount: 0,
      };
    },
  });

  const route: CliRoute = {
    kind: "stream_single",
    bootstrapCommand: { kind: "print", prompt: "hello" },
    warnings: [],
  };

  await assert.rejects(
    runNativeSession({
      context: makeContext({ kind: "print", prompt: "hello" }),
      route,
      createSessionManager,
      writeStderr: (chunk) => {
        stderr += chunk;
      },
    }),
    /AGENT_LOOP_LIMIT_EXCEEDED/,
  );

  assert.match(stderr, /AGENT_LOOP_LIMIT_EXCEEDED/);
});
