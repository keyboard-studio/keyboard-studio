// e2eHook — flag-gated window hook exposing the live working copy for
// Playwright assertions. Mirrors the established studio env-flag convention
// (lib/services.ts VITE_USE_REAL_ENGINE, stores/debugPinsStore.ts VITE_KM_DEBUG,
// flags/mutateFlag.ts VITE_KM_MUTATE_SEAM): a single import.meta.env read,
// guarded so it is SSR/Node-CI safe, plus a URL-param runtime override.
//
// Architecture contract:
//   - Enabled ONLY when VITE_E2E=1 (build/dev-time) OR ?e2e=1 is present in
//     the URL (runtime override, same pattern as debugPinsStore's ?debug=1).
//   - In all other modes (including production builds with the flag unset)
//     `installE2eHook()` is a no-op — no `window.__ksE2E__` is attached.
//   - Reads directly from useWorkingCopyStore.getState() — the single
//     canonical source of truth. No duplicated/mirrored state.
//   - Never imported by production step/editor code paths; call once from
//     the app bootstrap (main.tsx).

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { readEnvFlag } from "./envFlag.ts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

export interface KsE2EHook {
  /** The live working-copy IR (pre-carve-filter), or null before instantiation. */
  getWorkingIr: () => KeyboardIR | null;
  /** nodeIds currently marked deleted via the carve gallery. */
  getDeletedNodeIds: () => string[];
  /**
   * The instantiated working copy's base keyboard id, or null before
   * instantiation. Added for the F1 (switch-base rebase) regression spec —
   * lets a test assert which base the WORKING COPY is on, independent of
   * what the wizard's UI currently displays (the whole point of F1 is that
   * those two could silently disagree).
   */
  getBaseKeyboardId: () => string | null;
  /**
   * Count of recorded survey phase results on the working copy. Added for the
   * F1 regression spec to assert that a cancelled rebase (or a same-base
   * re-confirm) preserves recorded edits, while a confirmed genuine switch
   * clears them.
   */
  getPhaseResultsCount: () => number;
}

declare global {
  interface Window {
    __ksE2E__?: KsE2EHook;
  }
}

function isE2eEnabled(): boolean {
  return readEnvFlag("VITE_E2E", "e2e");
}

/**
 * Attach `window.__ksE2E__` when the E2E flag is active. No-op otherwise
 * (including every production build that doesn't set VITE_E2E=1 or pass
 * ?e2e=1) — no hook is attached and no reference to the store is retained.
 */
export function installE2eHook(): void {
  if (!isE2eEnabled()) return;
  window.__ksE2E__ = {
    getWorkingIr: () => useWorkingCopyStore.getState().ir,
    getDeletedNodeIds: () => [...useWorkingCopyStore.getState().deletedNodeIds],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id ?? null,
    getPhaseResultsCount: () => useWorkingCopyStore.getState().phaseResults.length,
  };
}
