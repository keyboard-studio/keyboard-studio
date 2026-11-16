// docCreateFix: a documentation page the opened keyboard lacks is offered as a
// suggested fix that creates it from the generated text and lists it in the
// descriptor (spec 111 FR-029/FR-041/FR-047, ruling 2026-11-16). Accepting writes
// the page file and the `.kps` edit as ONE `files` change (one undo record). Once
// it exists the page is edited and regenerated like any other. Copy is untouched.
// Pure producers: no store reads except in the stale check and the apply, no timers.
//
// Companion files: the generated page is rendered with no welcome-folder images
// or charts and carries its style inline, so it references nothing that has to be
// written beside it (Copy's step 5c writes charts and images only because it
// passes their names to the render).

import { addOpenKpsFile, type OpenKpsOptionTag } from "@keyboard-studio/engine";
import type { DocMemberId, WelcomeConvention } from "@keyboard-studio/contracts";

import type { SuggestedFix } from "./consistencySuggestions.ts";
import { EDITABLE_DOC_MEMBERS, type EditableDocMember } from "./authoredDocs.ts";
import { deriveOpenHelpGaps } from "./openHelpGaps.ts";
import { openDocPath } from "./openDocPath.ts";
import { FLAT_WELCOME_PATH, WELCOME_PAGE_PATH } from "./welcomeFolder.ts";
import { isLiveOpen } from "./openMode.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";

/** A short stable hash (FNV-1a, 32 bits). */
function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function textAt(vfs: { get(path: string): { content: Uint8Array | string } | undefined }, path: string): string | undefined {
  const content = vfs.get(path)?.content;
  return typeof content === "string" ? content : undefined;
}

