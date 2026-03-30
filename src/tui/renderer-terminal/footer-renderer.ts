import type { TuiFooterView } from "../view-model/tui-view-types.ts";
import { padOrTrimToWidth, wrapPlainText } from "./text-layout.ts";

type RgbColor = [number, number, number];

type AnsiStyle = {
  fg?: RgbColor;
  bg?: RgbColor;
  bold?: boolean;
  dim?: boolean;
};

export type FooterRenderOptions = {
  width: number;
  composerHeight: number;
};

export type RenderedFooter = {
  lines: string[];
  composerBodyTop: number;
  composerBodyHeight: number;
  composerContentColumn: number;
  composerContentWidth: number;
};

const FRAME_SIDE_WIDTH = 4;
const FRAMED_CONTENT_COLUMN = 3;
const COMPOSER_BODY_TOP = 1;

function createAnsiOpen(style: AnsiStyle): string {
  const codes: number[] = [];

  if (style.bold) {
    codes.push(1);
  }

  if (style.dim) {
    codes.push(2);
  }

  if (style.fg) {
    codes.push(38, 2, ...style.fg);
  }

  if (style.bg) {
    codes.push(48, 2, ...style.bg);
  }

  return codes.length === 0 ? "" : `\u001b[${codes.join(";")}m`;
}

function styleText(text: string, style: AnsiStyle | null): string {
  if (style === null || text.length === 0) {
    return text;
  }

  const open = createAnsiOpen(style);

  if (open === "") {
    return text;
  }

  return `${open}${text}\u001b[0m`;
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;

  if (normalized.length !== 6) {
    return [255, 255, 255];
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function renderLabeledFrameLine(
  width: number,
  leftCorner: string,
  rightCorner: string,
  label: string,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return leftCorner;
  }

  const innerWidth = Math.max(0, width - 2);
  const visibleLabel = label.slice(0, innerWidth);
  const fillerWidth = Math.max(0, innerWidth - visibleLabel.length);

  return `${leftCorner}${visibleLabel}${"─".repeat(fillerWidth)}${rightCorner}`;
}

function renderFramedBodyLine(content: string, width: number): string {
  if (width < FRAME_SIDE_WIDTH) {
    return padOrTrimToWidth(content, width);
  }

  const contentWidth = Math.max(1, width - FRAME_SIDE_WIDTH);
  return `│ ${padOrTrimToWidth(content, contentWidth)} │`;
}

function renderStyledFrameLine(
  width: number,
  leftCorner: string,
  rightCorner: string,
  label: string,
  borderStyle: AnsiStyle | null,
  innerStyle: AnsiStyle | null,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return styleText(leftCorner, borderStyle);
  }

  const innerWidth = Math.max(0, width - 2);
  const visibleLabel = label.slice(0, innerWidth);
  const fillerWidth = Math.max(0, innerWidth - visibleLabel.length);
  const inner = `${visibleLabel}${"─".repeat(fillerWidth)}`;

  if (borderStyle === null && innerStyle === null) {
    return `${leftCorner}${inner}${rightCorner}`;
  }

  return `${styleText(leftCorner, borderStyle)}${styleText(inner, innerStyle)}${styleText(rightCorner, borderStyle)}`;
}

function renderStyledBodyLine(
  content: string,
  width: number,
  borderStyle: AnsiStyle | null,
  contentStyle: AnsiStyle | null,
): string {
  if (width < FRAME_SIDE_WIDTH) {
    return styleText(padOrTrimToWidth(content, width), contentStyle);
  }

  const contentWidth = Math.max(1, width - FRAME_SIDE_WIDTH);
  const paddedContent = padOrTrimToWidth(content, contentWidth);

  if (borderStyle === null && contentStyle === null) {
    return `│ ${paddedContent} │`;
  }

  return `${styleText("│ ", borderStyle)}${styleText(paddedContent, contentStyle)}${styleText(" │", borderStyle)}`;
}

export function renderFooter(view: TuiFooterView, options: FooterRenderOptions): RenderedFooter {
  const width = normalizePositiveInteger(options.width, 1);
  const composerHeight = normalizePositiveInteger(options.composerHeight, 1);
  const composerBackground = view.theme === undefined ? null : hexToRgb(view.theme.palette.surface.composerBg);
  const borderStyle = view.theme === undefined
    ? null
    : {
        fg: hexToRgb(view.theme.palette.chrome.footer),
        bold: true,
      } satisfies AnsiStyle;
  const frameInnerStyle = view.theme === undefined || composerBackground === null
    ? null
    : {
        fg: hexToRgb(view.theme.palette.chrome.footer),
        bg: composerBackground,
        bold: true,
      } satisfies AnsiStyle;
  const composerBodyStyle = view.theme === undefined || composerBackground === null
    ? null
    : {
        fg: hexToRgb(view.theme.palette.text.muted),
        bg: composerBackground,
      } satisfies AnsiStyle;
  const pickerEntry = view.themePicker?.entries.find((entry) => entry.selected)
    ?? view.themePicker?.entries.find((entry) => entry.id === view.themePicker?.selectedThemeId)
    ?? null;
  const pickerLines = view.themePicker === undefined
    ? null
    : [
        pickerEntry
          ? `${pickerEntry.displayName} · ${pickerEntry.animal} · ${pickerEntry.paletteLabel}`
          : "Theme preview",
        "Use ↑↓ to move",
        pickerEntry?.availability === "planned"
          ? "Preview only · not yet available"
          : "Enter apply",
        view.themePicker.required
          ? "Required before entering the Room of Requirement"
          : "Press /theme any time",
      ];
  const composerText = pickerLines
    ? pickerLines.join("\n")
    : view.composer.value === ""
      ? "Write a prompt"
      : view.composer.value;
  const composerContentWidth = width < FRAME_SIDE_WIDTH ? width : Math.max(1, width - FRAME_SIDE_WIDTH);
  const composerContentColumn = width < FRAME_SIDE_WIDTH ? 1 : FRAMED_CONTENT_COLUMN;

  const composerLines = wrapPlainText(composerText, composerContentWidth);
  const visibleComposer = composerLines.slice(-composerHeight).map((line) =>
    renderStyledBodyLine(line, width, borderStyle, composerBodyStyle)
  );

  while (visibleComposer.length < composerHeight) {
    visibleComposer.push(renderStyledBodyLine("", width, borderStyle, composerBodyStyle));
  }

  return {
    lines: [
      renderStyledFrameLine(
        width,
        "╭",
        "╮",
        view.themePicker ? " Theme Picker " : " Composer ",
        borderStyle,
        frameInnerStyle,
      ),
      ...visibleComposer,
      renderStyledFrameLine(
        width,
        "╰",
        "╯",
        ` Status: ${view.status.runtimeLabel} `,
        borderStyle,
        frameInnerStyle,
      ),
    ],
    composerBodyTop: COMPOSER_BODY_TOP,
    composerBodyHeight: composerHeight,
    composerContentColumn,
    composerContentWidth,
  };
}
