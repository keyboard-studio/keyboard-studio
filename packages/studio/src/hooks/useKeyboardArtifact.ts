import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
// [SCAFFOLD] Mock fallbacks — in use until @keyboard-studio/engine exports
// compile + fetchKeyboardSourceToVfs + init (issues #17 / #39-loader).
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

// [SCAFFOLD] Dynamic import falls back gracefully when the engine package
// doesn't yet export compile/fetchKeyboardSourceToVfs/init.
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
  const prevBlobUrl = useRef<string | null>(null);
  const runId = useRef(0);
  const engineRef = useRef<EngineModule | null>(null);
  const engineLoadAttempted = useRef(false);

  const run = useCallback(async (kb: BaseKeyboard, thisRunId: number) => {
    // Step 0: Lazily load the engine module once.
    if (!engineLoadAttempted.current) {
      engineLoadAttempted.current = true;
      const mod = await loadEngine();
      engineRef.current = mod;
      if (mod) {
        await mod.init();
      } else {
        // [SCAFFOLD] Fall back to mock compiler while engine is unbuilt.
        await mockCompiler.init();
      }
    }

    if (runId.current !== thisRunId) return;

    setStage({ kind: "fetching" });

    // [SCAFFOLD] makeMockVirtualFS — replace with real VirtualFS from
    // @keyboard-studio/engine once spec §11 VirtualFS lands.
    const vfs = makeMockVirtualFS([]);

    try {
      if (engineRef.current) {
        await engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, {
          proxyBase: LOCAL_PROXY_BASE,
        });
      }
      // If engine is absent, skip fetch — mockCompiler.compile() works without
      // real source files (returns a fixture result).
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "Unknown fetch error";
      setStage({ kind: "error", step: "fetch", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    const isWarmCompile = engineRef.current
      ? engineRef.current.isReady?.() ?? false
      : mockCompiler.isReady();

    setStage({ kind: "compiling", isWarmCompile });

    let result: CompileResult;
    try {
      if (engineRef.current) {
        result = await engineRef.current.compile(vfs, kb.id);
      } else {
        // [SCAFFOLD] mockCompiler — remove when engine exports compile().
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

    const jsArtifact = result.artifacts.find((a) =>
      a.filename.endsWith(".js")
    );

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

    setStage({ kind: "ready", compileResult: result, jsBlobUrl });
  }, []);

  useEffect(() => {
    if (baseKeyboard === null) {
      setStage({ kind: "idle" });
      return;
    }

    const thisRunId = ++runId.current;
    void run(baseKeyboard, thisRunId);
  }, [baseKeyboard, run]);

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
