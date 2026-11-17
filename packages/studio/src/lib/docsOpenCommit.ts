// docsOpenCommit -- a Documentation-step edit on a keyboard opened for update
// (spec 111 FR-041, FR-042, FR-043; constitution Article III).
//
// On Open each page the author edited is written into its own file through the
// apply seam, when the author moves on (switching file, or Continue): one
// `files` change and one undo record per page, no consent. The page text is
// never held in the store, so the editor, the preview and the download all
// read the file. The `welcome-htm` decision is a record only: the names of the
// pages edited, never their text. Copy never comes through here.
//
// The start*Text slices are read-only seeds for the render paths; nothing here reads or
// writes them. A page with no file is not created by an edit: the "create" suggested fix
// (lib/docCreateFix.ts) makes it, after which it is edited here like any other.
//
// No timers.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { VirtualFS, WelcomeConvention } from "@keyboard-studio/contracts";
import { EDITABLE_DOC_MEMBERS, type EditableDocMember } from "./authoredDocs.ts";
import { applyThroughOpenSeam } from "./openApplyNotifier.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";
import { readVfsText } from "./vfsText.ts";
import { openDocPath } from "./openDocPath.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";

export { openDocPath };

/** The text of a page's file, or undefined when the working copy has no such file. */
export function readOpenDocText(
  member: EditableDocMember,
  keyboardId: string,
  startVfs: VirtualFS | null,
  convention: WelcomeConvention | null,
): string | undefined {
  if (startVfs === null) return undefined;
  return readVfsText(startVfs, openDocPath(member, keyboardId, startVfs, convention));
}

/** True when the opened keyboard has a file for the page (a page with none is not edited on Open). */
export function hasOpenDoc(
  member: EditableDocMember,
  keyboardId: string,
  startVfs: VirtualFS | null,
  convention: WelcomeConvention | null,
): boolean {
  return readOpenDocText(member, keyboardId, startVfs, convention) !== undefined;
}

export type ApplyDocChange = (change: OpenChange) => Promise<OpenApplyResult>;

export interface DocsCommitArgs {
  edits: Partial<Record<EditableDocMember, string>>;
  keyboardId: string;
  startVfs: VirtualFS | null;
  convention: WelcomeConvention | null;
}

/** What a commit did: the pages now in their files, and those the apply refused or failed. */
export interface DocsCommitResult {
  written: EditableDocMember[];
  refused: EditableDocMember[];
}

/** One `files` change per edited page that has a file; a page with no file writes nothing. */
function pageChanges(args: DocsCommitArgs): Array<{ member: EditableDocMember; path: string; change: OpenChange }> {
  const out: Array<{ member: EditableDocMember; path: string; change: OpenChange }> = [];
  for (const member of EDITABLE_DOC_MEMBERS) {
    const text = args.edits[member];
    if (text === undefined || !hasOpenDoc(member, args.keyboardId, args.startVfs, args.convention)) continue;
    const path = openDocPath(member, args.keyboardId, args.startVfs, args.convention);
    out.push({
      member,
      path,
      change: { kind: "files", files: { [path]: text }, label: "Documentation edit", labelKey: "docs-edit" },
    });
  }
  return out;
}

function settle(member: EditableDocMember, path: string, result: OpenApplyResult, into: DocsCommitResult): void {
  if (result.status === "applied") into.written.push(member);
  else if (result.status !== "unchanged") {
    devLog.warn(`[docs-open] ${path} was not written: ${result.status}`);
    into.refused.push(member);
  }
}

/**
 * Write each edited page into its file through the apply host: one `files` change
 * (one undo record) per page whose text differs from the file, and record the
 * names of the pages written. A page the host refused is left out of `written` (the
 * editor keeps its text and the host has shown its notice).
 */
export async function commitDocPagesOnOpen(args: DocsCommitArgs & { applyOnOpen: ApplyDocChange }): Promise<DocsCommitResult> {
  const result: DocsCommitResult = { written: [], refused: [] };
  for (const { member, path, change } of pageChanges(args)) {
    settle(member, path, await args.applyOnOpen(change), result);
  }
  // The decision is a record only: the names of the pages now in their files.
  recordDocPagesEdited(result.written);
  return result;
}

/**
 * The same write straight through the apply seam, for callers with no apply host
 * (the headless step drivers): there is no notice to show, so a refusal is only logged.
 */
export function commitDocPagesThroughSeam(args: DocsCommitArgs): DocsCommitResult {
  const result: DocsCommitResult = { written: [], refused: [] };
  for (const { member, path, change } of pageChanges(args)) {
    settle(member, path, applyThroughOpenSeam(change), result);
  }
  recordDocPagesEdited(result.written);
  return result;
}

/** The names of the pages the `welcome-htm` decision records on Open. */
export function recordedDocPages(): EditableDocMember[] {
  const value = useDecisionStore.getState().decisions["welcome-htm"]?.value;
  if (typeof value !== "object" || value === null || !("pages" in value) || !Array.isArray(value.pages)) return [];
  return EDITABLE_DOC_MEMBERS.filter((m) => (value.pages as unknown[]).includes(m));
}

/** Record which pages were edited (names only; their text is in the files). */
export function recordDocPagesEdited(pages: readonly EditableDocMember[]): void {
  if (pages.length === 0) return;
  const merged = new Set<EditableDocMember>([...recordedDocPages(), ...pages]);
  useDecisionStore.getState().record({
    id: "welcome-htm",
    value: { pages: EDITABLE_DOC_MEMBERS.filter((m) => merged.has(m)) },
    provenance: "asked",
  });
}
