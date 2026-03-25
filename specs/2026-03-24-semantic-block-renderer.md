# Semantic Block Renderer

## Goal

Define the first stable rendering architecture that upgrades `beta` from string-based timeline cards to a renderer-agnostic semantic block pipeline, while preserving the existing runtime, TUI state model, and blessed isolation boundary.

## Problem Statement

The current fullscreen TUI is usable, but timeline rendering still relies on direct string markup generation from `TimelineItem`.

That approach is now the main bottleneck for the next product requirements:

- user messages should render as distinct submitted-input cards
- assistant output should support richer markdown structure
- execution output should remain visually separate from normal content
- keywords such as commands, paths, shortcuts, and status phrases should be highlightable by meaning rather than by ad-hoc string formatting
- future work such as diff blocks, file-edit blocks, and scrollbar marks needs stable semantic structure

If those features are added directly into the current renderer string functions, the renderer will become the source of product semantics, which conflicts with the project’s modularity constraints.

## Architectural Boundary

The semantic block renderer introduces a new display pipeline:

1. `RuntimeSession` emits renderer-neutral events
2. `runInteractiveTui()` maintains `TuiState`
3. `TuiState.timeline` remains the stable renderer input boundary outside renderer code
4. a renderer-agnostic view-model layer converts `TimelineItem` into semantic cards and blocks
5. `src/tui/renderer-blessed/*` renders those blocks into terminal markup

This means:

- runtime remains responsible for conversation and session semantics
- TUI state remains responsible for interaction state
- view-model code becomes responsible for display semantics
- blessed remains responsible only for layout and terminal rendering

## Hard Constraints

- `neo-blessed` may only appear under `src/tui/renderer-blessed/*`
- `TimelineItem` remains the renderer-external input boundary for this pass
- markdown/block parsing must not import blessed
- command semantics remain outside renderer code
- this pass must not rewrite runtime/provider/session contracts

## V1 Scope

The first semantic block renderer pass supports:

- top-level card kinds:
  - welcome
  - user
  - assistant
  - system
  - execution
- content blocks:
  - paragraph
  - list
  - quote block
  - code block
  - badge row
  - transcript block
- inline text tokens:
  - default
  - muted
  - inline code
  - command
  - path
  - shortcut
  - status

The first pass is intentionally narrow. It is not a full markdown renderer and does not attempt to infer tool semantics from arbitrary text.

## Non-Goals

This pass does not yet define or implement:

- diff blocks
- file edit blocks
- table rendering
- scrollbar mark models
- selection-driven command acceptance from the slash palette
- a full CommonMark parser
- runtime schema changes for tool or file-edit events

## Block Model

The block model separates three concerns:

1. structural containers
2. content organization
3. inline semantic highlighting

### Structural Container

Each timeline entry is converted into a `card` view model with:

- stable `kind`
- header label
- selected/collapsed display state
- ordered child blocks

### Content Blocks

The first pass uses these renderer-agnostic block kinds:

- `paragraph`
- `list`
- `quote_block`
- `code_block`
- `badge_row`
- `transcript_block`

These blocks are sufficient to express the current product goals without prematurely introducing a full document AST.

### Inline Text Tokens

Inline text remains intentionally lightweight. A paragraph or list item is composed from tokenized text segments so the renderer can apply semantic emphasis to:

- inline code
- slash commands
- file paths
- keyboard shortcuts
- runtime/status vocabulary

## Timeline Card Rules

### Welcome Card

- remains a special onboarding card
- uses paragraph-style body blocks
- may continue to include static shortcut guidance

### User Card

- represents submitted input, not active composer state
- should visually belong to the same family as the composer
- must remain less visually dominant than the active composer
- should render as a distinct container rather than plain body text

### Assistant Card

- becomes the main markdown-capable reading surface
- parses paragraph, list, quote, code fence, and inline code structure
- remains visually cleaner than user or execution cards

### System Card

- remains compact and status-oriented
- may use badge rows for state summaries plus paragraph text when needed

### Execution Card

- keeps its collapsed/expanded behavior
- summary remains compact
- expanded state renders transcript content through a dedicated `transcript_block`
- transcript styling must remain visually distinct from ordinary assistant body content

## Markdown Parsing Boundary

The markdown layer in this pass is intentionally partial and display-oriented.

It should support:

- paragraphs split on blank lines
- unordered and ordered lists
- block quotes
- fenced code blocks with optional language labels
- inline code spans

It should not attempt:

- full nested markdown fidelity
- link parsing beyond basic text treatment
- table syntax
- HTML blocks

The goal is stable rendering value, not full markdown compliance.

## Renderer Responsibilities

The blessed renderer should consume semantic blocks and decide:

- spacing between cards
- header/body visual hierarchy
- user-card container styling
- execution transcript guide styling
- token-to-color mapping
- compact markup for selected vs unselected cards

It should not:

- parse markdown
- infer business semantics from raw text
- decide whether a timeline item is a user/execution/system concept

## Testing Strategy

This architecture requires three testing layers:

### View-Model Tests

Verify that:

- timeline items become the correct card structures
- assistant text becomes the correct markdown blocks
- execution collapsed/expanded states produce the correct block shapes

### Renderer Pure Tests

Verify that:

- cards render with the expected hierarchy
- user cards get their own container treatment
- transcript blocks differ from ordinary body blocks
- semantic tokens receive the correct emphasis

### Integration Tests

Verify that:

- the interactive TUI still projects runtime events into timeline state
- the renderer can consume the new block layer without breaking interaction
- slash palette state and timeline rendering can coexist

## Success Criteria

This pass is successful when:

- timeline rendering no longer depends on direct `TimelineItem -> final markup` logic alone
- user messages render as distinct submitted-input cards
- assistant messages render through semantic markdown blocks
- execution cards render through dedicated transcript-aware block structure
- blessed remains isolated to `src/tui/renderer-blessed/*`
- the new pipeline is covered by block-level, renderer-level, and integration-level tests

## Follow-On Work Enabled By This Spec

Once this layer exists, later tasks can add:

- diff blocks
- file edit blocks
- richer status badge vocabularies
- semantic scrollbar marks
- more expressive command/system feedback rendering
