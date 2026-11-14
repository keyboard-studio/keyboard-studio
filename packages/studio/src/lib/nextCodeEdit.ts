// nextCodeEdit -- the Code-tab entry the store will record next (spec 117 US8, research R15).
//
// The Apply gate predicts the build, and compiles it, with the candidate entry replayed after the
// recorded ones. Its seq is one above the highest recorded, which is what `commitKmnEdit` assigns,
// so a projection warning that names the seq is about this candidate.

import type { CodeEdit, IRChange, KmnEditsValue } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";

export function nextCodeEdit(changes: readonly IRChange[]): CodeEdit {
  const value = useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
  const seq = (value?.entries ?? []).reduce((max, e) => Math.max(max, e.seq), 0) + 1;
  return { seq, at: Date.now(), op: "code-apply", changes: [...changes], overrides: [] };
}
