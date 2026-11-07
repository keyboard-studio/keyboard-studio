// touchBuilderModel.test.ts — operation parity, template-merge parity, and
// round-trip fidelity for the TIKE touch-builder port.
//
// Operation parity: each in-scope gesture builds an expected
// `KeyEditOperation` sequence (asserted exactly), which is then replayed
// through the REAL appliers (`replayKeyEditOverlay` = Case A IR, plus the
// Case B raw-JSON twin on a subset) and the resulting layout compared
// against the Delphi-described end state.
//
// Template-merge parity: `buildTemplateApplyOps` over a real fixture
// reproduces `TTouchLayout.Merge` semantics — match by id + predefined
// layer, template `sp=1` keys never overridden (I3982).
//
// Round-trip: every vendored template + `test_touchlayout_14_*` fixture
// parses and re-emits to a deep-equal document (the fixtures are already
// clean, so no cleanupKVKL normalization applies — see the note below).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTouchLayoutString,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  applyKeyEditsToRawJson,
  emitTouchLayout,
  replayKeyEditOverlay,
  type KeyEditOperation,
} from "@keyboard-studio/engine";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import {
  BUILDER_KEY_MARGIN,
  buildTemplateApplyOps,
  computeBuilderScale,
  defaultBuilderPresentationId,
  layerKeyAddresses,
  mintBuilderKeyId,
  parseBuilderTemplate,
  predefinedLayerOf,
  resolveBuilderKey,
  subKeyEntriesOf,
  synthesizeDropKeyId,
  buildCharmapDropOps,
  FLICK_DIRECTIONS,
} from "./touchBuilderModel.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../../../../tests/fixtures/touchLayouts");
const readFixture = (name: string): string =>
  readFileSync(resolve(FIXTURES, name), "utf8");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assign `seq` 0..n and replay through the Case A applier. */
function replay(
  layout: TouchLayoutIR,
  ops: readonly PendingKeyEditOperation[],
): TouchLayoutIR {
  const sequenced = ops.map((op, i) => ({ ...op, seq: i }) as KeyEditOperation);
  const { layout: out, orphaned } = replayKeyEditOverlay(layout, {
    ops: sequenced,
  });
  expect(orphaned).toEqual([]);
  return out;
}

function keyAt(layout: TouchLayoutIR, platform: string, layerId: string, keyId: string) {
  const layer = layout.platforms
    .find((p) => p.id === platform)
    ?.layers.find((l) => l.id === layerId);
  expect(layer).toBeDefined();
  for (const row of layer!.rows) {
    const key = row.keys.find((k) => k.id === keyId);
    if (key !== undefined) return { key, row };
  }
  throw new Error(`key ${keyId} not found`);
}

const PARITY_LAYOUT_JSON = `{
  "phone": {
    "layer": [
      { "id": "default", "row": [
        { "id": 1, "key": [
          { "id": "K_A", "text": "a" },
          { "id": "K_B", "text": "b", "sk": [{ "id": "U_00E1", "text": "á" }] },
          { "id": "K_C", "text": "c", "nextlayer": "shift" }
        ]},
        { "id": 2, "key": [ { "id": "K_D", "text": "d" } ]}
      ]},
      { "id": "shift", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "A" } ]}
      ]}
    ]
  }
}`;

const parityLayout = (): TouchLayoutIR => parseTouchLayoutString(PARITY_LAYOUT_JSON);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

describe("builder geometry (TIKE 100-units/row model)", () => {
  it("scales from the widest row plus one trailing keyMargin", () => {
    const { xscale, yscale } = computeBuilderScale(
      [
        { keys: [{ id: "a", width: 100, pad: 15 }, { id: "b", width: 100, pad: 15 }] },
        { keys: [{ id: "c", width: 200, pad: 15 }] },
      ],
      { id: "test", name: "test", x: 829, y: 299 },
    );
    // Widest row: 100+15 + 100+15 = 230, +15 trailing = 245.
    expect(xscale).toBeCloseTo(829 / 245, 10);
    // Height: 2 rows × (100 + 15) = 230.
    expect(yscale).toBeCloseTo(299 / 230, 10);
  });

  it("falls back to 0.5/0.5 without a presentation, like TIKE", () => {
    const { xscale, yscale } = computeBuilderScale(
      [{ keys: [{ id: "a", width: 100, pad: BUILDER_KEY_MARGIN }] }],
      undefined,
    );
    expect(xscale).toBe(0.5);
    expect(yscale).toBe(0.5);
  });

  it("uses TIKE's default presentations per platform", () => {
    expect(defaultBuilderPresentationId("tablet")).toBe("tablet-ipad-landscape");
    expect(defaultBuilderPresentationId("phone")).toBe("phone-iphone5-landscape");
    expect(defaultBuilderPresentationId("desktop")).toBe("desktop");
  });

  it("defaults missing width/pad to 100/15", () => {
    const { xscale } = computeBuilderScale(
      [{ keys: [{ id: "a", width: 100, pad: 15 }] }],
      { id: "t", name: "t", x: 1000, y: 1000 },
    );
    expect(xscale).toBeCloseTo(1000 / 130, 10);
  });
});

