// useOe2SoleSourceFindings — the sole-source oe2 Layer C warning, run inside
// the existing render/validation cycle (the useDocumentationFindings
// precedent): a pure synchronous compute in a useMemo over working-copy
// store slices, NO new timer, NO second debounce, NO store write
// (Constitution Article IV / decision D3). StudioShell concatenates the
// result into the one findings array it already publishes, so the finding
// chips and badges exactly like every other finding — its owner surface is
// the mechanisms step, via the lintToQuestion mapping for its code.
//
// The detector runs over the working IR (the carve working IR when carve
// has produced one, else the base IR — the same derivation MechanismGallery
// uses) with this session's physical assignments folded in, so a glyph the
// author placed on oe2 during the mechanisms step is judged on the keyboard
// actually being built.

import { useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LintFinding } from "@keyboard-studio/contracts";
import { findSessionOe2SoleSourceGlyphs } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import { getPatternByIdSync } from "../lib/services.ts";
import { buildOe2SoleSourceFindings } from "../lint/oe2SoleSourceFindings.ts";

const EMPTY: LintFinding[] = [];

export function useOe2SoleSourceFindings(): LintFinding[] {
  const { i18n } = useLingui();
  const workingIr = useWorkingCopyStore((s) => s.ir ?? s.startIr);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);

  return useMemo(() => {
    if (workingIr === null) return EMPTY;
    const glyphs = findSessionOe2SoleSourceGlyphs(
      workingIr,
      selectDesktopAssignments(phaseResults),
      getPatternByIdSync,
    );
    if (glyphs.length === 0) return EMPTY;
    return buildOe2SoleSourceFindings(glyphs, i18n);
  }, [workingIr, phaseResults, i18n]);
}
