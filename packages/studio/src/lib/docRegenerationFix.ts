// docRegenerationFix: regenerating a document is a suggested fix (spec 111 US7,
// FR-028), never a silent rewrite. Only the text between the `ks:generated`
// markers changes; a document with no markers gets a marked block appended.
// The fix carries the current and proposed text so the author previews both
// before accepting. Pure: no store reads, no timers (decision D3 is untouched).

import { DOC_GENERATED_END, DOC_GENERATED_START, replaceGeneratedBlock } from "@keyboard-studio/engine";
import { docMemberPath, type DocMemberId } from "@keyboard-studio/contracts";

import type { SuggestedFix } from "./consistencySuggestions.ts";
import { replaceStartingPointAndReplay } from "./replaceStartingPoint.ts";

export interface DocRegenerationInput {
  member: DocMemberId;
  /** The document's path in the working copy (shown as the preview's file). */
  path: string;
  /** The document as it is now. */
  current: string;
  /** The freshly generated section text, without markers. */
  generated: string;
}

/** The proposed full text of the document. */
export function proposeRegeneratedDoc(current: string, generated: string): string {
  return replaceGeneratedBlock(current, generated);
}

/**
 * The suggested fix for one document, or null when regenerating would change
 * nothing (so nothing is offered).
 */
export function docRegenerationFix(input: DocRegenerationInput): SuggestedFix | null {
  const after = proposeRegeneratedDoc(input.current, input.generated);
  if (after === input.current) return null;
  return {
    id: `docs:regenerate:${input.member}`,
    kind: "docs",
    findingKey: null,
    preview: [{ file: input.path, before: input.current, after }],
    status: "pending",
    title: `Regenerate the generated section of ${input.path}`,
    action: { target: "docs", change: "refresh", subject: input.member },
  };
}

/** The text between the first generated markers of a rendered page, or null when it has none. */
export function generatedSectionOf(rendered: string): string | null {
  const start = rendered.indexOf(DOC_GENERATED_START);
  if (start === -1) return null;
  const from = start + DOC_GENERATED_START.length;
  const end = rendered.indexOf(DOC_GENERATED_END, from);
  if (end === -1) return null;
  return rendered.slice(from, end).replace(/^\n/, "").replace(/\n$/, "");
}

export interface DocRegenerationProducerInput {
  vfs: { get(path: string): { content: Uint8Array | string } | undefined };
  keyboardId: string;
  /** The pages as the studio would render them now, by member. */
  rendered: Partial<Record<DocMemberId, string>>;
}

/**
 * The regeneration fixes to offer on Open: one per document that exists in the
 * working copy, whose freshly rendered page carries a generated section that
 * differs from what the file holds. Offers only; nothing is written here.
 */
export function docRegenerationFixes(input: DocRegenerationProducerInput): SuggestedFix[] {
  const out: SuggestedFix[] = [];
  for (const [member, rendered] of Object.entries(input.rendered) as [DocMemberId, string | undefined][]) {
    if (rendered === undefined) continue;
    const generated = generatedSectionOf(rendered);
    if (generated === null) continue;
    const path = docMemberPath(member, input.keyboardId);
    const content = input.vfs.get(path)?.content;
    if (typeof content !== "string") continue;
    const fix = docRegenerationFix({ member, path, current: content, generated });
    if (fix !== null) out.push(fix);
  }
  return out;
}

/** Accepting a regeneration: the previewed text becomes the file, through the working-copy store. */
export function applyDocRegeneration(fix: SuggestedFix): boolean {
  const preview = fix.preview[0];
  if (fix.kind !== "docs" || preview === undefined) return false;
  return replaceStartingPointAndReplay(preview.file, preview.after).ok;
}
