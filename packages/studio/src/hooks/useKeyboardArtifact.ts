import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushBreadcrumb } from "../crash/breadcrumbs.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { StartKeyboard, VirtualFS, KeyboardIR, LintFinding, RemovalCapability, TouchLayoutIR, KpsFontEntry, KpsStylesheetEntry, PackageFontSet, WelcomeConvention, WelcomeFolderImage } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import type { RoundTripDeps, StartDocCssText } from "@keyboard-studio/engine";
import { loadDemoSimulate } from "../components/rules/demoSimulation.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { LOCAL_PROXY_BASE, getScaffolderService } from "../lib/services.ts";
// Re-exported so tests can assert the open-base fetch passes this exact proxy
// base by reference, rather than hardcoding the literal (which a rename could
// silently desync from).
export { LOCAL_PROXY_BASE };
import { findKmnPath } from "../lib/findKmnPath.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { computeBaselineDocFindings } from "../lib/collectDocLintInput.ts";
import { recoverFromStaleChunk } from "../crash/staleChunk.ts";
import { runContextToleranceAnalysis } from "../lib/contextToleranceRun.ts";

interface EngineModule {
  compile: (fs: VirtualFS, keyboardId: string) => Promise<CompileResult>;
  fetchKeyboardSourceToVfs: (
    startKeyboard: StartKeyboard,
    fs: VirtualFS,
    opts?: { proxyBase?: string }
  ) => Promise<{
    options?: Record<string, unknown>;
    filesLoaded?: string[];
    warnings?: string[];
    fonts?: KpsFontEntry[];
    stylesheets?: KpsStylesheetEntry[];
    startWelcomeHtmText?: string;
    startHelpPhpText?: string;
    // spec 080 US2 — the base documentation bundle (data-model §6).
    startReadmeMdText?: string;
    startHistoryMdText?: string;
    startWelcomeImages?: WelcomeFolderImage[];
    startWelcomeConvention?: WelcomeConvention;
    // Issue #2139 — the base's welcome/help stylesheets (criterion 11.8).
    startDocCssTexts?: StartDocCssText[];
    // The base's packaged fonts, for the package descriptor.
    packageFonts?: PackageFontSet;
  }>;
  init: () => Promise<void>;
  isReady?: () => boolean;
  parseKmn?: (text: string, keyboardId: string) => { ir: KeyboardIR; opaqueFeatures: Array<{ feature: string; count: number }> };
  /** Emit a parsed IR back to .kmn text (the codec's emit, barrel name). */
  emitKmn?: (ir: KeyboardIR) => string;
  /**
   * Layer A′ import-fidelity stages (the engine's, composed inline here).
   * Parse stage runs on the raw ParseResult + source text; emit stage runs on
   * the parsed IR + its emitted text. Both return LintFinding[] (I1–I6).
   */
  runImportFidelityParseChecks?: (
    parseResult: { ir: KeyboardIR; opaqueFeatures: Array<{ feature: string; count: number }> },
    source: string,
  ) => LintFinding[];
  /**
   * The synchronous half of the emit stage (I3 + I6 + NUL behaviour) — the
   * only fidelity work allowed on the pre-`ready` path.
   */
  runImportFidelityEmitChecksSync?: (
    ir: KeyboardIR,
    emitted: string,
  ) => LintFinding[];
  /**
   * I2 (functional round-trip) on its own. Expensive (two compiles + a
   * corpus simulation), so the live path runs it AFTER the stage reaches
   * `ready` and appends its findings to the ready stage's warnings.
   */
  runImportFidelityRoundTripCheck?: (
    ir: KeyboardIR,
    roundTripDeps?: RoundTripDeps,
  ) => Promise<LintFinding[]>;
  recognizePatterns?: (ir: KeyboardIR) => { ir: KeyboardIR; recognizedRatio: number };
  classifyRemovalCapabilities?: (ir: KeyboardIR) => Map<string, RemovalCapability>;
  /**
   * Parse a `.keyman-touch-layout` JSON string into a TouchLayoutIR. Used at
   * import time to carry the base's shipped touch layout into `ir.touchLayout`
   * so downstream touch authoring edits a copy of it rather than regenerating a
   * default layout from scratch.
   */
  parseTouchLayout?: (json: string) => TouchLayoutIR;
  /**
   * Remove dangling packaging-asset store references (BITMAP / VISUALKEYBOARD /
   * LAYOUTFILE / …) whose target file is absent from the VFS. kmcmplib emits
   * ZERO artifacts when it cannot open a referenced asset (reported only as a
   * "warning"), so for the live preview — which needs none of those assets — a
   * dangling reference must be stripped or the preview shows nothing.
   */
  stripDanglingAssetStores?: (kmn: string, fs: VirtualFS) => { kmn: string; stripped: string[] };
  /**
   * Drop a `store(&BITMAP)` icon reference whose file is absent from the VFS.
   * Unlike {@link stripDanglingAssetStores}, this mutates the WORKING COPY, not
   * a preview snapshot: an icon reference with nothing behind it is a package
   * that will not build (kmcmplib emits zero artifacts), so it must not survive
   * into the shipped `.kmn` either. Called once per fetch on the open-base path
   * — see the Track 1 scaffolder equivalent this mirrors,
   * `dropBitmapStoreIfUnbacked` in `packages/engine/src/scaffolder/index.ts`.
   */
  dropUnbackedBitmapStore?: (kmn: string, fs: VirtualFS) => { kmn: string; dropped: string | null };
}

/**
 * The last `import("@keyboard-studio/engine")` rejection, preserved verbatim
 * (spec 060, FR-005a, P0-3).
 *
 * WHY THIS EXISTS. `loadEngine()` collapses every failure to `null`, and the
 * caller then throws a friendly synthetic string
 * ("Engine failed to load — check browser console for WASM errors."). That
 * string is good UX and completely useless to the stale-chunk classifier, which
 * can only match on the text it is given: a post-deploy chunk 404 says
 * "Failed to fetch dynamically imported module", the synthetic string does not,
 * so the carve-out never fires and the failure goes to ordinary filing —
 * exactly the deploy flood User Story 3 exists to prevent.
 *
 * So the original rejection is kept here. The UI keeps showing the friendly
 * string; the classifier gets the truth.
 */
let lastEngineLoadFailure: unknown = null;

/**
 * Read (and clear) the preserved rejection.
 *
 * Cleared on read so a stale failure from an earlier run cannot misclassify a
 * later, unrelated one.
 */
export function takeEngineLoadFailure(): unknown {
  const failure = lastEngineLoadFailure;
  lastEngineLoadFailure = null;
  return failure;
}


// No `importOrReload` wrapper here, deliberately. This hook has exactly ONE
// consumer of loadEngine() — the engineReadyPromise below — and its catch
// already routes through `recoverFromStaleChunk`, covering the `init()` call
// (the kmc-kmn chunk, the path this bug was reported on) as well as this
// import. Recovering here too would mean two detections of one failure: the
// first reloads, the second lands inside the cooldown and is counted as
// "reloading didn't help".
async function loadEngine(): Promise<EngineModule | null> {
  try {
    const mod = await import(/* @vite-ignore */ "@keyboard-studio/engine");
    if (
      typeof mod.compile === "function" &&
      typeof mod.fetchKeyboardSourceToVfs === "function" &&
      typeof mod.init === "function"
    ) {
      lastEngineLoadFailure = null;
      return mod as EngineModule;
    }
    return null;
  } catch (err: unknown) {
    // Preserved, not swallowed (FR-005a). The return value stays `null` so
    // every existing caller behaves exactly as before.
    lastEngineLoadFailure = err;
    return null;
  }
}

