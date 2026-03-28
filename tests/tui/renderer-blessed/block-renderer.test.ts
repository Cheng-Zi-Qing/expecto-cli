import test from "node:test";
import assert from "node:assert/strict";

import type { TimelineCard } from "../../../src/tui/view-model/timeline-blocks.ts";
import type { TimelineItem } from "../../../src/tui/tui-types.ts";
import { buildTimelineCards } from "../../../src/tui/view-model/timeline-blocks.ts";
import { createTextToken } from "../../../src/tui/block-model/text-tokens.ts";
import { createRendererPalette } from "../../../src/tui/renderer-blessed/tui-theme.ts";
import {
  renderTimelineCardMarkup,
  renderTimelineItems,
} from "../../../src/tui/renderer-blessed/block-renderer.ts";
import * as blockRenderer from "../../../src/tui/renderer-blessed/block-renderer.ts";

const createPalette = () =>
  createRendererPalette({
    focus: "timeline",
    inputLocked: false,
  });

const createCard = (overrides: Partial<TimelineCard>): TimelineCard => ({
  id: overrides.id ?? "card-1",
  kind: overrides.kind ?? "assistant",
  summary: overrides.summary ?? "Summary",
  headerLabel: overrides.headerLabel ?? "Assistant",
  selected: overrides.selected ?? false,
  collapsed: overrides.collapsed ?? false,
  blocks: overrides.blocks ?? [],
});

const createTimelineItem = (overrides: Partial<TimelineItem>): TimelineItem => ({
  id: overrides.id ?? "item-1",
  kind: overrides.kind ?? "assistant",
  summary: overrides.summary ?? "Summary",
  ...(overrides.body !== undefined ? { body: overrides.body } : {}),
  ...(overrides.collapsed !== undefined ? { collapsed: overrides.collapsed } : {}),
});

