import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/cli/entry.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-cli-renderer-"));
  await mkdir(join(root, ".beta-agent", "docs"), { recursive: true });
  return root;
}

async function makeEmptyHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "beta-agent-home-empty-"));
}

test("runCli forwards terminal renderer selection to the interactive runner", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRenderer = "";

  await runCli(["inspect auth"], {
    cwd: projectRoot,
    env: {
      BETA_TUI_RENDERER: "terminal",
    },
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    runInteractiveTui: async (input) => {
      observedRenderer = input.tuiRenderer;
    },
  });

  assert.equal(observedRenderer, "terminal");
});
