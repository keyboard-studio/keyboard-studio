// docSlots — the named values a documentation form can use (spec 102), the
// escapers that prepare them, and the markers around generated sections on
// Track 2.
//
// The forms themselves are content-owned data (`@keyboard-studio/contracts`
// DOC_FORMS); this module is the engine side of that contract. A form may
// reference only the ids in DOC_SLOT_IDS, which the forms check test enforces.

import { escapeHtml } from "./escapeHtml.js";

/**
 * Every value a form can insert. Each is a string already escaped for the
 * target file; an empty string counts as empty for `{{#id}}` blocks.
 * Adding a slot is non-breaking; renaming or removing one breaks the forms.
 */
export interface DocSlotModel {
  // identity
  displayName: string;
  keyboardId: string;
  languages: string;
  platforms: string;
  /** One source for every file that names a holder. */
  copyrightHolder: string;
  /** License form only. */
  year: string;
  docLang: string;
  helpPageUrl: string;
  /** Non-empty when the README has at least one link (homepage or help page), so the Links heading appears once. */
  hasLinks: string;
  /** helpSiteHeader(displayName); help form only. */
  helpHeader: string;
  // history
  /** History form only. */
  version: string;
  date: string;
  historyEntries: string;
  lineage: string;
  /** The start keyboard's HISTORY entries, Track 2 only. */
  inheritedHistory: string;
  // author answers (HelpDocsAnswers, meanings unchanged)
  description: string;
  /** Non-empty exactly when no description was answered and no prose was inherited, so a form can show its own fallback sentence. */
  noDescription: string;
  usageTips: string;
  credits: string;
  contactInfo: string;
  projectHomeUrl: string;
  projectHelpUrl: string;
  /** The opt-in battery, in its existing order. */
  additionalDetail: string;
  // inherited (Track 2 only)
  inheritedProse: string;
  // composition: the rendered body form, passed into welcome and help
  body: string;
  // derived (studio buildDocContent)
  typingGuide: string;
  mechanisms: string;
  layoutPictures: string;
  touchNotes: string;
  characterInventory: string;
}

export type DocSlotId = keyof DocSlotModel;

const SLOT_ID_RECORD: Record<DocSlotId, true> = {
  displayName: true,
  keyboardId: true,
  languages: true,
  platforms: true,
  copyrightHolder: true,
  year: true,
  docLang: true,
  helpPageUrl: true,
  hasLinks: true,
  helpHeader: true,
  version: true,
  date: true,
  historyEntries: true,
  lineage: true,
  inheritedHistory: true,
  description: true,
  noDescription: true,
  usageTips: true,
  credits: true,
  contactInfo: true,
  projectHomeUrl: true,
  projectHelpUrl: true,
  additionalDetail: true,
  inheritedProse: true,
  body: true,
  typingGuide: true,
  mechanisms: true,
  layoutPictures: true,
  touchNotes: true,
  characterInventory: true,
};

/** Every slot id a form may reference. Built from a total record, so a slot added to the model without an entry here fails to compile. */
export const DOC_SLOT_IDS: readonly DocSlotId[] = Object.keys(SLOT_ID_RECORD) as DocSlotId[];

export const DOC_GENERATED_START = "<!-- ks:generated:start -->";
export const DOC_GENERATED_END = "<!-- ks:generated:end -->";

/** The tail earlier releases appended to inherited pages, from this comment to `</body>`. */
const LEGACY_ADDITIONS_COMMENT = "<!-- Keyboard Studio additions -->";

/**
 * Inherited prose with every earlier generated block removed: each
 * DOC_GENERATED_START..DOC_GENERATED_END block (and the newline after it), and
 * any legacy "Keyboard Studio additions" tail up to `</body>`. Everything else
 * is left byte-identical, so re-rendering never stacks generated sections.
 */
export function stripGeneratedBlocks(inheritedProse: string): string {
  let text = inheritedProse;
  for (;;) {
    const start = text.indexOf(DOC_GENERATED_START);
    if (start === -1) break;
    const endIdx = text.indexOf(DOC_GENERATED_END, start);
    if (endIdx === -1) break;
    let end = endIdx + DOC_GENERATED_END.length;
    if (text[end] === "\n") end += 1;
    text = text.slice(0, start) + text.slice(end);
  }
  const legacy = text.indexOf(LEGACY_ADDITIONS_COMMENT);
  if (legacy !== -1) {
    const closingBody = text.toLowerCase().indexOf("</body>", legacy);
    text = closingBody === -1 ? text.slice(0, legacy) : text.slice(0, legacy) + text.slice(closingBody);
  }
  return text;
}

/** Escape a value for an `.htm` or `.php` form. */
export function escapeDocHtml(value: string): string {
  return escapeHtml(value);
}

/**
 * Escape a value for a Markdown form: the inline metacharacters, plus a `#`
 * that would start a heading. Minimal on purpose, so ordinary prose reads the
 * same in the raw file.
 */
export function escapeDocMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]<>]/g, "\\$&").replace(/^(\s*)#/gm, "$1\\#");
}
