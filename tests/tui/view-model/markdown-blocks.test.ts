import test from "node:test";
import assert from "node:assert/strict";

import type { MarkdownBlock } from "../../../src/tui/block-model/block-types.ts";
import type { TextToken } from "../../../src/tui/block-model/text-tokens.ts";
import { parseMarkdownBlocks } from "../../../src/tui/view-model/markdown-blocks.ts";

test("paragraphs are split on blank lines", () => {
  const source = ["first line", "second line", "", "third line"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.equal(blocks[1]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "first line\nsecond line" },
  ]);
  assert.deepEqual(blocks[1]?.tokens, [{ kind: "default", text: "third line" }]);
});

test("unordered lists produce list blocks with tokens per item", () => {
  const source = ["- alpha", "- beta", "- gamma"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  const listBlock = blocks[0];
  assert.equal(listBlock?.kind, "list");
  assert.equal((listBlock as MarkdownBlock).kind, "list");
  assert.equal((listBlock as { ordered: boolean }).ordered, false);
  assert.deepEqual((listBlock as { items: TextToken[][] }).items, [
    [{ kind: "default", text: "alpha" }],
    [{ kind: "default", text: "beta" }],
    [{ kind: "default", text: "gamma" }],
  ]);
});

test("ordered lists produce ordered list blocks with tokens per item", () => {
  const source = ["1. first", "2. second"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  const listBlock = blocks[0];
  assert.equal(listBlock?.kind, "list");
  assert.equal((listBlock as { ordered: boolean }).ordered, true);
  assert.deepEqual((listBlock as { items: TextToken[][] }).items, [
    [{ kind: "default", text: "first" }],
    [{ kind: "default", text: "second" }],
  ]);
});

test("quote blocks parse consecutive quote lines", () => {
  const source = ["> first quote", "> second line"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "quote_block");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "first quote\nsecond line" },
  ]);
});

test("fenced code blocks capture language and code body", () => {
  const source = ["```ts", "const x = 1;", "```"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "code_block");
  assert.equal(blocks[0]?.language, "ts");
  assert.equal(blocks[0]?.code, "const x = 1;");
});

test("fenced code blocks preserve interior blank lines", () => {
  const source = ["```", "line 1", "", "line 3", "```"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "code_block");
  assert.equal(blocks[0]?.code, "line 1\n\nline 3");
});

test("fenced code blocks preserve trailing blank line before closing", () => {
  const source = ["```", "line 1", "", "```"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "code_block");
  assert.equal(blocks[0]?.code, "line 1\n");
});

test("code fences ignore literal lines that start with ``` but are not closing", () => {
  const source = [
    "```",
    "line 1",
    " ```not closing",
    "",
    "line 4",
    "```",
  ].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "code_block");
  assert.equal(blocks[0]?.code, "line 1\n ```not closing\n\nline 4");
});

test("malformed unclosed code fences degrade to paragraph content", () => {
  const source = ["```ts", "const x = 1;", "still code?"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "```ts\nconst x = 1;\nstill code?" },
  ]);
});

test("unclosed fence keeps the opening fence line in paragraph text", () => {
  const source = ["```ts", "const x = 1;"].join("\n");
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "```ts\nconst x = 1;" },
  ]);
});

test("inline code becomes inline_code tokens", () => {
  const source = "Surround `inline` code spans";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Surround " },
    { kind: "inline_code", text: "inline" },
    { kind: "default", text: " code spans" },
  ]);
});

test("semantic tokenizer recognizes command path shortcut and status", () => {
  const source =
    "Run /help then open README.md, press Ctrl+C, status: running.";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Run " },
    { kind: "command", text: "/help" },
    { kind: "default", text: " then open " },
    { kind: "path", text: "README.md" },
    { kind: "default", text: ", press " },
    { kind: "shortcut", text: "Ctrl+C" },
    { kind: "default", text: ", status: " },
    { kind: "status", text: "running" },
    { kind: "default", text: "." },
  ]);
});

test("semantic tokenizer includes slash paths and does not highlight freeform nouns", () => {
  const source = "Use ./scripts/install-local-beta.sh while the branch is ready";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Use " },
    { kind: "path", text: "./scripts/install-local-beta.sh" },
    { kind: "default", text: " while the branch is " },
    { kind: "status", text: "ready" },
  ]);
});

test("inline_code remains highest priority over semantic tokenization", () => {
  const source = "Literal `/branch` and `README.md` stay code, but /inspect works";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Literal " },
    { kind: "inline_code", text: "/branch" },
    { kind: "default", text: " and " },
    { kind: "inline_code", text: "README.md" },
    { kind: "default", text: " stay code, but " },
    { kind: "command", text: "/inspect" },
    { kind: "default", text: " works" },
  ]);
});

test("multi-backtick inline_code also wins over semantic tokenization", () => {
  const source = "Literal ``/branch`` and ``README.md`` stay code";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Literal " },
    { kind: "inline_code", text: "/branch" },
    { kind: "default", text: " and " },
    { kind: "inline_code", text: "README.md" },
    { kind: "default", text: " stay code" },
  ]);
});

test("semantic tokenizer avoids version numbers and email domains as paths", () => {
  const source = "Version 1.2.3 is out; contact a@b.com for details";
  const blocks = parseMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "paragraph");
  assert.deepEqual(blocks[0]?.tokens, [
    { kind: "default", text: "Version 1.2.3 is out; contact a@b.com for details" },
  ]);
});
