import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, VirtualFS, KeyboardIR } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { LOCAL_PROXY_BASE } from "../lib/services.ts";
import { useIRStore } from "../stores/irStore.ts";

interface EngineModule {
  compile: (fs: VirtualFS, keyboardId: string) => Promise<CompileResult>;
  fetchKeyboardSourceToVfs: (
    baseKeyboard: BaseKeyboard,
    fs: VirtualFS,
    opts?: { proxyBase?: string }
  ) => Promise<{ options?: Record<string, unknown>; filesLoaded?: string[]; warnings?: string[] }>;
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

    const vfs = createVirtualFS();

    try {
      if (engineRef.current) {
        await engineRef.current.fetchKeyboardSourceToVfs(kb, vfs, {
          proxyBase: LOCAL_PROXY_BASE,
        });
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message =
        err instanceof Error ? err.message : "Unknown fetch error";
      setStage({ kind: "error", step: "fetch", message });
      return;
    }

    if (runId.current !== thisRunId) return;

    const isWarmCompile = engineRef.current?.isReady?.() ?? false;

    setStage({ kind: "compiling", isWarmCompile });

    let result: CompileResult;
    try {
      const kmnPath = vfs.list().find((p) => p.endsWith('.kmn'));
      const kmnText = kmnPath ? (vfs.get(kmnPath)!.content as string) : '';

      const [compileResult, parseResult] = await Promise.all([
        engineRef.current!.compile(vfs, kb.id),
        Promise.resolve().then(() => {
          if (!engineRef.current!.parseKmn || !engineRef.current!.recognizePatterns || !kmnPath) return null;
          const pr = engineRef.current!.parseKmn(kmnText, kb.id);
          const recognized = engineRef.current!.recognizePatterns(pr.ir);
          return { ...pr, ir: recognized.ir };
        }),
      ]);
      result = compileResult;
      if (parseResult) {
        useIRStore.getState().setIR(parseResult.ir);
      }
    } catch (err: unknown) {
      if (runId.current !== thisRunId) return;
      const message = err instanceof Error ? err.message : 'Unknown compile error';
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
      useIRStore.getState().clearIR();
      return;
    }

    useIRStore.getState().clearIR();
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
