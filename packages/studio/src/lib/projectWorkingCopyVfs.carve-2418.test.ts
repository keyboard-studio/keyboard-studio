// Issue #2418: carving a T_ mark key must DELETE its .kmn rules, not rewrite
// them to `> nul`.
//
// End-to-end through `projectWorkingCopyVfs` (the same projection the OSK
// preview and the download share): a carved T_ mark key leaves the touch
// layout (076 FR-023 T020 default), and its binding rule must leave the
// .kmn with it — while a desktop-bound rule carved in the same run keeps
// the FR-019 swallow suppression (`> nul`), because its key is still
// pressable.
//
// The bug: the fallback-policy expansion turned the whole-node deletion
// into a `block` disposition, `compileCarveSuppression` rewrote the rule in
// place to `> nul`, and `carveFilterIr` skipped the suppression-owned rule,
// so the deletion never happened.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

const KMN_2418 = [
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [T_0301] > U+0301",
  "+ [K_Q] > 'x'",
  "",
].join("\n");

// The carved mark key (dotted-circle keycap, production only through its
// .kmn rule — the spec-104 T009 shape) and a desktop key producing a carved
// character of its own.
const TOUCH_LAYOUT_2418 = JSON.stringify({
  tablet: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "T_0301", text: "◌́" },
              { id: "K_Q", text: "x" },
            ],
          },
        ],
      },
    ],
  },
});

function makeVfs2418(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: KMN_2418, isBinary: false },
    {
      path: `source/${keyboardId}.keyman-touch-layout`,
      content: TOUCH_LAYOUT_2418,
      isBinary: false,
    },
  ]);
}

describe("issue #2418 — projectWorkingCopyVfs deletes carved T_ keys' .kmn rules", () => {
  it("the removed touch key's rule is deleted whole-node; the desktop rule carved in the same run is swallowed", () => {
    const { ir } = parseKmn(KMN_2418, "test_kb");
    const rules = ir.groups.flatMap((g) => g.rules);
    const tRule = rules.find((r) =>
      r.output.some((o) => o.kind === "char" && o.value === "́"),
    );
    const kRule = rules.find((r) =>
      r.output.some((o) => o.kind === "char" && o.value === "x"),
    );
    if (tRule === undefined || kRule === undefined) throw new Error("fixture rules not found");
    const vfs = makeVfs2418("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: ir,
      deletedNodeIds: new Set([tRule.nodeId, kRule.nodeId]),
      deletedItemIds: new Set([tRule.nodeId, kRule.nodeId]),
      fallbackPolicy: "swallow",
      touchLayoutJson: TOUCH_LAYOUT_2418,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);

    // The touch layout lost both carved main keys (T020 default removal).
    const touch = JSON.parse(
      vfs.get("source/test_kb.keyman-touch-layout")?.content as string,
    );
    const ids = touch.tablet.layer[0].row[0].key.map((k: { id: string }) => k.id);
    expect(ids).not.toContain("T_0301");
    expect(ids).not.toContain("K_Q");

    // .kmn: the T_0301 rule is GONE — not rewritten to `> nul` — while the
    // desktop K_Q rule (its physical key is still pressable) is swallowed
    // per FR-019.
    const kmn = vfs.get("source/test_kb.kmn")?.content as string;
    expect(kmn).not.toContain("T_0301");
    expect(kmn).toMatch(/\+\s*\[K_Q\]\s*>\s*nul/);
  });

  it("without a fallback policy the touch rule is deleted as before (no behavior change off the suppression path)", () => {
    const { ir } = parseKmn(KMN_2418, "test_kb");
    const rules = ir.groups.flatMap((g) => g.rules);
    const tRule = rules.find((r) =>
      r.output.some((o) => o.kind === "char" && o.value === "́"),
    );
    if (tRule === undefined) throw new Error("fixture rule not found");
    const vfs = makeVfs2418("test_kb");

    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: "test_kb",
      startIr: ir,
      deletedNodeIds: new Set([tRule.nodeId]),
      deletedItemIds: new Set([tRule.nodeId]),
      touchLayoutJson: TOUCH_LAYOUT_2418,
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    expect(warnings).toHaveLength(0);
    const kmn = vfs.get("source/test_kb.kmn")?.content as string;
    expect(kmn).not.toContain("T_0301");
  });
});
