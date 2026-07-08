import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, VirtualFS, KeyboardIR, RemovalCapability, TouchLayoutIR, KpsFontEntry, KpsStylesheetEntry } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { LOCAL_PROXY_BASE, getScaffolderService } from "../lib/services.ts";
// Re-exported so tests can assert the open-base fetch passes this exact proxy
// base by reference, rather than hardcoding the literal (which a rename could
// silently desync from).
export { LOCAL_PROXY_BASE };
import { findKmnPath } from "../lib/findKmnPath.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";

interface EngineModule {
  compile: (fs: VirtualFS, keyboardId: string) => Promise<CompileResult>;
  fetchKeyboardSourceToVfs: (
    baseKeyboard: BaseKeyboard,
    fs: VirtualFS,
    opts?: { proxyBase?: string }
  ) => Promise<{ options?: Record<string, unknown>; filesLoaded?: string[]; warnings?: string[]; fonts?: KpsFontEntry[]; stylesheets?: KpsStylesheetEntry[] }>;
  init: () => Promise<void>;
  isReady?: () => boolean;
  parseKmn?: (text: string, keyboardId: string) => { ir: KeyboardIR; opaqueFeatures: Array<{ feature: string; count: number }> };
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
}

async function loadEngine(): Promise<EngineModule | null> {
  try {
    const mod = await import(
      /* @vite-ignore */ "@keyboard-studio/engine"
    );
    if (
      typeof mod.compile === "function" &&
      typeof mod.fetchKeyboardSourceToVfs === "function" &&
      typeof mod.init === "function"
    ) {
      return mod as EngineModule;
    }
    return null;
  } catch {
    return null;
  }
}

// Maximum time the fetch step may run before we surface a retryable error.
// A stalled proxy/network request would otherwise leave the preview overlay
// stuck on "Loading keyboard source..." forever (the run is never superseded
// when baseKeyboard is stable), so we bound it and fall through to the existing
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
// Stage discriminated union
// ---------------------------------------------------------------------------

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
  | { kind: "ready"; compileResult: CompileResult; jsBlobUrl: string; vfs: VirtualFS; scaffoldWarnings: string[]; keyboardId: string; fontFaceUrl?: string; fontFaceFamily?: string; keyboardCssUrls?: string[] }
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
) => { warnings: string[] };

/**
 * Called exactly once per successful fetch→compile run, after both the
 * compile result and the parsed IR are available. The caller (PreviewShell,
 * SurveyView) uses this to call instantiateFromBase or instantiateFromExisting
 * on the workingCopyStore — separating the pipeline from store ownership.
 *
 * `ir` is null when the engine does not expose parseKmn/recognizePatterns (i.e.
 * the real WASM engine is absent and only the mock compile path ran). Callers
 * must guard on ir !== null before passing it to the store.
 */
export type OnInstantiateCallback = (
  base: BaseKeyboard,
  opts: { vfs: VirtualFS; ir: KeyboardIR | null; removalCapabilities: Map<string, RemovalCapability> },
) => void;

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
 * single BaseKeyboard selection. No debounce — the picker drives this
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
 * whether to call instantiateFromBase or instantiateFromExisting. The callback
 * receives ir=null when parseKmn is unavailable (mock engine path).
 */
