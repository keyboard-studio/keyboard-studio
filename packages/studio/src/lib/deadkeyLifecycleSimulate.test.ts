// deadkeyLifecycleSimulate tests — spec 083 Phase 4 real simulator proofs.
//
// End-to-end through the EXACT path preview/download use: base .kmn ->
// projectWorkingCopyVfs with a DeadkeyOperation log (step 1.8 replay) ->
// engine compile -> simulate() with real SimKeyInput sequences. No mocks
// anywhere on this path — these tests prove a defined/renamed/deleted/
// retargeted deadkey actually types correctly in the KeymanWeb processor.

import { describe, it, expect } from "vitest";
import type { SimKeyInput, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile, parseKmn } from "@keyboard-studio/engine";
import { simulate } from "@keyboard-studio/engine/simulator";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { DeadkeyOperation } from "./deadkeyOps.ts";

const KBID = "deadkey_sim_proof";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-sim-proof'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ 'a' > 'a'
`;

const key = (vkey: string): SimKeyInput => ({ vkey, modifiers: [], caps: false });

function projectKmn(baseKmn: string, ops: DeadkeyOperation[]): {
  vfs: VirtualFS;
  warnings: string[];
} {
  const vfs = createVirtualFS([
    { path: `source/${KBID}.kmn`, content: baseKmn, isBinary: false },
  ]);
  const baseIr = parseKmn(baseKmn, KBID).ir;
  const { warnings } = projectWorkingCopyVfs({
    vfs,
    keyboardId: KBID,
    baseIr,
    deletedNodeIds: new Set<string>(),
    deletedItemIds: new Set<string>(),
    deletedTouchKeyIds: new Set<string>(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    deadkeyOps: ops,
  });
  return { vfs, warnings };
}

/** Project the op log, assert a clean deadkey pass, compile, assert success. */
async function compileAfterOps(ops: DeadkeyOperation[], baseKmn: string = BASE_KMN) {
  const { vfs, warnings } = projectKmn(baseKmn, ops);
  expect(
    warnings.filter((w) => w.includes("deadkey")),
    "deadkey overlay pass must be warning-free",
  ).toEqual([]);
  const compiled = await compile(vfs, KBID);
  expect(compiled.success, "projected keyboard must compile").toBe(true);
  return compiled;
}

const DEFINE: DeadkeyOperation = {
  kind: "define",
  triggerKey: "K_5",
  id: 0x3000,
  accentChar: "´",
  authorName: "acute",
};
const PAIR_A: DeadkeyOperation = {
  kind: "add-pair",
  id: 0x3000,
  base: "a",
  accented: "á",
};

// The compile dominates each test's time in this environment; the engine's
// own simulate precedent uses an explicit 30 s — allow 60 s for safety.
const T = 60_000;

describe("define — typed through the real processor", () => {
  it("trigger + base → accented character; trigger alone holds a pending deadkey", async () => {
    const compiled = await compileAfterOps([DEFINE, PAIR_A]);
    const result = simulate(compiled, [key("K_5"), key("K_A")]);

    expect(result.trace).toHaveLength(2);
    // After the trigger: nothing emitted yet, one deadkey pending.
    expect(result.trace[0]!.outputAfter).toBe("");
    expect(result.trace[0]!.pendingDeadkeys).toHaveLength(1);
    // After the base: the pair resolves.
    expect(result.trace[1]!.outputAfter).toBe("á");
    expect(result.trace[1]!.pendingDeadkeys).toHaveLength(0);
    expect(result.finalOutput).toBe("á");
  }, T);

  it("trigger + trigger → the accent character (escape rule)", async () => {
    const compiled = await compileAfterOps([DEFINE, PAIR_A]);
    const result = simulate(compiled, [key("K_5"), key("K_5")]);
    expect(result.finalOutput).toBe("´");
  }, T);
});

describe("rename — output identical before/after the id rename", () => {
  it("same trigger + base sequence types the same character", async () => {
    const before = await compileAfterOps([DEFINE, PAIR_A]);
    const beforeOut = simulate(before, [key("K_5"), key("K_A")]).finalOutput;

    const after = await compileAfterOps([
      DEFINE,
      PAIR_A,
      { kind: "rename", from: 0x3000, to: 0x3001 },
    ]);
    const afterOut = simulate(after, [key("K_5"), key("K_A")]).finalOutput;

    expect(beforeOut).toBe("á");
    expect(afterOut).toBe("á");
    // And the double-tap escape survives the rename too.
    expect(simulate(after, [key("K_5"), key("K_5")]).finalOutput).toBe("´");
  }, T);
});

describe("delete — the old trigger follows the keyboard's open/closed posture", () => {
  it("open keyboard: old trigger falls through to host/default output", async () => {
    const compiled = await compileAfterOps([
      DEFINE,
      PAIR_A,
      { kind: "delete", id: 0x3000 },
    ]);
    // The trigger key is no longer a deadkey: no pending state, no beep,
    // default output for K_5 on the US base layout.
    const single = simulate(compiled, [key("K_5")]);
    expect(single.trace[0]!.pendingDeadkeys).toHaveLength(0);
    expect(single.trace[0]!.beep).toBe(false);
    expect(single.finalOutput).toBe("5");

    // And a following base key is NOT swallowed by a phantom deadkey.
    const seq = simulate(compiled, [key("K_5"), key("K_A")]);
    expect(seq.finalOutput).toBe("5a");
  }, T);

  it("closed keyboard: the terminal blocking rule still suppresses the old trigger", async () => {
    // Model a closed keyboard: the projected define cluster plus a terminal
    // blocking rule on the trigger key — the stand-in for the 1802
    // swallow-undefined terminal rule (KMN has no key wildcard, so the
    // terminal rule is per-key). The delete must remove the cluster and
    // leave the terminal rule standing.
    const { vfs } = projectKmn(BASE_KMN, [DEFINE, PAIR_A]);
    const clustered = vfs.get(`source/${KBID}.kmn`)!.content as string;
    const closedBase = `${clustered}\n+ [K_5] > beep\n`;

    const compiled = await compileAfterOps(
      [{ kind: "delete", id: 0x3000 }],
      closedBase,
    );
    const result = simulate(compiled, [key("K_5")]);
    expect(result.trace[0]!.beep).toBe(true);
    expect(result.trace[0]!.pendingDeadkeys).toHaveLength(0);
    expect(result.finalOutput).toBe("");
  }, T);
});

describe("retarget — the new trigger works, the old one is released", () => {
  it("new trigger + base → accented; old trigger → default output", async () => {
    const compiled = await compileAfterOps([
      DEFINE,
      PAIR_A,
      { kind: "retarget", id: 0x3000, newTriggerKey: "K_6" },
    ]);

    const moved = simulate(compiled, [key("K_6"), key("K_A")]);
    expect(moved.finalOutput).toBe("á");

    // The old trigger is released: no deadkey, default output.
    const released = simulate(compiled, [key("K_5")]);
    expect(released.trace[0]!.pendingDeadkeys).toHaveLength(0);
    expect(released.finalOutput).toBe("5");
  }, T);
});
