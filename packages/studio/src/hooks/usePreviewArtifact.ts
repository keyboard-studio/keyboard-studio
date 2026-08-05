// The artifact pipeline for OutputScreen.
//
// Spec 057 (FR-026): NOT renamed and NOT modified. It used to be shared with
// PreviewScreen; the Compare tab that replaced that screen has its own
// deliberately weaker hook (useCompareArtifact) which passes no onInstantiate.
// Output still needs this one's instantiate path and its download gate, so the
// rename sweep stops at the tab's author-facing surfaces and leaves this name
// alone.
//
// Encapsulates: baseKeyboard / pickerMode / scaffoldSpec local state,
// useKeyboardArtifact, useWorkingCopyTransform, onInstantiate, diagnostics
// derivation, canDownload, handleDownload, the zip-blob cleanup effect, and
// the download/identity warning state.
//
// Both screens mount this hook so each screen has its own live pipeline
// instance. The Zustand working-copy store (module-level singleton) persists
// across hash navigation, so selecting/instantiating on Output works
// standalone and handleDownload reads the settled store state regardless of
// which screen triggered the compile.
//
// canDownload ALSO gates on inventory coverage (the Phase F hard-gate truth,
// spec §7.7 / §10 criterion 18.6) — not just compile-readiness. This is the
// authoritative enforcement point: OutputScreen is directly reachable via
// #output (nav link or a typed/bookmarked hash) without ever passing through
// advance.ts's "help" gate or PhaseFGate, so the artifact must not be
// emittable here either, independent of how the screen was reached. Computed
// via the SAME shared selector (lib/unimplementedInventory.ts) StepHost and
// PhaseFGate use — do not fork the definition a fourth time.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, CompilerDiagnostic } from "@keyboard-studio/contracts";
import {
  useKeyboardArtifact,
  type ScaffoldSpec,
  type OnInstantiateCallback,
} from "./useKeyboardArtifact.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { instantiateFromBaseIfConfirmed } from "../lib/confirmRebase.ts";
import { useWorkingCopyTransform } from "./useWorkingCopyTransform.ts";
import {
  buildKmpForDownload,
  buildSourceZipForDownload,
  OutputBundleError,
} from "../lib/buildOutputBundle.ts";
import { useInventoryCoverageGate } from "./useInventoryCoverageGate.ts";
import type { InventoryCoverageGate } from "../lib/unimplementedInventory.ts";

export type PickerMode = "open" | "scaffold";

export interface PreviewArtifact {
  // Picker state
  baseKeyboard: BaseKeyboard | null;
  pickerMode: PickerMode;
  scaffoldSpec: ScaffoldSpec | null;
  setScaffoldSpec: (spec: ScaffoldSpec | null) => void;
  handleBaseKeyboardChange: (kb: BaseKeyboard | null) => void;
  handlePickerModeChange: (mode: PickerMode) => void;

  // Artifact pipeline
  stage: ReturnType<typeof useKeyboardArtifact>["stage"];
  retry: ReturnType<typeof useKeyboardArtifact>["retry"];
  recompile: ReturnType<typeof useKeyboardArtifact>["recompile"];
  diagnostics: CompilerDiagnostic[];

  // Download state.
  //
  // `canDownload` gates BOTH downloads identically — the .kmp is not a laxer
  // path to an artifact than the .zip, it is the primary one.
  canDownload: boolean;
  /** The source .zip (secondary). */
  downloading: boolean;
  downloadError: string | null;
  downloadWarnings: string[];
  handleDownload: () => Promise<void>;
  /** The installable .kmp (primary). */
  buildingKmp: boolean;
  kmpError: string | null;
  /**
   * Package-compiler and compile diagnostics from a failed .kmp build, so the
   * screen can say WHY rather than showing a bare failure. The source .zip stays
   * available throughout — a failed package never dead-ends the author.
   */
  kmpDiagnostics: CompilerDiagnostic[];
  handleDownloadKmp: () => Promise<void>;