// Maximum time the fetch step may run before we surface a retryable error.
// A stalled proxy/network request would otherwise leave the preview overlay
// stuck on "Loading keyboard source..." forever (the run is never superseded
// when startKeyboard is stable), so we bound it and fall through to the existing
// "fetch" error stage, which renders the Retry button.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Reject with a labelled timeout error if `p` has not settled within `ms`.
 * The rejection lands in run()'s catch block and surfaces as a retryable
 * `error/fetch` stage rather than an indefinite spinner.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms / 1000}s — the keyboard source did not load (check the dev proxy / network).`,
        ),
      );
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Revoke a single blob URL ref if present. */
function revokeBlobUrl(ref: React.MutableRefObject<string | null>): void {
  if (ref.current !== null) {
    URL.revokeObjectURL(ref.current);
    ref.current = null;
  }
}

/** Revoke all blob URLs in an array ref and clear the array. */
function revokeBlobUrls(ref: React.MutableRefObject<string[]>): void {
  for (const url of ref.current) URL.revokeObjectURL(url);
  ref.current = [];
}

// ---------------------------------------------------------------------------
// Functional I2 (round-trip) supersession — app-wide, not per hook instance
// ---------------------------------------------------------------------------
//
// Several useKeyboardArtifact instances are alive at once during a walk
// (SurveyView's preview plus the Mechanism/Touch gallery previews, each with
// its own hook state), and they all share one main thread. The round-trip's
// cancellation token therefore lives at module scope: at most one I2 pass
// runs at a time, and ANY instance's new compile retires the pass in flight,
// whichever instance owns it. The per-instance token this replaces (#2249)
// let a sibling instance's pass keep simulating after the walk moved on:
// the gallery instance's pass was still running while the author waited at
// Output, whose own fresh pipeline then shared the main thread with it, and
// the Output stage did not reach `ready` inside the e2e driver's wait
// window (CI run 39045148284: emit-download stuck on the NOT_READY blocker —
// the sole blocker — with Playwright's poll starved to 8 evaluations in
// 60 s). An aborted pass reports UNAVAILABLE, never a partial clean bill —
// the same posture as the same-instance supersession this generalises.
let activeRoundTripToken: { aborted: boolean } | null = null;

/** Retire the I2 pass currently in flight, whichever instance owns it. */
function retireActiveRoundTrip(): void {
  if (activeRoundTripToken !== null) {
    activeRoundTripToken.aborted = true;
    activeRoundTripToken = null;
  }
}

/**
 * Build OSK font blob URL from VFS if an OSK font entry is present.
 * Returns { url, family } when successful, or { url: null, family: null } when
 * the font is absent or malformed.
 */
function buildFontBlobUrl(
  fonts: KpsFontEntry[],
  vfs: VirtualFS,
): { url: string | null; family: string | null } {
  const oskFontEntry = fonts.find((f) => f.isOskFont && f.family);
  if (!oskFontEntry) return { url: null, family: null };

  const fontFile = vfs.get(oskFontEntry.vfsPath);
  if (!fontFile || !(fontFile.content instanceof Uint8Array)) {
    return { url: null, family: null };
  }

  const blob = new Blob([fontFile.content.slice().buffer], { type: "font/ttf" });
  return { url: URL.createObjectURL(blob), family: oskFontEntry.family ?? null };
}

/**
 * Whether a keyboard stylesheet belongs in the OSK frame. A package's
 * `welcome/` and `help/` folders carry the documentation pages' own CSS
 * (commonly `kb.css`, with bare `body` / `table` rules) — injected into the
 * frame it restyles the preview's scaffold, e.g. padding the keyboard in
 * from the edges. Keyman never applies those sheets to the keyboard.
 */
export function isOskStylesheetPath(path: string): boolean {
  return !/(^|[\\/])source[\\/](welcome|help)[\\/]/i.test(path);
}

/**
 * Build keyboard CSS blob URLs from stylesheet entries.
 * Returns an array of blob URLs (one per OSK stylesheet).
 */
function buildCssBlobUrls(stylesheets: KpsStylesheetEntry[]): string[] {
  return stylesheets.filter((sheet) => isOskStylesheetPath(sheet.vfsPath)).map((sheet) => {
    const blob = new Blob([sheet.cssText], { type: "text/css" });
    return URL.createObjectURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Stage discriminated union
// ---------------------------------------------------------------------------
//
// Warning channels on the "ready" stage (refs #467):
//   - scaffoldWarnings — warnings from the scaffold + pattern-apply pipeline
//     (the scaffolder's result.warnings and the post-scaffold transform). These
//     describe what happened while producing/mutating the artifact.
//   - runtimeWarnings  — warnings from the runtime parse/recognize pipeline that
//     are non-fatal to the compile (e.g. a codec IR-parse gap that disables IR
//     features but leaves the preview working). Kept separate so the UI can
//     render them apart from the pattern-application "Apply warnings" heading.
//
// Warning-text convention (both channels): each message is prefixed with a
// bracket tag naming its source — `[<source>] <human-readable text>`
// (e.g. `[pattern-apply] ...`, `[ir-parse] ...`). Prefer this over a prose
// prefix so new warning sources stay greppable and visually grouped.

export type Stage =
  | { kind: "idle" }
  | { kind: "fetching" }
  /**
   * vfs-loading is reserved for future async-VFS implementations where the
   * VFS population itself is asynchronous (e.g. streaming from a remote
   * storage layer). In the current synchronous implementation the VFS write
   * happens inside "fetching" and we transition directly to "compiling".
   */
  | { kind: "vfs-loading" }
  | { kind: "compiling"; isWarmCompile: boolean }
  | { kind: "ready"; compileResult: CompileResult; jsBlobUrl: string; vfs: VirtualFS; scaffoldWarnings: string[]; runtimeWarnings?: string[]; keyboardId: string; fontFaceUrl?: string; fontFaceFamily?: string; keyboardCssUrls?: string[] }
  /**
   * NOT A CRASH-CAPTURE SURFACE (spec 060, FR-005).
   *
   * This stage MUST NOT auto-file a crash report on every occurrence. Fetch and
   * compile errors here are frequently transient — a flaky proxy, an offline
   * moment, a keyboard whose source has a genuine syntax error the author is
   * mid-way through fixing — and they already have a modelled Retry UX. Wiring
   * the reporter in here would file an issue every time someone typed an
   * unbalanced brace, drowning the tracker in non-defects.
   *
   * The one thing this stage DOES owe the reporter is the ORIGINAL rejection
   * text from `loadEngine()`, so the stale-chunk classifier can see it (FR-005a).
   * That is forwarding, not filing.
   */
  | {
      kind: "error";
      step: "fetch" | "vfs" | "compile";
      message: string;
      compileResult?: CompileResult;
    };

/** Spec for a new scaffolded keyboard. When present, useKeyboardArtifact uses
 * createScaffolderService().scaffold() instead of fetchKeyboardSourceToVfs. */
export interface ScaffoldSpec {
  keyboardId: string;
  displayName: string;
}

/**
 * Optional post-scaffold transform applied to the VFS before the compile step.
 * Receives the populated VFS and the keyboardId; may mutate the VFS in-place
 * (VFS entries are immutable values — use vfs.set() for updates) and MUST
 * return any diagnostic warnings to surface in the UI.
 *
 * Called exactly once per run(), not on recompile() calls (which skip the
 * scaffold step entirely). Keeping it here enforces the single compile cycle
 * contract — no second compile path is created.
 */
export type VfsTransform = (
  vfs: VirtualFS,
  keyboardId: string,
) => {
  warnings: string[];
  /**
   * The keyboard id the VFS ends up keyed under after the transform runs,
   * when it differs from the `keyboardId` the transform was called with
   * (e.g. the Track 1 identity-rename projection step renames
   * `source/<startId>.kmn` to `source/<targetId>.kmn`). Omit or leave
   * `undefined` when the transform did not change the effective id — the
   * caller then keeps using the `keyboardId` it already has.
   *
   * `useKeyboardArtifact` reads this so the subsequent compile step reads
   * `source/<effectiveKeyboardId>.kmn` instead of the stale base id, which
   * would otherwise throw "required file not found" and strand the compile
   * stage in "error" permanently.
   */
  effectiveKeyboardId?: string;
};

/**
 * Called exactly once per successful fetch→compile run, after both the
 * compile result and the parsed IR are available. The caller (OutputScreen,
 * SurveyView) uses this to call instantiateFromStart or instantiateFromExisting
 * on the workingCopyStore — separating the pipeline from store ownership.
 *
 * `ir` is null when the engine does not expose parseKmn/recognizePatterns (i.e.
 * the real WASM engine is absent and only the mock compile path ran). Callers
 * must guard on ir !== null before passing it to the store.
 */
export type OnInstantiateCallback = (
  base: StartKeyboard,
  opts: { vfs: VirtualFS; ir: KeyboardIR | null; removalCapabilities: Map<string, RemovalCapability> },
) => void;

/**
 * Format Layer A′ import-fidelity findings for the runtime-warning channel.
 *
 * Only warning/error/fatal severities surface. The I4 opaque-feature
 * inventory (info) and the I2 round-trip stub (hint) fire on EVERY import by
 * design — they are ImportReport metadata, not author-facing diagnostics, and
 * surfacing them would put a warning banner on every keyboard open.
 * Error-severity findings (I1 parse completeness, I6 ownership, …) surface
 * here as non-blocking warnings, exactly like the [ir-parse] gap note:
 * instantiation proceeds either way.
 */
function formatFidelityWarnings(findings: LintFinding[]): string[] {
  return findings
    .filter(
      (f) => f.severity === "warning" || f.severity === "error" || f.severity === "fatal",
    )
    .map((f) => `[import-fidelity] ${f.code}: ${f.message}`);
}

/** Optional behaviour for {@link useKeyboardArtifact}. */
export interface KeyboardArtifactOptions {
  /**
   * Run the context-tolerance analysis after each compile reaches `ready`
   * (spec 078) and publish it to `workingCopyStore.contextTolerance`. Only
   * StudioShell's main-walk preview passes this, behind the flag.
   */
  analyseContextTolerance?: boolean;
  /**
   * Run the functional I2 round-trip check after a full run reaches
   * `ready` (spec 078 publish-after-ready posture) and append its findings
   * to the ready stage's runtime warnings. Only StudioShell's main-walk
   * preview passes this: it is the instance whose full run IS the base
   * import, so its pass is the import's verdict. Every other instance
   * (galleries, Output, Criteria, Compare) compiles the same base or the
   * author's working copy for its own screen; a 100k-sequence simulation
   * after each of those readies only competes for the main thread with
   * the screen the author is waiting on — on PR #2250's CI run
   * 39053681152 the Output screen's own pass (plus a sibling's) kept
   * `sil_cameroon_azerty`'s Output compile from settling inside the
   * driver's 60 s window even with app-wide supersession, while the five
   * lighter T011 walks passed (#2249).
   */
  runRoundTripCheck?: boolean;
  /**
   * Whether this instance's full runs write the starting point's
   * documentation slices (welcome/help prose, README/HISTORY, welcome images,
   * doc stylesheets, baseline doc findings) into the working-copy store.
   * Those slices are session state, so only an instance that instantiates the
   * working copy may write them:
   *
   * - `"by-branch"` — StudioShell's main walk: the scaffold branch writes the
   *   copy's slices (images, no prose), the open-base branch the adaptation's.
   * - `"copy-on-switch"` — Output/Criteria (usePreviewArtifact), which only
   *   ever instantiate a Track 1 copy: copy slices, and only when the run is
   *   for a different keyboard than the working copy already started from.
   *
   * Absent, nothing is written. The galleries and Compare compile the same
   * base for their own screen; when they wrote, a re-preview of a copy's
   * starting keyboard refilled the prose slices the copy had cleared (and a
   * gallery's identity-derived scaffold spec cleared an adaptation's).
   */
  startDocs?: "by-branch" | "copy-on-switch";
}

type WorkingCopyActions = ReturnType<typeof useWorkingCopyStore.getState>;

/**
 * spec 080 R9 / FR-007: a Track 1 copy inherits the base's welcome IMAGES
 * (carried into its own welcome folder) and nothing of its prose. The prose
 * slices are cleared explicitly rather than assumed null —
 * instantiateFromStart does not touch them, so a prior adapt session's texts
 * would otherwise survive into this copy and merge.
 */
function applyCopyStartDocs(
  wc: WorkingCopyActions,
  docs: {
    images: Parameters<WorkingCopyActions["setStartWelcomeImages"]>[0];
    convention: Parameters<WorkingCopyActions["setStartWelcomeConvention"]>[0];
    helpForExtraction: string | null;
    packageFonts: PackageFontSet | null;
  },
): void {
  wc.setStartWelcomeImages(docs.images);
  wc.setStartWelcomeConvention(docs.convention);
  wc.setStartWelcomeHtmText(null);
  wc.setStartHelpPhpText(null);
  // Issue #2206 (Matthew's 2026-10-17 FR-007 carve-out ruling): the
  // base's help text is retained in the EXTRACTION-ONLY slice at
  // the same moment the prose slice is nulled — the extractor may
  // offer its Troubleshooting lines as suggestions, but the text
  // itself never becomes prose (startHelpPhpText stays null, so
  // every render/serialize path behaves exactly as FR-007 asks).
  wc.setBaseHelpPhpTextForExtraction(docs.helpForExtraction);
  // A copy re-declares the fonts its starting keyboard packaged.
  wc.setStartPackageFonts(docs.packageFonts);
  wc.setStartReadmeMdText(null);
  wc.setStartHistoryMdText(null);
  // Issue #2139: a copy's pages are fresh renders — the base's page
  // stylesheets do not govern them, so the slice clears with the prose.
  wc.setStartDocCssTexts(null);
  // spec 080 FR-020: a copy inherits no prose, so nothing can be an
  // upstream finding — an EMPTY baseline (computed), not null (pending).
  wc.setBaselineDocFindings([]);
}

export interface KeyboardArtifactResult {
  stage: Stage;
  retry: () => void;
  /** Re-run the compile step against the current vfs ref. Debounce drives this. */
  recompile: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * State machine that drives the fetch → vfs-load → compile pipeline for a
 * single StartKeyboard selection. No debounce — the picker drives this
 * directly. The 300 ms debounce lives on the editor's keystroke cycle (§8
 * / Decision D3) and is a separate hook.
 *
 * Memory hygiene: previous blob URLs are revoked on every stage transition
 * that produces a new URL, preventing orphaned object URLs from accumulating.
 *
 * When `scaffoldSpec` is present, the VFS is populated via
 * createScaffolderService().scaffold() (new keyboard authoring path).
 * When absent, the original fetchKeyboardSourceToVfs path runs (open base).
 *
 * When `vfsTransform` is present it is called once after VFS population and
 * before the compile step. Its warnings are merged into scaffoldWarnings so
 * they surface on the ready Stage. Keeps the single compile cycle intact —
 * the transform does not trigger a second compile.
 *
 * `onInstantiate` — fired exactly once per successful full run (not on
 * recompile). The hook no longer owns the working-copy IR; the caller decides
 * whether to call instantiateFromStart or instantiateFromExisting. The callback
 * receives ir=null when parseKmn is unavailable (mock engine path).
 */
export function useKeyboardArtifact(
  startKeyboard: StartKeyboard | null,
  scaffoldSpec?: ScaffoldSpec | null,
  vfsTransform?: VfsTransform | null,
  onInstantiate?: OnInstantiateCallback | null,
  options?: KeyboardArtifactOptions,
): KeyboardArtifactResult {
  const [stage, setStageRaw] = useState<Stage>({ kind: "idle" });
  // Read at launch time rather than threaded through runCompile's deps, so
  // toggling it never restarts a compile.
  const analyseToleranceRef = useRef(options?.analyseContextTolerance === true);
  analyseToleranceRef.current = options?.analyseContextTolerance === true;
  // Same read-at-launch discipline as analyseToleranceRef: which instance
  // owns the I2 check is a mount-time fact, and toggling it must never
  // restart a compile.
  const runRoundTripRef = useRef(options?.runRoundTripCheck === true);
  runRoundTripRef.current = options?.runRoundTripCheck === true;
  // Same read-at-launch discipline: which instance owns the start docs is a
  // mount-time fact.
  const startDocsRef = useRef(options?.startDocs);
  startDocsRef.current = options?.startDocs;

  /**
   * Records a crash breadcrumb on every Stage transition (spec 060 FR-045).
   *
   * Wrapping the setter rather than instrumenting each of the ~10 call sites
   * means a future stage cannot be added without its breadcrumb. Only the
   * discriminant (and the error `step`) is recorded — structural facts, never
   * the error message, which could carry author content (FR-047).
   */
  const setStage = useCallback((next: Stage) => {
    pushBreadcrumb(
      "stage",
      next.kind === "error" ? `error:${next.step}` : next.kind,
    );
    setStageRaw(next);
  }, []);
  const prevBlobUrl = useRef<string | null>(null);
  const prevFontBlobUrl = useRef<string | null>(null);
  // Current OSK font family, paired with prevFontBlobUrl. Persists across
  // recompiles — the font only changes on a new fetch, not on recompile().
  const fontFaceFamilyRef = useRef<string | null>(null);
  // Per-keyboard CSS blob URLs. Same lifetime semantics as the font blob URL:
  // rebuilt on every fresh fetch, revoked on teardown / next fetch.
  const prevKeyboardCssBlobUrls = useRef<string[]>([]);
  const runId = useRef(0);
  // This instance's own in-flight post-ready functional round-trip (I2)
  // token, while its pass is running. The token object IS the module-level
  // active token (see retireActiveRoundTrip above) so a sibling instance's
  // compile can retire it; this ref exists so unmount can retire exactly
  // this instance's pass. A new compile supersedes the previous artifact:
  // without retirement, every recompile (e.g. each Mechanisms gallery
  // Apply) stacked another full corpus simulation on the main thread, and
  // the superseded passes burned CPU to completion even though their
  // findings were always going to be dropped.
  const ownRoundTripTokenRef = useRef<{ aborted: boolean } | null>(null);
  const engineRef = useRef<EngineModule | null>(null);
  // Shared engine load+init promise. Assigned by the first run() call that
  // finds it empty; cleared again if the load rejects, so a later run()
  // re-attempts the load instead of re-awaiting a cached failure (see the
  // catch inside the Step 0 block in run()).
  // Subsequent concurrent run() calls await the same promise so they don't
  // skip the load block while engineRef.current is still null — which caused
  // runCompile to abort with engine=null on every mount of GalleryPreviewWithPatterns
  // until an explicit user action (assignment) happened to re-trigger a compile.
  const engineReadyPromise = useRef<Promise<void> | null>(null);
  // Persistent VFS across recompiles — lifted out of the run closure.
  const vfsRef = useRef<VirtualFS | null>(null);
  // Snapshot of the clean populated VFS (after fetch/scaffold, before any
  // transform mutation). Restored into vfsRef before each transform-version
  // reapply so that applyCarveToVfs's no-op fast-path (empty deletedNodeIds)
  // does not cause assignments to accumulate on a stale .kmn.
  const startVfsRef = useRef<VirtualFS | null>(null);
  // Effective keyboard id reported by the last vfsTransform application, when
  // it differs from the id the transform was invoked with (Track 1 identity
  // rename with no scaffoldSpec — see VfsTransform's effectiveKeyboardId doc).
  // runCompile reads this so it compiles `source/<renamedId>.kmn` instead of
  // the stale base id. Reset to null at the start of every full run() so a
  // rename from a previous keyboard selection can never leak into the next
  // one; persists across recompile()/transformVersion cycles for the same
  // keyboard so a rename made once stays in effect until the next full run.
  const effectiveKeyboardIdRef = useRef<string | null>(null);

  // vfsTransform stored in a ref so that assignment changes (which produce a
  // new function reference from useWorkingCopyTransform) do NOT re-trigger
  // the full fetch→compile cycle. Only startKeyboard / scaffoldSpec changes
  // should restart from "fetching". Transform-only changes recompile cheaply.
  const vfsTransformRef = useRef<VfsTransform | null | undefined>(vfsTransform);
  // True once the first full fetch+compile cycle has completed. Used by the
  // transform-change effect below to skip the initial render.
  const hasFetchedRef = useRef(false);
  // Value key of the last full fetch→compile run started by the effect below
  // (`<base id>|<scaffold keyboardId>|<scaffold displayName>`). The effect
  // compares by VALUE, not object identity: callers re-derive scaffoldSpec
  // on every render (see decisions/identitySelectors.ts, called bare in
  // StudioShell), so an equal spec arrives as a fresh object each render.
  // Restarting on identity alone is not benign — each restart increments
  // runId, aborting the in-flight run at its next checkpoint AFTER it has
  // already fetched the base source, so identity churn in the host can keep
  // the pipeline fetching forever without ever settling (measured on the
  // union tree's CI run 37754110396: ~5,800 full base-package fetches in a
  // single 240 s walk, ~26/s sustained, starving every step of the walk).
  // A genuinely different base or scaffold target changes the key and runs;
  // retry() calls run() directly and is unaffected.
  const lastFullRunKeyRef = useRef<string | null>(null);
  // Value key of the last transform re-apply+recompile performed by the
  // transformVersion effect below (`<transformVersion>|<base id>|<scaffold
  // keyboardId>|<scaffold displayName>`) — the same value-not-identity
  // discipline as lastFullRunKeyRef, one effect over. That effect's deps
  // include scaffoldSpec, which callers re-derive on every render, so an
  // unchanged transform target arrives as a fresh object identity per
  // render. Every fire ends in runCompile → setStage, the host re-renders
  // on the stage change and re-derives the spec, and the effect refires:
  // once transformVersion is armed the loop needs no further input and is
  // self-sustaining (#2044 — measured ~6–8 full compiles/second after
  // carve → Continue, saturating the main thread: the tab "freeze"). The
  // version is part of the key, so a genuine transform change (which bumps
  // it) still re-applies; only identity churn is skipped. SurveyView also
  // memoizes its derivation now — this guard is the defence in depth for
  // every other caller, the same reason the start effect keeps its guard
  // even with well-behaved hosts.
  const lastTransformRunKeyRef = useRef<string | null>(null);
  // Version counter bumped when vfsTransform changes after the first fetch.
  // Drives the re-apply+recompile effect without touching run()'s dep array.
  const [transformVersion, setTransformVersion] = useState(0);

  // Sync vfsTransformRef and trigger a re-apply+recompile when the transform
  // changes after the initial fetch. We deliberately do NOT put vfsTransform
  // in run()'s dep array — that would restart from "fetching" (re-downloading
  // the keyboard source) on every assignment change, and also fire onInstantiate
  // again, which triggers the "switching base keyboards" confirmation dialog.
  useEffect(() => {
    vfsTransformRef.current = vfsTransform;
    if (hasFetchedRef.current) {
      setTransformVersion((v) => v + 1);
    }
  }, [vfsTransform]);

  /**
   * Context-tolerance follow-on task (spec 078 FR-001). Launched after the
   * `ready` stage is set and never awaited: the preview is already showing
   * before the analysis begins, and the analysis never joins the compile's
   * Promise.all or adds a timer (D3). Every await is followed by a runId
   * check inside analyseContextTolerance; a superseded run's result is
   * dropped.
   */
  const launchContextTolerance = useCallback((thisRunId: number, parsedIr: KeyboardIR | null) => {
    // Analyse what the preview actually compiled: the IR parsed from the
    // projected .kmn. The store's working IR is never emitted into the
    // artifact (see projectWorkingCopyVfs), so it can lag what the author runs.
    const ir = parsedIr ?? useWorkingCopyStore.getState().ir;
    if (ir === null) return;
    void runContextToleranceAnalysis(ir, thisRunId, () => runId.current === thisRunId);
  }, []);

  // Separate compile step, callable independently for the recompile() path.
  // `warnings` carries any scaffold warnings from the preceding fetch step;
  // empty for recompile() calls (which don't re-scaffold).
  // `isFullRun` distinguishes a full fetch→compile run (fires onInstantiate)
  // from a recompile()-only call (does NOT fire onInstantiate — no VFS change).
  const runCompile = useCallback(async (
    kb: StartKeyboard,
    thisRunId: number,
    warnings: string[] = [],
    isFullRun: boolean = false,
  ): Promise<void> => {
    const engine = engineRef.current;
    const vfs = vfsRef.current;
    if (engine === null || vfs === null || runId.current !== thisRunId) {
      return;
    }
    // A new compile supersedes the previous artifact — retire any
    // round-trip still simulating for it right away, not just when this
    // compile's own post-ready pass starts. App-wide (module token): the
    // pass in flight may belong to a sibling instance whose artifact this
    // compile also supersedes in every way the author can observe.
    retireActiveRoundTrip();

    const isWarmCompile = engine.isReady?.() ?? false;
    setStage({ kind: "compiling", isWarmCompile });

    let result: CompileResult;
    let parsedIr: KeyboardIR | null = null;
    let parsedRemovalCapabilities: Map<string, RemovalCapability> = new Map();
    // Functional I2 input captured by the parse branch on full runs; the
    // check itself runs after `ready` publishes (see below).
    let pendingRoundTrip: {
      ir: KeyboardIR;
      deps: Omit<RoundTripDeps, "compileFn" | "simulateFn">;
    } | null = null;
    // effectiveKeyboardIdRef takes precedence: it is set only when the last
    // vfsTransform application (Track 1 identity rename) actually renamed
    // source/<startId>.* to source/<targetId>.* inside the VFS, so the compile
    // must read the renamed path. scaffoldSpec?.keyboardId covers the
    // Track-1-with-scaffold / new-keyboard path (no rename involved — the VFS
    // was scaffolded under this id from the start). kb.id is the fallback for
    // an unmodified open-base compile.
    const compileId = effectiveKeyboardIdRef.current ?? scaffoldSpec?.keyboardId ?? kb.id;
    // Parse failure is captured here so it can be surfaced as a non-fatal
    // warning rather than aborting the compile/preview flow (slice 4, AC #4).
    let parseWarning: string | null = null;
    // Layer A′ import-fidelity findings for this run, formatted for the
    // runtime-warning channel alongside parseWarning below. Populated by the
    // parse branch when the engine exposes the fidelity stages.
    let fidelityWarnings: string[] = [];
    try {
      const kmnPath = findKmnPath(vfs);
      const kmnText = kmnPath ? (readVfsText(vfs, kmnPath) ?? "") : "";

      // Strip dangling packaging-asset references before compiling for preview.
      // If the base names a BITMAP / VISUALKEYBOARD / LAYOUTFILE that wasn't
      // fetched into the VFS, kmcmplib produces ZERO artifacts (with an
      // error-severity "cannot read file" diagnostic), which surfaces as
      // "no usable artifacts" and a blank preview. The preview
      // needs none of these assets; present ones are kept (full-quality OSK).
      // The output/zip path serializes the IR separately and is unaffected.
      if (kmnPath && engine.stripDanglingAssetStores) {
        const { kmn: cleaned, stripped } = engine.stripDanglingAssetStores(kmnText, vfs);
        if (stripped.length > 0) {
          vfs.set(kmnPath, cleaned);
        }
        // Compile reads source/<compileId>.kmn specifically; keep it in sync
        // when findKmnPath resolved a different path than the compile id.
        // Strip independently of whether kmnPath had danglers — compilePath
        // may have its own dangling references even when kmnPath did not.
        const compilePath = `source/${compileId}.kmn`;
        if (compilePath !== kmnPath && vfs.get(compilePath) !== undefined) {
          const compileEntry = readVfsText(vfs, compilePath) ?? "";
          const { kmn: cleanedCompile, stripped: strippedCompile } =
            engine.stripDanglingAssetStores(compileEntry, vfs);
          if (strippedCompile.length > 0) {
            vfs.set(compilePath, cleanedCompile);
          }
        }
      }

      // compile() and the parse/recognize branch run concurrently, but the
      // parse branch is wrapped in its own try/catch so a codec IR-parse gap
      // (a real-world .kmn construct the codec can't yet model) does NOT reject
      // the outer Promise.all. compile() is independent of the parsed IR —
      // kmcmplib drives the preview and .kmx; IR features (recognizer, patterns)
      // simply degrade to null when parse fails. Decision D3: single 300 ms
      // cycle; we do not add a second timer here.
      const [compileResult, parseResult] = await Promise.all([
        engine.compile(vfs, compileId),
        (async () => {
          if (!engine.parseKmn || !engine.recognizePatterns || !kmnPath) return null;
          try {
            const pr = engine.parseKmn(kmnText, compileId);
            const recognized = engine.recognizePatterns(pr.ir);
            let ir = recognized.ir;
            // Layer A′ import-fidelity — the engine's parse + emit
            // stages, run here because this branch is
            // where the live path holds the raw ParseResult + source text.
            // FULL RUNS ONLY: a full run is the import moment (the parse
            // reads the base keyboard as fetched), while recompile() re-parses
            // the author's edited working copy, where the checks' parse→emit
            // round-trip premise no longer holds. This also keeps the checks
            // outside the 300 ms debounce cycle, as designed (see
            // validator/index-import-fidelity.ts). The emit stage runs on the
            // recognized IR before the touch-layout carry-over below, exactly
            // as the codec emits it. A failure here must never break the
            // compile — same posture as parseTouchLayout below.
            let fidelityFindings: LintFinding[] = [];
            let roundTripInput: {
              ir: KeyboardIR;
              deps: Omit<RoundTripDeps, "compileFn" | "simulateFn">;
            } | null = null;
            if (
              isFullRun &&
              engine.runImportFidelityParseChecks &&
              engine.runImportFidelityEmitChecksSync &&
              engine.emitKmn
            ) {
              try {
                const parseFindings = engine.runImportFidelityParseChecks(pr, kmnText);
                const emittedKmnText = engine.emitKmn(ir);
                // Only the SYNCHRONOUS emit checks (I3 + I6 + NUL) run on
                // this pre-`ready` path. Functional I2 (#882) compiles both
                // .kmn versions and simulates the generated corpus through
                // KeymanWeb — seconds to minutes on a real base — and
                // awaiting it here wedged every base preview at
                // "Preparing preview…" (the parse branch shares the
                // Promise.all the ready stage waits on). I2 now runs after
                // `ready` publishes, off the captured input below, and its
                // findings are appended to the ready stage's warnings when
                // they land — the spec-078 publish-after-ready posture,
                // same as the context-tolerance analysis.
                const emitFindings = engine.runImportFidelityEmitChecksSync(
                  ir,
                  emittedKmnText,
                );
                fidelityFindings = [...parseFindings, ...emitFindings];
                // Capture the I2 input only on the designated import
                // instance (see KeyboardArtifactOptions.runRoundTripCheck):
                // with no input captured, this instance's post-ready step
                // below starts no pass, so its `ready` is the last word —
                // nothing keeps simulating behind the screen the author
                // is waiting on (#2249, Cameroon Output frontier).
                if (runRoundTripRef.current) {
                  roundTripInput = {
                    ir,
                    deps: {
                      originalKmn: kmnText,
                      emittedKmn: emittedKmnText,
                      keyboardId: compileId,
                      sourceFiles: vfs
                        .entries("source/")
                        .map((e) => ({ path: e.path, content: e.content, isBinary: e.isBinary })),
                    },
                  };
                }
              } catch (fidelityErr: unknown) {
                devLog.warn("[useKeyboardArtifact] import-fidelity checks failed:", fidelityErr);
              }
            }
            // Carry the base's shipped .keyman-touch-layout into the IR so that
            // touch authoring (Phase E preview + Phase F output) edits a COPY of
            // the existing layout — scaffoldTouchLayout Case B (preserve +
            // augment) — instead of regenerating a default layout from scratch
            // (Case A) the moment the author makes an edit. This mirrors how the
            // desktop keyboard is adapted from the base rather than rebuilt.
            // A malformed/absent touch file leaves ir.touchLayout undefined, so
            // the generated default remains the fallback.
            if (engine.parseTouchLayout && ir.touchLayout === undefined) {
              const touchPath = findTouchLayoutPath(vfs);
              const touchText = touchPath ? readVfsText(vfs, touchPath) : undefined;
              if (touchText !== undefined) {
                try {
                  ir = { ...ir, touchLayout: engine.parseTouchLayout(touchText) };
                } catch (e) {
                  devLog.warn("[useKeyboardArtifact] parseTouchLayout failed, falling back to generated default:", e);
                  // Leave ir.touchLayout undefined; fall back to the generated default.
                }
              }
            }
            // Classify removal capabilities from the recognized IR. Run after
            // recognizePatterns so ownedByPattern is set on rules (the classifier
            // depends on it for S-02 escape-rule handling). Defensive: if the
            // engine method is absent, leave the map empty.
            const caps: Map<string, RemovalCapability> =
              typeof engine.classifyRemovalCapabilities === "function"
                ? engine.classifyRemovalCapabilities(ir)
                : new Map();
            return { ...pr, ir, removalCapabilities: caps, fidelityFindings, roundTripInput };
          } catch (parseErr: unknown) {
            // Record the gap so it surfaces as a warning on the ready stage.
            // Do not re-throw — compile must still succeed independently.
            parseWarning = parseErr instanceof Error
              ? `[ir-parse] IR features unavailable: ${parseErr.message}`
              : "[ir-parse] IR features unavailable: unknown parse error";
            return null;
          }
        })(),
      ]);
      result = compileResult;
      if (parseResult) {
        parsedIr = parseResult.ir;
        parsedRemovalCapabilities = parseResult.removalCapabilities;
        fidelityWarnings = formatFidelityWarnings(parseResult.fidelityFindings);
        pendingRoundTrip = parseResult.roundTripInput;
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message = err instanceof Error ? err.message : "Unknown compile error";
      setStage({ kind: "error", step: "compile", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Route any parse-gap note to the runtime-warning channel (refs #467) so it
    // surfaces on the ready stage without riding the scaffold/apply channel or
    // blocking the preview. Import-fidelity findings ride the same channel.
    const runtimeWarnings: string[] = [
      ...(parseWarning !== null ? [parseWarning] : []),
      ...fidelityWarnings,
    ];

    const jsArtifact = result.artifacts.find((a) => a.filename.endsWith(".js"));

    revokeBlobUrl(prevBlobUrl);

    let jsBlobUrl: string;
    if (jsArtifact) {
      jsBlobUrl = jsArtifact.url;
      if (jsBlobUrl.startsWith("blob:")) {
        prevBlobUrl.current = jsBlobUrl;
      }
    } else if (!result.success && result.artifacts.length === 0) {
      setStage({
        kind: "error",
        step: "compile",
        message: "Compile failed: no usable artifacts produced.",
        compileResult: result,
      });
      return;
    } else {
      jsBlobUrl = "";
    }

    // Fire onInstantiate on full runs only (not recompile). The working-copy
    // store takes ownership of the IR here; the hook no longer calls setIR.
    if (isFullRun && onInstantiate !== null && onInstantiate !== undefined) {
      try {
        onInstantiate(kb, { vfs, ir: parsedIr, removalCapabilities: parsedRemovalCapabilities });
      } catch (err: unknown) {
        // The callback runs on the far side of setStage("compiling") and
        // before setStage("ready") below, so an uncontained throw would
        // escape through the caller's `void run(...)` as an unhandled
        // rejection and leave the stage wedged on "compiling" forever — the
        // preview silently appears to stop compiling. Land it on the same
        // error surface compile failures use, with the failure visible.
        if (runId.current !== thisRunId) return;
        const message =
          err instanceof Error
            ? err.message
            : "Working-copy instantiation failed";
        setStage({ kind: "error", step: "compile", message });
        return;
      }
    }

    // Carry font face info (added by the .kps font-loading path) onto the ready stage.
    const readyStage: Extract<Stage, { kind: "ready" }> = {
      kind: "ready", compileResult: result, jsBlobUrl, vfs, scaffoldWarnings: warnings, keyboardId: compileId,
    };
    if (runtimeWarnings.length > 0) readyStage.runtimeWarnings = runtimeWarnings;
    if (prevFontBlobUrl.current !== null) readyStage.fontFaceUrl = prevFontBlobUrl.current;
    if (fontFaceFamilyRef.current !== null) readyStage.fontFaceFamily = fontFaceFamilyRef.current;
    if (prevKeyboardCssBlobUrls.current.length > 0) {
      readyStage.keyboardCssUrls = prevKeyboardCssBlobUrls.current;
    }
    setStage(readyStage);
    // Functional I2 (#882) runs only now that `ready` has published — never
    // on the path the author is waiting on (its two compiles + corpus
    // simulation wedged every base preview at "Preparing preview…" while
    // it was awaited pre-ready). Findings append to this ready stage's
    // runtime warnings when they land; a superseded run's are dropped. If
    // the simulator chunk cannot load, deps stay undefined and I2 reports
    // its unavailable hint instead of passing silently.
    // The start is deferred two macrotask hops so the ready render commits
    // and paints first: corpus generation + simulation churn the main
    // thread in microtasks, and starting them in this same turn starved
    // the ready paint — on the CI runner the preview button stayed
    // "Preparing preview…" past every consumer's wait window even though
    // the stage had already flipped to ready (run 38999923387 trace: the
    // compile finished, then I2's corpus generation began immediately).
    if (pendingRoundTrip !== null && engine.runImportFidelityRoundTripCheck) {
      const input = pendingRoundTrip;
      const roundTripCheck = engine.runImportFidelityRoundTripCheck;
      const startRoundTrip = () => {
        void (async () => {
          retireActiveRoundTrip();
          const abortToken = { aborted: false };
          activeRoundTripToken = abortToken;
          ownRoundTripTokenRef.current = abortToken;
          let deps: RoundTripDeps | undefined;
          try {
            const simulateFn = await loadDemoSimulate();
            deps = {
              ...input.deps,
              compileFn: engine.compile,
              simulateFn,
              shouldAbort: () => abortToken.aborted,
            };
          } catch {
            deps = undefined;
          }
          const findings = await roundTripCheck(input.ir, deps).catch(
            (err: unknown) => {
              devLog.warn("[useKeyboardArtifact] functional I2 check failed:", err);
              return [] as LintFinding[];
            },
          );
          if (activeRoundTripToken === abortToken) activeRoundTripToken = null;
          if (ownRoundTripTokenRef.current === abortToken) {
            ownRoundTripTokenRef.current = null;
          }
          if (runId.current !== thisRunId) return;
          const extra = formatFidelityWarnings(findings);
          if (extra.length === 0) return;
          setStageRaw((prev) =>
            prev.kind === "ready" && prev.keyboardId === compileId
              ? { ...prev, runtimeWarnings: [...(prev.runtimeWarnings ?? []), ...extra] }
              : prev,
          );
        })();
      };
      setTimeout(() => {
        setTimeout(startRoundTrip, 0);
      }, 0);
    }
    if (analyseToleranceRef.current) launchContextTolerance(thisRunId, parsedIr);
  }, [scaffoldSpec?.keyboardId, onInstantiate, launchContextTolerance]);

  const run = useCallback(async (kb: StartKeyboard, thisRunId: number) => {
    // Reset so transform changes during this fetch do not trigger a premature
    // re-apply+recompile before the new VFS is ready. It is set back to true
    // after the transform is applied at the end of the fetch step.
    hasFetchedRef.current = false;

    // Reset any id rename carried over from a previous keyboard selection —
    // a fresh full run starts from the new base's unrenamed id until (and
    // unless) the transform below reports otherwise.
    effectiveKeyboardIdRef.current = null;

    // Transition to fetching immediately so the preview pane shows a loading
    // state rather than blank/idle during the async engine + source load.
    setStage({ kind: "fetching" });

    // Step 0: Lazily load the engine module. All concurrent run() calls share
    // a single promise so the second call doesn't skip this block while
    // engineRef.current is still null (the original one-shot flag race).
    if (engineReadyPromise.current === null) {
      engineReadyPromise.current = (async () => {
        try {
          const mod = await loadEngine();
          if (mod === null) {
            // The author sees the friendly string; the classifier must see the
            // original text (FR-005a). Attaching it as `cause` carries it through
            // without changing what the Stage: "error" UI renders.
            const original = takeEngineLoadFailure();
            throw new Error(
              "Engine failed to load — check browser console for WASM errors.",
              ...(original !== null ? [{ cause: original }] : []),
            );
          }
          engineRef.current = mod;
          await mod.init();
        } catch (err: unknown) {
          // A rejected load must not stay cached. This promise is the
          // session's only engine-load attempt, so leaving the rejection in
          // the ref would make every later run() — Retry included — re-await
          // the same failure without ever re-attempting the load, stranding
          // the preview on the error stage even when the failure was
          // transient (a chunk fetch or WASM init that would succeed on a
          // second attempt). Clearing the ref lets the next run() load
          // afresh; the rejection still propagates unchanged to this run's
          // catch below, which owns the error stage and the stale-chunk
          // reload decision, so a failed attempt surfaces exactly once and
          // nothing here can spin a reload loop.
          engineReadyPromise.current = null;
          throw err;
        }
      })();
    }
    try {
      await engineReadyPromise.current;
    } catch (err: unknown) {
      // A deployment that landed while this tab was open deletes the hashed
      // chunk the engine (and, through it, kmc-kmn) is imported from, so the
      // load fails with a module-script/MIME error no retry in this document
      // can fix. Reload instead of stranding the preview on "VFS load failed".
      //
      // `err` is the friendly synthetic string above, whose `cause` is the
      // original rejection loadEngine() preserved (FR-005a) —
      // `recoverFromStaleChunk` walks the chain, so the classifier matches the
      // real text rather than the wrapper. The single recovery point for both
      // the import and `init()`; see the note above loadEngine().
      if (recoverFromStaleChunk(err)) return;
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "WASM engine failed to load";
      setStage({ kind: "error", step: "vfs", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Fresh VFS for each full run (new selection or retry).
    const vfs = createVirtualFS();
    vfsRef.current = vfs;

    const scaffoldWarnings: string[] = [];

    // Reset any OSK-font and keyboard-CSS state carried over from a previous
    // selection. A fresh run rebuilds them from the fetched source (or leaves
    // them cleared if the .kps has no font / .css entries).
    revokeBlobUrl(prevFontBlobUrl);
    fontFaceFamilyRef.current = null;
    revokeBlobUrls(prevKeyboardCssBlobUrls);

    // Decided before the fetch, while the store still holds the working copy
    // this run would replace — see KeyboardArtifactOptions.startDocs.
    const startDocsMode = startDocsRef.current;
    const writesStartDocs =
      startDocsMode === "by-branch" ||
      (startDocsMode === "copy-on-switch" &&
        useWorkingCopyStore.getState().startKeyboard?.id !== kb.id);

    try {
      if (scaffoldSpec != null) {
        // Scaffold path — new keyboard authoring. Routes through
        // getScaffolderService() so USE_REAL=false uses the mock in CI.
        const svc = await getScaffolderService();
        // spec 064 US1: pass the captured attribution so LICENSE.md,
        // store(&COPYRIGHT) and .kps <Copyright>/<Author> name the real holder.
        // Read from the store at call time rather than through a hook dep, so a
        // re-scaffold picks up an attribution confirmed after the first run.
        // Absent => the scaffolder emits no notice and flags attributionMissing;
        // it never invents a holder.
        const wc = useWorkingCopyStore.getState();
        const attribution = wc.attribution;
        // spec 064 D5: an author-supplied original holder replaces parsing, so
        // the remedy preserves the base's notice instead of dropping it.
        const startHolderOverride = wc.startHolderOverride;
        const result = await svc.scaffold(kb, scaffoldSpec.keyboardId, scaffoldSpec.displayName, {
          ...(attribution !== null ? { attribution } : {}),
          ...(startHolderOverride !== null && startHolderOverride !== ""
            ? { startHolderOverride }
            : {}),
        });
        // Record (or clear) the unreadable-notice block for the download gate.
        wc.setLicenseUnparseable(result.licenseUnparseable ?? null);
        // Retain the base's verbatim license so the DOWNLOAD path can inherit the
        // same holders. It completes a missing LICENSE.md, and the loader never
        // writes the base's into the VFS, so this is its only source.
        wc.setStartLicenseText(result.startLicenseText ?? null);
        if (writesStartDocs) {
          applyCopyStartDocs(wc, {
            images: result.startWelcomeImages ?? null,
            convention: result.startWelcomeConvention ?? null,
            helpForExtraction: result.baseHelpPhpTextForExtraction ?? null,
            packageFonts: result.packageFonts ?? null,
          });
        }
        vfsRef.current = result.vfs;
        scaffoldWarnings.push(...result.warnings);
        // Build font + CSS blob URLs from scaffold result — mirrors the open-base path below.
        // result.fonts / result.stylesheets forwarded by scaffold() from fetchKeyboardSourceToVfs.
        const fontBlob = buildFontBlobUrl(result.fonts, vfsRef.current);
        prevFontBlobUrl.current = fontBlob.url;
        fontFaceFamilyRef.current = fontBlob.family;
        prevKeyboardCssBlobUrls.current = buildCssBlobUrls(result.stylesheets);
      } else if (engineRef.current) {
        // Open-base path — fetch existing keyboard source. Bounded by a
        // timeout so a stalled proxy/network request surfaces a retryable
        // error instead of an indefinite "Loading keyboard source..." overlay.
        const fetchResult = await withTimeout(
          engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, {
            proxyBase: LOCAL_PROXY_BASE,
          }),
          FETCH_TIMEOUT_MS,
          "Loading keyboard source",
        );
        const wc = useWorkingCopyStore.getState();
        if (writesStartDocs && startDocsMode === "copy-on-switch") {
          // Output/Criteria's picker instantiates a Track 1 copy from this
          // fetch: the copy's slices, exactly as the scaffold branch writes.
          applyCopyStartDocs(wc, {
            images: fetchResult.startWelcomeImages ?? null,
            convention: fetchResult.startWelcomeConvention ?? null,
            helpForExtraction: fetchResult.startHelpPhpText ?? null,
            packageFonts: fetchResult.packageFonts ?? null,
          });
        } else if (writesStartDocs) {
          // spec 061 FR-013: retain the base's own welcome.htm/help.php verbatim
          // so the Track 2 output-projection merge has something to preserve.
          // Track 1 (scaffold branch above) never sets these — a brand-new
          // keyboard has no prior docs of its own to merge with (research D-05).
          wc.setStartWelcomeHtmText(fetchResult.startWelcomeHtmText ?? null);
          wc.setStartHelpPhpText(fetchResult.startHelpPhpText ?? null);
          // Issue #2206: the extraction-only slice is a Track 1 (copy)
          // retention — on this open-base/adapt path the base's
          // troubleshooting section already ships inside the inherited
          // prose, and the ruling authorises no extraction here. Cleared
          // explicitly so a prior copy session's text cannot survive into
          // an adapt session (the same hazard the Track 1 clearing above
          // guards against, in reverse).
          wc.setBaseHelpPhpTextForExtraction(null);
          // spec 080 FR-006: the rest of the base's documentation bundle — README
          // and HISTORY prose (adapt track only, FR-007) plus the welcome-folder
          // images and which convention the base used (data-model §6).
          wc.setStartReadmeMdText(fetchResult.startReadmeMdText ?? null);
          wc.setStartHistoryMdText(fetchResult.startHistoryMdText ?? null);
          wc.setStartWelcomeImages(fetchResult.startWelcomeImages ?? null);
          wc.setStartWelcomeConvention(fetchResult.startWelcomeConvention ?? null);
          // Issue #2139: the base's welcome/help stylesheet texts, so the live
          // 11.8 check and the baseline below judge images against kb.css.
          wc.setStartDocCssTexts(fetchResult.startDocCssTexts ?? null);
          // The fonts the adaptation's generated descriptor declares.
          wc.setStartPackageFonts(fetchResult.packageFonts ?? null);
          // spec 080 FR-020 (research R8): run the documentation checks ONCE
          // over the base's own files as fetched. A later finding on a still-
          // inherited member whose code appears here is the base's, not the
          // author's, and renders muted instead of counting against them.
          {
            const baselineKmnPath = findKmnPath(vfs);
            const baselineTouchPath = findTouchLayoutPath(vfs);
            wc.setBaselineDocFindings(
              computeBaselineDocFindings({
                keyboardId: kb.id,
                displayName: kb.displayName,
                kmnText: baselineKmnPath ? (readVfsText(vfs, baselineKmnPath) ?? null) : null,
                kpsText: readVfsText(vfs, `source/${kb.id}.kps`) ?? null,
                kvksText: readVfsText(vfs, `source/${kb.id}.kvks`) ?? null,
                touchLayoutJson: baselineTouchPath ? (readVfsText(vfs, baselineTouchPath) ?? null) : null,
                // Issue #2139: the baseline judges the base's images against the
                // same kb.css texts the live check uses (FR-020 consistency).
                ...(fetchResult.startDocCssTexts !== undefined
                  ? { cssTexts: fetchResult.startDocCssTexts.map((entry) => entry.text) }
                  : {}),
                base: {
                  welcomeHtmText: fetchResult.startWelcomeHtmText ?? null,
                  helpPhpText: fetchResult.startHelpPhpText ?? null,
                  readmeMdText: fetchResult.startReadmeMdText ?? null,
                  historyMdText: fetchResult.startHistoryMdText ?? null,
                  // The base LICENSE is never written into the VFS (loader FR-011)
                  // and the adapt track's shipped LICENSE.md is generated with no
                  // invented holder, so the base's notice has no current
                  // counterpart to compare against — it is not part of the baseline.
                  licenseText: null,
                },
              }),
            );
          }
        }
        // Build a blob URL for the OSK font so the frame can inject an
        // @font-face rule before the keyboard JS executes. Stored in refs so
        // it survives recompile() (the font only changes on a new fetch).
        const fontBlob = buildFontBlobUrl(fetchResult.fonts ?? [], vfs);
        prevFontBlobUrl.current = fontBlob.url;
        fontFaceFamilyRef.current = fontBlob.family;
        // Build a blob URL for each per-keyboard CSS file the .kps declared.
        // The OSK frame injects these as <style> tags so the keyboard's own
        // `.kmw-keyboard-<id>` rules (key colors, font-family bindings, etc.)
        // paint the preview the same way they paint a real install.
        prevKeyboardCssBlobUrls.current = buildCssBlobUrls(fetchResult.stylesheets ?? []);

        // The base's icon came across with the rest of source/ (loader). If it
        // did NOT — an optional sibling the loader could not fetch — the
        // reference now names a file nobody has, and kmcmplib answers that by
        // emitting zero artifacts. Track 2 preserves identity (no rename), so
        // this reads straight off kb.id's .kmn — the same working-copy VFS the
        // download/output path serializes. Mirrors
        // the Track 1 scaffolder's dropBitmapStoreIfUnbacked; see EngineModule's
        // dropUnbackedBitmapStore docstring for why this can't just be the
        // preview-only stripDanglingAssetStores above.
        const openStartKmnPath = findKmnPath(vfs);
        const openStartKmnText = openStartKmnPath ? readVfsText(vfs, openStartKmnPath) : undefined;
        if (openStartKmnPath && openStartKmnText !== undefined && engineRef.current.dropUnbackedBitmapStore) {
          const { kmn: cleaned, dropped } = engineRef.current.dropUnbackedBitmapStore(openStartKmnText, vfs);
          if (dropped !== null) {
            vfs.set(openStartKmnPath, cleaned, false);
            scaffoldWarnings.push(
              `icon '${dropped}' was not available, so the &BITMAP reference was dropped; the keyboard builds without an icon`,
            );
          }
        }
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "Unknown fetch error";
      setStage({ kind: "error", step: "fetch", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Apply optional VFS transform (e.g. mechanism-assignment injection) before
    // compile. Called once per run(), never on recompile(). Warnings are merged
    // so they surface on the ready Stage. Errors in the transform abort the run
    // and surface as a "vfs" step error — the transform must NOT throw for
    // expected conditions (unknown patternId, missing slot); those are warnings.
    // Uses vfsTransformRef.current (not the closure-captured vfsTransform) so
    // assignment updates don't force run() to be recreated.
    // Snapshot the clean populated VFS before the transform mutates it.
    // The transformVersion effect restores this snapshot before each reapply
    // so that stale accumulated .kmn text never poisons rule ordering.
    const currentVfs = vfsRef.current;
    if (currentVfs !== null) {
      startVfsRef.current = createVirtualFS(currentVfs.entries());
    }

    const transform = vfsTransformRef.current;
    if (transform !== null && transform !== undefined && currentVfs !== null) {
      try {
        const keyboardId = scaffoldSpec?.keyboardId ?? kb.id;
        const transformResult = transform(currentVfs, keyboardId);
        scaffoldWarnings.push(...transformResult.warnings);
        // Capture the rename (if any) so runCompile below reads
        // source/<effectiveKeyboardId>.kmn instead of the stale base id.
        effectiveKeyboardIdRef.current = transformResult.effectiveKeyboardId ?? null;

        // Rebuild the keyboard CSS blob URLs from the projected VFS so the OSK
        // frame's <style> tags carry the post-rename `.kmw-keyboard-<newId>`
        // selectors. The stylesheets captured at fetch time (used to seed
        // prevKeyboardCssBlobUrls) hold pre-rename cssText and would otherwise
        // ship the base id's wrapper class — which KMW wraps the runtime
        // keyboard in with the new id, so the rules never match.
        const cssPaths = currentVfs
          .list("")
          .filter((p) => p.endsWith(".css") && isOskStylesheetPath(p));
        if (cssPaths.length > 0) {
          revokeBlobUrls(prevKeyboardCssBlobUrls);
          for (const cssPath of cssPaths) {
            const entry = currentVfs.get(cssPath);
            if (entry === undefined || typeof entry.content !== "string") continue;
            const blob = new Blob([entry.content], { type: "text/css" });
            prevKeyboardCssBlobUrls.current.push(URL.createObjectURL(blob));
          }
        }
      } catch (err: unknown) {
        if (runId.current !== thisRunId) return;
        const message =
          err instanceof Error ? err.message : "VFS transform failed";
        setStage({ kind: "error", step: "vfs", message });
        return;
      }
    }

    // Mark that the first full fetch cycle has completed. The vfsTransform
    // effect above uses this to skip triggering re-apply before the VFS exists.
    hasFetchedRef.current = true;

    if (runId.current !== thisRunId) return;

    // Pass scaffold warnings into runCompile so they surface on the ready Stage.
    // isFullRun=true: this is a full fetch→compile cycle; onInstantiate fires.
    await runCompile(kb, thisRunId, scaffoldWarnings, true);
  }, [scaffoldSpec, runCompile]);

  useEffect(() => {
    if (startKeyboard === null) {
      setStage({ kind: "idle" });
      vfsRef.current = null;
      startVfsRef.current = null;
      lastFullRunKeyRef.current = null;
      // IR ownership moved to the working-copy store; the hook no longer calls
      // clearIR() here. The store's instantiateFromStart / reset owns IR lifecycle.
      return;
    }

    // Value-key guard (see lastFullRunKeyRef): a re-render whose base and
    // scaffold target are unchanged must not restart the fetch→compile
    // cycle — the in-flight (or settled) run for this key already owns it.
    const runKey = `${startKeyboard.id}|${scaffoldSpec?.keyboardId ?? ""}|${scaffoldSpec?.displayName ?? ""}`;
    if (lastFullRunKeyRef.current === runKey) return;
    lastFullRunKeyRef.current = runKey;

    // Reset transformVersion so no stale transform from the previous keyboard
    // can survive into this keyboard's VFS via the transform-change effect.
    setTransformVersion(0);
    const thisRunId = ++runId.current;
    void run(startKeyboard, thisRunId);
  }, [startKeyboard, scaffoldSpec, run]);

  // When the vfsTransform changes after the initial fetch (i.e. the user
  // records an assignment), restore the clean base VFS snapshot, re-apply the
  // transform, and recompile — no re-fetch required. The snapshot restore is
  // necessary because applyCarveToVfs is a no-op when deletedNodeIds is empty,
  // so without it the transform accumulates on a stale .kmn and rule-ordering
  // fixes are bypassed by the idempotency check.
  // isFullRun=false: onInstantiate is NOT fired, so no "switching base
  // keyboards" confirmation dialog is triggered by assignment changes.
  useEffect(() => {
    if (transformVersion === 0) {
      // A full run resets the version to 0 (see the start effect above), so
      // version 0 marks a fresh keyboard lifecycle: drop the guard key with
      // it, so the next keyboard's first re-apply is never compared against
      // this keyboard's last one.
      lastTransformRunKeyRef.current = null;
    }
    if (
      transformVersion === 0 ||
      !hasFetchedRef.current ||
      startKeyboard === null ||
      vfsRef.current === null
    ) {
      return;
    }

    // Value-key guard (see lastTransformRunKeyRef): this exact transform
    // target has already been re-applied and recompiled — a re-render that
    // only carries a fresh scaffoldSpec identity (equal values) must not
    // re-apply or recompile again.
    const transformRunKey = `${transformVersion}|${startKeyboard.id}|${scaffoldSpec?.keyboardId ?? ""}|${scaffoldSpec?.displayName ?? ""}`;
    if (lastTransformRunKeyRef.current === transformRunKey) return;
    lastTransformRunKeyRef.current = transformRunKey;

    const keyboardId = scaffoldSpec?.keyboardId ?? startKeyboard.id;
    const transform = vfsTransformRef.current;
    if (transform !== null && transform !== undefined) {
      // Restore the clean base VFS snapshot so the transform always starts from
      // the unmodified keyboard source, not an accumulated previous result.
      if (startVfsRef.current !== null) {
        vfsRef.current = createVirtualFS(startVfsRef.current.entries());
      }
      // Reset BEFORE invoking the transform, not after. If the transform
      // throws, the catch below leaves this at null rather than a stale
      // renamed id from a PREVIOUS successful reapply — otherwise runCompile
      // would read source/<staleRenamedId>.kmn against the vfsRef.current
      // just restored to the clean, un-renamed base snapshot above,
      // reproducing the exact "compile looks for a file that isn't there"
      // bug class this hook exists to prevent.
      effectiveKeyboardIdRef.current = null;
      try {
        const transformResult = transform(vfsRef.current, keyboardId);
        // Capture the rename (if any) so runCompile reads
        // source/<effectiveKeyboardId>.kmn instead of the stale base id.
        // The base VFS snapshot restore above means each reapply starts
        // clean, so a rename that no longer applies (e.g. the author reverted
        // the id) correctly clears back to null here.
        effectiveKeyboardIdRef.current = transformResult.effectiveKeyboardId ?? null;
      } catch {
        // The transform threw. effectiveKeyboardIdRef was already reset to
        // null above and vfsRef.current is the clean, un-renamed base
        // snapshot restored a few lines up (no partial carve/assignment/
        // identity edit applied) — so the recompile below reads
        // source/<baseId>.kmn against unmodified source. No warning is
        // attached anywhere for this failure (it is silent beyond whatever
        // the transform itself may log); that pre-existing gap is not
        // introduced by this comment fix and is left as-is here.
      }
    }

    const thisRunId = ++runId.current;
    void runCompile(startKeyboard, thisRunId, [], false);
  }, [transformVersion, startKeyboard, scaffoldSpec, runCompile]);

  useEffect(() => {
    return () => {
      // Retire this instance's I2 pass if one is in flight: nobody is left
      // to read its findings, and letting it simulate to completion keeps
      // it competing for the main thread with whatever screen replaces
      // this one (#2249 — the Output frontier: SurveyView and the gallery
      // unmount when the author navigates to Output, and their passes were
      // still running while Output's own pipeline tried to compile).
      // Exactly this instance's token — a sibling's pass belongs to a
      // screen still mounted. StrictMode's simulated unmount runs this
      // cleanup before any pass can have started (I2 starts after
      // `ready`), so it is a no-op there.
      if (ownRoundTripTokenRef.current !== null) {
        ownRoundTripTokenRef.current.aborted = true;
        if (activeRoundTripToken === ownRoundTripTokenRef.current) {
          activeRoundTripToken = null;
        }
        ownRoundTripTokenRef.current = null;
      }
      revokeBlobUrl(prevBlobUrl);
      revokeBlobUrl(prevFontBlobUrl);
      revokeBlobUrls(prevKeyboardCssBlobUrls);
    };
  }, []);

  const retry = useCallback(() => {
    if (startKeyboard !== null) {
      const thisRunId = ++runId.current;
      void run(startKeyboard, thisRunId);
    }
  }, [startKeyboard, run]);

  const recompile = useCallback(() => {
    if (startKeyboard !== null && vfsRef.current !== null) {
      const thisRunId = ++runId.current;
      void runCompile(startKeyboard, thisRunId, [], false);
    }
  }, [startKeyboard, runCompile]);

  return { stage, retry, recompile };
}
