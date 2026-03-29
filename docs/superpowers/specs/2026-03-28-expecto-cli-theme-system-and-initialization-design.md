# Expecto CLI Theme System And Initialization Design

## Context

The current TUI has a single unthemed startup experience:

- one default welcome item
- hardcoded renderer colors
- no persisted UI theme preference
- no first-run setup flow
- no command for switching theme after startup

The previously approved `Expecto CLI` welcome direction established the first visual identity: a Hufflepuff badger welcome card. That is now only the first theme, not the whole system.

This design expands the scope from "one branded welcome screen" to "a stable theme framework that can host all four school themes without rewiring the TUI each time."

## Goal

Build a theme system that supports:

- a required first-run theme selection page
- persisted local theme preference
- `/theme` as the re-entry point for changing theme later
- a data-driven first implementation for `Hufflepuff`
- forward compatibility for the remaining three school themes

The main success condition is architectural: after this lands, adding Gryffindor, Ravenclaw, and Slytherin should primarily be theme-data work, not a second structural refactor.

## Locked Decisions

The following decisions are now locked:

- first launch shows a dedicated theme initialization page
- theme choice is required before entering the normal main TUI
- moving selection on the left updates the right-side sample live
- `Enter` saves the currently selected theme and continues immediately
- there is no second confirmation step
- after the first choice, later theme switching happens via `/theme`
- the left rail shows only house name, animal, and palette
- the right sample includes both the welcome card and one semantic highlight sample row
- `Hufflepuff` is the only fully implemented theme in the first delivery
- the framework must be compatible with all four school themes from the start

## Product Behavior

### First Launch

If no saved theme preference exists, interactive TUI startup opens a theme initialization surface before the normal welcome/transcript experience.

Behavior contract:

- the user cannot enter normal prompt mode before choosing a theme
- the initialization surface is keyboard-driven
- up/down changes the highlighted house
- the right-side sample updates immediately with the current selection
- `Enter` persists the selected theme and enters the normal TUI

### Later Launches

If a saved theme preference exists:

- startup skips the initialization surface
- the TUI starts directly into the normal themed welcome view

### Re-Entry Through `/theme`

When the user runs `/theme`:

- the TUI opens the same theme selection surface again
- the current saved theme is preselected
- applying a new choice updates local config and the active in-memory theme immediately

For the first implementation, `/theme` is still a required-choice surface. If the user wants to keep the current theme, they can press `Enter` on the already selected entry.

## Theme System Contract

Themes are data-first, not renderer-first.

The system should revolve around a single theme definition contract that drives:

- theme identity metadata for the selector
- welcome page mascot and copy
- palette values for renderer chrome
- semantic highlight colors
- future expansion to other theme-specific assets

## Theme Definition Shape

Each theme definition should provide explicit structured data for these areas.

### Identity

- stable theme id
- display name
- house animal
- palette label for the selector
- availability state

Availability must be explicit because the first implementation only ships one full theme.

Recommended states:

- `available`
- `planned`

### Welcome Assets

- welcome title/subtitle copy
- mascot glyph lines
- per-segment color intent for the glyph
- right-side sample content

The actual welcome screen and the initialization preview must both read from the same welcome asset model so they do not drift.

### Palette Roles

Palette values must be semantic roles, not ad hoc per-renderer color constants.

Required role groups:

- primary accent chrome
- muted neutral chrome
- transcript body text
- footer accent
- selection accent
- semantic token colors for `command`, `path`, `shortcut`, and `status`
- mascot color zones

Renderers may translate these roles differently, but the roles themselves must stay stable.

## First Delivery Scope

### Hufflepuff

`Hufflepuff` is the only full theme in the first delivery.

It owns:

- the approved badger mascot
- the yellow and gray palette direction
- sparse cool-blue mystical accent in the mascot only
- the first complete welcome sample
- the first full semantic highlight mapping

### Remaining Houses

