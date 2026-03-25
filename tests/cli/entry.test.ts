import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../../src/cli/entry.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-cli-"));
  await mkdir(join(root, ".beta-agent", "docs"), { recursive: true });
  return root;
}

async function makeHomeDirWithSessionEnv(contents: string): Promise<string> {
  const homeDir = await mkdtemp(join(tmpdir(), "beta-agent-home-"));
  await mkdir(join(homeDir, ".beta-agent"), { recursive: true });
  await writeFile(join(homeDir, ".beta-agent", "session.env"), contents);
  return homeDir;
}

async function makeEmptyHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "beta-agent-home-empty-"));
}

async function captureCli(argv: string[], cwd: string): Promise<string> {
  let output = "";
  const homeDir = await makeEmptyHomeDir();

  await runCli(argv, {
    cwd,
    env: {},
    processEnv: {},
    homeDir,
    write: (chunk) => {
      output += chunk;
    },
  });

  return output;
}

test("beta with no args starts interactive bootstrap in balanced mode", async () => {
  const projectRoot = await makeProjectRoot();
  const output = await captureCli([], projectRoot);

  assert.match(output, /beta interactive session/);
  assert.match(output, /mode: balanced/);
  assert.match(output, new RegExp(`project: ${projectRoot}`));
});

test("beta with a positional prompt starts interactive bootstrap with the first user message", async () => {
  const projectRoot = await makeProjectRoot();
  const output = await captureCli(["fix auth regression"], projectRoot);

  assert.match(output, /beta interactive session/);
  assert.match(output, /initial prompt: fix auth regression/);
});

test("beta -p runs one-shot bootstrap with the provided prompt", async () => {
  const projectRoot = await makeProjectRoot();
  const output = await captureCli(["-p", "summarize the plan"], projectRoot);

  assert.match(output, /beta one-shot session/);
  assert.match(output, /prompt: summarize the plan/);
  assert.match(output, /mode: balanced/);
});

test("beta with no args uses the fullscreen TUI runner when stdin is a TTY", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let output = "";
  let interactiveRuns = 0;
  let observedEntryKind = "";
  let observedInitialPrompt = "";

  await runCli([], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    runInteractiveTui: async (input) => {
      interactiveRuns += 1;
      observedEntryKind = input.context.entry.kind;
      observedInitialPrompt =
        input.context.entry.kind === "interactive"
          ? input.context.entry.initialPrompt ?? ""
          : "";
    },
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.equal(interactiveRuns, 1);
  assert.equal(observedEntryKind, "interactive");
  assert.equal(observedInitialPrompt, "");
  assert.equal(output, "");
});

test("beta with a positional prompt uses the fullscreen TUI runner when stdin is a TTY", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let observedInitialPrompt = "";

  await runCli(["fix auth regression"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    runInteractiveTui: async (input) => {
      interactiveRuns += 1;
      observedInitialPrompt =
        input.context.entry.kind === "interactive"
          ? input.context.entry.initialPrompt ?? ""
          : "";
    },
  });

  assert.equal(interactiveRuns, 1);
  assert.equal(observedInitialPrompt, "fix auth regression");
});

test("beta -p stays on the plain path even when stdin is a TTY", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let output = "";
  let interactiveRuns = 0;

  await runCli(["-p", "summarize the plan"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    runInteractiveTui: async () => {
      interactiveRuns += 1;
    },
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.equal(interactiveRuns, 0);
  assert.match(output, /beta one-shot session/);
});

test("beta -p uses a configured provider runner from environment variables", async () => {
  const projectRoot = await makeProjectRoot();
  let output = "";

  await runCli(["-p", "say hello"], {
    cwd: projectRoot,
    env: {
      BETA_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "gpt-5",
      OPENAI_BASE_URL: "https://api.openai.test/v1",
    },
    processEnv: {},
    homeDir: await makeEmptyHomeDir(),
    fetch: async () =>
      new Response(
        JSON.stringify({
          model: "gpt-5",
          output_text: "hello from model",
          status: "completed",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.match(output, /hello from model/);
});

test("beta -p loads provider config from ~/.beta-agent/session.env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
BETA_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=file-anthropic-token
ANTHROPIC_BASE_URL=https://code.newcli.com/claude/ultra
ANTHROPIC_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["-p", "say hello"], {
    cwd: projectRoot,
    env: {},
    homeDir,
    fetch: async (url) => {
      observedUrl = String(url);

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "hello from session env",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.equal(observedUrl, "https://code.newcli.com/claude/ultra/v1/messages");
  assert.match(output, /hello from session env/);
});

test("beta -p lets explicit env vars override ~/.beta-agent/session.env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
BETA_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=file-anthropic-token
ANTHROPIC_BASE_URL=https://file-gateway.example.com/claude
ANTHROPIC_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["-p", "say hello"], {
    cwd: projectRoot,
    env: {
      ANTHROPIC_BASE_URL: "https://override-gateway.example.com/claude",
    },
    homeDir,
    fetch: async (url) => {
      observedUrl = String(url);

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "override worked",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.equal(observedUrl, "https://override-gateway.example.com/claude/v1/messages");
  assert.match(output, /override worked/);
});

test("beta -p treats ~/.beta-agent/session.env as authoritative over ambient provider env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
ANTHROPIC_AUTH_TOKEN=file-anthropic-token
ANTHROPIC_BASE_URL=https://code.newcli.com/claude/ultra
ANTHROPIC_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["-p", "say hello"], {
    cwd: projectRoot,
    env: {},
    processEnv: {
      NEO_KEY: "ambient-neo-key",
    },
    homeDir,
    fetch: async (url) => {
      observedUrl = String(url);

      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-20250514",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "session env wins",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    },
    write: (chunk) => {
      output += chunk;
    },
  });

  assert.equal(observedUrl, "https://code.newcli.com/claude/ultra/v1/messages");
  assert.match(output, /session env wins/);
});
