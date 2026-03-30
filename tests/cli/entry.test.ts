import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { runCli } from "../../src/cli/entry.ts";
import { SESSION_ENV_RELATIVE_PATH } from "../../src/cli/session-env.ts";
import { currentAppPath } from "../../src/core/brand.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-cli-"));
  await mkdir(join(root, currentAppPath("docs")), { recursive: true });
  return root;
}

async function makeHomeDirWithSessionEnv(contents: string): Promise<string> {
  const homeDir = await mkdtemp(join(tmpdir(), "expecto-home-"));
  await mkdir(join(homeDir, currentAppPath()), { recursive: true });
  await writeFile(join(homeDir, SESSION_ENV_RELATIVE_PATH), contents);
  return homeDir;
}

async function makeEmptyHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "expecto-home-empty-"));
}

function makeUnreadableStdinStream(): Readable {
  return new Readable({
    read() {
      throw new Error("stdin should not be consumed");
    },
  });
}

test("expecto with a positional prompt routes to one-shot native execution", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";
  let observedEntryKind = "";
  let observedPrompt = "";
  let stderr = "";

  await runCli(["fix auth regression"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    writeStderr: (chunk) => {
      stderr += chunk;
    },
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
      observedEntryKind = input.context.entry.kind;
      if (input.context.entry.kind === "print") {
        observedPrompt = input.context.entry.prompt;
      }
    },
  });

  assert.equal(observedRouteKind, "stream_single");
  assert.equal(observedEntryKind, "print");
  assert.equal(observedPrompt, "fix auth regression");
  assert.equal(stderr, "");
});

test("expecto -p routes to one-shot native execution and emits a deprecation warning on stderr", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";
  let observedEntryKind = "";
  let observedPrompt = "";
  let stderr = "";

  await runCli(["-p", "summarize the plan"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    writeStderr: (chunk) => {
      stderr += chunk;
    },
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
      observedEntryKind = input.context.entry.kind;
      if (input.context.entry.kind === "print") {
        observedPrompt = input.context.entry.prompt;
      }
    },
  });

  assert.equal(observedRouteKind, "stream_single");
  assert.equal(observedEntryKind, "print");
  assert.equal(observedPrompt, "summarize the plan");
  assert.match(stderr, /-p\/--print alias is deprecated/i);
});

test("expecto with no args uses the sticky main-screen TUI runner only in full TTY sessions", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let nativeRuns = 0;
  let observedEntryKind = "";
  let observedRenderer = "";

  await runCli([], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async (input) => {
      interactiveRuns += 1;
      observedEntryKind = input.context.entry.kind;
      observedRenderer = input.tuiRenderer;
    },
    runNativeSession: async () => {
      nativeRuns += 1;
    },
  });

  assert.equal(interactiveRuns, 1);
  assert.equal(nativeRuns, 0);
  assert.equal(observedEntryKind, "interactive");
  assert.equal(observedRenderer, "terminal");
});

test("expecto with a positional prompt does not use fullscreen TUI even in full TTY sessions", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let nativeRuns = 0;
  let observedKind = "";
  let observedPrompt = "";

  await runCli(["fix auth regression"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async (input) => {
      interactiveRuns += 1;
      observedKind = input.context.entry.kind;
    },
    runNativeSession: async (input) => {
      nativeRuns += 1;
      observedKind = input.context.entry.kind;
      observedPrompt = input.context.entry.kind === "print" ? input.context.entry.prompt : "";
    },
  });

  assert.equal(interactiveRuns, 0);
  assert.equal(nativeRuns, 1);
  assert.equal(observedKind, "print");
  assert.equal(observedPrompt, "fix auth regression");
});

test("expecto --tui uses the fullscreen TUI runner in full TTY sessions", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let observedKind = "";
  let observedRenderer = "";

  await runCli(["--tui"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async (input) => {
      interactiveRuns += 1;
      observedKind = input.context.entry.kind;
      observedRenderer = input.tuiRenderer;
    },
  });

  assert.equal(interactiveRuns, 1);
  assert.equal(observedKind, "interactive");
  assert.equal(observedRenderer, "terminal");
});

test("expecto --native with no prompt uses the native REPL route in full TTY sessions", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let nativeRuns = 0;
  let observedRouteKind = "";
  let observedEntryKind = "";

  await runCli(["--native"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async () => {
      interactiveRuns += 1;
    },
    runNativeSession: async (input) => {
      nativeRuns += 1;
      observedRouteKind = input.route.kind;
      observedEntryKind = input.context.entry.kind;
    },
  });

  assert.equal(interactiveRuns, 0);
  assert.equal(nativeRuns, 1);
  assert.equal(observedRouteKind, "native_repl");
  assert.equal(observedEntryKind, "interactive");
});

test("expecto with no prompt fails fast when stdout is redirected but stdin stays interactive", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let interactiveRuns = 0;
  let nativeRuns = 0;

  await assert.rejects(
    runCli([], {
      cwd: projectRoot,
      env: {},
      processEnv: {},
      homeDir,
      stdinIsTTY: true,
      stdoutIsTTY: false,
      runInteractiveTui: async () => {
        interactiveRuns += 1;
      },
      runNativeSession: async () => {
        nativeRuns += 1;
      },
    }),
    /non-TTY environment/i,
  );

  assert.equal(interactiveRuns, 0);
  assert.equal(nativeRuns, 0);
});