// ---------------------------------------------------------------------------
// Id minting
// ---------------------------------------------------------------------------

describe("mintBuilderKeyId (TIKE T_new_N)", () => {
  it("mints T_new_1 on a layout with no T_new_N ids", () => {
    expect(mintBuilderKeyId(parityLayout())).toBe("T_new_1");
  });

  it("continues past the highest existing T_new_N, including subkeys", () => {
    const layout = parseTouchLayoutString(`{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [
          { "id": "T_new_2", "text": "" },
          { "id": "K_A", "text": "a", "sk": [{ "id": "T_new_7", "text": "x" }] }
        ]}
      ]} ] }
    }`);
    expect(mintBuilderKeyId(layout)).toBe("T_new_8");
  });
});

// ---------------------------------------------------------------------------
// Operation parity — gesture → ops → replayed layout
// ---------------------------------------------------------------------------

describe("operation parity (gesture → KeyEditOperation → replay)", () => {
  it("set {text}: keycap edit", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
    ];
    expect(ops).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
    ]);
    const out = replay(parityLayout(), ops);
    expect(keyAt(out, "phone", "default", "K_A").key.text).toBe("ä");
    // Untouched keys are untouched.
    expect(keyAt(out, "phone", "default", "K_B").key.text).toBe("b");
  });

  it("rename: id change is identity, not a field", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_A", kind: "rename", toId: "K_AX" },
    ];
    const out = replay(parityLayout(), ops);
    expect(keyAt(out, "phone", "default", "K_AX").key.text).toBe("a");
    expect(() => keyAt(out, "phone", "default", "K_A")).toThrow();
  });

  it("add: wedge insert carries a T_new_N id and default geometry", () => {
    const ops: PendingKeyEditOperation[] = [
      {
        address: "phone:default:K_A",
        kind: "add",
        position: "after",
        key: { id: "T_new_1", text: "", sp: 0 },
      },
    ];
    const out = replay(parityLayout(), ops);
    const row = keyAt(out, "phone", "default", "K_A").row;
    expect(row.keys.map((k) => k.id)).toEqual(["K_A", "T_new_1", "K_B", "K_C"]);
    const added = row.keys[1]!;
    expect(added.width).toBe(100);
    expect(added.pad).toBe(15);
  });

  it("remove {reflow}: key gone, freed width stays as trailing padding (#2360)", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_B", kind: "remove", outcome: "reflow" },
    ];
    const out = replay(parityLayout(), ops);
    const row = keyAt(out, "phone", "default", "K_A").row;
    expect(row.keys.map((k) => k.id)).toEqual(["K_A", "K_C", "T_SPACER"]);
    const pad = row.keys[2]!;
    expect(pad.sp).toBe(10);
    // The removed key carried no explicit geometry, so none is written —
    // the spacer still holds the default 100/15 at render time, exactly
    // as the removed key did, so the row keeps its total width and no
    // remaining key stretches.
    expect(pad.width).toBeUndefined();
    expect(pad.pad).toBeUndefined();
  });

  it("move: direction steps, never no-ops", () => {
    // Right within the row.
    let out = replay(parityLayout(), [
      { address: "phone:default:K_A", kind: "move", direction: "right" },
    ]);
    expect(keyAt(out, "phone", "default", "K_A").row.keys.map((k) => k.id)).toEqual([
      "K_B",
      "K_A",
      "K_C",
    ]);
    // Down across rows — clamped into the shorter row.
    out = replay(parityLayout(), [
      { address: "phone:default:K_C", kind: "move", direction: "down" },
    ]);
    const targetRow = out.platforms[0]!.layers[0]!.rows[1]!;
    expect(targetRow.keys.map((k) => k.id)).toEqual(["K_D", "K_C"]);
    // A move with no room is a no-op in the applier (the studio never
    // emits one — FR-020 keeps the control absent instead).
    const { warnings } = replayKeyEditOverlay(parityLayout(), {
      ops: [{ address: "phone:default:K_A", kind: "move", direction: "left", seq: 0 }],
    });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("suppress: blank is one compound op (sp 9 + T_BLANK), never split", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_C", kind: "suppress", spClass: 9, sentinelId: "T_BLANK" },
    ];
    expect(ops).toHaveLength(1);
    const out = replay(parityLayout(), ops);
    const key = keyAt(out, "phone", "default", "T_BLANK").key;
    expect(key.sp).toBe(9);
    expect(key.id).toBe("T_BLANK");
  });

  it("setSubKey: upsert creates a missing longpress entry", () => {
    const ops: PendingKeyEditOperation[] = [
      {
        address: "phone:default:K_A",
        kind: "setSubKey",
        sub: { kind: "sk", id: "U_00E8" },
        fields: { id: "U_00E8", text: "è", sp: 0 },
      },
    ];
    const out = replay(parityLayout(), ops);
    const sk = keyAt(out, "phone", "default", "K_A").key.sk ?? [];
    expect(sk.map((s) => s.id)).toEqual(["U_00E8"]);
    expect(sk[0]!.text).toBe("è");
  });

  it("setSubKey: edits an existing entry in place", () => {
    const ops: PendingKeyEditOperation[] = [
      {
        address: "phone:default:K_B",
        kind: "setSubKey",
        sub: { kind: "sk", id: "U_00E1" },
        fields: { text: "à" },
      },
    ];
    const out = replay(parityLayout(), ops);
    const sk = keyAt(out, "phone", "default", "K_B").key.sk ?? [];
    expect(sk).toHaveLength(1);
    expect(sk[0]!.text).toBe("à");
    expect(sk[0]!.id).toBe("U_00E1");
  });

  it("removeSubKey: deleting the last entry drops the group", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_B", kind: "removeSubKey", sub: { kind: "sk", id: "U_00E1" } },
    ];
    const out = replay(parityLayout(), ops);
    expect(keyAt(out, "phone", "default", "K_B").key.sk).toBeUndefined();
  });

  it("set {width}: resize commits the declared width", () => {
    const out = replay(parityLayout(), [
      { address: "phone:default:K_A", kind: "set", fields: { width: 150 } },
    ]);
    expect(keyAt(out, "phone", "default", "K_A").key.width).toBe(150);
  });

  it("Case B twin agrees on set/add/remove", () => {
    const ops: PendingKeyEditOperation[] = [
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
      {
        address: "phone:default:K_A",
        kind: "add",
        position: "after",
        key: { id: "T_new_1", text: "", sp: 0 },
      },
      { address: "phone:default:K_C", kind: "remove", outcome: "reflow" },
    ];
    const sequenced = ops.map((op, i) => ({ ...op, seq: i }) as KeyEditOperation);
    const caseA = replay(parityLayout(), ops);
    const { json, warnings } = applyKeyEditsToRawJson(PARITY_LAYOUT_JSON, sequenced);
    expect(warnings).toEqual([]);
    const caseB = parseTouchLayoutString(json);
    const rowA = keyAt(caseA, "phone", "default", "K_A").row;
    const rowB = keyAt(caseB, "phone", "default", "K_A").row;
    expect(rowB.keys.map((k) => `${k.id}:${k.text ?? ""}`)).toEqual(
      rowA.keys.map((k) => `${k.id}:${k.text ?? ""}`),
    );
  });
});

