// Static stub for hooks/useKeyboardArtifact.ts: a fresh `{ kind: "idle" }`
// stage on every render and no onInstantiate. For suites that never settle the
// compile pipeline and were written against this exact shape (charmap, the
// golden walk); use ./useKeyboardArtifact.ts when a test must drive the stage.

import { vi, type Mock } from "vitest";

export const useKeyboardArtifact = (): { stage: { kind: "idle" }; retry: Mock; recompile: Mock } => ({
  stage: { kind: "idle" },
  retry: vi.fn(),
  recompile: vi.fn(),
});