test("user cards render as submitted-input cards with distinct chrome", () => {
  const markup = renderTimelineCardMarkup(
    createCard({
      id: "user-1",
      kind: "user",
      headerLabel: "User",
      summary: "Inspect auth flow",
      selected: true,
      blocks: [
        {
          kind: "paragraph",
          tokens: [createTextToken("default", "Inspect auth flow")],
        },
      ],
    }),
    createPalette(),
  );

  assert.match(markup, /Submitted Input/);
  assert.equal((markup.match(/Inspect auth flow/g) ?? []).length, 1);
  assert.match(markup, /#D6A93D-fg/);
  assert.match(markup, /#F2D16B-fg/);
  assert.match(markup, /╭/);
  assert.match(markup, /╰/);
});

test("user cards do not leak escaped style-tag placeholders around rendered body text", () => {
  const markup = renderTimelineCardMarkup(
    createCard({
      id: "user-escaped-1",
      kind: "user",
      headerLabel: "User",
      summary: "Inspect auth flow",
      selected: false,
      blocks: [
        {
          kind: "paragraph",
          tokens: [createTextToken("default", "Inspect auth flow")],
        },
      ],
    }),
    createPalette(),
  );

  assert.match(markup, /Inspect/);
  assert.doesNotMatch(markup, /\{open\}#|\{open\}\/#/);
});

test("user cards preserve literal braces as escaped text instead of interpreting them as tags", () => {
  const markup = renderTimelineCardMarkup(
    createCard({
      id: "user-braces-1",
      kind: "user",
      headerLabel: "User",
      summary: "Inspect {auth} flow",
      selected: false,
      blocks: [
        {
          kind: "paragraph",
          tokens: [createTextToken("default", "Inspect {auth} flow")],
        },
      ],
    }),
    createPalette(),
  );

  assert.match(markup, /Inspect/);
  assert.match(markup, /\{open\}auth\{close\}/);
});

test("assistant cards render markdown paragraph, list, quote, and code blocks from the view-model", () => {
  const [card] = buildTimelineCards(
    [
      {
        id: "assistant-1",
        kind: "assistant",
        summary: "Rendered markdown",
        body: [
          "First paragraph with `npm test`.",
          "",
          "- alpha",
          "- beta",
          "",
          "> quoted line",
          "",
          "```ts",
          "const status = 'ok';",
          "```",
        ].join("\n"),
      },
    ],
    0,
  );

  assert.ok(card);

  const markup = renderTimelineCardMarkup(card, createPalette());

  assert.match(markup, /First paragraph with/);
  assert.match(markup, /•/);
  assert.match(markup, /alpha/);
  assert.match(markup, /beta/);
  assert.match(markup, /quoted line/);
  assert.match(markup, /ts/);
  assert.match(markup, /const status = 'ok';/);
  assert.match(markup, /#B8892C-fg/);
});

test("execution cards keep collapsed hints compact and render expanded transcripts with separate styling", () => {
  const palette = createPalette();
  const collapsed = renderTimelineCardMarkup(
    createCard({
      id: "execution-collapsed",
      kind: "execution",
      headerLabel: "Execution",
      summary: "Read files",
      collapsed: true,
    }),
    palette,
  );
  const expanded = renderTimelineCardMarkup(
    createCard({
      id: "execution-expanded",
      kind: "execution",
      headerLabel: "Execution",
      summary: "Read files",
      blocks: [
        {
          kind: "transcript_block",
          lines: ["rg --files src", "sed -n '1,40p' src/main.ts"],
        },
      ],
    }),
    palette,
  );

  assert.match(collapsed, /Details hidden/);
  assert.match(collapsed, /Enter expand/);
  assert.doesNotMatch(collapsed, /rg --files src/);

  assert.match(expanded, /Details visible/);
  assert.match(expanded, /Enter collapse/);
  assert.match(expanded, /rg --files src/);
  assert.match(expanded, /sed -n '1,40p' src\/main\.ts/);
  assert.match(expanded, /#B8892C-fg/);
  assert.match(expanded, /#F3F4F6-bg/);
});

test("semantic inline tokens render with dedicated highlighting across supported token kinds", () => {
  const markup = renderTimelineCardMarkup(
    createCard({
      id: "assistant-2",
      kind: "assistant",
      headerLabel: "Assistant",
      summary: "Tokens",
      blocks: [
        {
          kind: "paragraph",
          tokens: [
            createTextToken("default", "Run "),
            createTextToken("command", "/status"),
            createTextToken("default", " in "),
            createTextToken("path", "src/tui/tui-app.ts"),
            createTextToken("default", " then press "),
            createTextToken("shortcut", "Ctrl+C"),
            createTextToken("default", " if "),
            createTextToken("status", "blocked"),
            createTextToken("default", " or inspect "),
            createTextToken("inline_code", "npm run check"),
          ],
        },
      ],
    }),
    createPalette(),
  );

  assert.match(markup, /\/status/);
  assert.match(markup, /src\/tui\/tui-app\.ts/);
  assert.match(markup, /Ctrl\+C/);
  assert.match(markup, /blocked/);
  assert.match(markup, /npm run check/);
  assert.match(markup, /#D6A93D-fg/);
  assert.match(markup, /#7A746C-fg/);
  assert.match(markup, /#7AA9D9-fg/);
  assert.match(markup, /#2C2620-bg/);
});

test("timeline renderer returns content plus item start lines for scrolling", () => {
  const rendered = renderTimelineItems(
    [
      createTimelineItem({
        id: "user-1",
        kind: "user",
        summary: "Inspect auth flow",
        body: "Inspect auth flow",
      }),
      createTimelineItem({
        id: "assistant-1",
        kind: "assistant",
        summary: "Auth findings",
        body: "Found the session check.",
      }),
    ],
    1,
    createPalette(),
  );

  assert.equal(rendered.itemStartLines.length, 2);
  const firstStartLine = rendered.itemStartLines[0];
  const secondStartLine = rendered.itemStartLines[1];
  if (firstStartLine === undefined || secondStartLine === undefined) {
    assert.fail("expected both item start lines to exist");
  }
  assert.equal(rendered.selectedLine, secondStartLine);
  assert.ok(secondStartLine > firstStartLine);
  assert.match(rendered.content, /Inspect auth flow/);
  assert.match(rendered.content, /Found the session check\./);
});

test("welcome cards render the themed mascot block instead of the legacy placeholder body", () => {
  const [card] = buildTimelineCards(
    [
      {
        id: "welcome-1",
        kind: "welcome",
        summary: "beta is ready",
        body: "Enter send",
      },
    ],
    0,
    "hufflepuff",
  );

  assert.ok(card);

  const markup = renderTimelineCardMarkup(card, createPalette());

  assert.match(markup, /Welcome back!/);
  assert.match(markup, /Hufflepuff Badger is standing by/);
  assert.match(markup, /▐██▛◦█ █◦▜██▌/);
  assert.match(markup, /Highlight sample/);
  assert.doesNotMatch(markup, /Enter send/);
});

test("timeline layout accounts for wrapped visual lines when a wrapWidth is provided", () => {
  const palette = createPalette();
  const items: TimelineItem[] = [
    createTimelineItem({
      id: "assistant-1",
      kind: "assistant",
      summary: "Long line",
      body: "0123456789012345678901234567890123456789",
    }),
    createTimelineItem({
      id: "assistant-2",
      kind: "assistant",
      summary: "Short line",
      body: "ok",
    }),
  ];

  const baseline = renderTimelineItems(items, 0, palette);
  const wrapped = renderTimelineItems(items, 0, palette, {
    wrapWidth: 12,
  });

  const baselineSecondStart = baseline.itemStartLines[1];
  const wrappedSecondStart = wrapped.itemStartLines[1];
  if (baselineSecondStart === undefined || wrappedSecondStart === undefined) {
    assert.fail("expected second item start lines to exist");
  }

  assert.equal(baseline.selectedLine, baseline.itemStartLines[0]);
  assert.equal(wrapped.selectedLine, wrapped.itemStartLines[0]);

  // With a narrow wrap width, the long paragraph line should consume additional
  // visual lines, pushing subsequent items down.
  assert.ok(wrappedSecondStart > baselineSecondStart);
});

test("renderer module exposes raw timeline items as the only layout entry point", () => {
  assert.equal(typeof blockRenderer.renderTimelineItems, "function");
  assert.equal("renderTimelineCards" in blockRenderer, false);
});

test("tui app resolves timeline wrap width from box width minus borders and padding", async () => {
  const tuiAppModule = await import("../../../src/tui/renderer-blessed/tui-app.ts");
  const resolveTimelineWrapWidth = (tuiAppModule as unknown as {
    resolveTimelineWrapWidth?: (options: {
      boxWidth?: number;
      border?: boolean;
      paddingLeft?: number;
      paddingRight?: number;
    }) => number | undefined;
  }).resolveTimelineWrapWidth;

  assert.equal(typeof resolveTimelineWrapWidth, "function");

  assert.equal(
    resolveTimelineWrapWidth?.({
      boxWidth: 80,
      border: true,
      paddingLeft: 1,
      paddingRight: 1,
    }),
    76,
  );

  // When geometry is unavailable, the app should keep behavior unchanged by
  // returning undefined instead of guessing.
  assert.equal(
    resolveTimelineWrapWidth?.({
      border: true,
      paddingLeft: 1,
      paddingRight: 1,
    }),
    undefined,
  );
});
