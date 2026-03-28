import assert from "node:assert/strict";
import test from "node:test";

import {
  getThemeDefinition,
  listThemeDefinitions,
} from "../../../src/tui/theme/theme-registry.ts";
import { buildTuiViewModel } from "../../../src/tui/view-model/tui-view-model.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";
import {
  diffTranscriptLines,
  renderTranscript,
  renderTranscriptLines,
  renderThemePickerOverlay,
} from "../../../src/tui/renderer-terminal/transcript-renderer.ts";

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function createSampleTuiState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    sessionId: "session-1",
    focus: "composer",
    timelineMode: "scroll",
    inspectorOpen: false,
    runtimeState: "ready",
    commandMenu: {
      visible: false,
      query: "",
      items: [],
      selectedIndex: 0,
    },
    timeline: [],
    selectedTimelineIndex: 0,
    draft: "",
    inputLocked: false,
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude",
    contextMetrics: {
      percent: 0,
      rules: 0,
      hooks: 0,
      docs: 0,
    },
    ...overrides,
    activeThemeId: overrides.activeThemeId ?? "hufflepuff",
    themePicker: overrides.themePicker ?? null,
    activeRequestLedger: overrides.activeRequestLedger ?? null,
  };
}

function createThemePickerOverlay(selectedThemeId: "hufflepuff" = "hufflepuff") {
  const sampleTheme = getThemeDefinition(selectedThemeId);

  return {
    kind: "theme_picker" as const,
    reason: "first_launch" as const,
    entries: listThemeDefinitions().map((theme) => ({
      id: theme.id,
      displayName: theme.displayName,
      animal: theme.animal,
      paletteLabel: theme.paletteLabel,
      availability: theme.availability,
      selected: theme.id === selectedThemeId,
    })),
    sampleTheme: {
      id: sampleTheme.id,
      displayName: sampleTheme.displayName,
      animal: sampleTheme.animal,
      availability: sampleTheme.availability,
      palette: sampleTheme.palette,
      welcome: sampleTheme.welcome,
      sample: sampleTheme.sample,
    },
  };
}

test("renderTranscript appends visible block lines without mouse-only affordances", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "Found changes",
          body: "Found changes in src/tui and tests.",
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 20 });
  const plainOutput = stripAnsi(output.join("\n"));
  assert.match(plainOutput, /Assistant/);
  assert.match(plainOutput, /^│ Found changes in src\/tui and tests\..*$/m);
  assert.doesNotMatch(plainOutput, /╭ Assistant:/);
  assert.doesNotMatch(plainOutput, /^│ Found changes in src\/tui and tests\..* │$/m);
  assert.doesNotMatch(plainOutput, /\{open\}|wheelup|wheeldown/);
});

test("renderTranscript preserves code indentation in visible lines", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-code-1",
          kind: "assistant",
          summary: "Code sample",
          body: ["```ts", "function f(x: number) {", "    return x;", "}", "```"].join("\n"),
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 120, height: 20 });
  assert.match(stripAnsi(output.join("\n")), / {4}return x;/);
});

test("renderTranscript keeps the selected card visible when the viewport is shorter than the transcript", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "First card",
          body: "first body",
        },
        {
          id: "assistant-2",
          kind: "assistant",
          summary: "Second card",
          body: "second body",
        },
        {
          id: "assistant-3",
          kind: "assistant",
          summary: "Third card",
          body: "third body",
        },
      ],
      selectedTimelineIndex: 0,
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 3 });

  const plainOutput = stripAnsi(output.join("\n"));
  assert.match(plainOutput, /first body/);
  assert.doesNotMatch(plainOutput, /third body/);
});

test("renderTranscript renders the Hufflepuff welcome using the active theme assets", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      activeThemeId: "hufflepuff",
      timeline: [
        {
          id: "welcome-1",
          kind: "welcome",
          summary: "beta is ready",
          body: "Enter send\n/help commands",
          collapsed: false,
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 100, height: 20 }).join("\n");
  const plainOutput = stripAnsi(output);

  assert.match(plainOutput, /Welcome back!/);
  assert.match(plainOutput, /Hufflepuff Badger is standing by/);
  assert.match(plainOutput, /▐██▛◦█ █◦▜██▌/);
  assert.match(plainOutput, /Highlight sample/);
  assert.match(plainOutput, /\/theme/);
  assert.doesNotMatch(plainOutput, /Enter send/);
});

test("renderTranscriptLines returns the full transcript without viewport clipping", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "First card",
          body: "first body",
        },
        {
          id: "assistant-2",
          kind: "assistant",
          summary: "Second card",
          body: "second body",
        },
        {
          id: "assistant-3",
          kind: "assistant",
          summary: "Third card",
          body: "third body",
        },
      ],
    }),
  );

  const lines = renderTranscriptLines(view.transcript, 80);
  const output = stripAnsi(lines.join("\n"));

  assert.match(output, /first body/);
  assert.match(output, /third body/);
});

test("diffTranscriptLines reports append-only updates separately from replay-required updates", () => {
  assert.deepEqual(diffTranscriptLines(["a", "b"], ["a", "b", "c"]), {
    mode: "append",
    lines: ["c"],
  });
  assert.deepEqual(diffTranscriptLines(["a", "b"], ["a", "x"]), {
    mode: "replay",
    lines: ["a", "x"],
  });
});

test("renderTranscriptLines shows submitted input text only once for user cards", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "user-1",
          kind: "user",
          summary: "inspect auth flow",
          body: "inspect auth flow",
        },
      ],
    }),
  );

  const lines = renderTranscriptLines(view.transcript, 80);
  const output = stripAnsi(lines.join("\n"));

  assert.match(output, /Submitted Input/);
  assert.equal((output.match(/inspect auth flow/g) ?? []).length, 1);
});

