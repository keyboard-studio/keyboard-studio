// Tests for applyCarveKeycapRemovalsToVfs — the carve-side keycap blanker.
//
// Coverage:
//   1. Base-layer .kvks key cleared in place; siblings and layer count unchanged.
//   2. Same char on multiple shift layers (RA + S) both cleared (layer-agnostic).
//   3. Touch: sk entry removed (property deleted when emptied); matched U_ main
//      key gets text:"" and an inert T_carved_ id.
//   4. Carved char absent from layer files → VFS byte-identical, no warnings.
//   5. No .kvks / no touch layout at all → graceful silent no-op.
//   6. NFC: decomposed .kvks key text matches a precomposed carved char.
//   7. collectCarvedKeycapTexts survivor guard — one of two producers carved
//      → empty set; both carved → the char. Slot-id derivation included.

import { describe, it, expect, vi } from "vitest";
import {
  applyCarveKeycapRemovalsToVfs,
  collectCarvedKeycapTexts,
} from "./applyCarveKeycapRemovalsToVfs.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR, IRGroup, IRStore, IRRule, OutputElement } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCharRule(nodeId: string, char: string, vkeyName = "K_E"): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkeyName, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function makeRuleWithOutput(nodeId: string, output: OutputElement[]): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
    output,
  };
}

function makeGroup(nodeId: string, rules: IRRule[]): IRGroup {
  return { nodeId, name: "main", usingKeys: true, rules, readonly: false };
}

function makeIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

const KVKS_BASE = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
<key vkey="K_E">é</key>
</layer>
</encoding>
</visualkeyboard>`;

function makeVfs(entries: { path: string; content: string }[]) {
  return createVirtualFS([
    // No &VISUALKEYBOARD/&LAYOUTFILE header stores — assets resolve to the
    // source/test.<ext> fallback paths.
    { path: "source/test.kmn", content: "c test keyboard\n", isBinary: false },
    ...entries.map((e) => ({ ...e, isBinary: false })),
  ]);
}

function removalsOf(opts: { slotIds?: string[]; wholeNodeIds?: string[] }) {
  return {
    slotIds: new Set(opts.slotIds ?? []),
    wholeNodeIds: new Set(opts.wholeNodeIds ?? []),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyCarveKeycapRemovalsToVfs — .kvks base layer", () => {
  it("clears the carved keycap text in place, keeping the element and siblings", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#e", "é")])]);

    const { warnings } = applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({
      wholeNodeIds: ["rule#e"],
    }));

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_E"></key>');
    expect(xml).toContain('<key vkey="K_A">a</key>');
    expect(xml.match(/<layer\b/g)).toHaveLength(1);
  });
});

describe("applyCarveKeycapRemovalsToVfs — layer-agnostic .kvks scan", () => {
  it("clears the carved char on every shift layer it appears on", () => {
    const kvks = `<visualkeyboard><encoding name="unicode">
<layer shift="">
<key vkey="K_A">a</key>
</layer>
<layer shift="S">
<key vkey="K_E">é</key>
</layer>
<layer shift="RA">
<key vkey="K_Q">é</key>
<key vkey="K_W">w</key>
</layer>
</encoding></visualkeyboard>`;
    const vfs = makeVfs([{ path: "source/test.kvks", content: kvks }]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#e", "é")])]);

    applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({ wholeNodeIds: ["rule#e"] }));

    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_E"></key>');
    expect(xml).toContain('<key vkey="K_Q"></key>');
    expect(xml).toContain('<key vkey="K_A">a</key>');
    expect(xml).toContain('<key vkey="K_W">w</key>');
    expect(xml.match(/<layer\b/g)).toHaveLength(3);
  });
});

describe("applyCarveKeycapRemovalsToVfs — touch layout", () => {
  const touchLayout = JSON.stringify({
    tablet: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "K_A", text: "a", sk: [{ id: "U_00E9", text: "é" }] },
                {
                  id: "K_O",
                  text: "o",
                  sk: [
                    { id: "U_00E9", text: "é" },
                    { id: "U_00E0", text: "à" },
                  ],
                },
                { id: "U_00E9", text: "é" },
              ],
            },
          ],
        },
      ],
    },
  });

  it("removes matching popup entries and neutralizes a matched U_ main key", () => {
    const vfs = makeVfs([
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#e", "é")])]);

    const { warnings } = applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({
      wholeNodeIds: ["rule#e"],
    }));

    expect(warnings).toHaveLength(0);
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    const keys = data.tablet.layer[0].row[0].key;

    // Host whose only sk entry matched: property removed entirely.
    expect(keys[0].sk).toBeUndefined();
    expect(keys[0].text).toBe("a");

    // Host with a surviving sibling entry: filtered, property kept.
    expect(keys[1].sk).toHaveLength(1);
    expect(keys[1].sk[0].id).toBe("U_00E0");

    // Matched main key: blank cap, inert id (U_ would keep emitting é).
    expect(keys[2].text).toBe("");
    expect(keys[2].id).toBe("T_carved_00E9");
  });
});

describe("applyCarveKeycapRemovalsToVfs — carved char absent from layer files", () => {
  it("leaves the VFS byte-identical and returns no warnings", () => {
    const touch = JSON.stringify({ tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] } });
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: touch },
    ]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#z", "ƶ")])]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({
      wholeNodeIds: ["rule#z"],
    }));

    expect(warnings).toHaveLength(0);
    expect(setSpy).not.toHaveBeenCalled();
    expect(vfs.get("source/test.kvks")?.content).toBe(KVKS_BASE);
    expect(vfs.get("source/test.keyman-touch-layout")?.content).toBe(touch);
  });
});

describe("applyCarveKeycapRemovalsToVfs — no layer files at all", () => {
  it("is a graceful silent no-op", () => {
    const vfs = makeVfs([]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#e", "é")])]);

    const { warnings } = applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({
      wholeNodeIds: ["rule#e"],
    }));

    expect(warnings).toHaveLength(0);
  });
});

describe("applyCarveKeycapRemovalsToVfs — NFC comparison", () => {
  it("clears a decomposed .kvks keycap when the carved output is precomposed", () => {
    // Keycap text is NFD (e + COMBINING ACUTE); the carved rule outputs NFC é.
    const kvks = `<visualkeyboard><encoding name="unicode">
