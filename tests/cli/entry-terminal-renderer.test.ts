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

test("runCli defaults to the sticky terminal renderer for fullscreen TTY sessions", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRenderer = "";
  const shutdownController = new AbortController();
  let observedShutdownSignal: AbortSignal | undefined;

  await runCli(["--tui"], {
    cwd: projectRoot,
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    shutdownSignal: shutdownController.signal,
    runInteractiveTui: async (input) => {
      observedRenderer = input.tuiRenderer;
      observedShutdownSignal = input.shutdownSignal;
    },
  });

  assert.equal(observedRenderer, "terminal");
  assert.equal(observedShutdownSignal, shutdownController.signal);
});

test("BETA_TUI_RENDERER=terminal stays warning-only after the terminal renderer becomes default", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv("BETA_TUI_RENDERER=blessed\n");
  let observedRenderer = "";
  let stderr = "";

  await runCli(["--tui"], {
    cwd: projectRoot,
    processEnv: {
      BETA_TUI_RENDERER: "terminal",
    },
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    writeStderr: (chunk) => {
      stderr += chunk;
    },
    runInteractiveTui: async (input) => {
      observedRenderer = input.tuiRenderer;
    },
  });

  assert.equal(observedRenderer, "terminal");
  assert.match(stderr, /BETA_TUI_RENDERER=terminal is deprecated/i);
});
