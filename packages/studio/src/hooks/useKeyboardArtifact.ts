import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, VirtualFS, KeyboardIR, KpsFontEntry, KpsStylesheetEntry } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { LOCAL_PROXY_BASE, getScaffolderService } from "../lib/services.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";

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
  | { kind: "ready"; compileResult: CompileResult; jsBlobUrl: string; vfs: VirtualFS; scaffoldWarnings: string[]; fontFaceUrl?: string; fontFaceFamily?: string; keyboardCssUrls?: string[] }
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
  opts: { vfs: VirtualFS; ir: KeyboardIR | null },
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
  const engineLoadAttempted = useRef(false);
  // Persistent VFS across recompiles — lifted out of the run closure.
  const vfsRef = useRef<VirtualFS | null>(null);

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
    if (engine === null || vfs === null) return;

    if (runId.current !== thisRunId) return;

    const isWarmCompile = engine.isReady?.() ?? false;
    setStage({ kind: "compiling", isWarmCompile });

    let result: CompileResult;
    let parsedIr: KeyboardIR | null = null;
    try {
      const kmnPath = findKmnPath(vfs);
      const kmnText = kmnPath ? (vfs.get(kmnPath)!.content as string) : "";

      const compileId = scaffoldSpec?.keyboardId ?? kb.id;

      const [compileResult, parseResult] = await Promise.all([
        engine.compile(vfs, compileId),
        Promise.resolve().then(() => {
          if (!engine.parseKmn || !engine.recognizePatterns || !kmnPath) return null;
          const pr = engine.parseKmn(kmnText, compileId);
          const recognized = engine.recognizePatterns(pr.ir);
          return { ...pr, ir: recognized.ir };
        }),
      ]);
      result = compileResult;
      if (parseResult) {
        parsedIr = parseResult.ir;
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message = err instanceof Error ? err.message : "Unknown compile error";
      setStage({ kind: "error", step: "compile", message });
      return;
    }

    if (runId.current !== thisRunId) return;

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
      onInstantiate(kb, { vfs, ir: parsedIr });
    }

    // Carry font face info (added by the .kps font-loading path) onto the ready stage.
    const readyStage: Extract<Stage, { kind: "ready" }> = {
      kind: "ready", compileResult: result, jsBlobUrl, vfs, scaffoldWarnings: warnings,
    };
    if (prevFontBlobUrl.current !== null) readyStage.fontFaceUrl = prevFontBlobUrl.current;
    if (fontFaceFamilyRef.current !== null) readyStage.fontFaceFamily = fontFaceFamilyRef.current;
    if (prevKeyboardCssBlobUrls.current.length > 0) {
      readyStage.keyboardCssUrls = prevKeyboardCssBlobUrls.current;
    }
    setStage(readyStage);
  }, [scaffoldSpec?.keyboardId, onInstantiate]);

  const run = useCallback(async (kb: BaseKeyboard, thisRunId: number) => {
    // Step 0: Lazily load the engine module once.
    if (!engineLoadAttempted.current) {
      engineLoadAttempted.current = true;
      try {
        const mod = await loadEngine();
        if (mod === null) {
          setStage({
            kind: "error",
            step: "vfs",
            message:
              "Engine failed to load — check browser console for WASM errors.",
          });
          return;
        }
        engineRef.current = mod;
        await mod.init();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "WASM engine failed to load";
        setStage({ kind: "error", step: "vfs", message });
        return;
      }
    }

    if (runId.current !== thisRunId) return;

    setStage({ kind: "fetching" });

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
        // Open-base path — fetch existing keyboard source.
        const fetchResult = await engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, {
          proxyBase: LOCAL_PROXY_BASE,
        });
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
    if (vfsTransform !== null && vfsTransform !== undefined && vfsRef.current !== null) {
      try {
        const keyboardId = scaffoldSpec?.keyboardId ?? kb.id;
        const transformResult = vfsTransform(vfsRef.current, keyboardId);
        scaffoldWarnings.push(...transformResult.warnings);
      } catch (err: unknown) {
        if (runId.current !== thisRunId) return;
        const message =
          err instanceof Error ? err.message : "VFS transform failed";
        setStage({ kind: "error", step: "vfs", message });
        return;
      }
    }

    if (runId.current !== thisRunId) return;

    // Pass scaffold warnings into runCompile so they surface on the ready Stage.
    // isFullRun=true: this is a full fetch→compile cycle; onInstantiate fires.
    await runCompile(kb, thisRunId, scaffoldWarnings, true);
  }, [scaffoldSpec, vfsTransform, runCompile]);

  useEffect(() => {
    if (baseKeyboard === null) {
      setStage({ kind: "idle" });
      vfsRef.current = null;
      // IR ownership moved to the working-copy store; the hook no longer calls
      // clearIR() here. The store's instantiateFromBase / reset owns IR lifecycle.
      return;
    }

    const thisRunId = ++runId.current;
    void run(baseKeyboard, thisRunId);
  }, [baseKeyboard, scaffoldSpec, run]);

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
      void runCompile(baseKeyboard, thisRunId);
    }
  }, [baseKeyboard, runCompile]);

  return { stage, retry, recompile };
}