  // Inventory coverage gate — the same desktop-always/touch-only-if-authored
  // truth StepHost and PhaseFGate compute (lib/unimplementedInventory.ts).
  // canDownload already folds `!coverageGate.blocked` in; this is exposed
  // separately so OutputScreen can render WHY (which characters, which
  // modality) rather than a silently-disabled button.
  coverageGate: InventoryCoverageGate;

  // Identity warning
  showIdentityWarn: boolean;
}

export function usePreviewArtifact(): PreviewArtifact {
  // Lazy-init from the working-copy store's already-instantiated base (if any)
  // rather than always starting null. The default flow can navigate straight
  // to #output (e.g. handlePhaseFComplete) without ever visiting #preview, so
  // this screen's independent pipeline instance would otherwise mount with
  // baseKeyboard === null and never render the download affordance even
  // though a base was already picked and instantiated earlier in the flow.
  // Lazy-init (not a useEffect sync) reads the store exactly once at mount —
  // it does not fight handleBaseKeyboardChange's subsequent picker updates on
  // this screen, and it does not re-run when the store's baseKeyboard later
  // changes (mirrors the read-once semantics of useState's initializer form).
  const [baseKeyboard, setBaseKeyboard] = useState<BaseKeyboard | null>(
    () => useWorkingCopyStore.getState().baseKeyboard,
  );
  const [pickerMode, setPickerMode] = useState<PickerMode>("open");
  const [scaffoldSpec, setScaffoldSpec] = useState<ScaffoldSpec | null>(null);

  // Helper: clear scaffoldSpec when entering "open" mode.
  const clearScaffoldIfOpen = useCallback((mode: PickerMode) => {
    if (mode === "open") {
      setScaffoldSpec(null);
    }
  }, []);

  const handleBaseKeyboardChange = useCallback(
    (kb: BaseKeyboard | null) => {
      setBaseKeyboard(kb);
      clearScaffoldIfOpen(pickerMode);
    },
    [pickerMode, clearScaffoldIfOpen],
  );

  const handlePickerModeChange = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    clearScaffoldIfOpen(mode);
  }, [clearScaffoldIfOpen]);

  // Late-instantiation adoption: the lazy init above reads the store exactly
  // once, at mount, on the assumption that SurveyView's onInstantiate has
  // already settled by the time the author navigates to Preview/Output. That
  // assumption can race — SurveyView's own compile pipeline (StudioShell's
  // onInstantiate, fired from useKeyboardArtifact's async fetch/compile/parse
  // run) can still be in flight at the exact moment this screen mounts, so the
  // lazy init reads null even though the working copy finishes instantiating a
  // few hundred ms later. Without this, THIS screen's local baseKeyboard stays
  // permanently null (no picker value, no download affordance) even after the
  // store settles, because the lazy-init form never re-reads.
  //
  // This effect closes that race by adopting the store's baseKeyboard the
  // moment it FIRST transitions to non-null — but only while this screen's own
  // local baseKeyboard is still null. Once the author (or the mount-time lazy
  // init) has set a local baseKeyboard, this guard permanently closes, so a
  // later, unrelated store change (e.g. a different screen re-instantiating)
  // can never fight handleBaseKeyboardChange's picker updates on this screen —
  // preserving the original lazy-init contract for every case except this one
  // race at mount.
  const storeBaseKeyboardForLateAdopt = useWorkingCopyStore((s) => s.baseKeyboard);
  useEffect(() => {
    if (baseKeyboard === null && storeBaseKeyboardForLateAdopt !== null) {
      setBaseKeyboard(storeBaseKeyboardForLateAdopt);
    }
  }, [baseKeyboard, storeBaseKeyboardForLateAdopt]);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);
  const [buildingKmp, setBuildingKmp] = useState(false);
  const [kmpError, setKmpError] = useState<string | null>(null);
  const [kmpDiagnostics, setKmpDiagnostics] = useState<CompilerDiagnostic[]>([]);
  const blobUrlRef = useRef<string | null>(null);

  // Helper: revoke and clear any lingering download blob URL. Shared by both
  // downloads — one ref, because only one download is ever in flight (each
  // handler sets its own busy flag and the buttons disable on it).
  const revokeBlobUrl = useCallback(() => {
    if (blobUrlRef.current !== null) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  // Clean up any lingering download blob URL on unmount.
  useEffect(() => revokeBlobUrl, [revokeBlobUrl]);

  // Helper: hand bytes to the browser as a file download.
  const triggerDownload = useCallback(
    (bytes: Uint8Array, filename: string, mimeType: string) => {
      // Coerce to ArrayBuffer to satisfy Blob's strict BlobPart type.
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      const blob = new Blob([buf as ArrayBuffer], { type: mimeType });

      revokeBlobUrl();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        // Revoke after the click tick so the browser can start the download.
        revokeBlobUrl();
      }
    },
    [revokeBlobUrl],
  );

  // onInstantiate: explicit working-copy instantiation (spec §8 v1.3.0, Track 1).
  // Delegates to instantiateFromBaseIfConfirmed which reads live store state via
  // getState() so the stale-closure problem cannot arise even though this
  // callback is memoised.
  //
  // Re-instantiation guard: by the time these screens mount, the working copy is
  // already a persistent singleton in the store — instantiated during the survey
  // (Track 1 new-from-base OR Track 2 adapt-existing) with the author's carve
  // deletions and survey answers. This screen runs its OWN decoupled compile
  // pipeline (see the module comment), whose full run() fires onInstantiate on
  // mount. Re-instantiating from that mount would pop the rebase-confirm dialog
  // ("Switching base keyboards will discard your current edits…") over work that
  // is already in the store, and confirming it is destructive: this path only
  // knows Track 1 instantiateFromBase, so against a Track 2 store it is a
  // same-id/different-mode "genuine switch" that resets phaseResults + irAxes —
  // discarding the survey answers and leaving nothing valid to submit. So skip
  // entirely when the store already holds a working copy for this same base;
  // only genuinely NEW bases picked via this screen's own picker fall through to
  // instantiate. Mirrors StudioShell's instantiatedForBaseIdRef gate, keyed on the store
  // (survives this screen's own mount/unmount) rather than a per-mount ref.
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir, removalCapabilities }) => {
    const current = useWorkingCopyStore.getState().baseKeyboard;
    if (current !== null && current.id === base.id) return;
    instantiateFromBaseIfConfirmed(base, { vfs, ir, removalCapabilities });
  }, []);

  // Working-copy transform — projects carve + identity layers into the pick-base
  // OSK. Returns null when the working copy is not yet instantiated.
  //
  // previewedBaseId: this screen's own local `baseKeyboard` picker state (bug
  // F4) — it can point at a candidate base the author is previewing that
  // differs from the store's already-instantiated base (e.g. re-visiting the
  // picker after a base was committed and carved). Without this, the
  // candidate base's compile would receive the committed base's carve
  // overlay (node ids that don't belong to it) and never reach "ready".
  const workingCopyTransform = useWorkingCopyTransform({
    previewedBaseId: baseKeyboard?.id ?? null,
  });

  const activeSpec = pickerMode === "scaffold" ? scaffoldSpec : null;
  const { stage, retry, recompile } = useKeyboardArtifact(
    baseKeyboard,
    activeSpec,
    workingCopyTransform,
    onInstantiate,
  );

  const diagnostics: CompilerDiagnostic[] =
    stage.kind === "ready"
      ? stage.compileResult.diagnostics
      : stage.kind === "error" && stage.compileResult !== undefined
        ? stage.compileResult.diagnostics
        : [];

  // Working-copy instantiation state — used for canDownload and the
  // not-instantiated guard in handleDownload.
  const isInstantiated = useWorkingCopyStore((s) => s.baseKeyboard !== null);

  // Identity-unset warning: shown non-blocking when Track 1 author has not
  // set a unique keyboard id (id still equals the base keyboard's id).
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const storeIdentity = useWorkingCopyStore((s) => s.identity);
  const storeBaseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const showIdentityWarn =
    instantiationMode === "new-from-base" &&
    storeBaseKeyboard !== null &&
    (storeIdentity?.keyboardId === undefined ||
      storeIdentity.keyboardId === storeBaseKeyboard.id);

  // Inventory coverage gate — same shared hook StepHost/PhaseFGate use
  // (hooks/useInventoryCoverageGate.ts).
  const coverageGate = useInventoryCoverageGate();

  // canDownload: require the compile to be ready AND the working copy to be
  // instantiated (baseVfs + baseIr available in the store) AND every
  // inventory character implemented in every modality actually engaged this
  // session (the Phase F hard-gate truth — see the module comment above).
  // The serializer builds the zip from the store's baseVfs, not from
  // stage.vfs, so the download contains the full projected working copy
  // including assignments.
  const canDownload = stage.kind === "ready" && isInstantiated && !coverageGate.blocked;

  const handleDownload = useCallback(async () => {
    if (stage.kind !== "ready") return;
    // Defense-in-depth: the emit-download button is already disabled while
    // coverage.blocked (canDownload), but handleDownload must refuse the
    // emission itself too — this is the authoritative gate, not just a
    // disabled affordance. A caller invoking this outside the normal button
    // click (tests, a future programmatic path) must not bypass it.
    if (coverageGate.blocked) {
      setDownloadError("Finish every inventory character before downloading.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    setDownloadWarnings([]);
    try {
      // The source archive: the canonical projection (carve + assignments +
      // identity + descriptor) PLUS the compiled build/ artifacts, so the
      // shipped descriptor's ..\build\<id>.* references resolve and the project
      // opens cleanly in Keyman Developer. Returns null when the working copy is
      // not instantiated.
      const result = await buildSourceZipForDownload();
      if (result === null) {
        setDownloadError("Nothing to download — select a keyboard first.");
        return;
      }

      // Surface any projection warnings to the user (carve safety gate,
      // missing patterns, identity-injection failures). Warn-only: the
      // download still proceeds so the user is not silently blocked.
      if (result.warnings.length > 0) {
        devLog.warn("[studio] download projection warnings:", result.warnings);
        setDownloadWarnings(result.warnings);
      }

      triggerDownload(result.bytes, result.filename, "application/zip");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }, [stage, triggerDownload, coverageGate.blocked]);

  // The installable package — the primary download. Same gates as the zip:
  // .kmp is the default artifact, not a privileged shortcut past them.
  const handleDownloadKmp = useCallback(async () => {
    if (stage.kind !== "ready") return;
    if (coverageGate.blocked) {
      setKmpError("Finish every inventory character before downloading.");
      return;
    }
    setBuildingKmp(true);
    setKmpError(null);
    setKmpDiagnostics([]);
    setDownloadWarnings([]);
    try {
      const result = await buildKmpForDownload();
      if (result === null) {
        setKmpError("Nothing to download — select a keyboard first.");
        return;
      }
      if (result.warnings.length > 0) {
        devLog.warn("[studio] package projection warnings:", result.warnings);
        setDownloadWarnings(result.warnings);
      }
      // Keyman's own MIME type for a package.
      triggerDownload(result.bytes, result.filename, "application/octet-stream");
    } catch (err: unknown) {
      // Show the real reason and keep the .zip available — never a silent
      // fallback, and never a dead end.
      if (err instanceof OutputBundleError) {
        setKmpError(err.message);
        setKmpDiagnostics(err.diagnostics);
      } else {
        setKmpError(err instanceof Error ? err.message : "Package build failed");
      }
    } finally {
      setBuildingKmp(false);
    }
  }, [stage, triggerDownload, coverageGate.blocked]);

  return {
    baseKeyboard,
    pickerMode,
    scaffoldSpec,
    setScaffoldSpec,
    handleBaseKeyboardChange,
    handlePickerModeChange,
    stage,
    retry,
    recompile,
    diagnostics,
    canDownload,
    downloading,
    downloadError,
    downloadWarnings,
    handleDownload,
    buildingKmp,
    kmpError,
    kmpDiagnostics,
    handleDownloadKmp,
    coverageGate,
    showIdentityWarn,
  };
}