// ---------------------------------------------------------------------------
// Addressing
// ---------------------------------------------------------------------------

describe("builder addressing", () => {
  it("walks row-major with occurrence suffixes for duplicate ids", () => {
    const layout = parseTouchLayoutString(`{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [ { "id": "T_BLANK", "text": "" }, { "id": "T_BLANK", "text": "" } ] }
      ]} ] }
    }`);
    const addresses = layerKeyAddresses(layout, "phone", "default");
    expect(addresses).toHaveLength(2);
    expect(addresses[0]).not.toBe(addresses[1]);
    // Both resolve to distinct keys.
    const first = resolveBuilderKey(layout, addresses[0]!)!;
    const second = resolveBuilderKey(layout, addresses[1]!)!;
    expect(first.key).not.toBe(second.key);
  });

  it("resolveBuilderKey returns undefined for a stale address", () => {
    expect(resolveBuilderKey(parityLayout(), "phone:default:NOPE")).toBeUndefined();
  });

  it("subKeyEntriesOf groups sk/flick/multitap in TIKE compass order", () => {
    const layout = parseTouchLayoutString(`{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "a",
          "sk": [{ "id": "U_00E1", "text": "á" }],
          "flick": { "w": { "id": "U_00E0", "text": "à" }, "n": { "id": "U_00E2", "text": "â" } },
          "multitap": [{ "id": "U_00E4", "text": "ä" }]
        } ] }
      ]} ] }
    }`);
    const key = keyAt(layout, "phone", "default", "K_A").key;
    const entries = subKeyEntriesOf(key);
    expect(entries.sk.map((e) => e.key.id)).toEqual(["U_00E1"]);
    expect(entries.flick.map((e) => e.ref.id)).toEqual(["n", "w"]);
    expect(entries.multitap.map((e) => e.key.id)).toEqual(["U_00E4"]);
    expect(FLICK_DIRECTIONS).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// Template-merge parity
// ---------------------------------------------------------------------------

describe("template apply (TTouchLayout.Merge parity)", () => {
  const current = (): TouchLayoutIR =>
    parseTouchLayoutString(readFixture("test_touchlayout_14_1.keyman-touch-layout"));
  const latin = (): TouchLayoutIR =>
    parseBuilderTemplate(readFixture("template-latin.keyman-touch-layout"));

  it("emits one set {text} per id+predefined-layer match", () => {
    const ops = buildTemplateApplyOps(current(), latin());
    // Exactly one non-sp=1 text difference in this fixture pair: K_X.
    expect(ops).toEqual([
      { address: "tablet:default:K_X", kind: "set", fields: { text: "x" } },
    ]);
  });

  it("never overrides template sp=1 keys (I3982)", () => {
    const ops = buildTemplateApplyOps(current(), latin());
    // K_BKSP matches by id+layer but is sp=1 in the template — its
    // current text ("*RTLBkSp*") must survive.
    expect(ops.some((op) => op.address === "tablet:default:K_BKSP")).toBe(false);
    const out = replay(current(), ops);
    expect(keyAt(out, "tablet", "default", "K_BKSP").key.text).toBe("*RTLBkSp*");
    expect(keyAt(out, "tablet", "default", "K_X").key.text).toBe("x");
  });

  it("matches on predefined layer, not the row's layer id", () => {
    // Current key K_Q carries layer:"shift" on the "default" layer →
    // predefined "shift". Template K_Q on "shift" matches; template K_Q on
    // "default" must not.
    const cur = parseTouchLayoutString(`{
      "phone": { "layer": [
        { "id": "default", "row": [ { "id": 1, "key": [
          { "id": "K_Q", "text": "q-cur", "layer": "shift" }
        ] } ] },
        { "id": "shift", "row": [ { "id": 1, "key": [
          { "id": "K_W", "text": "w-cur" }
        ] } ] }
      ] }
    }`);
    const tmpl = parseTouchLayoutString(`{
      "phone": { "layer": [
        { "id": "default", "row": [ { "id": 1, "key": [
          { "id": "K_Q", "text": "q-tmpl-default" }
        ] } ] },
        { "id": "shift", "row": [ { "id": 1, "key": [
          { "id": "K_Q", "text": "q-tmpl-shift" },
          { "id": "K_W", "text": "w-tmpl" }
        ] } ] }
      ] }
    }`);
    const ops = buildTemplateApplyOps(cur, tmpl);
    expect(ops).toEqual([
      // K_Q matched via predefined "shift" (its layer override), not "default".
      { address: "phone:default:K_Q", kind: "set", fields: { text: "q-tmpl-shift" } },
      { address: "phone:shift:K_W", kind: "set", fields: { text: "w-tmpl" } },
    ]);
  });

  it("collapses unknown layer names to default (GetKeyPredefinedLayer)", () => {
    expect(predefinedLayerOf("nosuchlayer", "default")).toBe("default");
    expect(predefinedLayerOf(undefined, "shift")).toBe("shift");
    expect(predefinedLayerOf("rightalt", "default")).toBe("rightalt");
  });

  it("skips platforms the current layout does not have", () => {
    const cur = parseTouchLayoutString(`{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "a" } ] }
      ]} ] }
    }`);
    const tmpl = parseTouchLayoutString(`{
      "tablet": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "b" } ] }
      ]} ] }
    }`);
    expect(buildTemplateApplyOps(cur, tmpl)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Charmap drop mapping (stub interface — no drag source in Studio yet)
// ---------------------------------------------------------------------------

describe("charmap drop op mapping", () => {
  it("synthesizes U_XXXX ids from dropped text", () => {
    expect(synthesizeDropKeyId("é")).toBe("U_00E9");
    expect(synthesizeDropKeyId("aé")).toBe("U_0061_00E9");
  });

  it("maps a plain drop to set {text}", () => {
    const ops = buildCharmapDropOps(parityLayout(), "phone:default:K_A", { text: "ä" });
    expect(ops).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
    ]);
  });

  it("ctrl-drop also renames to the synthesized U_XXXX id", () => {
    const ops = buildCharmapDropOps(parityLayout(), "phone:default:K_A", {
      text: "ä",
      ctrl: true,
    });
    expect(ops).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
      { address: "phone:default:K_A", kind: "rename", toId: "U_00E4" },
    ]);
  });

  it("shift-drop prepends to existing text", () => {
    const ops = buildCharmapDropOps(parityLayout(), "phone:default:K_A", {
      text: "x",
      shift: true,
    });
    expect(ops).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "xa" } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip fidelity
// ---------------------------------------------------------------------------

/** cleanupKVKL's "delete blank id strings", applied recursively — the one
 *  documented normalization the studio emit does NOT perform itself (the
 *  parser materializes a missing id as `""` and the #2083-faithful emitter
 *  writes it back). */
function stripBlankIds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripBlankIds);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "id" && v === "") continue;
      out[k] = stripBlankIds(v);
    }
    return out;
  }
  return node;
}

describe("round-trip (parse → emit)", () => {
  const names = [
    "template-basic.keyman-touch-layout",
    "template-latin.keyman-touch-layout",
    "template-traditional.keyman-touch-layout",
    "test_touchlayout_14_1.keyman-touch-layout",
    "test_touchlayout_14_2.keyman-touch-layout",
    "test_touchlayout_14_3.keyman-touch-layout",
  ];
  for (const name of names) {
    it(`${name} re-emits byte-faithfully`, () => {
      const text = readFixture(name);
      const emitted = emitTouchLayout(parseTouchLayoutString(text));
      // The fixtures are already clean (no empty rows/sk arrays, sequential
      // row ids), so the only documented cleanupKVKL normalization that
      // applies is "delete blank id strings" (id-less spacer keys). Key
      // ORDER within objects is irrelevant to the document the emitter owns,
      // hence the parsed comparison.
      expect(stripBlankIds(JSON.parse(emitted))).toEqual(JSON.parse(text));
    });
  }

  it("parser normalizations: empty sk dropped, empty hint dropped, sp stays numeric", () => {
    const ir = parseTouchLayoutString(`{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [
          { "id": "K_A", "text": "a", "hint": "", "sk": [], "sp": "1" }
        ] }
      ]} ] }
    }`);
    const key = keyAt(ir, "phone", "default", "K_A").key;
    expect(key.sk).toBeUndefined();
    expect(key.hint).toBeUndefined();
    // Numeric value coerced; the SOURCE encoding ("1") is preserved for
    // byte-faithful re-emit (#2083) rather than cleanupKVKL's number.
    expect(key.sp).toBe(1);
    const emitted = JSON.parse(emitTouchLayout(ir));
    expect(emitted.phone.layer[0].row[0].key[0].sp).toBe("1");
    expect(emitted.phone.layer[0].row[0].key[0]).not.toHaveProperty("sk");
    expect(emitted.phone.layer[0].row[0].key[0]).not.toHaveProperty("hint");
  });
});

// ---------------------------------------------------------------------------
// No Ctrl layer the keyboard lacks (spec 114 FR-003)
// ---------------------------------------------------------------------------

describe("template apply never adds a Ctrl layer", () => {
  const layout = (layers: string[]): TouchLayoutIR =>
    parseTouchLayoutString(
      JSON.stringify({
        phone: {
          layer: layers.map((id) => ({
            id,
            row: [{ id: 1, key: [{ id: "K_A", text: id === "default" ? "a" : id }] }],
          })),
        },
      }),
    );

  it("emits ops only for layers the keyboard already has, even when the template carries a ctrl layer", () => {
    const ops = buildTemplateApplyOps(layout(["default"]), layout(["default", "ctrl", "ctrl-alt"]));
    for (const op of ops) expect(op.address).not.toMatch(/:ctrl/);
    expect(ops.every((op) => op.address.startsWith("phone:default:"))).toBe(true);
  });
});
