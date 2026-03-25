# V1 Provider Architecture

## Provider Strategy

`beta-agent` should not be designed around hard-coded model names.

It should be designed around:

- provider families
- capability flags
- routing by role

## V1 Required Providers

### 1. Anthropic native

Required because:

- the CLI interaction model is heavily inspired by Claude Code
- Anthropic models are a first-class target for code-agent behavior

### 2. OpenAI native

Required because:

- OpenAI models are a core competitive baseline
- Codex-style usage should be supported through the OpenAI family

### 3. OpenAI-compatible generic

Required because:

- it gives low-cost access to a wide range of providers and local gateways
- it avoids writing many provider-specific adapters too early

Examples this can later cover:

- OpenRouter-backed endpoints
- DeepSeek-compatible endpoints
- Qwen-compatible endpoints
- Kimi-compatible endpoints
- local gateways such as vLLM, LM Studio, or Ollama bridges

## Explicit V1 Non-Goals

- no large matrix of native provider adapters
- no provider-specific runtime branching inside core logic
- no hard-coded model names throughout the system

## V1.5 Candidates

- Gemini native adapter
- improved local model adapter support
- multi-provider fallback / health-aware routing

## Core Abstraction

```ts
interface ModelProvider {
  id: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  supportsLongContext?: boolean;

  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
```

## Role-Based Routing

Do not route by raw model name in core logic.

Route by role:

```ts
type ModelRole =
  | "main"
  | "fast"
  | "reviewer"
  | "planner"
  | "summarizer"
  | "observer";
```

Then let config map roles to provider/model pairs.

Example:

```toml
[routing]
main = "anthropic:sonnet"
fast = "openai:fast"
reviewer = "anthropic:review"
planner = "openai:reasoning"
summarizer = "openai-compatible:cheap"
observer = "openai-compatible:cheap"
```

## Why Codex Is Not a Separate Runtime Family

Treat Codex-style support as:

- an OpenAI-family coding profile
- or a routed model choice under the OpenAI adapter

Do not build a separate runtime abstraction just for "Codex."

## Benefits

This design gives:

- cleaner runtime contracts
- easier model swaps
- cheaper role-based execution
- future fallback and routing support
- less provider lock-in

## Interaction With Other Specs

- `v1-tech-stack.md`
- `v1-cli-spec.md`
- future contract specs under `src/contracts/`

## Open Follow-Up Questions

- exact provider config schema
- capability normalization strategy
- fallback policy per role
- how tool-calling differences are normalized across providers
