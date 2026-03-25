import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TimelineItemKind } from "../tui-types.ts";

export type TuiBadgeRowBlock = {
  kind: "badge_row";
  badges: string[];
};

export type TuiTranscriptTextBlock = {
  kind: "transcript_block";
  lines: string[];
};

export type TuiTranscriptContentBlock =
  | MarkdownBlock
  | TuiBadgeRowBlock
  | TuiTranscriptTextBlock;

export type TuiTranscriptBlock = {
  id: string;
  kind: TimelineItemKind;
  summary: string;
  headerLabel: string;
  selected: boolean;
  collapsed: boolean;
  blocks: TuiTranscriptContentBlock[];
};

export type TuiTranscriptView = {
  blocks: TuiTranscriptBlock[];
};

export type TuiFooterView = {
  composer: {
    value: string;
    locked: boolean;
  };
  status: {
    runtimeLabel: string;
  };
};

export type TuiViewModel = {
  transcript: TuiTranscriptView;
  footer: TuiFooterView;
  overlay: null;
};
