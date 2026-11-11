// Spec 117 (research R12, T056 follow-up): what a rebuild does when a recorded kmn-edits entry can
// no longer be applied, e.g. the starting point is switched to a mnemonic keyboard after Layout
// edits were recorded. replayKmnEdits throws on a refusal (misses stay empty until US8), so this
// pins the CURRENT behaviour: the rebuild throws. If US8 turns refusals into misses, flip this.

import { beforeEach, describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import {
  rebuildWorkingCopyFromStores,
  recalculateForStartingPointChangeFromStores,
  resetRebuildTrail,
} from "./rebuildWorkingCopy.ts";

const MNEMONIC = `store(&VERSION) '10.0'
store(&NAME) 'm'
store(&TARGETS) 'any'
store(&MNEMONICLAYOUT) '1'
begin Unicode > use(main)

group(main) using keys

+ 'a' > 'x'
`;

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  resetRebuildTrail();
  const ir = parseKmn(MNEMONIC, "m").ir;
  useWorkingCopyStore.setState({ startIr: ir, ir });
  useDecisionStore.getState().record({
    id: "kmn-edits",
    value: {
      entries: [{ seq: 1, at: 0, op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "z" } }],
    },
    provenance: "asked",
  });
});

describe("kmn-edits replay refusal", () => {
  it("a rebuild over a starting point that refuses the recorded edits throws (known limit)", () => {
    expect(() => rebuildWorkingCopyFromStores(["physical-layout"])).toThrow(/mnemonic/);
  });

  it("the starting-point-change recalculation throws the same way (known limit)", () => {
    expect(() => recalculateForStartingPointChangeFromStores()).toThrow(/mnemonic/);
  });
});
