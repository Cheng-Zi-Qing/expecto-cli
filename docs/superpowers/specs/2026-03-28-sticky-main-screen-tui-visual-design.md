# Sticky Main-Screen TUI Visual Design

## Context

The current default interactive TUI is a sticky-bottom, main-screen terminal path. Its interaction model is the right one:

- no alternate screen
- native terminal scrollback
- native selection and copy
- sticky composer at the bottom

The current problem is visual, not behavioral. After the renderer shift to the main-screen path, the UI lost most of its contrast, grouping, and frame cues. Transcript items, utility items, and the footer now read too close to plain stdout.

This design restores visual hierarchy without changing the interaction model.

## Goal

Restore a clear, intentional visual language for the sticky main-screen TUI so that:

- submitted input and model output are immediately distinguishable
- assistant output is readable over long sessions without feeling boxed in
- utility items remain scannable without flattening into plain transcript text
- the bottom composer and status remain visually stable and obviously interactive

## Locked Decisions

The chosen visual direction is:

- Layout: `A1`
- Keyword highlighting density: `K2`
- Utility item chrome: `U3`
- Color family: `P1`

These choices define the contract below.

## Interaction Invariants

This work must not change the current interaction behavior:

- the app remains on the main terminal screen
- terminal scrollback remains native
- mouse selection remains terminal-native
- the sticky composer remains the only persistent bottom region
- slash commands, prompt submission, interrupt behavior, and input locking semantics remain unchanged

## Visual Contract

### Overall Surface

- Base surface uses a warm paper-like background tone rather than pure white or dark console styling.
- The terminal should still feel like a terminal, not a browser card stack.
- Chrome should be deliberate but restrained. The screen must not collapse into plain text, and it must not become visually noisy.

### Submitted Input

- `Submitted Input` remains a full framed card.
- It uses green chrome and a subtle warm background so user-issued prompts are unmistakably separate from model output.
- This is the strongest non-footer container on screen because it anchors turn boundaries.

### Assistant Output

- Assistant output must not use a full border + filled background card.
- Assistant output uses a blue title and a left rail only.
- The body stays on the paper surface with no enclosing box fill.
- This keeps long assistant replies open and readable while preserving clear ownership.

### Utility Items

- `System` and `Execution` items use the same light rail treatment as assistant output.
- They are differentiated by gold chrome rather than by boxed cards.
- This keeps the transcript visually consistent while preserving category identity.
- Utility items remain secondary to assistant output through lighter emphasis and shorter body treatments.

### Footer

- The bottom sticky region keeps a fully framed footer.
- `Composer` and `Status` must have explicit frame chrome.
- The footer must feel stable and interactive even when the transcript above is visually lighter.

## Color Contract

The final color family is `P1 Warm Ledger`:

- warm paper background for the transcript surface
- green for submitted input chrome
- blue for assistant rails and labels
- gold for system/execution rails and labels
- muted gray text for secondary footer content

The palette should avoid:

- cold default white
- purple-heavy default AI styling
- neon console colors
- low-contrast gray-on-gray transcript text

## Semantic Highlighting Contract

Highlighting is semantic, not ad hoc. The renderer must only color text that has been classified into a known token kind.

### Token Kinds

- `command`
- `path`
- `inline_code`
- `shortcut`
- `status`
- `default`
- `muted`

### Highlight Density

Use the `K2 Clear Balanced` density:

- highlight commands, file paths, inline code, shortcuts, and status words
- keep normal narrative text in the default body color
- do not attempt “importance highlighting” for arbitrary nouns or phrases

### Token Rules

#### Inline Code

- Anything inside inline backticks becomes `inline_code`
- This is the highest priority token kind inside prose

Examples:

- `` `resolveCliRoute()` ``
- `` `npm run build` ``

#### Commands

- Recognize explicit slash commands and similarly high-confidence command forms
- Do not highlight ordinary verbs as commands

Examples:

- `/branch`
- `/help`
- `/inspect`

#### Paths

- Recognize file paths and file-like references with high confidence
- Bare filenames such as `README.md` are included
- Path matching must be conservative enough to avoid false positives in normal prose

Examples:

- `src/cli/entry.ts`
- `README.md`
- `./scripts/install-local-beta.sh`

#### Shortcuts

- Recognize keyboard shortcut forms

Examples:

- `Ctrl+C`
- `Ctrl+J`
- `Alt+Enter`

#### Status

- Use a fixed status vocabulary rather than freeform sentiment matching

Examples:

- `ready`
- `thinking`
- `running`
- `success`
- `error`
- `interrupted`

### Token Priority

To avoid conflicting styles:

1. `inline_code`
2. `command` / `path` / `shortcut` / `status`
3. `default` / `muted`

Code blocks are out of scope for this semantic pass. They keep their existing code-block rendering contract.

## Renderer Responsibilities

### Transcript Renderer

The terminal transcript renderer must:

- restore explicit visual grouping for transcript items
- render user prompts as framed cards
- render assistant/system/execution as rail-based items
- preserve wrapping, append-only diffing, and current scrollback-friendly output behavior

### Footer Renderer

The sticky footer must reuse or match the existing framed footer contract rather than writing plain unframed lines.

### Tokenization Layer

Semantic highlighting must be introduced upstream of the terminal render layer. The terminal renderer should consume tokenized content, not infer colors directly from raw strings late in the pipeline.

## File-Level Design Direction

The expected implementation direction is:

- `src/tui/view-model/markdown-blocks.ts`
  - extend inline tokenization beyond `default` and `inline_code`
- `src/tui/block-model/text-tokens.ts`
  - keep semantic token definitions authoritative
- `src/tui/renderer-terminal/transcript-renderer.ts`
  - implement framed user rendering and rail-based assistant/system/execution rendering
- `src/tui/renderer-terminal/footer-renderer.ts`
  - remain the source of truth for framed footer chrome
- `src/tui/sticky-screen/screen-writer.ts`
  - render the framed footer in sticky mode instead of plain text footer lines
- `src/tui/sticky-screen/presentation-surface.ts`
  - continue projecting footer state and semantic transcript state into renderer inputs

## Testing Requirements

The implementation must be locked down with focused tests for:

- transcript framing rules by timeline item kind
- footer chrome in sticky mode
- semantic tokenization for `command`, `path`, `shortcut`, and `status`
- regression coverage for append-only transcript updates
- regression coverage for the current LF-only Enter compatibility fix

## Out of Scope

- changing the main-screen interaction model
- reintroducing alternate screen behavior
- changing provider/runtime behavior
- full syntax highlighting of fenced code blocks
- redesigning command semantics or session behavior
- changing the sticky-bottom layout structure beyond its visual treatment

## Acceptance Criteria

This design is complete when:

- the default main-screen TUI clearly separates submitted input from assistant output
- assistant output is visually lighter than before and remains unboxed
- utility items retain visible category identity
- the footer regains clear frame contrast
- semantic keyword highlighting appears only on the approved token classes
- the screen looks intentional and legible over long transcript sessions without changing how the app behaves