test("renderTranscript keeps submitted input framed while assistant content stays rail-only", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "user-1",
          kind: "user",
          summary: "inspect auth flow",
          body: "inspect auth flow",
        },
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "reply",
          body: "assistant body line",
        },
      ],
    }),
  );

  const output = stripAnsi(renderTranscript(view.transcript, { width: 80, height: 20 }).join("\n"));

  assert.match(output, /╭ Submitted Input/);
  assert.match(output, /inspect auth flow/);
  assert.match(output, /^│ assistant body line.*$/m);
  assert.doesNotMatch(output, /╭ Assistant:/);
  assert.doesNotMatch(output, /^│ assistant body line.* │$/m);
});

test("renderTranscript does not repeat assistant body text in the header", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "hello there",
          body: "hello there",
        },
      ],
    }),
  );

  const output = stripAnsi(renderTranscript(view.transcript, { width: 80, height: 20 }).join("\n"));

  assert.match(output, /^Assistant:\s*$/m);
  assert.equal((output.match(/hello there/g) ?? []).length, 1);
});

test("renderTranscript renders system and execution entries as plain transcript lines instead of utility rails", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "system-1",
          kind: "system",
          summary: "branch: main",
          body: "branch: main",
        },
        {
          id: "execution-1",
          kind: "execution",
          summary: "Run git status",
          body: "$ git status\nOn branch main",
        },
      ],
    }),
  );

  const output = stripAnsi(renderTranscript(view.transcript, { width: 80, height: 20 }).join("\n"));

  assert.match(output, /^branch: main.*$/m);
  assert.match(output, /^\$ git status.*$/m);
  assert.match(output, /^On branch main.*$/m);
  assert.doesNotMatch(output, /^System: branch: main.*$/m);
  assert.doesNotMatch(output, /╭ System:/);
  assert.doesNotMatch(output, /╭ Execution:/);
  assert.doesNotMatch(output, /^│ branch: main.*$/m);
  assert.doesNotMatch(output, /^│ \$ git status.*$/m);
});

test("renderTranscript renders blank system separators as plain blank lines", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "system-1",
          kind: "system",
          summary: "",
          body: "",
          collapsed: false,
        },
        {
          id: "system-2",
          kind: "system",
          summary: "Session",
          body: "Session",
          collapsed: false,
        },
      ],
    }),
  );

  const output = stripAnsi(renderTranscript(view.transcript, { width: 80, height: 20 }).join("\n"));

  assert.match(output, /^\nSession.*$/m);
  assert.doesNotMatch(output, /^System:\s*$/m);
  assert.doesNotMatch(output, /^System: Session.*$/m);
  assert.doesNotMatch(output, /^│ Session.*$/m);
});

test("renderTranscript applies ANSI chrome to submitted input and assistant headers", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "user-1",
          kind: "user",
          summary: "inspect auth flow",
          body: "inspect auth flow",
        },
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "reply",
          body: "assistant body line",
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 20 }).join("\n");

  assert.match(output, /\u001b\[[0-9;]*m╭ Submitted Input/);
  assert.match(output, /\u001b\[[0-9;]*mAssistant:\s*\u001b\[0m/);
});

test("renderTranscript highlights semantic token kinds in assistant output", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "Token demo",
          body: "Run /help in README.md with Ctrl+C when ready and `npm test`.",
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 120, height: 20 }).join("\n");
  const plainOutput = stripAnsi(output);

  assert.match(plainOutput, /Run \/help in README\.md with Ctrl\+C when ready and npm test\./);
  assert.match(output, /\u001b\[[0-9;]*m\/help\u001b\[0m/);
  assert.match(output, /\u001b\[[0-9;]*mREADME\.md\u001b\[0m/);
  assert.match(output, /\u001b\[[0-9;]*mCtrl\+C\u001b\[0m/);
  assert.match(output, /\u001b\[[0-9;]*mready\u001b\[0m/);
  assert.match(output, /\u001b\[[0-9;]*mnpm test\u001b\[0m/);
});

test("renderTranscript wraps full-width assistant text by terminal cell width", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "中文",
          body: "你好世界",
        },
      ],
    }),
  );

  const output = stripAnsi(renderTranscript(view.transcript, { width: 6, height: 20 }).join("\n"));

  assert.match(output, /^│ 你好$/m);
  assert.match(output, /^│ 世界$/m);
});

test("renderTranscript wraps themed highlight tokens without leaking ANSI fragments", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      activeThemeId: "hufflepuff",
      timeline: [
        {
          id: "welcome-1",
          kind: "welcome",
          summary: "ready",
          body: "ignored",
          collapsed: false,
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 30 }).join("\n");
  const plainOutput = stripAnsi(output);

  assert.doesNotMatch(plainOutput, /\u001b\[/);
  assert.match(plainOutput, /\/theme · README\.md · Ctrl\+C · ready/);
});

test("renderThemePickerOverlay uses compact house labels on narrow terminals", () => {
  const plainOutput = stripAnsi(renderThemePickerOverlay(createThemePickerOverlay(), 80).join("\n"));

  assert.match(plainOutput, /^> Hufflepuff\s+Welcome back!$/m);
  assert.match(plainOutput, /^  Gryffindor\s+Hufflepuff Badger is standing by$/m);
  assert.match(plainOutput, /^  Ravenclaw$/m);
  assert.match(plainOutput, /^  Slytherin\s+░ · ░  · ░$/m);
  assert.doesNotMatch(plainOutput, /Badger · yellow/);
  assert.doesNotMatch(plainOutput, /\u001b\[/);
});