test("expecto assembles a stdin-only prompt when stdin is non-TTY and no prompt is provided", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedPrompt = "";

  await runCli([], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: false,
    stdoutIsTTY: false,
    stdinStream: Readable.from(["hello from stdin"]),
    runNativeSession: async (input) => {
      if (input.context.entry.kind === "print") {
        observedPrompt = input.context.entry.prompt;
      }
    },
  });

  assert.match(observedPrompt, /Please analyze the following input/i);
  assert.match(observedPrompt, /\[Input\]\nhello from stdin/);
});

test("expecto preserves explicit empty prompt vs undefined when assembling stdin pipeline prompts", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedPrompt = "";

  await runCli([""], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: false,
    stdoutIsTTY: false,
    stdinStream: Readable.from(["extra context"]),
    runNativeSession: async (input) => {
      if (input.context.entry.kind === "print") {
        observedPrompt = input.context.entry.prompt;
      }
    },
  });

  assert.match(observedPrompt, /\[User Instruction\]/);
  assert.match(observedPrompt, /\[Additional Context\]\nextra context/);
  assert.doesNotMatch(observedPrompt, /Please analyze the following input/i);
});

test("expecto --continue preserves legacy routing without consuming piped stdin", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";

  await runCli(["--continue"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: false,
    stdoutIsTTY: false,
    stdinStream: makeUnreadableStdinStream(),
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
    },
  });

  assert.equal(observedRouteKind, "continue");
});

test("expecto --resume preserves legacy routing without consuming piped stdin", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";
  let observedSession = "";

  await runCli(["--resume", "session-123"], {
    cwd: projectRoot,
    env: {},
    processEnv: {},
    homeDir,
    stdinIsTTY: false,
    stdoutIsTTY: false,
    stdinStream: makeUnreadableStdinStream(),
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
      if (input.route.kind === "resume") {
        observedSession = input.route.bootstrapCommand.session;
      }
    },
  });

  assert.equal(observedRouteKind, "resume");
  assert.equal(observedSession, "session-123");
});

test("expecto --continue ignores incomplete provider env on the legacy route", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";

  await runCli(["--continue"], {
    cwd: projectRoot,
    env: {
      EXPECTO_PROVIDER: "openai",
    },
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
    },
  });

  assert.equal(observedRouteKind, "continue");
});

test("expecto --resume ignores incomplete provider env on the legacy route", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeEmptyHomeDir();
  let observedRouteKind = "";

  await runCli(["--resume", "session-123"], {
    cwd: projectRoot,
    env: {
      EXPECTO_PROVIDER: "openai",
    },
    processEnv: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runNativeSession: async (input) => {
      observedRouteKind = input.route.kind;
    },
  });

  assert.equal(observedRouteKind, "resume");
});

test("expecto with a positional prompt uses a configured provider runner from environment variables", async () => {
  const projectRoot = await makeProjectRoot();
  let output = "";

  await runCli(["say hello"], {
    cwd: projectRoot,
    env: {
      EXPECTO_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_MODEL: "gpt-5",
      OPENAI_BASE_URL: "https://api.openai.test/v1",
    },
    processEnv: {},
    homeDir: await makeEmptyHomeDir(),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    writeStderr: () => {},
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

test("expecto with a positional prompt loads provider config from ~/.expecto-cli/session.env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
EXPECTO_PROVIDER=anthropic
EXPECTO_API_KEY=file-anthropic-token
EXPECTO_BASE_URL=https://code.newcli.com/claude/ultra
EXPECTO_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["say hello"], {
    cwd: projectRoot,
    env: {},
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: false,
    writeStderr: () => {},
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

test("expecto with a positional prompt lets explicit env vars override ~/.expecto-cli/session.env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
EXPECTO_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=file-anthropic-token
ANTHROPIC_BASE_URL=https://file-gateway.example.com/claude
ANTHROPIC_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["say hello"], {
    cwd: projectRoot,
    env: {
      ANTHROPIC_BASE_URL: "https://override-gateway.example.com/claude",
    },
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: false,
    writeStderr: () => {},
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

test("expecto with a positional prompt treats ~/.expecto-cli/session.env as authoritative over ambient provider env", async () => {
  const projectRoot = await makeProjectRoot();
  const homeDir = await makeHomeDirWithSessionEnv(`
ANTHROPIC_AUTH_TOKEN=file-anthropic-token
ANTHROPIC_BASE_URL=https://code.newcli.com/claude/ultra
ANTHROPIC_MODEL=claude-sonnet-4-20250514
`);
  let output = "";
  let observedUrl = "";

  await runCli(["say hello"], {
    cwd: projectRoot,
    env: {},
    processEnv: {
      NEO_KEY: "ambient-neo-key",
    },
    homeDir,
    stdinIsTTY: true,
    stdoutIsTTY: false,
    writeStderr: () => {},
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
