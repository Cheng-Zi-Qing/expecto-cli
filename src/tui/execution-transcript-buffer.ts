export interface ExecutionTranscriptBuffer {
  headLineLimit: number;
  tailLineLimit: number;
  headLines: readonly string[];
  tailLines: readonly string[];
  omittedLineCount: number;
  pendingFragment: string;
  totalCommittedLineCount: number;
}

export interface CreateExecutionTranscriptBufferOptions {
  headLineLimit?: number;
  tailLineLimit?: number;
}

const DEFAULT_HEAD_LINE_LIMIT = 100;
const DEFAULT_TAIL_LINE_LIMIT = 2000;

export function createExecutionTranscriptBuffer(
  options: CreateExecutionTranscriptBufferOptions = {},
): ExecutionTranscriptBuffer {
  return {
    headLineLimit: normalizeLimit(options.headLineLimit, DEFAULT_HEAD_LINE_LIMIT),
    tailLineLimit: normalizeLimit(options.tailLineLimit, DEFAULT_TAIL_LINE_LIMIT),
    headLines: [],
    tailLines: [],
    omittedLineCount: 0,
    pendingFragment: "",
    totalCommittedLineCount: 0,
  };
}

export function appendTranscriptChunk(
  buffer: ExecutionTranscriptBuffer,
  output: string,
): ExecutionTranscriptBuffer {
  const { committedLines, pendingFragment: nextPendingFragment } =
    splitCommittedLines(buffer.pendingFragment, output);

  if (
    committedLines.length === 0 &&
    nextPendingFragment === buffer.pendingFragment
  ) {
    return buffer;
  }

  const nextTotalCommittedLineCount =
    buffer.totalCommittedLineCount + committedLines.length;

  const headLines = appendHeadLines(buffer, committedLines);
  const tailLines = appendTailLines(buffer, committedLines);

  return {
    ...buffer,
    headLines,
    tailLines,
    omittedLineCount: computeOmittedLineCount(
      nextTotalCommittedLineCount,
      buffer.headLineLimit,
      buffer.tailLineLimit,
    ),
    pendingFragment: nextPendingFragment,
    totalCommittedLineCount: nextTotalCommittedLineCount,
  };
}

function appendHeadLines(
  buffer: ExecutionTranscriptBuffer,
  committedLines: string[],
): readonly string[] {
  const remainingHeadCapacity = buffer.headLineLimit - buffer.headLines.length;

  if (remainingHeadCapacity <= 0 || committedLines.length === 0) {
    return buffer.headLines;
  }

  return [
    ...buffer.headLines,
    ...committedLines.slice(0, remainingHeadCapacity),
  ];
}

function appendTailLines(
  buffer: ExecutionTranscriptBuffer,
  committedLines: string[],
): readonly string[] {
  if (buffer.tailLineLimit === 0) {
    return [];
  }

  if (committedLines.length === 0) {
    return buffer.tailLines;
  }

  const merged = [...buffer.tailLines, ...committedLines];

  if (merged.length <= buffer.tailLineLimit) {
    return merged;
  }

  return merged.slice(-buffer.tailLineLimit);
}

function computeOmittedLineCount(
  totalCommittedLineCount: number,
  headLineLimit: number,
  tailLineLimit: number,
): number {
  const retainedHeadCount = Math.min(headLineLimit, totalCommittedLineCount);
  const retainedTailCount = Math.min(tailLineLimit, totalCommittedLineCount);
  const overlapCount = Math.max(
    0,
    retainedHeadCount + retainedTailCount - totalCommittedLineCount,
  );
  const retainedUniqueCount =
    retainedHeadCount + retainedTailCount - overlapCount;
  return Math.max(0, totalCommittedLineCount - retainedUniqueCount);
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function splitCommittedLines(
  pendingFragment: string,
  output: string,
): {
  committedLines: string[];
  pendingFragment: string;
} {
  const committedLines: string[] = [];
  let currentLinePrefix = pendingFragment;
  let segmentStart = 0;

  if (currentLinePrefix.endsWith("\r")) {
    if (output.length === 0) {
      return { committedLines, pendingFragment: currentLinePrefix };
    }

    currentLinePrefix = currentLinePrefix.slice(0, -1);

    if (output.startsWith("\n")) {
      committedLines.push(currentLinePrefix);
      currentLinePrefix = "";
      segmentStart = 1;
    } else {
      committedLines.push(currentLinePrefix);
      currentLinePrefix = "";
    }
  }

  for (let index = segmentStart; index < output.length; index += 1) {
    const character = output[index];

    if (character === "\n") {
      committedLines.push(currentLinePrefix + output.slice(segmentStart, index));
      currentLinePrefix = "";
      segmentStart = index + 1;
      continue;
    }

    if (character !== "\r") {
      continue;
    }

    const lineSegment = output.slice(segmentStart, index);

    if (index + 1 >= output.length) {
      return {
        committedLines,
        pendingFragment: currentLinePrefix + lineSegment + "\r",
      };
    }

    committedLines.push(currentLinePrefix + lineSegment);
    currentLinePrefix = "";

    if (output[index + 1] === "\n") {
      index += 1;
    }

    segmentStart = index + 1;
  }

  return {
    committedLines,
    pendingFragment: currentLinePrefix + output.slice(segmentStart),
  };
}
