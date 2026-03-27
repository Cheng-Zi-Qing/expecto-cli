import type { MarkdownBlock } from "../block-model/block-types.ts";
import { createTextToken } from "../block-model/text-tokens.ts";
import type { TimelineItem, TimelineItemKind } from "../tui-types.ts";
import { parseMarkdownBlocks } from "./markdown-blocks.ts";

export type BadgeRowBlock = {
  kind: "badge_row";
  badges: string[];
};

export type TranscriptBlock = {
  kind: "transcript_block";
  lines: string[];
};

export type TimelineCardBlock = MarkdownBlock | BadgeRowBlock | TranscriptBlock;

export type TimelineCard = {
  id: string;
  kind: TimelineItemKind;
  summary: string;
  headerLabel: string;
  selected: boolean;
  collapsed: boolean;
  blocks: TimelineCardBlock[];
};

const HEADER_LABELS: Record<TimelineItemKind, string> = {
  welcome: "Welcome",
  system: "System",
  user: "User",
  assistant: "Assistant",
  execution: "Execution",
};

const getHeaderLabel = (kind: TimelineItemKind): string => {
  const label = HEADER_LABELS[kind];
  if (label === undefined) {
    throw new Error(`Unknown timeline kind: ${kind}`);
  }
  return label;
};

const hasUsableText = (value: string | undefined): value is string => {
  return value !== undefined && value.trim().length > 0;
};

const selectCardText = (item: Pick<TimelineItem, "body" | "summary">): string => {
  if (hasUsableText(item.body)) {
    return item.body;
  }
  if (hasUsableText(item.summary)) {
    return item.summary;
  }
  return "";
};

const buildMarkdownBlocks = (item: TimelineItem): MarkdownBlock[] => {
  const source = selectCardText(item);
  if (!source.trim()) {
    return [];
  }

  return parseMarkdownBlocks(source);
};

const buildParagraphBlock = (source: string): MarkdownBlock[] => {
  if (!source.trim()) {
    return [];
  }

  return [
    {
      kind: "paragraph",
      tokens: [createTextToken("default", source)],
    },
  ];
};

const buildTranscriptBlock = (body: string): TranscriptBlock => {
  const normalized = body.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n").map((line) => {
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  });
  if (normalized.endsWith("\n") && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return {
    kind: "transcript_block",
    lines,
  };
};

function buildTranscriptLinesFromBuffer(item: TimelineItem): string[] {
  const buffer = item.executionTranscript;

  if (buffer === undefined) {
    return [];
  }

  const overlapCount = Math.max(
    0,
    buffer.headLines.length +
      buffer.tailLines.length -
      buffer.totalCommittedLineCount,
  );
  const committedLines =
    buffer.omittedLineCount > 0
      ? [
          ...buffer.headLines,
          `... ${buffer.omittedLineCount} lines omitted ...`,
          ...buffer.tailLines,
        ]
      : [...buffer.headLines, ...buffer.tailLines.slice(overlapCount)];

  const pendingFragment = buffer.pendingFragment.replaceAll("\r", "");

  if (pendingFragment.length > 0) {
    committedLines.push(pendingFragment);
  }

  return committedLines;
}

const buildBlocks = (item: TimelineItem, collapsed: boolean): TimelineCardBlock[] => {
  if (
    item.kind === "welcome" ||
    item.kind === "user" ||
    item.kind === "system"
  ) {
    return buildParagraphBlock(selectCardText(item));
  }

  if (item.kind === "assistant") {
    return buildMarkdownBlocks(item);
  }

  if (item.kind === "execution") {
    if (collapsed) {
      return [];
    }

    const transcriptLines = buildTranscriptLinesFromBuffer(item);

    if (transcriptLines.length > 0) {
      return [
        {
          kind: "transcript_block",
          lines: transcriptLines,
        },
      ];
    }

    if (item.body === undefined || item.body === "") {
      return [];
    }

    return [buildTranscriptBlock(item.body)];
  }

  return [];
};

export const buildTimelineCards = (
  timeline: TimelineItem[],
  selectedIndex: number,
): TimelineCard[] => {
  return timeline.map((item, index) => {
    const collapsed = item.collapsed ?? false;

    return {
      id: item.id,
      kind: item.kind,
      summary: item.summary,
      headerLabel: getHeaderLabel(item.kind),
      selected: index === selectedIndex,
      collapsed,
      blocks: buildBlocks(item, collapsed),
    };
  });
};
