// useFontGlyphCoverageFindings — the 18.13 packaged-font glyph check
// (issue #2593) on the authored host, run inside the existing
// render/validation cycle.
//
// A `useMemo` over the working-copy slices (`startVfs`, `startIr`): a
// pure synchronous compute, NO new timer, NO second debounce, NO store
// write — the `useDocumentationFindings` / `useLdmlFindings` precedent
// (Constitution Article IV, decision D3). StudioShell concatenates the
// result into the one findings array it already renders and publishes,
// so the warning shows on the Output screen as an unmapped finding.
//
// The SAME check function runs through `runCriteriaChecks` (via
// CriteriaLintInput.kpsFontCoverage, assembled by assembleLintContext
// from the same cmap reader), so the Criteria screen and /review see
// the identical finding — this hook only supplies the authored-host
// surface, where the criteria assembly does not run.

import { useMemo } from "react";
import type { FontCoverage, LintFinding } from "@keyboard-studio/contracts";
import { parseKpsFontRefs } from "@keyboard-studio/engine";
import { checkFontGlyphCoverage } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { fontCoveredRanges } from "../criteria/fontCmap.ts";
import { packagedFontBinaries } from "../criteria/packagedFontBinaries.ts";

const EMPTY: LintFinding[] = [];

export function useFontGlyphCoverageFindings(): LintFinding[] {
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startIr = useWorkingCopyStore((s) => s.startIr);

  return useMemo(() => {
    if (startVfs === null || startIr === null) return EMPTY;
    const kpsPath = startVfs.list("source/").find((p) => p.toLowerCase().endsWith(".kps"));
    if (kpsPath === undefined) return EMPTY;
    const kpsText = readVfsText(startVfs, kpsPath);
    if (kpsText === undefined) return EMPTY;
    let refs: { oskFonts: string[]; fileFonts: string[] };
    try {
      refs = parseKpsFontRefs(kpsText);
    } catch {
      return EMPTY;
    }
    const coverage: FontCoverage[] = [];
    for (const font of packagedFontBinaries(startVfs, [...refs.oskFonts, ...refs.fileFonts])) {
      const covered = fontCoveredRanges(font.bytes);
      if (covered !== undefined) coverage.push({ ref: font.path, covered });
    }
    const findings = checkFontGlyphCoverage({
      ir: startIr,
      coverage,
      kmnPath: findKmnPath(startVfs) ?? "",
    }).findings;
    return findings.length === 0 ? EMPTY : findings;
  }, [startVfs, startIr]);
}
