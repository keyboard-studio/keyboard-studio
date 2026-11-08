// packagedFontBinaries — locate the .kps-listed font files that are
// actually present in a VFS, with their bytes.
//
// The .kps lists fonts by repo-relative reference
// (`..\..\..\shared\fonts\sil\x\Font.ttf` from `source/<id>.kps`); the
// VFS keys the same file by its release-relative path
// (`shared/fonts/sil/x/Font.ttf`). The two are matched by BASENAME,
// the same test criterion 8.7's family extraction uses (see
// sharedFontRefsMissingFromVfs in assembleLintContext.ts): a ref whose
// basename is in the VFS counts as present. First match wins when two
// VFS entries share a basename. Text entries are skipped — a font is
// binary content.
//
// Shared by the criteria assembly (8.7 families + 18.13 coverage) and
// the Output-step hook, so both surfaces judge the same population.

import type { VirtualFS } from "@keyboard-studio/contracts";

export interface PackagedFontBinary {
  /** The VFS path of the font file (used as the finding's font name). */
  path: string;
  /** The font file's raw bytes. */
  bytes: Uint8Array;
}

function baseNameLower(path: string): string {
  return (path.split(/[\\/]/).pop() ?? "").toLowerCase();
}

/**
 * Every .kps-listed font file present in the VFS, in VFS order,
 * deduplicated by basename. Fonts the .kps lists but the VFS does not
 * carry are absent from the result — their absence is itself the 8.7
 * finding's substance, and the 18.13 check cannot judge bytes it
 * cannot read.
 */
export function packagedFontBinaries(
  vfs: VirtualFS,
  kpsFontRefs: readonly string[],
): PackagedFontBinary[] {
  const wanted = new Set(kpsFontRefs.map(baseNameLower));
  if (wanted.size === 0) return [];
  const seen = new Set<string>();
  const out: PackagedFontBinary[] = [];
  for (const entry of vfs.entries()) {
    const base = baseNameLower(entry.path);
    if (!wanted.has(base) || seen.has(base)) continue;
    if (typeof entry.content === "string") continue;
    seen.add(base);
    out.push({ path: entry.path, bytes: entry.content });
  }
  return out;
}
