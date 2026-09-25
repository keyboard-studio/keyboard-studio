// Controllable stub for hooks/useKeyboardArtifact.ts, so WASM and the VFS are
// never touched. By default every mount reports a stable `{ kind: "idle" }`
// stage and onInstantiate never fires. A test that needs the compile pipeline
// to "settle" imports `artifactHoisted` and calls
// `artifactHoisted.onInstantiateRef.current` and/or pushes a new stage through
// every live `artifactHoisted.stageSetters` entry.

import { useEffect, useState } from "react";
import { vi, type Mock } from "vitest";
import type { OnInstantiateCallback, Stage } from "../../hooks/useKeyboardArtifact.ts";

export const artifactHoisted = {
  onInstantiateRef: { current: null as OnInstantiateCallback | null },
  stageSetters: [] as Array<(s: Stage) => void>,
};

export function useKeyboardArtifact(
  _base: unknown,
  _spec: unknown,
  _transform: unknown,
  onInstantiate: OnInstantiateCallback | null | undefined,
): { stage: Stage; retry: Mock; recompile: Mock } {
  artifactHoisted.onInstantiateRef.current = onInstantiate ?? null;
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  useEffect(() => {
    artifactHoisted.stageSetters.push(setStage);
    return () => {
      artifactHoisted.stageSetters = artifactHoisted.stageSetters.filter((f) => f !== setStage);
    };
  }, []);
  return { stage, retry: vi.fn(), recompile: vi.fn() };
}
