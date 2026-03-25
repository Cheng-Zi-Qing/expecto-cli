import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/cli/entry.ts";
import { SESSION_ENV_RELATIVE_PATH } from "../../src/cli/session-env.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-cli-renderer-"));
  await mkdir(join(root, ".beta-agent", "docs"), { recursive: true });
  return root;
}

async function makeEmptyHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "beta-agent-home-empty-"));
}

async function makeHomeDirWithSessionEnv(contents: string): Promise<string> {
  const homeDir = await mkdtemp(join(tmpdir(), "beta-agent-home-session-"));
  const sessionEnvPath = join(homeDir, SESSION_ENV_RELATIVE_PATH);
  await mkdir(join(homeDir, ".beta-agent"), { recursive: true });
  await writeFile(sessionEnvPath, contents, "utf8");
  return homeDir;
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

test("runCli lets shell renderer env override session env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv("BETA_TUI_RENDERER=blessed\n");
  let observedRenderer = "";

  await runCli(["inspect auth"], {
    cwd: projectRoot,
    processEnv: {
      BETA_TUI_RENDERER: "terminal",
    },
    homeDir,
    stdinIsTTY: true,
    runInteractiveTui: async (input) => {
      observedRenderer = input.tuiRenderer;
    },
  });

  assert.equal(observedRenderer, "terminal");
});