`Gryffindor`, `Ravenclaw`, and `Slytherin` must appear in the selector from day one because the approved initialization layout uses a four-house left rail.

First-release behavior:

- all four houses are visible in the selector
- only `Hufflepuff` is fully applicable
- the remaining three entries are clearly marked as planned or unavailable
- moving onto those entries still updates the right-side sample area, but it may render a planned-theme preview state rather than a final themed welcome card

The important constraint is that adding those themes later should not require changes to the TUI state model, command model, or renderer API shape.

## Persistence Contract

Theme preference should live in a dedicated local user config store, not inside provider credential env parsing.

Why:

- provider secrets and UI preferences are different concerns
- theme should not be modeled as an env override surface by default
- later UI settings can share the same config store cleanly

Recommended location:

- `~/.beta-agent/config.json`

Recommended persisted field:

- `themeId`

The persistence layer must expose a narrow load/save interface so tests can inject a fake store.

## State Model Contract

The TUI needs two distinct concepts:

- the active theme
- whether the theme picker overlay is open

The picker should not be smuggled through normal transcript items.

Instead, use a dedicated state branch plus a dedicated view-model overlay branch.

Recommended state concepts:

- `activeThemeId`
- `themePicker` or equivalent overlay state

The picker state should include:

- whether it is active
- why it was opened: `first_launch` or `command`
- the currently highlighted theme id
- the list of visible theme ids

## View-Model And Rendering Contract

### Overlay Model

The existing `overlay: null` slot in the TUI view model should become the main hook for the theme picker.

That overlay should be structured, not pre-rendered text.

It should carry:

- left rail entries
- active selection id
- right-side sample welcome data
- footer control hints
- blocking/required state

### Normal Welcome Rendering

The post-selection welcome screen should read from the active theme definition.

That means the existing `Expecto CLI` welcome work is no longer a one-off card. It becomes the Hufflepuff implementation of a shared themed welcome contract.

### Renderer Parity

Both renderers must consume the same theme abstraction:

- sticky terminal renderer
- blessed renderer

Parity requirements:

- same selector information architecture
- same current theme selection
- same welcome mascot proportions
- same semantic color intent
- same `/theme` behavior

Exact line art and color encoding can vary slightly by renderer constraints, but the data model must be shared.

## Input Contract

While the theme picker is active:

- normal prompt typing is suppressed
- up/down move the highlighted theme
- `Enter` applies the highlighted theme
- `Ctrl+C` keeps its session-interrupt / exit behavior contract

The existing selection actions should be reused where reasonable instead of inventing a second navigation system.

## Command Contract

Add a built-in `/theme` command.

`/theme` is a local TUI command, not a provider request.

Its responsibility is:

- open the theme picker overlay
- preselect the current theme
- let the user apply a new theme locally

This should flow through the built-in command effect system rather than bypassing command execution in ad hoc UI code.

## Compatibility Contract

Compatibility means later themes plug into the existing framework by supplying theme data, not by redefining logic.

The following must be stable before adding later themes:

- theme registry interface
- theme preference store interface
- TUI state and overlay model shape
- `/theme` command effect shape
- renderer palette role contract
- welcome asset contract

If those interfaces hold, future work should mainly be:

- add theme definition file
- add mascot glyph and palette data
- extend tests with the new theme cases

## Out Of Scope

- finishing Gryffindor, Ravenclaw, and Slytherin assets
- non-interactive CLI theming
- user-facing CLI flags for theme selection
- redesigning provider/session configuration
- changing the main-screen, non-alternate-screen interaction model

## Acceptance Criteria

This design is complete when:

- first launch requires the user to choose a theme before entering the TUI
- the selected theme is persisted to local config
- later launches respect the saved theme automatically
- `/theme` reopens the selector and applies the new theme locally
- Hufflepuff is implemented as a real theme using the shared framework
- theme color and mascot data flow through shared contracts rather than renderer-specific hardcoding
- the remaining three school themes can be added later without changing the core theme system interfaces
