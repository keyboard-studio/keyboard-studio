// ensurePackageFiles — write the non-descriptor files a Keyman package needs,
// but only the ones the working copy is missing.
//
// WHY: the package descriptor (packages/engine/src/package-descriptor) lists
// `welcome.htm` and `readme.htm` in `<Files>` and names them in `<Options>`, and
// kmc-package fails the whole build with KM04003 on a listed-but-absent member.
// Track 1 (new-from-base) already has them from the scaffolder's generateStubs.
// Track 2 (adapt-existing) does not: it starts from a fetched `.kmn` plus the
// sibling assets the header references, and the loader deliberately declines to
// fetch the base's own docs. So the descriptor promised files that were never
// there, and the .kmp build would fail on the adapt track only.
//
// This does NOT write the descriptor. There is exactly one writer of that file
// (package-descriptor/, reached from the shared projection), and adding a second
// is the defect that module exists to prevent.
//
// Every write is guarded on absence — the same `vfs.get(path) === undefined`
// guard the scaffolder's generateStubs uses. An author's own welcome.htm is
// never overwritten, so on Track 1 this is a no-op.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { welcomeHtm, readmeHtm } from "../shared/packageDocs.js";

export interface EnsurePackageFilesInput {
  /** The projected working copy. Mutated in place. */
  vfs: VirtualFS;
  /** Author-facing name, for the stub text. */
  displayName: string;
  /** Copyright holder for a generated LICENSE.md. Defaults to `displayName`. */
  copyright?: string;
  /** Year for a generated LICENSE.md. Defaults to the current year. */
  year?: number;
}

export interface EnsurePackageFilesResult {
  /** VFS paths this call created, in write order. Empty when nothing was missing. */
  created: string[];
}

/**
 * Write `source/welcome.htm`, `source/readme.htm`, and `LICENSE.md` if absent.
 *
 * Returns the paths it created so the caller can report them — a silently
 * synthesized file is how the missing-descriptor problem stayed invisible for as
 * long as it did.
 */
export function ensurePackageFiles({
  vfs,
  displayName,
  copyright,
  year,
}: EnsurePackageFilesInput): EnsurePackageFilesResult {
  const created: string[] = [];

  const write = (path: string, content: string): void => {
    if (vfs.get(path) !== undefined) return;
    vfs.set(path, content, false);
    created.push(path);
  };

  write("source/welcome.htm", welcomeHtm(displayName));
  write("source/readme.htm", readmeHtm(displayName));

  // The descriptor references `..\LICENSE.md` only when a license exists, but a
  // package without one is a package nobody can redistribute. The scaffolder
  // emits the same MIT stub on Track 1; this closes the adapt track's gap.
  const holder = copyright !== undefined && copyright !== "" ? copyright : displayName;
  const yyyy = year ?? new Date().getFullYear();
  write("LICENSE.md", `Copyright © ${yyyy} ${holder}\n\nMIT License\n`);

  return { created };
}
