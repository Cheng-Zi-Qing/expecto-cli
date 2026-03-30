import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import { SessionManager } from "../../src/runtime/session-manager.ts";

function assistantOutputResult(output: string, responseId = "response-1") {
  return {
    kind: "output" as const,
    responseId,
    output,
    finishReason: "stop" as const,
  };
}

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-interactive-"));
  await mkdir(join(root, currentAppPath("docs")), { recursive: true });
  await writeFile(join(root, currentAppPath("docs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(root, currentAppPath("docs", "01-plan.md")), "# Plan\n");
  return root;
}

test("interactive session processes multiple turns and preserves conversation history", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const observedMessages: Array<string[]> = [];
  let output = "";
  const inputs = ["hello", "what did I just say?", "/exit"];
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => {
      observedMessages.push(input.messages.map((message) => `${message.role}:${message.content}`));

      if (input.prompt === "hello") {
        return assistantOutputResult("assistant: hi there");
      }

      return assistantOutputResult("assistant: you said hello");
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 2);
  assert.deepEqual(observedMessages, [
    ["user:hello"],
    ["user:hello", "assistant:assistant: hi there", "user:what did I just say?"],
  ]);
  assert.match(output, /assistant: hi there/);
  assert.match(output, /assistant: you said hello/);
});

test("interactive session clears conversation history on /clear and stops on /exit", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const observedMessages: Array<string[]> = [];
  let output = "";
  const inputs = ["hello", "/clear", "start over", "/exit"];
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => {
      observedMessages.push(input.messages.map((message) => `${message.role}:${message.content}`));

      return assistantOutputResult(`assistant: ${input.prompt}`);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 2);
  assert.deepEqual(observedMessages, [
    ["user:hello"],
    ["user:start over"],
  ]);
  assert.match(output, /conversation cleared/);
});

test("interactive session treats bare exit as an interactive alias instead of a prompt", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const observedPrompts: string[] = [];
  let output = "";
  const inputs = ["hello", "exit"];
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => {
      observedPrompts.push(input.prompt ?? "");
      return assistantOutputResult(`assistant: ${input.prompt}`);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(observedPrompts, ["hello"]);
  assert.doesNotMatch(output, /assistant: exit/);
});

test("interactive session executes slash commands locally without sending them to the assistant", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const observedMessages: Array<string[]> = [];
  let output = "";
  const inputs = ["/help", "/status", "/missing", "/branch", "hello", "/exit"];
  const manager = new SessionManager({
    write: (chunk) => {
      output += chunk;
    },
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async (input) => {
      observedMessages.push(input.messages.map((message) => `${message.role}:${message.content}`));

      return assistantOutputResult(`assistant: ${input.prompt}`);
    },
  });

  const result = await manager.run(context);

  assert.equal(result.turnCount, 1);
  assert.deepEqual(observedMessages, [["user:hello"]]);
  assert.match(output, /Available commands/);
  assert.match(output, /\/status/);
  assert.match(output, /Unknown command: \/missing/);
  assert.match(output, /Run \/help to see available commands\./);
  assert.match(output, /mode: balanced/);
  assert.match(output, /branch: no-git/);
});
