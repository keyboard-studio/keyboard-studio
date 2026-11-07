// Unit tests for the Code tab's diff→op-sequence decomposition
// (touchCodeDiff.ts).
//
// Coverage:
//  1. Each expressible edit → the expected op sequence (address/kind/fields).
//  2. Round-trip: replaying the ops through the REAL Case A applier yields a
//     layout equal to the edited one (modulo the documented normalizations:
//     nodeIds are minted per parse; add materializes default geometry; new
//     subkeys default sp to 0; a `remove`+`"reflow"` leaves the freed width
//     as trailing padding, so a key deletion replays to the edited row PLUS
//     a `T_SPACER` — see "decomposes a key removal into a remove op").
//  3. Structural edits → named rejections, never silent drops.
//  4. Empty diff → no ops.

import { describe, expect, it } from "vitest";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import {
  applyKeyEditsToLayout,
  DEFAULT_KEY_PAD_PCT,
  DEFAULT_KEY_WIDTH_PCT,
  type KeyEditOperation,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/engine";
import {
  diffTouchLayouts,
  type TouchCodeDiffOk,
} from "./touchCodeDiff.ts";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";

const BASE = `{
  "phone": {
    "layer": [
      {
        "id": "default",
        "row": [
          { "id": 1, "key": [
            { "id": "K_Q", "text": "q" },
            { "id": "K_W", "text": "w", "sk": [{ "id": "K_W2", "text": "W" }] },
            { "id": "K_E", "text": "e" }
          ] },
          { "id": 2, "key": [
            { "id": "K_A", "text": "a" },
            { "id": "K_S", "text": "s" }
          ] }
        ]
      }
    ]
  }
}`;

function parse(text: string): TouchLayoutIR {
  return parseTouchLayoutString(text);
}

interface Edited {
  ir: TouchLayoutIR;
  /** The wire JSON the author typed (for the unknown-top-level-key check). */
  raw: unknown;
}

/** Minimal wire shape of the touch-layout JSON the tests mutate. */
interface WireTouchLayout {
  phone: {
    layer: Array<{
      id: string;
      row: Array<{
        id: number;
        key: Array<{ id: string; [field: string]: unknown }>;
      }>;
    }>;
  };
}

/** The edited layout, produced by a JSON-level edit of the base text. */
function edited(mutate: (json: WireTouchLayout) => void): Edited {
  const json = JSON.parse(BASE);
  mutate(json);
  return { ir: parse(JSON.stringify(json)), raw: json };
}

function diffOk(before: TouchLayoutIR, editedAfter: Edited): PendingKeyEditOperation[] {
  const result = diffTouchLayouts(before, editedAfter.ir, editedAfter.raw);
  if (!result.ok) {
    throw new Error(
      `expected ok, got rejection ${result.kind}: ${result.detail}`,
    );
  }
  return (result as TouchCodeDiffOk).ops;
}

/** Strip session-only fields + apply the applier's documented defaulting. */
function normKey(k: TouchKeyIR): unknown {
  const { nodeId: _n, keycapAuthored: _ka, producedOutput: _po, ...rest } = k as Record<
    string,
    unknown
  >;
  const out: Record<string, unknown> = { ...rest };
  delete out["nodeId"];
  delete out["keycapAuthored"];
  delete out["producedOutput"];
  // Wire-encoding hints (spWire/widthWire/padWire) record HOW the source
  // wrote a value, not the value — parse artifacts, not semantics.
  delete out["spWire"];
  delete out["widthWire"];
  delete out["padWire"];
  out["sp"] = (out["sp"] as number | undefined) ?? 0;
  out["width"] = (out["width"] as number | undefined) ?? DEFAULT_KEY_WIDTH_PCT;
  out["pad"] = (out["pad"] as number | undefined) ?? DEFAULT_KEY_PAD_PCT;
  out["provenance"] = (out["provenance"] as string | undefined) ?? "hand-set";
  out["sk"] = ((out["sk"] as TouchKeyIR[] | undefined) ?? []).map(normKey);
  out["multitap"] = ((out["multitap"] as TouchKeyIR[] | undefined) ?? []).map(
    normKey,
  );
  const flick = out["flick"] as Record<string, TouchKeyIR> | undefined;
  out["flick"] =
    flick === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(flick).map(([d, fk]) => [d, normKey(fk)]),
        );
  return out;
}

