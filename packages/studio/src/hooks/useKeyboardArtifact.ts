import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { makeMockVirtualFS } from "@keyboard-studio/contracts/mocks";
import { mockCompiler } from "@keyboard-studio/contracts/mocks";
import { LOCAL_PROXY_BASE } from "../lib/localBaseBrowser.ts";

// ---------------------------------------------------------------------------
// Engine imports — these symbols land when km-keyman / km-output finish their
// parallel work (issues #17 / #39-loader). Until then the dynamic import
// below falls back to the mock implementations so the hook is exercisable
// in dev and test without the real WASM pipeline.
//
// Import path: "@keyboard-studio/engine" (workspace package)
// Exported symbols: compile, fetchKeyboardSourceToVfs, init
// ---------------------------------------------------------------------------

// The engine module is imported lazily so that a missing export does not blow
// up the entire SPA. We define the expected shape here:
interface EngineModule {
  compile: (
    fs: ReturnType<typeof makeMockVirtualFS>,
    keyboardId: string
  ) => Promise<CompileResult>;
  fetchKeyboardSourceToVfs: (
    baseKeyboard: BaseKeyboard,
    fs: ReturnType<typeof makeMockVirtualFS>,
    opts?: { proxyBase?: string }
  ) => Promise<{ options?: Record<string, unknown> }>;
  init: () => Promise<void>;
  isReady?: () => boolean;
}

async function loadEngine(): Promise<EngineModule | null> {
  try {
    // Dynamic import — resolved at runtime. The engine package will re-export
    // compile + fetchKeyboardSourceToVfs + init once #17 / loader land.
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
    // Engine package not yet built / exports not yet present.
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
  | { kind: "ready"; compileResult: CompileResult; jsBlobUrl: string }
  | {
      kind: "error";
      step: "fetch" | "vfs" | "compile";
      message: string;
      compileResult?: CompileResult;
    };

export interface KeyboardArtifactResult {
  stage: Stage;
  retry: () => void;
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
 */
export function useKeyboardArtifact(
  baseKeyboard: BaseKeyboard | null
): KeyboardArtifactResult {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // Track the previous blob URL so we can revoke it when a new one is produced.
  const prevBlobUrl = useRef<string | null>(null);
  // Abort controller lets us ignore results from a stale pipeline run.
  const runId = useRef(0);
  // Stable reference to the engine module once loaded.
  const engineRef = useRef<EngineModule | null>(null);
  // Track whether we've attempted to load the engine.
  const engineLoadAttempted = useRef(false);

  const run = useCallback(async (kb: BaseKeyboard, thisRunId: number) => {
    // Step 0: Lazily load the engine module once.
    if (!engineLoadAttempted.current) {
      engineLoadAttempted.current = true;
      const mod = await loadEngine();
      engineRef.current = mod;
      // Warm up the compiler. If the engine module is absent, fall through to mockCompiler.
      if (mod) {
        await mod.init();
      } else {
        await mockCompiler.init();
      }
    }

    if (runId.current !== thisRunId) return;

    setStage({ kind: "fetching" });

    // Step 1: Create an empty VirtualFS.
    const vfs = makeMockVirtualFS([]);

    // Step 2: Fetch keyboard source into VFS (local clone via Vite plugin).
    try {
      if (engineRef.current) {
        await engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, {
          proxyBase: LOCAL_PROXY_BASE,
        });
      }
      // If engine is absent, skip fetch — mockCompiler.compile() works without
      // real source files (it returns a fixture result).
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "Unknown fetch error";
      setStage({ kind: "error", step: "fetch", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Step 3: Determine warm state for overlay UX.
    const isWarmCompile = engineRef.current
      ? engineRef.current.isReady?.() ?? false
      : mockCompiler.isReady();

    setStage({ kind: "compiling", isWarmCompile });

    // Step 4: Compile.
    let result: CompileResult;
    try {
      if (engineRef.current) {
        result = await engineRef.current.compile(vfs, kb.id);
      } else {
        result = await mockCompiler.compile(vfs, kb.id);
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "Unknown compile error";
      setStage({ kind: "error", step: "compile", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    // Step 5: Find .js artifact and create a blob URL.
    const jsArtifact = result.artifacts.find((a) =>
      a.filename.endsWith(".js")
    );

    // Revoke previous blob URL before creating the new one (memory hygiene).
    if (prevBlobUrl.current !== null) {
      URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = null;
    }

    let jsBlobUrl: string;
    if (jsArtifact) {
      // If the artifact already has a blob URL from the compiler, use it
      // directly; otherwise the artifact.url is already the usable URL.
      jsBlobUrl = jsArtifact.url;
      // Only track for revocation if we created the blob (i.e. it starts with "blob:").
      if (jsBlobUrl.startsWith("blob:")) {
        prevBlobUrl.current = jsBlobUrl;
      }
    } else if (!result.success && result.artifacts.length === 0) {
      // Parse-fatal: no usable artifacts.
      setStage({
        kind: "error",
        step: "compile",
        message: "Compile failed: no usable artifacts produced.",
        compileResult: result,
      });
      return;
    } else {
      // success with no .js artifact (desktop-only keyboard, no touch layout).
      // Still transition to ready; OSKFrame won't send SET_KEYBOARD for touch mode.
      jsBlobUrl = "";
    }

    setStage({ kind: "ready", compileResult: result, jsBlobUrl });
  }, []);

  // Re-run the pipeline whenever the baseKeyboard selection changes.
  useEffect(() => {
    if (baseKeyboard === null) {
      setStage({ kind: "idle" });
      return;
    }

    const thisRunId = ++runId.current;
    void run(baseKeyboard, thisRunId);

    return () => {
      // Mark this run as stale; its async results will be ignored.
      // We do NOT revoke the blob URL here — the next run's Step 5 revokes it.
    };
  }, [baseKeyboard, run]);

  // Revoke the final blob URL on hook unmount.
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current !== null) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
    };
  }, []);

  const retry = useCallback(() => {
    if (baseKeyboard !== null) {
      const thisRunId = ++runId.current;
      void run(baseKeyboard, thisRunId);
    }
  }, [baseKeyboard, run]);

  return { stage, retry };
}
