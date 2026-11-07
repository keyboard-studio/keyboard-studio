// SC-003 round trip (spec 113 T068): change three keys in two layers, then undo each. After every
// step the emitted .kmn (the Code tab's text) equals the expected text, and the artifact
// projection (what the preview compiles and the download ships) and the Assign tab's slot ledger
// agree with it. The simulator itself needs the compiled .js, which the Node harness does not
// have; the projection is the text the compiler would receive, so it stands in for it here.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { projectWorkingCopyVfs } from "../../lib/projectWorkingCopyVfs.ts";
import { buildSlotOccupancy, slotKeyFor } from "../../survey/slotOccupancy.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'rt'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [SHIFT K_B] > 'B'
+ [K_C] > 'c'
`;

const live = () => useWorkingCopyStore.getState().ir!;
const logged = () => useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;

function projected(): string {
  const vfs = createVirtualFS();
  vfs.set("source/rt.kmn", KMN, false);
  const startIr = useWorkingCopyStore.getState().startIr!;
  const kmnEdits = logged();
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "rt",
    startIr,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(kmnEdits !== undefined ? { kmnEdits } : {}),
  });
  const f = vfs.get("source/rt.kmn");
  return typeof f?.content === "string" ? f.content : "";
}

/** The three views agree: Code tab text, artifact projection, Assign tab ledger. */
function expectViewsAgree(): void {
  const code = emitKmn(live());
  // The projection adds nothing but the target stamp the output step applies to every keyboard.
  expect(emitKmn(parseKmn(projected(), "rt").ir)).toBe(code);
  const occupancy = buildSlotOccupancy(live(), []);
  const kmn = logged()?.entries ?? [];
  for (const e of kmn) {
    if (e.op === "set-key" && e.output.kind === "text") {
      expect(occupancy.get(slotKeyFor(e.vkey, e.layer))?.char).toBe(e.output.text);
    }
  }
}

beforeEach(() => {
  const ir = parseKmn(KMN, "rt").ir;
  useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:rt", "rt"));
});

describe("SC-003 round trip", () => {
  it("three keys in two layers changed, then each undone, restores the text at every step", () => {
    const s = () => useWorkingCopyStore.getState();
    const t0 = emitKmn(live());
    s().commitKmnEdit({ op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "\u014b" } });
    const t1 = emitKmn(live());
    expectViewsAgree();
    s().commitKmnEdit({ op: "set-key", vkey: "K_B", layer: ["SHIFT"], output: { kind: "text", text: "\u0181" } });
    const t2 = emitKmn(live());
    expectViewsAgree();
    s().commitKmnEdit({ op: "set-key", vkey: "K_C", layer: [], output: { kind: "nul" } });
    const t3 = emitKmn(live());
    expectViewsAgree();

    expect(new Set([t0, t1, t2, t3]).size).toBe(4);
    expect(t3).toContain("U+014B");
    expect(t3).toContain("U+0181");

    expect(s().undoKmnEdit()).toBe(true);
    expect(emitKmn(live())).toBe(t2);
    expectViewsAgree();
    expect(s().undoKmnEdit()).toBe(true);
    expect(emitKmn(live())).toBe(t1);
    expectViewsAgree();
    expect(s().undoKmnEdit()).toBe(true);
    expect(emitKmn(live())).toBe(t0);
    expectViewsAgree();
    expect(logged()?.entries).toEqual([]);
  });

  it("the Layout tab live path and a replay from the starting point produce the same text", () => {
    const s = useWorkingCopyStore.getState();
    s.commitKmnEdit({ op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "\u014b" } });
    s.commitKmnEdit({ op: "set-key", vkey: "K_A", layer: [], output: { kind: "text", text: "\u0254" } });
    expect(emitKmn(parseKmn(projected(), "rt").ir)).toBe(emitKmn(live()));
  });
});
