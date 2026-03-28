# Expecto CLI Command System Design

## Context

The current command support works, but it is still closer to a small collection of built-ins than to a stable command system.

Today the codebase already contains short slash commands such as:

- `/help`
- `/clear`
- `/status`
- `/branch`
- `/inspect`
- `/theme`
- `/exit`

That is enough to prove the interaction model, but not enough to support the next phase cleanly.

The current gaps are architectural and behavioral:

- command metadata is not yet modeled as a long-lived framework
- help output is tied to the raw built-in list rather than a command registry contract
- future categories such as debug commands do not yet have a stable place in the model
- the command menu and command execution path need a clearer shared source of truth
- command inputs must never be ambiguous with model prompts

This design introduces a stable command framework while only formalizing the first practical batch of commands in the current delivery.

## Goal

Build a command framework that:

- keeps the user-facing command syntax short and easy to type
- models commands internally as categorized, stable descriptors
- uses one registry as the shared source of truth for help, menu discovery, and execution lookup
- routes commands locally and prevents slash commands from leaking into the model path
- formalizes the first supported command set without overcommitting to future debug or config features

The main success condition is structural: after this lands, adding commands should primarily be descriptor and handler work, not a second refactor of parsing, help, menu behavior, and runtime routing.

## Locked Decisions

The following decisions are now locked:

- users continue to type short commands such as `/help` and `/exit`
- internal code uses categorized command descriptors rather than ad hoc command lists
- `/help` shows only implemented commands
- planned commands remain internal and are not shown in `/help`
- the first formally supported commands are:
  - `/help`
  - `/status`
  - `/clear`
  - `/theme`
  - `/branch`
  - `/exit`
- `/inspect` remains outside the first formal command batch
- command execution returns standard effects; it does not mutate TUI state directly
- any slash-prefixed unknown command is handled locally and must not be sent to the model
- bare `exit` and `quit` remain interactive aliases for `/exit`

## Scope

### First Formal Command Set

The first delivery of the framework formally supports two visible categories.

#### Session

- `/help`
- `/status`
- `/clear`
- `/theme`
- `/exit`

#### Project

- `/branch`

### Reserved Category

The framework must reserve a third category:

- `debug`

It is intentionally not exposed in `/help` for this delivery because no debug command is being promoted to the first formal support tier yet.

## User-Facing Command Model

The user-facing syntax remains flat and short.

Examples:

- `/help`
- `/status`
- `/clear`
- `/theme`
- `/branch`
- `/exit`

This is a deliberate product decision.

Users should not be forced into namespaced command syntax such as `/session help` or `/project branch` while the command set is still compact. The internal system should carry the organization burden so the user interaction stays lightweight.

## Internal Command Identity

Although the typed commands remain short, the implementation should use stable internal ids.

Recommended internal ids:

- `session.help`
- `session.status`
- `session.clear`
- `session.theme`
- `session.exit`
- `project.branch`

This gives the system three useful properties:

- command identity stays stable even if user-facing aliases change
- tests can target semantic command ids instead of display strings
- future category-specific behavior can be added without renaming the external interface

## Command Descriptor Contract

Each command should be defined as structured metadata.

Recommended shape:

```ts
type CommandCategory = "session" | "project" | "debug";

type CommandAvailability = "implemented" | "planned" | "hidden";

type CommandDescriptor = {
  id: CommandId;
  category: CommandCategory;
  name: `/${string}`;
  aliases: `/${string}`[];
  description: string;
  usage?: string;
  availability: CommandAvailability;
};
```

Design constraints:

- descriptors carry metadata only
- descriptors do not perform execution
- descriptors must be stable enough to drive help output and command menu rendering
- future planned commands may exist in the registry as `planned` or `hidden` without becoming user-visible in the current help surface

## Registry Contract

The registry becomes the single source of truth for command metadata.

Recommended responsibilities:

- list all descriptors
- list implemented descriptors
- list implemented descriptors by category
- resolve a typed command or alias to a descriptor
- provide a structured help model

Recommended public entry points:

- `listAllCommands()`
- `listImplementedCommands()`
- `listImplementedCommandsByCategory()`
- `findCommandByInput(name: string)`
- `createHelpSections()` or equivalent

The important architectural constraint is that both `/help` and the slash command menu must read from this same registry layer.

That avoids two common failures:

- help and menu drifting apart
- execution supporting commands that discovery surfaces do not know about

## Parsing And Routing Rules

Command routing must be deterministic.

### Rule 1: Implemented Slash Commands

If the input starts with `/` and resolves to an implemented command:

- execute locally
- do not send it to the model

### Rule 2: Unknown Slash Commands

If the input starts with `/` and does not resolve to an implemented command:

- handle it locally
- do not send it to the model
- render a local error message

Recommended output:

```text
Unknown command: /foo
Run /help to see available commands.
```

### Rule 3: Normal Prompts

If the input does not start with `/`:

- treat it as a normal model prompt

### Rule 4: Interactive Exit Aliases

