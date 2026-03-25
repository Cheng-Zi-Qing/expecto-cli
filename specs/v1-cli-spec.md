# V1 CLI Spec

## Public Entry Surface

The public `v1` entry surface should stay minimal:

```text
beta
beta "<prompt>"
beta -p "<prompt>"
```

## Meaning

### `beta`

- enters interactive conversation mode
- loads project context
- resolves active docs
- defaults to `balanced` mode

### `beta "<prompt>"`

- enters interactive conversation mode
- injects the given string as the first user message
- preserves the same default loading behavior as bare `beta`

### `beta -p "<prompt>"`

- runs a one-shot, non-interactive execution
- uses the same context-loading path
- prints a final answer and exits

## Hidden/Advanced Surface

These can exist in `v1`, but should not define the public product feel:

- `beta --continue`
- `beta --resume <session>`
- `beta --json`
- `beta --mode <fast|balanced|strict>`

## Session-Level Slash Commands

The first built-ins to prioritize:

### Session / navigation

- `/help`
- `/clear`
- `/branch`
- `/rewind`
- `/exit`

### Context / docs / memory

- `/compact`
- `/context`
- `/memory`
- `/requirements`
- `/plan`
- `/task`
- `/summary`
- `/btw`

### Runtime / control

- `/status`
- `/config`
- `/permissions`
- `/sandbox`
- `/mode`

### Review / reporting

- `/review`
- `/insights`

## Design Constraints

- entering the CLI should feel immediate, not command-tree driven
- advanced flags should not dominate the help surface
- built-in commands and skill-backed workflow commands must be implemented separately
- session graph operations (`branch`, `rewind`) are first-class
- side-channel query (`btw`) is first-class