function normLayout(ir: TouchLayoutIR): unknown {
  return ir.platforms.map((p) => ({
    id: p.id,
    layers: p.layers.map((l) => ({
      id: l.id,
      rows: l.rows.map((r) => ({ keys: r.keys.map(normKey) })),
    })),
  }));
}

/** Replay the diff's ops through the real applier; expect the edited layout. */
function expectRoundTrip(before: TouchLayoutIR, editedAfter: Edited): void {
  const ops = diffOk(before, editedAfter);
  const withSeq: KeyEditOperation[] = ops.map(
    (op, i) => ({ ...op, seq: i }) as KeyEditOperation,
  );
  const result = applyKeyEditsToLayout(before, withSeq);
  expect(result.orphaned).toEqual([]);
  expect(normLayout(result.layout)).toEqual(normLayout(editedAfter.ir));
}

describe("diffTouchLayouts", () => {
  it("decomposes a field edit into a set op", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].text = "Q";
    });
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_Q",
        kind: "set",
        fields: { text: "Q" },
      },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes an id change into a rename op", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].id = "K_QQ";
    });
    expect(diffOk(before, after)).toEqual([
      { address: "phone:default:K_Q", kind: "rename", toId: "K_QQ" },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a rename plus field edits into rename + set", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].id = "K_QQ";
      j.phone.layer[0].row[0].key[0].text = "QQ";
    });
    expect(diffOk(before, after)).toEqual([
      { address: "phone:default:K_Q", kind: "rename", toId: "K_QQ" },
      {
        address: "phone:default:K_QQ",
        kind: "set",
        fields: { text: "QQ" },
      },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a key removal into a remove op", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key.splice(1, 1); // drop K_W
    });
    expect(diffOk(before, after)).toEqual([
      { address: "phone:default:K_W", kind: "remove", outcome: "reflow" },
    ]);
    // No exact round-trip here: replaying the `reflow` leaves the freed
    // width as trailing padding (#2360), so the replayed row is the edited
    // row plus a `T_SPACER` — the author's JSON did not write one, and the
    // applier's defined behaviour adds it. K_W carried no explicit
    // geometry, so the spacer carries none either (it still holds the
    // default 100/15 at render time).
    const ops = diffOk(before, after);
    const result = applyKeyEditsToLayout(
      before,
      ops.map((op, i) => ({ ...op, seq: i }) as KeyEditOperation),
    );
    expect(result.orphaned).toEqual([]);
    const row = result.layout.platforms[0]!.layers[0]!.rows[0]!;
    expect(row.keys.map((k) => k.id)).toEqual(["K_Q", "K_E", "T_SPACER"]);
    expect(row.keys[2]!.sp).toBe(10);
    expect(row.keys[2]!.width).toBeUndefined();
    expect(row.keys[2]!.pad).toBeUndefined();
  });

  it("decomposes a key insertion into add (+ geometry set when authored)", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key.splice(1, 0, {
        id: "K_NEW",
        text: "n",
        width: 150,
      });
    });
    const ops = diffOk(before, after);
    expect(ops[0]).toEqual({
      address: "phone:default:K_Q",
      kind: "add",
      position: "after",
      key: expect.objectContaining({ id: "K_NEW", text: "n" }),
    });
    // Authored width differs from the default the applier materializes, so
    // the differ follows the add with a restoring set.
    expect(ops[1]).toEqual({
      address: "phone:default:K_NEW",
      kind: "set",
      fields: { width: 150 },
    });
    expectRoundTrip(before, after);
  });

  it("decomposes a same-row reorder into move ops", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      const keys = j.phone.layer[0].row[0].key;
      const [q] = keys.splice(0, 1);
      keys.push(q); // K_Q to the end
    });
    // The differ bubbles each target key left into place: K_W and K_E each
    // move left past K_Q (rather than moving K_Q right twice) — both are
    // correct decompositions; the round-trip below pins the outcome.
    expect(diffOk(before, after)).toEqual([
      { address: "phone:default:K_W", kind: "move", direction: "left" },
      { address: "phone:default:K_E", kind: "move", direction: "left" },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a subkey addition into setSubKey (upsert)", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].sk = [{ id: "K_Q2", text: "Q" }];
    });
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_Q",
        kind: "setSubKey",
        sub: { kind: "sk", id: "K_Q2" },
        fields: expect.objectContaining({ id: "K_Q2", text: "Q" }),
      },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a subkey removal into removeSubKey", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      delete j.phone.layer[0].row[0].key[1].sk;
    });
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_W",
        kind: "removeSubKey",
        sub: { kind: "sk", id: "K_W2" },
      },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a subkey field edit into setSubKey with changed fields", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[1].sk[0].text = "w2";
    });
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_W",
        kind: "setSubKey",
        sub: { kind: "sk", id: "K_W2" },
        fields: { text: "w2" },
      },
    ]);
    expectRoundTrip(before, after);
  });

  it("decomposes a flick addition and removal", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].flick = { n: { id: "K_QF", text: "^" } };
    });
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_Q",
        kind: "setSubKey",
        sub: { kind: "flick", id: "n" },
        fields: expect.objectContaining({ text: "^" }),
      },
    ]);
    expectRoundTrip(before, after);

    const reverted = edited(() => undefined);
    expect(diffOk(after.ir, reverted)).toEqual([
      {
        address: "phone:default:K_Q",
        kind: "removeSubKey",
        sub: { kind: "flick", id: "n" },
      },
    ]);
    expectRoundTrip(after.ir, reverted);
  });

  it("replaces a whole row via the anchor trick", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[1].key = [
        { id: "K_X", text: "x" },
        { id: "K_Y", text: "y" },
      ];
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(true);
    expectRoundTrip(before, after);
  });

  it("returns no ops for an identical layout", () => {
    const before = parse(BASE);
    const after = edited(() => undefined);
    expect(diffOk(before, after)).toEqual([]);
  });

  it("rejects an added row as row-structure", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row.push({ id: 3, key: [{ id: "K_Z", text: "z" }] });
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("row-structure");
  });

  it("rejects an added layer as layer-structure", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer.push({ id: "shift", row: [] });
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("layer-structure");
  });

  it("rejects a removed platform as platform-structure", () => {
    const before = parse(
      `{"phone": {"layer": [{"id": "default", "row": []}]}, "tablet": {"layer": [{"id": "default", "row": []}]}}`,
    );
    const after = parse(`{"phone": {"layer": [{"id": "default", "row": []}]}}`);
    const result = diffTouchLayouts(before, after, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("platform-structure");
  });

  it("rejects an unknown top-level key instead of dropping it", () => {
    const before = parse(BASE);
    const raw = JSON.parse(BASE) as Record<string, unknown>;
    raw["windows"] = { layer: [] };
    const after = parse(JSON.stringify(raw));
    const result = diffTouchLayouts(before, after, raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("unknown-top-level-key");
      expect(result.detail).toBe("windows");
    }
  });

  it("rejects a key moved across rows", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      const [q] = j.phone.layer[0].row[0].key.splice(0, 1);
      j.phone.layer[0].row[1].key.push(q);
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("cross-row-move");
  });

  it("rejects an edit to an unexpressible field", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.layer[0].row[0].key[0].default = true;
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("unexpressible-field");
      expect(result.detail).toContain("default");
    }
  });

  it("rejects a platform display-field edit", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      j.phone.fontsize = "14";
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("unexpressible-field");
      expect(result.detail).toContain("fontsize");
    }
  });

  it("rejects an edit addressing a duplicated key id", () => {
    const before = parse(BASE);
    const after = edited((j) => {
      // Duplicate K_Q within the layer AND change a field on it: the differ
      // must refuse rather than address ambiguously.
      j.phone.layer[0].row[1].key.push({ id: "K_Q", text: "q2" });
      j.phone.layer[0].row[0].key[0].text = "Q";
    });
    const result = diffTouchLayouts(before, after.ir, after.raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("duplicate-id-edit");
  });

  it("edits a unique key in a duplicate-id layer", () => {
    const dup = `{
      "phone": { "layer": [ { "id": "default", "row": [
        { "id": 1, "key": [{ "id": "K_Q", "text": "q" }] },
        { "id": 2, "key": [{ "id": "K_Q", "text": "q" }, { "id": "K_A", "text": "a" }] }
      ] } ] }
    }`;
    const before = parse(dup);
    const raw = JSON.parse(dup) as WireTouchLayout;
    raw.phone.layer[0].row[1].key[1].text = "A";
    const after: Edited = { ir: parse(JSON.stringify(raw)), raw };
    // K_A is unique: the set addresses it unambiguously even though the
    // layer carries a duplicated K_Q elsewhere.
    expect(diffOk(before, after)).toEqual([
      {
        address: "phone:default:K_A",
        kind: "set",
        fields: { text: "A" },
      },
    ]);
    expectRoundTrip(before, after);
  });
});