The interactive shortcuts:

- `exit`
- `quit`

must normalize to `/exit` before execution.

No other bare-word aliases should be introduced in this delivery.

## Help Output Contract

`/help` should remain simple, grouped, and renderer-neutral.

It should:

- show only implemented commands
- group commands by visible category
- keep category order stable
- keep one command per line with a short description
- avoid exposing planned or hidden commands

Recommended output model:

```text
Available commands

Session
/help    Show available commands
/status  Show current session status
/clear   Clear the current conversation
/theme   Open the theme picker
/exit    Exit the interactive session

Project
/branch  Show the current git branch
```

This output should be emitted as local system messages rather than as a bespoke widget.

Why:

- it works the same way in sticky terminal and blessed
- it leaves transcript history visible
- it keeps the help system compatible with copy, scrollback, and transcript rendering

## Slash Command Menu Contract

The slash command menu is a discovery surface, not a second command interpreter.

### Visibility Rules

The menu is visible when:

- the draft starts with `/`
- the draft contains no whitespace after the command name

Examples:

- `/`
- `/h`
- `/sta`

The menu hides when:

- the draft is not slash-prefixed
- the draft contains command arguments, such as `/branch main`

### Content Rules

The menu shows:

- only implemented commands
- only commands matching the current prefix

It does not show:

- planned commands
- hidden commands
- commands from a separate static list outside the registry

### Interaction Rules

The menu supports:

- up/down to move the highlighted suggestion
- passive browsing of suggestions

The menu does not change the meaning of `Enter`.

`Enter` must always submit the current draft exactly as typed.

That means:

- typing `/help` and pressing `Enter` executes `/help`
- typing `/exit` and pressing `Enter` executes `/exit`
- the highlighted menu item does not replace the draft

This is a critical rule because command discovery must never interfere with command execution.

### Non-Goals For This Delivery

The menu does not need to support:

- tab completion
- inline usage previews
- argument-aware completions
- planned command previews

## Execution Contract

Command execution should remain renderer-neutral and runtime-neutral.

The executor should return standardized effects rather than directly touching TUI state.

Recommended effect set for this delivery:

```ts
type CommandExecutionEffect =
  | { type: "system_message"; line: string }
  | { type: "clear_conversation" }
  | { type: "open_theme_picker" }
  | { type: "exit_session" }
  | { type: "execution_item"; summary: string; body?: string };
```

### First Delivery Mapping

#### `session.help`

Returns:

- one heading line
- grouped command lines as `system_message`

#### `session.status`

Returns:

- current session summary lines as `system_message`

#### `session.clear`

Returns:

- `clear_conversation`
- confirmation `system_message`

#### `session.theme`

Returns:

- `open_theme_picker`

#### `session.exit`

Returns:

- `exit_session`

#### `project.branch`

Returns:

- one `system_message` with the resolved branch
- one `execution_item` describing the underlying local command output

## Runtime Consumption Contract

The command system must stop at effects.

The runtime and TUI layers remain responsible for consuming those effects:

- runtime session interprets the effects
- TUI reducers update local state through existing action paths
- renderers react only to state changes, not command names

This separation is important because the same command behavior must remain consistent across:

- the plain runtime path
- sticky terminal presentation
- blessed presentation

## Error Handling Contract

Unknown slash commands are local errors, not prompts.

Required behavior:

- no model call
- no fake assistant step
- no silent ignore
- clear user-facing error text

Recommended exact text:

```text
Unknown command: /foo
Run /help to see available commands.
```

This should be treated as a system-style local message so it behaves consistently with the rest of the command surfaces.

## Testing Contract

The framework should be covered at multiple levels.

### Registry Tests

Verify:

- implemented commands are grouped correctly
- internal ids are stable
- `/help` only exposes implemented commands
- hidden or planned commands do not appear in visible listings

### Executor Tests

Verify:

- each formal command maps to the expected effect set
- unknown slash commands produce the local error effect
- `/exit` yields `exit_session`

### Runtime Session Tests

Verify:

- slash commands never reach the assistant step
- bare `exit` and `quit` normalize to `/exit`
- unknown slash commands stay local

### Interactive TUI Tests

Verify:

- `/help` appears in the timeline as local system output
- `/exit` closes the session from the real interactive path
- the command menu uses the registry as its source
- `Enter` submits the typed draft rather than applying the selected menu item

## Non-Goals

This design does not include:

- promoting `/inspect` into the first supported command batch
- building a debug command family in this delivery
- adding tab completion
- adding argument parsing beyond current simple needs
- adding fuzzy matching or did-you-mean suggestions
- exposing planned commands in `/help`

## Success Criteria

This design is successful when:

- the command system has one metadata registry and one execution contract
- the first formal command batch is clearly modeled and stable
- `/help` and the slash command menu read from the same source of truth
- slash-prefixed unknown inputs never leak into the model path
- `/help` and `/exit` work reliably from the real interactive TUI path
- future commands can be added without reworking parsing, help, and menu behavior again
