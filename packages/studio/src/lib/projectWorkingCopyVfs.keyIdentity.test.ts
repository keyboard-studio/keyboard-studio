// Spec 104 key-identity projection: a severance commit composed with the
// AssignPanel's guard synthesis must reach the projected .kmn (the OSK
// preview and the download compile THIS text, never the working IR).
//
// Regression for walk 1's OSK failure: before the fix, the composed rules
// were never projected (the additions seam collects only `rulesStepAdded`
// nodes, and the composition was unstamped) while projection step 1.7b's
// mechanical rename fix-up DID fire for the commit's sibling rename ops —
// rewriting the source key K_1's producing rule (`+ [K_1] > U+0026`, "&")
// onto the minted T_0301. The compiled preview keyboard typed "&" for the
// guarded mark and had no guard at all.

import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import type { KeyEditOperation, TouchLayoutIR } from "@keyboard-studio/engine";
import {
  applyGuardSynthesis,
  emitTouchLayout,
  parseKmn,
  parseTouchLayout,
  planGuardSynthesis,
} from "@keyboard-studio/engine";
import {
  mergeSeveranceWithSynthesis,
  planInlineSeverance,
} from "./touchKeyIdentity.ts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { deriveRuleAdditions } from "../survey/rules/ruleAdditions.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'ki-projection-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ [K_1] > '&'
+ [SHIFT K_1] > '1'
`;

function layoutIr(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [{ keys: [{ nodeId: "k1", id: "K_1", text: "&" }] }],
          },
          {
            id: "shift",
            rows: [{ keys: [{ nodeId: "k2", id: "K_1", text: "1" }] }],
          },
        ],
      },
    ],
    nodeIds: [],
  } as unknown as TouchLayoutIR;
}

function makeVfs() {
  const layoutJson = emitTouchLayout(layoutIr());
  return {
    layoutJson,
    vfs: createVirtualFS([
      { path: "source/ki_test.kmn", content: KMN, isBinary: false },
      {
        path: "source/ki_test.keyman-touch-layout",
        content: layoutJson,
        isBinary: false,
      },
    ]),
  };
}

function project(
  vfs: ReturnType<typeof makeVfs>["vfs"],
  layoutJson: string,
  baseIr: ReturnType<typeof parseKmn>["ir"],
  ops: KeyEditOperation[],
  workingIr?: ReturnType<typeof parseKmn>["ir"],
): { kmn: string; warnings: string[] } {
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: "ki_test",
    startIr: baseIr,
    deletedNodeIds: new Set<string>(),
    keyEditOps: ops,
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    touchLayoutJson: layoutJson,
    ...(workingIr !== undefined
      ? { ruleAdditions: deriveRuleAdditions(workingIr, baseIr) }
      : {}),
  });
  return {
    kmn: String(vfs.get("source/ki_test.kmn")?.content ?? ""),
    warnings: result.warnings,
  };
}

describe("key-identity severance + guard synthesis projection (walk 1 regression)", () => {
  it("projects the guard pair and standing clone, keeps K_1's own rule, and never rewrites '&' onto T_0301", () => {
    const baseIr = parseKmn(KMN, "ki_test").ir;
    const layout = parseTouchLayout(emitTouchLayout(layoutIr()));

    const plan = planInlineSeverance({
      ir: baseIr,
      layout,
      platformId: "tablet",
      anchorLayerId: "default",
      sourceId: "K_1",
      targetId: "T_0301",
      track: "copy",
    });
    expect(plan.speculative.record.outcome).toBe("completed");

    const index = buildTouchKeyRuleIndex(baseIr);
    const gplan = planGuardSynthesis(baseIr, index, "T_0301", [], "́", {
      repertoire: [" ", "1", "."],
      opaqueAcknowledged: true,
    });
    expect(gplan.ok).toBe(true);
    if (!gplan.ok) return;
    const applied = applyGuardSynthesis(baseIr, index, gplan, "T_0301", "́", {
      opaqueAcknowledged: true,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const mergedIr = mergeSeveranceWithSynthesis({
      plan: plan.speculative,
      baseIr,
      nextIr: applied.ir,
      anchorLayerId: "default",
    });

    // The ops TouchGallery.commitAssignmentWithSeverance commits: the
    // anchor `set` op plus a `rename` op for the shift-layer sibling.
    const ops: KeyEditOperation[] = [
      {
        seq: 1,
        kind: "set",
        address: "tablet:default:K_1",
        fields: { id: "T_0301", text: "◌́" },
      },
      { seq: 2, kind: "rename", address: "tablet:shift:K_1", toId: "T_0301" },
    ] as KeyEditOperation[];

    const { vfs, layoutJson } = makeVfs();
    const { kmn, warnings } = project(vfs, layoutJson, baseIr, ops, mergedIr);

    // The synthesized guard pair reaches the artifact…
    expect(kmn).toMatch(/any\(generated_touch_guard\) \+ \[T_0301\] > context/);
    expect(kmn).toMatch(/\+ \[T_0301\] > U\+0301/);
    // …the standing SHIFT clone reaches it…
    expect(kmn).toMatch(/\+ \[SHIFT T_0301\] > U\+0031/);
    // …the source key keeps its own bindings (both halves keep typing)…
    expect(kmn).toMatch(/\+ \[K_1\] > U\+0026/);
    expect(kmn).toMatch(/\+ \[SHIFT K_1\] > U\+0031/);
    // …and the rename fix-up never rewrites K_1's "&" onto the minted id.
    expect(kmn).not.toMatch(/\[T_0301\] > U\+0026/);
    // The skip is loud, never silent.
    expect(
      warnings.some((w) => w.includes("rename") && w.includes("T_0301")),
    ).toBe(true);
  });

  it("a pure rename (no composed additions) still gets the mechanical rule fix-up", () => {
    const baseIr = parseKmn(KMN, "ki_test").ir;
    const ops: KeyEditOperation[] = [
      { seq: 1, kind: "rename", address: "tablet:shift:K_1", toId: "T_9999" },
    ] as KeyEditOperation[];

    const { vfs, layoutJson } = makeVfs();
    const { kmn, warnings } = project(vfs, layoutJson, baseIr, ops);

    expect(kmn).toMatch(/\+ \[SHIFT T_9999\] > U\+0031/);
    expect(
      warnings.some((w) => w.includes("skipped")),
    ).toBe(false);
  });
});
