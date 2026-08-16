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
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { readEnvFlag } from "./envFlag.ts";
import { _forceCrashForE2E } from "../components/CrashErrorBoundary.tsx";
import { _setCrashSendStateForTest } from "../crash/send.ts";
import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";

/**
 * A whole VFS reduced to `path -> exact content`, for the byte-identity half of
 * spec 063 SC-006 (T112). Text entries map to their string content verbatim;
 * BINARY entries map to a `"bin:"`-prefixed byte list, which is byte-exact
 * rather than a digest so an equality comparison needs no hashing (and no
 * async `crypto.subtle`) inside a Playwright `evaluate`. The keyboard corpus's
 * binaries are icons and bitmaps of a few KB, so the encoding stays cheap.
 */
export type KsE2EFileSnapshot = Readonly<Record<string, string>>;

function snapshotVfs(vfs: VirtualFS): KsE2EFileSnapshot {
  const out: Record<string, string> = {};
  for (const entry of vfs.entries()) {
    out[entry.path] =
      typeof entry.content === "string"
        ? entry.content
        : `bin:${Array.from(entry.content).join(",")}`;
  }
  return out;
}

export interface KsE2EHook {
  /** The live working-copy IR (pre-carve-filter), or null before instantiation. */
  getWorkingIr: () => KeyboardIR | null;
  /** nodeIds currently marked deleted via the carve gallery. */
  getDeletedNodeIds: () => string[];
  /**
   * itemIds (rule nodeIds + store-slot ids, "<storeNodeId>#<index>") marked
   * deleted via cascadeDelete — CarveGalleryV2's discard path. cascadeDelete
   * routes BOTH whole-rule deletes and store-slot drops through this ITEM
   * channel (deletedItemIds), never deletedNodeIds (see workingCopyStore.ts's
   * cascadeDelete doc comment) — so a V2 discard is asserted here, not via
   * getDeletedNodeIds(), which only reflects v1 CarveGallery's deleteNode path.
   */
  getDeletedItemIds: () => string[];
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
  /**
   * The SHIPPED SOURCE as instantiated — a snapshot of the store's `baseVfs`,
   * before any projection layer. Null before instantiation. Added for spec 063
   * SC-006 (T112), which has to compare "what the base shipped" against "what
   * we emit" for every file the author never touched.
   */
  snapshotBaseFiles: () => KsE2EFileSnapshot | null;
  /**
   * The EMITTED ARTIFACT — a snapshot of the fully projected output VFS, i.e.
   * exactly what `serializeWorkingCopy` would zip. Runs the same
   * `projectWorkingCopyForOutput` the download path uses, so a test can never
   * pass against a projection the real output does not perform. Null before
   * instantiation. Async because the projection resolves patterns.
   */
  snapshotOutputFiles: () => Promise<KsE2EFileSnapshot | null>;
  /**
   * Force the crash boundary into its fallback (spec 060 T033).
   *
   * The accessibility scan has to audit the REAL rendered recovery screen —
   * real page CSS, real focus behaviour, real contrast — and a browser has no
   * other way to reach it without an actual crash. Rendering a copy of the
   * component on a scratch page would scan something the author never sees.
   */
  forceRenderCrash: () => void;
  /**
   * Force the crash notice into its "report sent" state (spec 060 T033).
   *
   * Same reason: the notice only appears after a real POST resolves, and the
   * scan needs the surface, not a stand-in.
   */
  forceCrashNoticeSent: (issueUrl: string, issueNumber: number) => void;
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
    getDeletedItemIds: () => [...useWorkingCopyStore.getState().deletedItemIds],
    getBaseKeyboardId: () => useWorkingCopyStore.getState().baseKeyboard?.id ?? null,
    getPhaseResultsCount: () => useWorkingCopyStore.getState().phaseResults.length,
    snapshotBaseFiles: () => {
      const { baseVfs } = useWorkingCopyStore.getState();
      return baseVfs === null ? null : snapshotVfs(baseVfs);
    },
    snapshotOutputFiles: async () => {
      const projected = await projectWorkingCopyForOutput();
      return projected === null ? null : snapshotVfs(projected.vfs);
    },
    forceRenderCrash: () => {
      _forceCrashForE2E();
    },
    forceCrashNoticeSent: (issueUrl, issueNumber) => {
      _setCrashSendStateForTest({
        status: "sent",
        issueUrl,
        issueNumber,
        action: "created",
        // A token is required for the Undo affordance to render at all
        // (FR-074a), and the a11y scan's whole subject is that button. The value
        // is never verified on this path — no request is made — but it must be
        // present or the scan silently covers a notice with nothing to scan.
        retractionToken: "e2e-stub-token",
      });
    },
  };
}
