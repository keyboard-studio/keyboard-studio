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
import {
  inventoryCoverageGate,
  selectDesktopAssignments,
  type InventoryCoverageGate,
} from "../lib/unimplementedInventory.ts";

export function useInventoryCoverageGate(): InventoryCoverageGate {
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  // producedSet is the SAME session-aware (base + this session's physical
  // assignments, composability-augmented) set MechanismGallery/TouchGallery
  // derive their own coverage from — reused here (not re-derived) so the
  // hard gate can never disagree with what the galleries show as covered
  // (shaped-bug fix, diacritic-implementability).
  const { lettersToAdd, producedSet } = useInventoryDiff();

  const desktopAssignments = useMemo(
    () => selectDesktopAssignments(phaseResults),
    [phaseResults],
  );

  return useMemo(
    () =>
      inventoryCoverageGate({
        desktopAssignments,
        lettersToAdd,
        touchLayoutJson,
        confirmedInventory,
        desktopProducedSet: producedSet,
      }),
    [desktopAssignments, lettersToAdd, touchLayoutJson, confirmedInventory, producedSet],
  );
}
