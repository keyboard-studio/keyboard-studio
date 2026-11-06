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
  /** The intro language/script sentence, derived from the keyboard's identity (author-confirmed language name + the BCP47 script subtag); body form only. */
  languages: string;
  platforms: string;
  /** One source for every file that names a holder. */
  copyrightHolder: string;
  /** License form only. */
  year: string;
  docLang: string;
  helpPageUrl: string;
  /** The keyboard's keyman.com page (criterion 5.5); README form only. */
  keymanPageUrl: string;
  /** Non-empty when the README has at least one link (homepage or help page), so the Links heading appears once. */
  hasLinks: string;
  /** helpSiteHeader(displayName); help form only. */
  helpHeader: string;
  /** The shared inline style (DOC_PAGE_STYLE); welcome, help and readme.htm forms, so the pages carry identical CSS. */
  pageStyle: string;
  /** Non-empty exactly on a fresh (non-inherited) render, so the shared body opens with the page's one <h1>. */
  pageHeading: string;
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
  /** The author's font note (pf_font_guidance), rendered as intro paragraphs after the language line — never under Additional Detail. */
  fontNote: string;
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
  // README.md / readme.htm only (spec 110), from ReadmeFacts
  /** The language line, plus the "Based on" sentence on Track 1. */
  readmeIntro: string;
  /** The use-case phrase; empty for "general" or unanswered. */
  useCase: string;
  /** One line per character group, then the removed-characters line. */
  characterList: string;
  /** The precomposed / combining sentence. */
  composition: string;
  /** The capped example rows plus the trigger-key rows. */
  typingTable: string;
  /** Non-empty when example rows were left out, so the README points to the welcome page. */
  typingMore: string;
  /** The author's font note, else the generic one when it applies. */
  fontLine: string;
  knownLimitations: string;
  designNotes: string;
  /** readme.htm only: letters and marks, truncated past a cap. */
  addsLine: string;
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
  keymanPageUrl: true,
  hasLinks: true,
  helpHeader: true,
  pageStyle: true,
  pageHeading: true,
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
  fontNote: true,
  additionalDetail: true,
  inheritedProse: true,
  body: true,
  typingGuide: true,
  mechanisms: true,
  layoutPictures: true,
  touchNotes: true,
  characterInventory: true,
  readmeIntro: true,
  useCase: true,
  characterList: true,
  composition: true,
  typingTable: true,
  typingMore: true,
  fontLine: true,
  knownLimitations: true,
  designNotes: true,
  addsLine: true,
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

/**
 * The text of a hand-written document with its generated section replaced by
 * `generated` (a suggested regeneration, FR-028). Only the text between the
 * first DOC_GENERATED_START / DOC_GENERATED_END pair changes; everything the
 * author wrote stays byte-identical. A document with no markers gets a marked
 * block appended (before `</body>` for a page, else at the end), so a later
 * regeneration has a place to land.
 */
export function replaceGeneratedBlock(current: string, generated: string): string {
  const start = current.indexOf(DOC_GENERATED_START);
  const end = start === -1 ? -1 : current.indexOf(DOC_GENERATED_END, start + DOC_GENERATED_START.length);
  if (start !== -1 && end !== -1) {
    return `${current.slice(0, start + DOC_GENERATED_START.length)}\n${generated}\n${current.slice(end)}`;
  }
  const block = `${DOC_GENERATED_START}\n${generated}\n${DOC_GENERATED_END}`;
  const closingBody = current.toLowerCase().lastIndexOf("</body>");
  if (closingBody !== -1) return `${current.slice(0, closingBody)}${block}\n${current.slice(closingBody)}`;
  return current === "" || current.endsWith("\n") ? `${current}${block}\n` : `${current}\n${block}\n`;
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
