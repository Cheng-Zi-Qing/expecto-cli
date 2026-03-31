import { attachmentPlaceholder } from "./tui-state.ts";
import type { DraftAttachment } from "./tui-types.ts";

export const ATTACHMENT_PASTE_LINE_THRESHOLD = 3;
export const ATTACHMENT_PASTE_CHAR_THRESHOLD = 150;

export function shouldConvertToAttachment(text: string): boolean {
  const lineCount = text.split("\n").length;
  return lineCount >= ATTACHMENT_PASTE_LINE_THRESHOLD || text.length >= ATTACHMENT_PASTE_CHAR_THRESHOLD;
}

export function attachmentLabel(attachment: DraftAttachment): string {
  return `[pasted text · ${attachment.lineCount} lines · ~${attachment.tokenCount} tokens]`;
}

export function expandDraftAttachments(draft: string, attachments: DraftAttachment[]): string {
  let result = draft;

  for (const att of attachments) {
    result = result.replaceAll(attachmentPlaceholder(att.id), att.content);
  }

  return result;
}

export function renderDraftForDisplay(draft: string, attachments: DraftAttachment[]): string {
  let result = draft;

  for (const att of attachments) {
    result = result.replaceAll(attachmentPlaceholder(att.id), attachmentLabel(att));
  }

  return result;
}

/**
 * Backspace-aware delete: if the cursor is right after an attachment placeholder,
 * remove the entire placeholder. Otherwise remove the last character.
 */
export function deleteLastDraftUnit(draft: string, attachments: DraftAttachment[]): string {
  for (const att of attachments) {
    const placeholder = attachmentPlaceholder(att.id);

    if (draft.endsWith(placeholder)) {
      return draft.slice(0, draft.length - placeholder.length);
    }
  }

  const characters = Array.from(draft);
  characters.pop();
  return characters.join("");
}
