import { Readable } from "node:stream";
import { TextDecoder } from "node:util";

const USER_INSTRUCTION_WRAPPER = "[User Instruction]";
const ADDITIONAL_CONTEXT_WRAPPER = "[Additional Context]";
const STDIN_ONLY_WRAPPER = `Please analyze the following input and provide the most helpful direct summary, code review, or bug-fix guidance:`;

type AssemblePromptFromPipelineOptions = {
  prompt?: string | undefined;
  stdinText: string;
};

export async function readAllStdin(input: Readable): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  let decoded = "";

  for await (const chunk of input) {
    if (typeof chunk === "string") {
      decoded += chunk;
      continue;
    }

    decoded += decoder.decode(chunk, { stream: true });
  }

  decoded += decoder.decode();
  return decoded;
}

export function assemblePromptFromPipeline(
  options: AssemblePromptFromPipelineOptions,
): string {
  const { prompt, stdinText } = options;
  const hasPrompt = prompt !== undefined;
  const hasStdin = stdinText.length > 0;

  if (hasPrompt && hasStdin) {
    return `${USER_INSTRUCTION_WRAPPER}\n${prompt}\n\n${ADDITIONAL_CONTEXT_WRAPPER}\n${stdinText}`;
  }

  if (hasPrompt) {
    return prompt;
  }

  if (hasStdin) {
    return `${STDIN_ONLY_WRAPPER}\n\n[Input]\n${stdinText}`;
  }

  return "";
}