/** The member reference the descriptor uses for a file path: relative to `source/`, backslashes. */
export function descriptorRefForPath(path: string): string {
  return path.startsWith("source/") ? path.slice("source/".length).replace(/\//g, "\\") : `..\\${path.replace(/\//g, "\\")}`;
}

/** Plain label of the undo step an accepted creation records on Open. */
export const DOC_CREATE_LABEL = "Create a documentation page";

export interface DocCreateInput {
  member: EditableDocMember;
  keyboardId: string;
  vfs: { get(path: string): { content: Uint8Array | string } | undefined };
  convention: WelcomeConvention | null;
  /**
   * The freshly rendered page. The welcome and help pages are rendered with their generated
   * sections marked (`markGenerated`), so a later regeneration replaces the block in place.
   */
  generated: string;
}

/**
 * Only the pages that ship in a package are listed in the descriptor (the corpus lists
 * welcome.htm and readme.htm; README.md is a repository file and the help page belongs to
 * the help site). The installer-facing two are also declared in `<Options>`.
 */
const LISTED_IN_DESCRIPTOR: Partial<Record<EditableDocMember, OpenKpsOptionTag>> = {
  "welcome-htm": "WelcomeFile",
  "readme-htm": "ReadMeFile",
};

/** Why a page cannot be created, or the fix that creates it. `null` fix and reason: the page exists. */
export interface DocCreatePlan {
  fix: SuggestedFix | null;
  /** The descriptor has no place for the page's entry: nothing is offered (a page not listed would be orphaned). */
  blocked: { member: EditableDocMember; path: string; reason: string } | null;
}

export function planDocCreate(input: DocCreateInput): DocCreatePlan {
  const path = openDocPath(input.member, input.keyboardId, input.vfs, input.convention);
  if (input.vfs.get(path) !== undefined) return { fix: null, blocked: null };
  const preview = [{ file: path, before: "", after: input.generated }];
  const declareAs = LISTED_IN_DESCRIPTOR[input.member];
  const kpsPath = `source/${input.keyboardId}.kps`;
  const kps = textAt(input.vfs, kpsPath);
  if (declareAs !== undefined) {
    if (kps === undefined) return { fix: null, blocked: { member: input.member, path, reason: "no package descriptor" } };
    const listed = addOpenKpsFile(kps, { name: descriptorRefForPath(path), declareAs });
    if (listed.unwritable.length > 0) return { fix: null, blocked: { member: input.member, path, reason: listed.unwritable.join("; ") } };
    if (listed.text !== kps) preview.push({ file: kpsPath, before: kps, after: listed.text });
  }
  return {
    fix: {
      // Content-addressed: a different page text or descriptor is a different fix.
      id: `docs:create:${input.member}:${hashOf(preview.map((p) => `${p.file}\u0001${p.before}\u0001${p.after}`).join("\u0000"))}`,
      kind: "docs",
      findingKey: null,
      preview,
      status: "pending",
      title: `Create ${path} from the generated text`,
      action: { target: "docs", change: "add", subject: input.member },
    },
    blocked: null,
  };
}

/** The create fix for one absent page, or null when the keyboard has the page or the descriptor cannot list it. */
export function docCreateFix(input: DocCreateInput): SuggestedFix | null {
  return planDocCreate(input).fix;
}

export interface DocCreateProducerInput {
  vfs: { get(path: string): { content: Uint8Array | string } | undefined };
  keyboardId: string;
  convention: WelcomeConvention | null;
  /** The pages as the studio would create them now, by member. */
  rendered: Partial<Record<DocMemberId, string>>;
}

export interface DocCreatePlans {
  fixes: SuggestedFix[];
  blocked: Array<{ member: EditableDocMember; path: string; reason: string }>;
}

/**
 * What to offer on Open: one create fix per page the Help step reports as absent
 * (deriveOpenHelpGaps, FR-029) that the studio can generate, and the pages whose
 * creation the descriptor blocks (named so the author is told why none is offered).
 */
export function docCreatePlans(input: DocCreateProducerInput): DocCreatePlans {
  const gaps = deriveOpenHelpGaps({ vfs: input.vfs, keyboardId: input.keyboardId, baselineFindings: null });
  const out: DocCreatePlans = { fixes: [], blocked: [] };
  for (const member of EDITABLE_DOC_MEMBERS) {
    const generated = input.rendered[member];
    if (generated === undefined || !gaps.has(member)) continue;
    const plan = planDocCreate({ member, keyboardId: input.keyboardId, vfs: input.vfs, convention: input.convention, generated });
    if (plan.fix !== null) out.fixes.push(plan.fix);
    if (plan.blocked !== null) out.blocked.push(plan.blocked);
  }
  return out;
}

/** The create fixes alone (see {@link docCreatePlans}). */
export function docCreateFixes(input: DocCreateProducerInput): SuggestedFix[] {
  return docCreatePlans(input).fixes;
}

/** True when `fix` is a create fix (as opposed to a regeneration). */
export function isDocCreateFix(fix: SuggestedFix): boolean {
  return fix.kind === "docs" && fix.action?.change === "add";
}

/**
 * True when the working copy no longer matches what the create fix was previewed
 * against: the page now exists, or the descriptor changed since.
 */
export function isDocCreateStale(fix: SuggestedFix): boolean {
  const page = fix.preview[0];
  if (page === undefined) return true;
  const vfs = useWorkingCopyStore.getState().startVfs;
  if (vfs === null) return true;
  const paths = page.file === WELCOME_PAGE_PATH || page.file === FLAT_WELCOME_PATH ? [WELCOME_PAGE_PATH, FLAT_WELCOME_PATH] : [page.file];
  if (paths.some((p) => vfs.get(p) !== undefined)) return true;
  const kps = fix.preview[1];
  return kps !== undefined && textAt(vfs, kps.file) !== kps.before;
}

type ApplyOnOpen = (change: OpenChange) => Promise<OpenApplyResult>;

/**
 * Accepting a creation: the page and the descriptor entry go in as one `files`
 * change through the apply host (one undo step; the host owns the busy guard and
 * the failure notices). Only on a live Open with a host; a page or descriptor that
 * changed since the preview is left alone. True when the page now exists.
 */
export async function applyDocCreate(fix: SuggestedFix, applyOnOpen?: ApplyOnOpen): Promise<boolean> {
  if (!isDocCreateFix(fix) || fix.preview[0] === undefined) return false;
  if (!isLiveOpen(useWorkingCopyStore.getState()) || applyOnOpen === undefined) return false;
  if (isDocCreateStale(fix)) return false;
  const files: Record<string, string | null> = {};
  for (const p of fix.preview) files[p.file] = p.after;
  const result = await applyOnOpen({ kind: "files", files, label: DOC_CREATE_LABEL, labelKey: "docs-create" });
  return result.status === "applied" || result.status === "unchanged";
}