export function useKeyboardArtifact(
  baseKeyboard: BaseKeyboard | null,
  scaffoldSpec?: ScaffoldSpec | null,
  vfsTransform?: VfsTransform | null,
  onInstantiate?: OnInstantiateCallback | null,
): KeyboardArtifactResult {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const prevBlobUrl = useRef<string | null>(null);
  const prevFontBlobUrl = useRef<string | null>(null);
  // Current OSK font family, paired with prevFontBlobUrl. Persists across
  // recompiles — the font only changes on a new fetch, not on recompile().
  const fontFaceFamilyRef = useRef<string | null>(null);
  // Per-keyboard CSS blob URLs. Same lifetime semantics as the font blob URL:
  // rebuilt on every fresh fetch, revoked on teardown / next fetch.
  const prevKeyboardCssBlobUrls = useRef<string[]>([]);
  const runId = useRef(0);
  const engineRef = useRef<EngineModule | null>(null);
  // Shared engine load+init promise. Assigned once by the first run() call.
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
  const baseVfsRef = useRef<VirtualFS | null>(null);

  // vfsTransform stored in a ref so that assignment changes (which produce a
  // new function reference from useWorkingCopyTransform) do NOT re-trigger
  // the full fetch→compile cycle. Only baseKeyboard / scaffoldSpec changes
  // should restart from "fetching". Transform-only changes recompile cheaply.
  const vfsTransformRef = useRef<VfsTransform | null | undefined>(vfsTransform);
  // True once the first full fetch+compile cycle has completed. Used by the
  // transform-change effect below to skip the initial render.
  const hasFetchedRef = useRef(false);
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

  // Separate compile step, callable independently for the recompile() path.
  // `warnings` carries any scaffold warnings from the preceding fetch step;
  // empty for recompile() calls (which don't re-scaffold).
  // `isFullRun` distinguishes a full fetch→compile run (fires onInstantiate)
  // from a recompile()-only call (does NOT fire onInstantiate — no VFS change).
  const runCompile = useCallback(async (
    kb: BaseKeyboard,
    thisRunId: number,
    warnings: string[] = [],
    isFullRun: boolean = false,
  ): Promise<void> => {
    const engine = engineRef.current;
    const vfs = vfsRef.current;
    if (engine === null || vfs === null) {
      return;
    }

    if (runId.current !== thisRunId) {
      return;
    }

    const isWarmCompile = engine.isReady?.() ?? false;
    setStage({ kind: "compiling", isWarmCompile });

    let result: CompileResult;
    let parsedIr: KeyboardIR | null = null;
    let parsedRemovalCapabilities: Map<string, RemovalCapability> = new Map();
    const compileId = scaffoldSpec?.keyboardId ?? kb.id;
    // Parse failure is captured here so it can be surfaced as a non-fatal
    // warning rather than aborting the compile/preview flow (slice 4, AC #4).
    let parseWarning: string | null = null;
    try {
      const kmnPath = findKmnPath(vfs);
      const kmnText = kmnPath ? (vfs.get(kmnPath)!.content as string) : "";

      // Strip dangling packaging-asset references before compiling for preview.
      // If the base names a BITMAP / VISUALKEYBOARD / LAYOUTFILE that wasn't
      // fetched into the VFS, kmcmplib produces ZERO artifacts (only a warning),
      // which surfaces as "no usable artifacts" and a blank preview. The preview
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
          const compileEntry = vfs.get(compilePath)!.content as string;
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
              const touchEntry = touchPath ? vfs.get(touchPath) : undefined;
              if (touchEntry && typeof touchEntry.content === "string") {
                try {
                  ir = { ...ir, touchLayout: engine.parseTouchLayout(touchEntry.content) };
                } catch (e) {
                  console.warn("[useKeyboardArtifact] parseTouchLayout failed, falling back to generated default:", e);
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
            return { ...pr, ir, removalCapabilities: caps };
          } catch (parseErr: unknown) {
            // Record the gap so it surfaces as a warning on the ready stage.
            // Do not re-throw — compile must still succeed independently.
            parseWarning = parseErr instanceof Error
              ? `IR features unavailable: ${parseErr.message}`
              : "IR features unavailable: unknown parse error";
            return null;
          }
        })(),
      ]);
      result = compileResult;
      if (parseResult) {
        parsedIr = parseResult.ir;
        parsedRemovalCapabilities = parseResult.removalCapabilities;
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message = err instanceof Error ? err.message : "Unknown compile error";
      setStage({ kind: "error", step: "compile", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Fold any parse-gap note into the scaffold warnings so the ready stage
    // surfaces "IR features unavailable: <reason>" without blocking the preview.
    if (parseWarning !== null) {
      warnings = [...warnings, parseWarning];
    }

    const jsArtifact = result.artifacts.find((a) => a.filename.endsWith(".js"));

    if (prevBlobUrl.current !== null) {
      URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = null;
    }

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
      onInstantiate(kb, { vfs, ir: parsedIr, removalCapabilities: parsedRemovalCapabilities });
    }

    // Carry font face info (added by the .kps font-loading path) onto the ready stage.
    const readyStage: Extract<Stage, { kind: "ready" }> = {
      kind: "ready", compileResult: result, jsBlobUrl, vfs, scaffoldWarnings: warnings, keyboardId: compileId,
    };
    if (prevFontBlobUrl.current !== null) readyStage.fontFaceUrl = prevFontBlobUrl.current;
    if (fontFaceFamilyRef.current !== null) readyStage.fontFaceFamily = fontFaceFamilyRef.current;
    if (prevKeyboardCssBlobUrls.current.length > 0) {
      readyStage.keyboardCssUrls = prevKeyboardCssBlobUrls.current;
    }
    setStage(readyStage);
  }, [scaffoldSpec?.keyboardId, onInstantiate]);

  const run = useCallback(async (kb: BaseKeyboard, thisRunId: number) => {
    // Reset so transform changes during this fetch do not trigger a premature
    // re-apply+recompile before the new VFS is ready. It is set back to true
    // after the transform is applied at the end of the fetch step.
    hasFetchedRef.current = false;

    // Transition to fetching immediately so the preview pane shows a loading
    // state rather than blank/idle during the async engine + source load.
    setStage({ kind: "fetching" });

    // Step 0: Lazily load the engine module. All concurrent run() calls share
    // a single promise so the second call doesn't skip this block while
    // engineRef.current is still null (the original one-shot flag race).
    if (engineReadyPromise.current === null) {
      engineReadyPromise.current = (async () => {
        const mod = await loadEngine();
        if (mod === null) {
          throw new Error(
            "Engine failed to load — check browser console for WASM errors.",
          );
        }
        engineRef.current = mod;
        await mod.init();
      })();
    }
    try {
      await engineReadyPromise.current;
    } catch (err: unknown) {
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
    if (prevFontBlobUrl.current !== null) {
      URL.revokeObjectURL(prevFontBlobUrl.current);
      prevFontBlobUrl.current = null;
    }
    fontFaceFamilyRef.current = null;
    for (const url of prevKeyboardCssBlobUrls.current) URL.revokeObjectURL(url);
    prevKeyboardCssBlobUrls.current = [];

    try {
      if (scaffoldSpec != null) {
        // Scaffold path — new keyboard authoring. Routes through
        // getScaffolderService() so USE_REAL=false uses the mock in CI.
        const svc = await getScaffolderService();
        const result = await svc.scaffold(kb, scaffoldSpec.keyboardId, scaffoldSpec.displayName);
        vfsRef.current = result.vfs;
        scaffoldWarnings.push(...result.warnings);
        // Build font + CSS blob URLs from scaffold result — mirrors the open-base path below.
        // result.fonts / result.stylesheets forwarded by scaffold() from fetchKeyboardSourceToVfs.
        const oskFontEntry = result.fonts.find((f) => f.isOskFont && f.family);
        if (oskFontEntry) {
          const fontFile = vfsRef.current.get(oskFontEntry.vfsPath);
          if (fontFile && fontFile.content instanceof Uint8Array) {
            const blob = new Blob([fontFile.content.slice().buffer], { type: "font/ttf" });
            prevFontBlobUrl.current = URL.createObjectURL(blob);
            fontFaceFamilyRef.current = oskFontEntry.family ?? null;
          }
        }
        for (const sheet of result.stylesheets) {
          const blob = new Blob([sheet.cssText], { type: "text/css" });
          prevKeyboardCssBlobUrls.current.push(URL.createObjectURL(blob));
        }
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
        // Build a blob URL for the OSK font so the frame can inject an
        // @font-face rule before the keyboard JS executes. Stored in refs so
        // it survives recompile() (the font only changes on a new fetch).
        const oskFontEntry = (fetchResult.fonts ?? []).find((f) => f.isOskFont && f.family);
        if (oskFontEntry) {
          const fontFile = vfs.get(oskFontEntry.vfsPath);
          if (fontFile && fontFile.content instanceof Uint8Array) {
            // .slice() copies into a fresh ArrayBuffer-backed view — byte-correct
            // (respects byteOffset/length) and a valid BlobPart under the TS lib.
            const blob = new Blob([fontFile.content.slice().buffer], { type: "font/ttf" });
            prevFontBlobUrl.current = URL.createObjectURL(blob);
            fontFaceFamilyRef.current = oskFontEntry.family ?? null;
          }
        }
        // Build a blob URL for each per-keyboard CSS file the .kps declared.
        // The OSK frame injects these as <style> tags so the keyboard's own
        // `.kmw-keyboard-<id>` rules (key colors, font-family bindings, etc.)
        // paint the preview the same way they paint a real install.
        for (const sheet of fetchResult.stylesheets ?? []) {
          const blob = new Blob([sheet.cssText], { type: "text/css" });
          prevKeyboardCssBlobUrls.current.push(URL.createObjectURL(blob));
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
    if (vfsRef.current !== null) {
      baseVfsRef.current = createVirtualFS(vfsRef.current.entries());
    }

    if (vfsTransformRef.current !== null && vfsTransformRef.current !== undefined && vfsRef.current !== null) {
      try {
        const keyboardId = scaffoldSpec?.keyboardId ?? kb.id;
        const transformResult = vfsTransformRef.current(vfsRef.current, keyboardId);
        scaffoldWarnings.push(...transformResult.warnings);

        // Rebuild the keyboard CSS blob URLs from the projected VFS so the OSK
        // frame's <style> tags carry the post-rename `.kmw-keyboard-<newId>`
        // selectors. The stylesheets captured at fetch time (used to seed
        // prevKeyboardCssBlobUrls) hold pre-rename cssText and would otherwise
        // ship the base id's wrapper class — which KMW wraps the runtime
        // keyboard in with the new id, so the rules never match.
        const projectedVfs = vfsRef.current;
        const cssPaths = projectedVfs
          .list("")
          .filter((p) => p.endsWith(".css"));
        if (cssPaths.length > 0) {
          for (const url of prevKeyboardCssBlobUrls.current) URL.revokeObjectURL(url);
          prevKeyboardCssBlobUrls.current = [];
          for (const cssPath of cssPaths) {
            const entry = projectedVfs.get(cssPath);
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
    if (baseKeyboard === null) {
      setStage({ kind: "idle" });
      vfsRef.current = null;
      baseVfsRef.current = null;
      // IR ownership moved to the working-copy store; the hook no longer calls
      // clearIR() here. The store's instantiateFromBase / reset owns IR lifecycle.
      return;
    }

    // Reset transformVersion so no stale transform from the previous keyboard
    // can survive into this keyboard's VFS via the transform-change effect.
    setTransformVersion(0);
    const thisRunId = ++runId.current;
    void run(baseKeyboard, thisRunId);
  }, [baseKeyboard, scaffoldSpec, run]);

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
      return;
    }
    // hasFetchedRef is set to false synchronously inside run() before this
    // effect fires. If it is false, a new fetch is in progress and the VFS
    // is empty — skip recompile to avoid cancelling the in-flight run.
    if (!hasFetchedRef.current) {
      return;
    }
    if (baseKeyboard === null || vfsRef.current === null) {
      return;
    }

    const keyboardId = scaffoldSpec?.keyboardId ?? baseKeyboard.id;
    if (vfsTransformRef.current !== null && vfsTransformRef.current !== undefined) {
      // Restore the clean base VFS snapshot so the transform always starts from
      // the unmodified keyboard source, not an accumulated previous result.
      if (baseVfsRef.current !== null) {
        vfsRef.current = createVirtualFS(baseVfsRef.current.entries());
      }
      try {
        vfsTransformRef.current(vfsRef.current, keyboardId);
      } catch {
        // Transform errors surface as compile diagnostics; don't abort.
      }
    }

    const thisRunId = ++runId.current;
    void runCompile(baseKeyboard, thisRunId, [], false);
  }, [transformVersion, baseKeyboard, scaffoldSpec, runCompile]);

  useEffect(() => {
    return () => {
      if (prevBlobUrl.current !== null) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
      if (prevFontBlobUrl.current !== null) {
        URL.revokeObjectURL(prevFontBlobUrl.current);
        prevFontBlobUrl.current = null;
      }
      for (const url of prevKeyboardCssBlobUrls.current) URL.revokeObjectURL(url);
      prevKeyboardCssBlobUrls.current = [];
    };
  }, []);

  const retry = useCallback(() => {
    if (baseKeyboard !== null) {
      const thisRunId = ++runId.current;
      void run(baseKeyboard, thisRunId);
    }
  }, [baseKeyboard, run]);

  const recompile = useCallback(() => {
    if (baseKeyboard !== null && vfsRef.current !== null) {
      const thisRunId = ++runId.current;
      void runCompile(baseKeyboard, thisRunId, [], false);
    }
  }, [baseKeyboard, runCompile]);

  return { stage, retry, recompile };
}
