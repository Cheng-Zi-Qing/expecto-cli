# V1 Fullscreen TUI Architecture

## Goal

Turn `beta` into a fullscreen terminal UI by default for interactive sessions while preserving:

- `beta -p "<prompt>"` as one-shot mode
- provider/runtime portability
- markdown-driven project context loading
- future command renaming and renderer migration

## Product Decisions

The `v1` TUI freezes these interaction rules:

- `beta` enters fullscreen TUI
- `beta "<prompt>"` enters fullscreen TUI with the first user message prefilled/submitted
- `beta -p "<prompt>"` remains non-interactive
- layout is single main view: timeline + fixed input + thin status bar
- input is multi-line
- `Enter` sends
- `Alt+Enter` and `Ctrl+J` insert newline
- `Tab` toggles the right-side Context Inspector
- `Esc` moves focus from composer to timeline
- `i` moves focus back to composer
- arrow keys navigate timeline items
- `Enter` expands/collapses the selected timeline item
- `Ctrl+C` interrupts current generation and restores the draft to the composer
- timeline defaults to Claude-like collapsed execution summaries
- output rendering supports markdown-like terminal formatting
- the UI runs in alternate screen mode

## Hard Architecture Constraint

`blessed` or `neo-blessed` may only appear in:

```text
src/tui/renderer-blessed/*
```

It must not be imported from:

- `src/runtime/*`
- `src/providers/*`
- `src/memory/*`
- `src/core/*`
- future `src/commands/*`
- future `src/tools/*`

This keeps the renderer replaceable.

## Layering

The fullscreen TUI is split into four layers:

### 1. Agent core

Existing runtime, provider, memory, and artifact logic.

### 2. TUI state

Pure state transitions for:

- focus mode
- composer draft
- timeline selection
- inspector visibility
- collapsed/expanded cards
- visible status labels
- context metrics

This layer must stay renderer-agnostic.

### 3. TUI view model

Pure transformation from runtime/session state into:

- welcome screen
- timeline cards
- status bar items
- inspector sections
- input box state

This layer must stay renderer-agnostic.

### 4. Renderer adapter

Maps the view model into `neo-blessed` screen primitives and turns keypresses into TUI actions.

## Runtime Integration Strategy

The existing `RuntimeSession` remains the single owner of:

- conversation history
- slash command semantics
- session lifecycle
- snapshot/event persistence

To support the TUI without leaking renderer concepts into runtime, `RuntimeSession` should expose optional renderer-neutral events:

- system line emitted
- user prompt submitted
- assistant output emitted
- generation state changed
- conversation cleared

The TUI consumes those events and renders them as cards.

## Initial Status Bar Scope

`v1` status bar should show:

- product name
- provider/model
- project name
- git branch
- context percentage
- rules count
- hooks count
- loaded docs count
- runtime state
- input hint

Context percentage is allowed to be approximate in the first cut.

## Context Inspector Scope

`v1` right drawer should show:

- context usage
- provider/model
- mode
- session id
- rules count
- hooks count
- loaded docs count
- summary/memory presence
- active artifacts summary

## Execution Cards

Timeline items should support at least:

- welcome card
- user message
- assistant message
- system/status message
- execution summary card

Execution cards default to collapsed and should use stable internal state ids with separate display labels so naming can evolve later.

## Technical Recommendation

Use `neo-blessed` as the renderer primitive and isolate it in `src/tui/renderer-blessed/*`.
