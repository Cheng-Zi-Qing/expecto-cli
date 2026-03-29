# Expecto CLI Welcome Screen Design

## Context

The current interactive TUI creates its initial welcome state as a plain text card in `src/tui/tui-state.ts`. That was enough to prove the sticky main-screen interaction model, but it is no longer enough for the product direction that is now locked:

- the product-facing name in the UI is `Expecto CLI`
- the startup screen should feel deliberate and polished, not like raw transcript text
- the visual pattern should follow the Claude-style startup card the user approved
- the mascot should be a compact pixel badger glyph, not dense ASCII art or an illustration

This work changes the welcome presentation only. It does not change the startup interaction model.

## Goal

Ship a branded startup welcome card that:

- feels terminal-native and restrained
- clearly establishes `Expecto CLI` as the product identity
- gives the session a calm "ready to work" entry state
- presents model/runtime context and path information without looking like a debug dump
- preserves the existing sticky-main-screen behavior and native terminal affordances

## Locked Decisions

The following choices are now locked:

- Product name: `Expecto CLI`
- Language: English only
- Layout: one large bordered startup card in the transcript, Claude-like in structure
- Structure: left column for greeting, mascot, and meta; right column for tips and recent activity
- Extra mode badge: removed
- Old plain-text command list: removed from the welcome card
- Mascot direction: Hufflepuff badger / honey badger with a geeky edge
- Mascot rendering style: compact pixel glyph using sparse block characters
- Face direction: preserve the earlier `B`-style face shape the user preferred
- Color balance: yellow chin or lower accent, gray mist density for the body, only sparse blue edge accents

## Interaction Invariants

This design must not change the interaction behavior already approved for the sticky main-screen TUI:

- no alternate screen
- native terminal scrollback remains active
- native terminal mouse selection and copy remain active
- the composer stays sticky at the bottom
- the welcome card is still just a timeline item, not a separate screen mode
- the first real transcript item still replaces the initial welcome-only transcript state

## Content Contract

### Top-Level Card

The welcome view is a single bordered card rendered as the first timeline item.

- Card title line: `Expecto CLI v<version>`
- The CLI binary name may remain `beta`; this work only changes the product-facing welcome branding

### Left Column

The left column is the identity and orientation area.

- Primary heading: `Welcome back!`
- Secondary line: `Hufflepuff Badger is standing by`
- Centered mascot glyph below the copy
- Two metadata rows below the glyph

The metadata rows are:

- provider/model presentation
- workspace path presentation

The provider/model row must use real runtime data. The mock's `Sonnet 4.6 · API Usage Billing` text is only a visual reference, not an implementation requirement. If only `providerLabel` and `modelLabel` are available, the first shipped version must render those real values rather than inventing billing wording.

The workspace row should prefer a user-facing path such as a tilde-shortened absolute path. Rendering only the bare project basename is acceptable as a temporary fallback, but the intended design target is a fuller path label.

### Right Column

The right column is a compact utility column with two sections:

- `Tips for getting started`
- `Recent activity`

Rules for the right column:

- section titles are short and quiet, not banner-like
- a light divider separates the two sections
- body copy stays concise
- placeholder content is allowed when real data does not exist yet

The mock's `/init` and `EXPECTO.md` text is not currently backed by the codebase. The first implementation must only ship command copy that reflects real behavior, for example `/help` or `/status`, unless `/init` is implemented as part of separate scoped work.

`Recent activity` may ship with the placeholder `No recent activity` until a real session activity source is wired in.

## Layout Contract

### Wide Layout

At standard terminal widths, the card renders as a two-column layout.

- outer frame encloses the whole welcome unit
- title row spans the full width
- inner body is split into left and right columns
- left column is slightly wider than right
- right column has a visible vertical divider
- left column content is centered
- right column content is top-aligned

### Narrow Layout

The design must degrade gracefully on narrower terminals.

- the card must remain readable at `80` columns
- if the usable width becomes too narrow for a clean two-column layout, the card may stack into a single column
- the mascot must not be horizontally clipped
- wrapping must remain Unicode-width aware

The fallback behavior is:

- keep the outer frame
- render the identity block first
- render the utility sections below it
- preserve section labels and divider rhythm as much as possible

## Mascot Contract

The mascot is the signature element of the welcome card.

### Form

- compact five-line pixel glyph
- geometric face with preserved cheek and brow proportions from the preferred `B` direction
- lower chin rendered as the warm yellow accent
- body shape suggested through gray density rather than a fully filled silhouette
- sparse blue accents used only as edge-light or mystical hints

### Style Constraints

- no dense screen-filling ASCII art
- no cartoon illustration look
- no large solid blue body mass
- no face distortion away from the approved `B`-style silhouette
- mist effect should come from selective gray density and negative space

### Character Set

Unicode block and geometric characters are acceptable and expected here. This is a compact pixel glyph, not ASCII-only art.

## Color Contract

The welcome card should harmonize with the terminal and with the broader TUI refresh work without feeling flat.

- frame and divider: soft neutral gray
- title and key labels: bright neutral off-white
- body copy: lighter gray
- muted copy: darker gray
- mascot chin: warm yellow
- mascot body mist: layered grays
- mascot mystery accent: sparse cool blue

Avoid:

- purple-heavy styling
- neon terminal colors
- fully saturated blue body fills
- large background fills that fight the terminal's own surface

## Data Contract

The welcome card should be backed by explicit structured data, not a manually formatted paragraph string.

Required welcome fields:

- product name
- product version label
- greeting title
- greeting subtitle
- mascot glyph lines with per-segment color intent
- provider label
- model label
- workspace path label
- getting-started tip items
- recent activity summary items

This structured data should be created in state or view-model code and then rendered by each renderer, rather than reparsing a monolithic string downstream.

## Renderer Contract

Both renderers must present the same semantic welcome structure:

- sticky terminal renderer
- blessed renderer

Renderer parity requirements:

- same product title
- same greeting copy
- same mascot glyph proportions
- same left/right information architecture
- same placeholder handling for empty recent activity

Exact color codes may vary slightly by renderer implementation, but the semantic intent must remain aligned.

## Out Of Scope

- renaming the `beta` executable
- adding a new `/init` command
- introducing `EXPECTO.md` behavior
- adding persistent recent activity storage if no clean source exists yet
- changing composer, scrollback, selection, or alternate-screen behavior
- redesigning regular transcript cards outside the welcome item

## Acceptance Criteria

This design is complete when:

- the first TUI frame shows a branded `Expecto CLI` welcome card instead of the old plain text welcome paragraph
- the card matches the approved Claude-like structure
- the mascot reads as the approved badger direction, with yellow chin, gray mist, and sparse blue accents
- the card remains readable in a standard `80`-column terminal
- the content is English only
- fake or nonexistent commands are not shipped as real tips
- the welcome item still disappears once real timeline activity begins
