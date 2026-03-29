# Expecto CLI Complete Three Themes Design

## Context

The current theme system already supports:

- a first-launch theme picker
- persisted local `themeId` preference
- `/theme` as a re-entry point
- renderer-level palette propagation
- a fully implemented `Hufflepuff` theme

What remains incomplete is the actual delivery of the other three school themes. `Gryffindor`, `Ravenclaw`, and `Slytherin` still exist only as `planned` placeholder definitions in the registry.

The goal of this work is not to redesign the theme system. The system contract is already in place and already works. The gap is that only one of the four visible themes is actually usable.

## Goal

Promote `Gryffindor`, `Ravenclaw`, and `Slytherin` from placeholder entries to fully usable, high-fidelity themes while preserving the current theme architecture, renderer APIs, and interaction model.

Success means:

- all four houses are selectable and appliable through the existing picker
- all four houses are selectable and can be applied through the existing picker
- all four houses render full welcome assets instead of preview placeholders
- all four houses drive the existing semantic palette roles cleanly
- the result feels cohesive with the current restrained terminal-native direction established by `Hufflepuff`

## Locked Decisions

The following decisions are locked for this work:

- the existing theme system contract remains unchanged
- this is a data-completion pass, not a second theme-system refactor
- all four themes use the same layout and interaction structure
- all new themes follow the restrained terminal-native visual direction
- welcome copy uses the same sentence pattern across all houses
- each new house gets its own complete five-line mascot glyph
- the right-side sample keeps the same structure and stable token set across themes
- renderer behavior, keybindings, and persistence behavior remain unchanged

## Scope

### In Scope

- adding complete theme definition files for `Gryffindor`, `Ravenclaw`, and `Slytherin`
- updating the registry so all four themes are `available`
- providing complete semantic palettes for all theme roles already defined in `ThemeDefinition`
- providing complete `welcome` and `sample` assets for the three new themes
- updating tests that currently assume three themes are still `planned`
- adding regression coverage proving the existing picker and application flow now works for all four themes

### Out Of Scope

- changing the `ThemeDefinition` type shape
- adding new palette roles
- redesigning the theme picker layout
- introducing house-specific renderer branches
- changing the welcome/sample information architecture
- adding new theme states beyond `available` and the existing current behavior
- reworking persistence or command handling

## Theme Contract

This work keeps the existing `ThemeDefinition` structure and fills it completely for the remaining three houses.

Each new theme definition must provide:

- `id`
- `displayName`
- `animal`
- `paletteLabel`
- `availability: "available"`
- complete `palette` values for all current semantic roles
- complete `welcome` data:
  - `title`
  - `subtitle`
  - `glyphRows`
- complete `sample` data:
  - `tipTitle`
  - `tipText`
  - `highlightTitle`
  - `highlightTokens`

No renderer should need to know which house it is rendering beyond reading the active theme definition through the existing registry and view-model flow.

## Visual Direction

The existing `Hufflepuff` theme establishes the visual target: composed, terminal-native, and readable over long sessions. The new themes should match that level of finish without becoming louder or more theatrical than the current product direction.

Rules for the three new themes:

- use house color families, but keep them softened enough for terminal-native presentation
- preserve high readability in transcript, footer, and overlay chrome
- let differentiation come from palette tuning, mascot silhouette, and subtle copy differences only where already approved
- avoid dramatic background treatment, neon contrast, or novelty styling

### Welcome Copy

The top-level welcome copy remains structurally uniform across all houses:

- title stays `Welcome back!`
- subtitle keeps the same sentence rhythm and only swaps house and animal identity

This preserves product consistency and prevents the themes from diverging through tone alone.

### Mascot Glyphs

Each of the three new themes gets its own full five-line mascot glyph.

Glyph requirements:

- compact and compatible with the current welcome layout
- terminal-native block/geometric character language
- visually distinct silhouette per animal
- finished enough to stand beside the existing Hufflepuff badger without feeling like a placeholder

### Sample Panel

The right-side sample structure remains shared across all houses.

The stable token set remains the same class of sample content already used by `Hufflepuff`:

- command token
- path token
- shortcut token
- status token

The implementation should keep the content structure and token set stable so the panel compares color semantics across houses rather than drifting into house-specific feature storytelling.

## File Boundaries

The implementation should add three concrete theme modules:

- `src/tui/theme/themes/gryffindor.ts`
- `src/tui/theme/themes/ravenclaw.ts`
- `src/tui/theme/themes/slytherin.ts`

The registry should then import those modules in `src/tui/theme/theme-registry.ts` and stop generating placeholder planned themes.

`src/tui/theme/theme-types.ts` should remain unchanged unless an implementation detail reveals a genuine mismatch, which is not expected for this scope.

## Runtime Behavior

The current runtime behavior remains intact.

### Theme Picker

The picker flow already exists and should not be redesigned:

- first launch opens the picker when no saved theme exists
- `/theme` reopens the picker later
- moving selection previews the chosen theme
- `Enter` applies the currently selected theme

The existing `available` guard remains in place. This work changes which themes satisfy that guard by promoting the three remaining houses to `available`.

### Welcome / Footer / Transcript Propagation

No new state branch or renderer-specific behavior is introduced.

Once the registry serves complete theme definitions for all four houses, the existing view-model pipeline should continue to project the active theme into:

- transcript rendering
- footer/composer chrome
- theme picker sample preview

This keeps the work aligned with the already-approved architectural goal: theme additions should primarily be data work.

## Testing Strategy

This work should prove that the existing system now fully supports four real themes instead of one real theme plus three placeholders.

### Registry And Asset Coverage

Update and extend theme registry tests to assert:

- all four themes are present
- all four themes are `available`
- each theme exposes stable identity metadata
- each theme exposes non-empty mascot glyph rows
- each theme exposes complete sample tokens
- key palette roles are populated for each theme

### Picker / View-Model Coverage

Update theme picker and footer/view-model tests to assert:

- picker entries for all four themes are `available`
- preview projection works with any selected house
- existing overlay/footer structures remain unchanged while reflecting the new data

### Application Flow Coverage

Update or extend interactive/TUI state tests to prove:

- first-launch selection can apply each of the new themes
- `/theme` can reopen and apply each of the new themes
- the `available` guard still blocks nothing in the four-house supported set because all four are now complete

## Risks And Controls

### Risk: Theme Quality Drift

If the three new themes are implemented too quickly, they may read as clearly weaker than `Hufflepuff`.

Control:

- treat each new theme as a finished artifact, not a placeholder upgrade
- verify mascot polish, subtitle consistency, and palette completeness explicitly in tests and review

### Risk: Hidden Structural Expansion

It may be tempting to add new theme fields while implementing house-specific flavor.

Control:

- keep the current contract fixed
- defer any idea that requires new theme roles or renderer branches to separate scoped work

### Risk: Regressions In Existing Picker Behavior

Changing availability assumptions may accidentally affect first-launch or `/theme` flow.

Control:

- add or update state and interactive tests around apply behavior
- keep the current `available` guard intact instead of bypassing it

## Acceptance Criteria

This design is complete when:

- `Gryffindor`, `Ravenclaw`, and `Slytherin` are implemented as full theme definitions
- all four themes are marked `available`
- all four themes can be previewed and applied through the existing picker
- all four themes render complete welcome/sample assets through the existing renderer flow
- no theme-system refactor is required to land the work
- test coverage is updated so the new four-theme behavior is explicit and protected