<layer shift="">
<key vkey="K_E">${"e" + String.fromCharCode(0x0301)}</key>
</layer>
</encoding></visualkeyboard>`;
    const vfs = makeVfs([{ path: "source/test.kvks", content: kvks }]);
    const ir = makeIR([makeGroup("group#0", [makeCharRule("rule#e", "é")])]);

    applyCarveKeycapRemovalsToVfs(vfs, "test", ir, removalsOf({ wholeNodeIds: ["rule#e"] }));

    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_E"></key>');
  });
});

describe("collectCarvedKeycapTexts — derivation and survivor guard", () => {
  it("derives a char from a carved slot of an output store", () => {
    const outStore: IRStore = {
      nodeId: "store#out",
      name: "out",
      items: [
        { kind: "char", value: "é" },
        { kind: "char", value: "à" },
      ],
      isSystem: false,
    };
    const fanOut = makeRuleWithOutput("rule#fan", [
      { kind: "index", storeRef: "out", offset: 1 },
    ]);
    const ir = makeIR([makeGroup("group#0", [fanOut])], [outStore]);

    const texts = collectCarvedKeycapTexts(ir, removalsOf({ slotIds: ["store#out#0"] }));
    expect([...texts]).toEqual(["é"]);
  });

  it("keeps a char produced by a surviving rule out of the carved set", () => {
    const ir = makeIR([
      makeGroup("group#0", [
        makeCharRule("rule#e1", "é", "K_E"),
        makeCharRule("rule#e2", "é", "K_Q"),
      ]),
    ]);

    // Only one of the two producers carved → the char is still typeable.
    expect(
      collectCarvedKeycapTexts(ir, removalsOf({ wholeNodeIds: ["rule#e1"] })).size,
    ).toBe(0);

    // Both carved → the char is gone.
    expect([
      ...collectCarvedKeycapTexts(ir, removalsOf({ wholeNodeIds: ["rule#e1", "rule#e2"] })),
    ]).toEqual(["é"]);
  });

  it("keeps a char whose un-carved slot survives in an output store", () => {
    const outStore: IRStore = {
      nodeId: "store#out",
      name: "out",
      items: [
        { kind: "char", value: "é" },
        { kind: "char", value: "é" },
      ],
      isSystem: false,
    };
    const fanOut = makeRuleWithOutput("rule#fan", [
      { kind: "index", storeRef: "out", offset: 1 },
    ]);
    const ir = makeIR([makeGroup("group#0", [fanOut])], [outStore]);

    // One of the two é slots carved → the other still produces é.
    expect(
      collectCarvedKeycapTexts(ir, removalsOf({ slotIds: ["store#out#0"] })).size,
    ).toBe(0);
  });

  it("skips slots on blocked stores — the .kmn projection refuses those edits", () => {
    // A store that is BOTH an any() source and an index() output target in
    // the same rule classifies as blocked (dual-use / paired-input on the
    // nul-fill classifier) — applyStoreSlotRemovals refuses to edit it, so
    // its character keeps being produced and must keep its keycap.
    const dualStore: IRStore = {
      nodeId: "store#dual",
      name: "dualX",
      items: [{ kind: "char", value: "é" }],
      isSystem: false,
    };
    const dualRule: IRRule = {
      nodeId: "rule#dual",
      context: [{ kind: "any", storeRef: "dualX" }],
      output: [{ kind: "index", storeRef: "dualX", offset: 1 }],
    };
    const ir = makeIR([makeGroup("group#0", [dualRule])], [dualStore]);

    expect(
      collectCarvedKeycapTexts(ir, removalsOf({ slotIds: ["store#dual#0"] })).size,
    ).toBe(0);
  });

  it("ignores input-only stores when looking for survivors", () => {
    // "keys" is an any() matcher (input side) that happens to contain é — it
    // does not PRODUCE é, so it must not keep the keycap alive.
    const keysStore: IRStore = {
      nodeId: "store#keys",
      name: "keys",
      items: [{ kind: "char", value: "é" }],
      isSystem: false,
    };
    const matcher: IRRule = {
      nodeId: "rule#m",
      context: [{ kind: "any", storeRef: "keys" }],
      output: [{ kind: "char", value: "x" }],
    };
    const ir = makeIR(
      [makeGroup("group#0", [matcher, makeCharRule("rule#e", "é")])],
      [keysStore],
    );

    expect([
      ...collectCarvedKeycapTexts(ir, removalsOf({ wholeNodeIds: ["rule#e"] })),
    ]).toEqual(["é"]);
  });
});
