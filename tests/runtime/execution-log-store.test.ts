import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionLogStore } from "../../src/runtime/execution-log-store.ts";

test("execution log store appends execution chunks and returns a stable file path", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "beta-agent-exec-log-"));
  const store = createExecutionLogStore({ projectRoot });

  const ensuredPath = await store.ensureExecutionLog("exec:1");
  const firstAppendPath = await store.appendChunk("exec:1", "alpha\n");
  const secondAppendPath = await store.appendChunk("exec:1", "beta\n");

  await store.flush("exec:1");

  const content = await readFile(ensuredPath, "utf8");

  assert.equal(ensuredPath, firstAppendPath);
  assert.equal(firstAppendPath, secondAppendPath);
  assert.match(ensuredPath, /\.beta-agent\/logs\/exec_exec_1\.log$/);
  assert.equal(content, "alpha\nbeta\n");
  assert.equal(await store.resolveLogPath("exec:1"), ensuredPath);
});
