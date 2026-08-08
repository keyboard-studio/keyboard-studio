// ensurePackageFiles — write the non-descriptor files a Keyman package needs,
// but only the ones the working copy is missing.
//
// WHY: the package descriptor (packages/engine/src/package-descriptor) lists
// `LICENSE.md` and a package without one is not redistributable. Track 1
// (new-from-base) already has it from the scaffolder's generateStubs.
// Track 2 (adapt-existing) does not: it starts from a fetched `.kmn` plus the
// sibling assets the header references, and the loader deliberately declines to
// fetch the base's own LICENSE.md. So this closes the adapt track's gap.
//
// `welcome.htm`/`readme.htm` are NOT written here (spec 061): every call to
// `projectWorkingCopyForOutput` — this function's one caller's own caller —
// already writes both, unconditionally, from `helpDocsRender` (falling back to
// this module's own byte-identical placeholder text when the author has no
// answers yet). A second write-if-absent guard on the same paths would only
// ever see them already present and never fire.
//
// This does NOT write the descriptor. There is exactly one writer of that file
// (package-descriptor/, reached from the shared projection), and adding a second
// is the defect that module exists to prevent.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { licenseMd } from "../shared/packageDocs.js";

export interface EnsurePackageFilesInput {
  /** The projected working copy. Mutated in place. */
  vfs: VirtualFS;
  /** Copyright holder for a generated LICENSE.md. When absent (or blank), the
   *  copyright line is omitted rather than falling back to a display name
   *  (spec 059 FR-004) — see the `holder` derivation below. */
  copyright?: string;
  /** Year for a generated LICENSE.md. Defaults to the current year. */
  year?: number;
}

export interface EnsurePackageFilesResult {
  /** VFS paths this call created, in write order. Empty when nothing was missing. */
  created: string[];
}

/**
 * Write `LICENSE.md` if absent.
 *
 * Returns the paths it created so the caller can report them — a silently
 * synthesized file is how the missing-descriptor problem stayed invisible for as
 * long as it did.
 */
export function ensurePackageFiles({
  vfs,
  copyright,
  year,
}: EnsurePackageFilesInput): EnsurePackageFilesResult {
  const created: string[] = [];

  const write = (path: string, content: string): void => {
    if (vfs.get(path) !== undefined) return;
    vfs.set(path, content, false);
    created.push(path);
  };

  // spec 059 FR-004: an absent copyright falls back to NOTHING, not to a
  // display name. The MIT body still ships (so the package stays
  // redistributable) but with no copyright line, rather than one naming the
  // keyboard as its own rights holder. What stops an unattributed package
  // shipping at all is the download gate (usePreviewArtifact's
  // attributionMissing), not a fabricated notice here.
  const holder = copyright !== undefined && copyright.trim() !== "" ? copyright : null;
  const yyyy = year ?? new Date().getFullYear();
  write("LICENSE.md", licenseMd(holder, yyyy));

  return { created };
}
