import test from "node:test";
import assert from "node:assert/strict";

import type { TimelineItem } from "../../../src/tui/tui-types.ts";
import {
  appendTranscriptChunk,
  createExecutionTranscriptBuffer,
} from "../../../src/tui/execution-transcript-buffer.ts";
import { buildTimelineCards } from "../../../src/tui/view-model/timeline-blocks.ts";

const createItem = (overrides: Partial<TimelineItem>): TimelineItem => {
  const item: TimelineItem = {
    id: overrides.id ?? "card-1",
    kind: overrides.kind ?? "assistant",
    summary: overrides.summary ?? "summary",
  };

  if (overrides.body !== undefined) {
    item.body = overrides.body;
  }

  if (overrides.collapsed !== undefined) {
    item.collapsed = overrides.collapsed;
  }

  if (overrides.executionTranscript !== undefined) {
    item.executionTranscript = overrides.executionTranscript;
  }

  return item;
};

test("welcome card builds a themed welcome block with the welcome label", () => {
  const timeline = [
    createItem({
      id: "welcome-1",
      kind: "welcome",
      summary: "Welcome to expecto",
      body: "Line one\nLine two",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.ok(card);

  assert.equal(card.kind, "welcome");
  assert.equal(card.headerLabel, "Welcome");
  assert.equal(card.selected, true);
  assert.equal(card.collapsed, false);
  assert.equal(card.blocks.length, 1);
  const welcomeBlock = card.blocks[0];
  assert.ok(welcomeBlock);
  assert.equal(welcomeBlock.kind, "theme_welcome");
  assert.equal(welcomeBlock.title, "Welcome back!");
  assert.equal(welcomeBlock.subtitle, "Hufflepuff Badger is standing by");
});

test("welcome card ignores generic body text and renders theme-owned welcome content", () => {
  const timeline = [
    createItem({
      id: "welcome-2",
      kind: "welcome",
      summary: "Welcome list",
      body: "- alpha\n- beta",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const welcomeBlock = card.blocks[0];
  assert.ok(welcomeBlock);
  assert.equal(welcomeBlock.kind, "theme_welcome");
  assert.equal(welcomeBlock.tipTitle, "Tips");
  assert.equal(welcomeBlock.highlightTokens[0]?.text, "/theme");
});

test("welcome card resolves the active theme welcome asset instead of generic transcript text", () => {
  const timeline = [
    createItem({
      id: "welcome-themed",
      kind: "welcome",
      summary: "placeholder",
      body: "Enter send\n/help commands",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0, "hufflepuff");
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);

  const welcomeBlock = card.blocks[0];
  assert.ok(welcomeBlock);
  assert.equal(welcomeBlock.kind, "theme_welcome");
  assert.equal(welcomeBlock.title, "Welcome back!");
  assert.equal(welcomeBlock.subtitle, "Hufflepuff Badger is standing by");
  assert.equal(welcomeBlock.highlightTokens[0]?.text, "/theme");
});

test("origin welcome card falls back to the legacy plain welcome content", () => {
  const timeline = [
    createItem({
      id: "welcome-origin",
      kind: "welcome",
      summary: "expecto is ready in expecto-cli on main.",
      body: "Enter send\nCtrl+C interrupt",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0, "origin");
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);

  const paragraphBlock = card.blocks[0];
  assert.ok(paragraphBlock);
  assert.equal(paragraphBlock.kind, "paragraph");
  assert.deepEqual(paragraphBlock.tokens, [
    { kind: "default", text: "Enter send\nCtrl+C interrupt" },
  ]);
});

test("user card presents prompt text through a paragraph block", () => {
  const timeline = [
    createItem({
      id: "user-1",
      kind: "user",
      summary: "inspect auth",
      body: "inspect auth",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0, "origin");
  const card = cards[0];
  assert.ok(card);

  assert.equal(card.kind, "user");
  assert.equal(card.headerLabel, "Submitted Input");
  assert.equal(card.blocks.length, 1);
  const paragraphBlock = card.blocks[0];
  assert.ok(paragraphBlock);
  assert.equal(paragraphBlock.kind, "paragraph");
  assert.deepEqual(paragraphBlock.tokens, [
    { kind: "default", text: "inspect auth" },
  ]);
});

test("user card keeps markdown-like syntax as paragraph text", () => {
  const timeline = [
    createItem({
      id: "user-2",
      kind: "user",
      summary: "prompt",
      body: "- alpha\n- beta",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const paragraphBlock = card.blocks[0];
  assert.ok(paragraphBlock);
  assert.equal(paragraphBlock.kind, "paragraph");
  assert.deepEqual(paragraphBlock.tokens, [
    { kind: "default", text: "- alpha\n- beta" },
  ]);
});

test("assistant card reuses markdown blocks for structured content", () => {
  const timeline = [
    createItem({
      id: "assistant-1",
      kind: "assistant",
      summary: "list",
      body: "- alpha\n- beta",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0, "origin");
  const card = cards[0];
  assert.ok(card);

  assert.equal(card.kind, "assistant");
  assert.equal(card.headerLabel, "Assistant");
  assert.equal(card.blocks.length, 1);
  const listBlock = card.blocks[0];
  assert.ok(listBlock);
  assert.equal(listBlock.kind, "list");
  assert.equal(listBlock.items.length, 2);
});

test("house themes map user and assistant card titles away from the generic labels", () => {
  const cards = buildTimelineCards(
    [
      createItem({
        id: "user-themed",
        kind: "user",
        summary: "hello",
        body: "hello",
      }),
      createItem({
        id: "assistant-themed",
        kind: "assistant",
        summary: "hi there",
        body: "hi there",
      }),
    ],
    1,
    "hufflepuff",
  );

  const userCard = cards[0];
  const assistantCard = cards[1];
  assert.ok(userCard);
  assert.ok(assistantCard);
  assert.equal(userCard.headerLabel, "Badger Prompt");
  assert.equal(assistantCard.headerLabel, "Badger Reply");
});

test("system card stays compact and uses paragraph blocks", () => {
  const timeline = [
    createItem({
      id: "system-1",
      kind: "system",
      summary: "system ready",
      body: "system ready",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);

  assert.equal(card.kind, "system");
  assert.equal(card.headerLabel, "System");
  assert.equal(card.blocks.length, 1);
  const paragraphBlock = card.blocks[0];
  assert.ok(paragraphBlock);
  assert.equal(paragraphBlock.kind, "paragraph");
});

test("system card keeps markdown-like syntax as paragraph text", () => {
  const timeline = [
    createItem({
      id: "system-2",
      kind: "system",
      summary: "status",
      body: "- alpha\n- beta",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const paragraphBlock = card.blocks[0];
  assert.ok(paragraphBlock);
  assert.equal(paragraphBlock.kind, "paragraph");
  assert.deepEqual(paragraphBlock.tokens, [
    { kind: "default", text: "- alpha\n- beta" },
  ]);
});

test("execution card honors collapsed state and reveals transcript when expanded", () => {
  const collapsedCard = createItem({
    id: "execution-1",
    kind: "execution",
    summary: "Running tool",
    body: "cmd output",
    collapsed: true,
  });
  const expandedCard = createItem({
    id: "execution-2",
    kind: "execution",
    summary: "Tool done",
    body: "success",
    collapsed: false,
  });
  const timeline = [collapsedCard, expandedCard];

  const cards = buildTimelineCards(timeline, 1);
  const firstCard = cards[0];
  const secondCard = cards[1];
  assert.ok(firstCard);
  assert.ok(secondCard);
  assert.equal(firstCard.collapsed, true);
  assert.equal(firstCard.blocks.length, 0);
  assert.equal(secondCard.collapsed, false);
  assert.equal(secondCard.blocks.length, 1);
  const transcriptBlock = secondCard.blocks[0];
  assert.ok(transcriptBlock);
  assert.equal(transcriptBlock.kind, "transcript_block");
  assert.deepEqual(transcriptBlock.lines, ["success"]);
});

test("expanded execution card does not render transcript content from summary alone", () => {
  const timeline = [
    createItem({
      id: "execution-3",
      kind: "execution",
      summary: "Running tool",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.summary, "Running tool");
  assert.equal(card.blocks.length, 0);
});

test('empty-string body falls back to summary for user/system paragraph cards while welcome stays theme-owned', () => {
  const kinds: Array<TimelineItem["kind"]> = ["welcome", "user", "system"];

  for (const kind of kinds) {
    const timeline = [
      createItem({
        id: `card-${kind}`,
        kind,
        summary: "use summary text",
        body: "",
        collapsed: false,
      }),
    ];

    const cards = buildTimelineCards(timeline, 0);
    const card = cards[0];
    assert.ok(card);
    assert.equal(card.blocks.length, 1);
    const block = card.blocks[0];
    assert.ok(block);

    if (kind === "welcome") {
      assert.equal(block.kind, "theme_welcome");
      continue;
    }

    assert.equal(block.kind, "paragraph");
    assert.deepEqual(block.tokens, [
      { kind: "default", text: "use summary text" },
    ]);
  }
});

test("assistant card falls back to summary when body is empty string", () => {
  const timeline = [
    createItem({
      id: "assistant-empty-body",
      kind: "assistant",
      summary: "- alpha\n- beta",
      body: "",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const listBlock = card.blocks[0];
  assert.ok(listBlock);
  assert.equal(listBlock.kind, "list");
  assert.equal(listBlock.items.length, 2);
});

test("cards render no blocks when both body and summary are effectively empty, except the theme-owned welcome card", () => {
  const timeline = [
    createItem({
      id: "welcome-empty",
      kind: "welcome",
      summary: "   ",
      body: "",
    }),
    createItem({
      id: "assistant-empty",
      kind: "assistant",
      summary: "",
      body: "   ",
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.blocks[0]?.kind, "theme_welcome");
  assert.equal(cards[1]?.blocks.length, 0);
});

test("execution transcript normalizes CRLF and ignores trailing terminal newline", () => {
  const timeline = [
    createItem({
      id: "execution-crlf",
      kind: "execution",
      summary: "Tool output",
      body: "line1\r\n\r\nline2\r\n",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const transcriptBlock = card.blocks[0];
  assert.ok(transcriptBlock);
  assert.equal(transcriptBlock.kind, "transcript_block");
  assert.deepEqual(transcriptBlock.lines, ["line1", "", "line2"]);
});

test("execution transcript avoids phantom empty line for LF trailing newline", () => {
  const timeline = [
    createItem({
      id: "execution-trailing-lf",
      kind: "execution",
      summary: "Tool output",
      body: "success\n",
      collapsed: false,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const transcriptBlock = card.blocks[0];
  assert.ok(transcriptBlock);
  assert.equal(transcriptBlock.kind, "transcript_block");
  assert.deepEqual(transcriptBlock.lines, ["success"]);
});

test("execution transcript buffer pending fragment strips raw trailing carriage return", () => {
  let transcriptBuffer = createExecutionTranscriptBuffer();
  transcriptBuffer = appendTranscriptChunk(transcriptBuffer, "line from split crlf\r");

  const timeline = [
    createItem({
      id: "execution-pending-cr",
      kind: "execution",
      summary: "Tool output",
      collapsed: false,
      executionTranscript: transcriptBuffer,
    }),
  ];

  const cards = buildTimelineCards(timeline, 0);
  const card = cards[0];
  assert.ok(card);
  assert.equal(card.blocks.length, 1);
  const transcriptBlock = card.blocks[0];
  assert.ok(transcriptBlock);
  assert.equal(transcriptBlock.kind, "transcript_block");
  assert.deepEqual(transcriptBlock.lines, ["line from split crlf"]);
});
