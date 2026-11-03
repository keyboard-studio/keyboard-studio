// readmeFacts — the one set of facts README.md and source/readme.htm are both
// rendered from (spec 110 FR-010). The studio builds it from the working copy
// (characters and keystrokes from the IR, the rest from recorded decisions);
// `renderReadmeMd` / `renderReadmeHtm` choose which facts each file shows and
// escape them for its format. Every string here is plain text, never escaped.

/** One keyboard language: English name, BCP47 tag, and (primary language only) the autonym. */
export interface ReadmeLanguage {
  name: string;
  tag: string;
  autonym?: string;
}

/** One "How to type" row: the keystrokes as the studio labels them, and the text they give. */
export interface ReadmeTypingRow {
  keys: string;
  output: string;
}

export type ReadmeCharacterKind = "letters" | "marks" | "punctuation" | "digits" | "other";

/** One Characters line: a group label ("Letters") and its characters in display form (a mark on a dotted circle). */
export interface ReadmeCharacterGroup {
  kind: ReadmeCharacterKind;
  label: string;
  chars: string[];
}

/** Whether marked characters come out as one precomposed character, as letter + combining mark, or both. */
export type ReadmeComposition = "precomposed" | "decomposed" | "mixed";

export interface ReadmeFacts {
  /** Primary language first; empty when no language is known. */
  languages: ReadmeLanguage[];
  /** ISO 15924 code, used when no language tag names a script. */
  script?: string;
  /** Track 1 only: the copied keyboard and the base-keyboard layout family ("QWERTY"). */
  basedOn?: { name: string; layoutFamily?: string };
  /** The use-case answer, already phrased; absent for "general" or unanswered. */
  useCase?: string;
  /** Characters beyond printable ASCII, by group, in full; empty groups omitted. */
  characterGroups: ReadmeCharacterGroup[];
  /** Characters removed from the copied keyboard, display form. */
  removed: string[];
  composition?: ReadmeComposition;
  /** At most 8 example rows. */
  typingRows: ReadmeTypingRow[];
  /** How to type each trigger key's own character; never capped. */
  literalRows: ReadmeTypingRow[];
  /** True when typing rows were left out, so the README points to the welcome page. */
  typingRowsOmitted: boolean;
  /** True when, lacking an author font note, the generic note applies (characters outside Latin-1). */
  needsFontNote: boolean;
  /** At most 6 plain-language design notes. */
  designNotes: string[];
  /** Track 2: the inherited description, used when the author has not written one. */
  fallbackDescription?: string;
}

const SETEXT_RULE = /^\s*(=+|-+)\s*$/;
const ATX_HEADING = /^\s{0,3}#{1,6}\s/;

function isHeadingAt(lines: readonly string[], i: number): boolean {
  return ATX_HEADING.test(lines[i]!) || (i + 1 < lines.length && lines[i]!.trim() !== "" && SETEXT_RULE.test(lines[i + 1]!));
}

/** The first non-blank paragraph from `lines[start]`, stopping at a blank line or a heading. */
function paragraphFrom(lines: readonly string[], start: number): string | undefined {
  let i = start;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  const parts: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "" || isHeadingAt(lines, i) || SETEXT_RULE.test(line)) break;
    parts.push(line.trim());
  }
  const text = parts.join(" ").trim();
  return text !== "" ? text : undefined;
}

/**
 * The description paragraph of a hand-written keyboard README (spec 110 US5),
 * in the shapes the keymanapp/keyboards corpus uses: a "Description" heading
 * (ATX or setext), the older `__DESCRIPTION__` marker, or else the first
 * paragraph after the title. Undefined when none is found.
 */
export function extractReadmeDescription(readmeMd: string): string | undefined {
  const lines = readmeMd.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*__DESCRIPTION__\s*$/i.test(line)) return paragraphFrom(lines, i + 1);
    if (/^\s{0,3}#{1,6}\s+description\s*#*\s*$/i.test(line)) return paragraphFrom(lines, i + 1);
    if (/^\s*description\s*$/i.test(line) && i + 1 < lines.length && SETEXT_RULE.test(lines[i + 1]!)) {
      return paragraphFrom(lines, i + 2);
    }
  }
  const title = lines.findIndex((_, i) => isHeadingAt(lines, i));
  if (title === -1) return undefined;
  // The template puts the copyright and version lines straight after the
  // title; those are not the description, so skip past them.
  for (let i = ATX_HEADING.test(lines[title]!) ? title + 1 : title + 2; i < lines.length; ) {
    while (i < lines.length && lines[i]!.trim() === "") i++;
    if (i >= lines.length || isHeadingAt(lines, i)) return undefined;
    const paragraph = paragraphFrom(lines, i);
    if (paragraph !== undefined && !NOT_A_DESCRIPTION.test(paragraph)) return paragraph;
    while (i < lines.length && lines[i]!.trim() !== "") i++;
  }
  return undefined;
}

const NOT_A_DESCRIPTION = /^(?:copyright\b|©|\(c\)|version\b)/i;
