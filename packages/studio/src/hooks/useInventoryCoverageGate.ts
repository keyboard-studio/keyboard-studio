// useInventoryCoverageGate — single hook wrapping the store reads +
// selectDesktopAssignments + inventoryCoverageGate composition that
// StudioShell (nav-blocked signal), StepHost (Phase F advance gate),
// PhaseFGate (block banner), and usePreviewArtifact (download gate) all
// needed identically. Extracted so the four sites can't drift from each
// other on which store slices feed the gate (spec §7.7 / §10 criterion 18.6).
//
// Do not fork this composition — a new call site that needs "is every
// inventory character implemented" should use this hook rather than
// re-reading phaseResults/touchLayoutJson/confirmedInventory + calling
// selectDesktopAssignments/inventoryCoverageGate locally.
//
// Referential stability: the returned InventoryCoverageGate object is
// memoized on its four real inputs (desktopAssignments, lettersToAdd,
// touchLayoutJson, confirmedInventory) — same dependency shape each of the
// four call sites already used — so it does not change identity on an
// unrelated re-render, and downstream `useMemo`/`useCallback` deps that key
// on it stay stable.

import { useMemo } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useInventoryDiff } from "./useInventoryDiff.ts";
import type { InventoryCoverageGate } from "../lib/unimplementedInventory.ts";
import { useSessionAssignments } from "./useSessionAssignments.ts";
import { coverageGateFrom } from "../lib/inventoryDiff.ts";
import { isOpenMode } from "../lib/openMode.ts";

export function useInventoryCoverageGate(): InventoryCoverageGate {
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  // The marks-treatment credit inputs (see unimplementedInventory.ts's
  // InventoryCoverageInputs doc): the gate credits a composed-treatment
  // lone mark through its produced combinations; without these two
  // slices it cannot tell such a mark from a genuinely unplaced one.
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);
  // producedSet is the SAME session-aware (base + this session's physical
  // assignments, composability-augmented) set MechanismGallery/TouchGallery
  // derive their own coverage from — reused here (not re-derived) so the
  // hard gate can never disagree with what the galleries show as covered
  // (shaped-bug fix, diacritic-implementability).
  const { lettersToAdd, producedSet } = useInventoryDiff();

  const desktopAssignments = useSessionAssignments();

  const openMode = isOpenMode(useWorkingCopyStore((s) => s.instantiationMode));

  return useMemo(() => {
    const gate = coverageGateFrom(desktopAssignments, { lettersToAdd, producedSet }, {
        touchLayoutJson,
        confirmedInventory,
        ...(alphabet !== undefined ? { alphabet } : {}),
        ...(marksWorklist !== undefined ? { marksWorklist } : {}),
      });
    // Open (spec 111, ratchet): a gap the keyboard already had must not stop
    // an update, so the hard block is lifted here and criterion 18.6 is
    // judged by the submit ratchet instead (new gaps still block there). The
    // gap lists stay, so every warning still names them. An unreadable touch
    // layout stays blocking: that is a failure, not an inherited gap.
    if (openMode && !gate.touchLayoutCorrupted) {
      return { ...gate, blockedOnDesktop: false, blockedOnTouch: false, blocked: false };
    }
    return gate;
  }, [desktopAssignments, lettersToAdd, touchLayoutJson, confirmedInventory, producedSet, alphabet, marksWorklist, openMode]);
}
