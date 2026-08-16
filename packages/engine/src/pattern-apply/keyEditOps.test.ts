/**
 * Unit tests for keyEditOps (spec 063 T049).
 *
 * Two halves:
 *   1. The shared machinery this module owns directly — `resolveKeyAddress`,
 *      `resolveSubKeyEntry`, `applyFieldSemantics` — exercised against the
 *      `touchKeyRuleJoin` fixture (the ONE fixture behind the touch key<->rule
 *      join; see its module doc — do not fork it).
 *   2. Overlay replay (`replayKeyEditOverlay`, hosted in
 *      `applyKeyEditsToLayout.ts` to avoid a `keyEditOps` <-> applier cycle —
 *      see that file's doc comment) — ordering semantics, totality, purity,
 *      and idempotency, per contracts/key-edit-overlay.md §8 and §10.
 *
 * The headline case (§10's first bullet): a rename followed by an edit
 * addressed to the new id resolves cleanly; the SAME two operations with
 * `seq` reversed must not silently succeed against the wrong key — the
 * mis-ordered edit must land in `orphaned`, not apply to nothing-in-particular
 * or to some other key that happens to share an address fragment.
 */

import { describe, it, expect } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  makeTouchKeyRuleJoinLayout,
  TOUCH_JOIN_IDS,
} from "@keyboard-studio/contracts/fixtures";
import {
  applyFieldSemantics,
  applySuppressSemantics,
  proposeSuppressFields,
  resolveKeyAddress,
  resolveSubKeyEntry,
  type AddressableKeyLike,
  type EditableKeyFields,
  type KeyEditOperation,
  type KeyEditOverlay,
  type RenameKeyOp,
  type SetKeyOp,
  type SuppressKeyOp,
} from "./keyEditOps.js";
import { replayKeyEditOverlay } from "./applyKeyEditsToLayout.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Shared address parts helper (mirrors TouchKeyAddressParts without an extra
// import purely for the type — the resolver only needs the shape).
// ---------------------------------------------------------------------------

function mainKeyParts(platform: string, layerId: string, keyId: string) {
  return { platform, layerId, keyId } as const;
}

/** Row index the given `T_DUPE` occurrence resolves to — for the row-major check. */
function resolved0RowOf(layout: TouchLayoutIR, occurrence: number): number | undefined {
  return resolveKeyAddress(layout, {
    platform: "phone",
    layerId: "default",
    keyId: "T_DUPE",
    occurrence,
  })?.rowIndex;
}

/** Walk every key/sub-key in a layout and collect every "text" value present,
 *  for a blunt "did the patch leak onto some OTHER key" check. */
function allTextValues(layout: TouchLayoutIR): string[] {
  const out: string[] = [];
  const visit = (k: { text?: string; sk?: readonly unknown[]; multitap?: readonly unknown[]; flick?: Record<string, unknown> }): void => {
    if (k.text !== undefined) out.push(k.text);
    for (const sub of (k.sk ?? []) as Array<Parameters<typeof visit>[0]>) visit(sub);
    for (const sub of (k.multitap ?? []) as Array<Parameters<typeof visit>[0]>) visit(sub);
    for (const sub of Object.values(k.flick ?? {})) {
      if (sub) visit(sub as Parameters<typeof visit>[0]);
    }
  };
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// resolveKeyAddress
// ---------------------------------------------------------------------------

describe("resolveKeyAddress", () => {
  it("resolves a main key present in the layout's first row", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const resolved = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.mark),
    );
    expect(resolved?.key.id).toBe(TOUCH_JOIN_IDS.mark);
    expect(resolved?.rowIndex).toBe(0);
  });

  it("searches every row in the layer, not just the first", () => {
    // T_DOTTED lives in the fixture's fourth row of the default layer.
    const layout = makeTouchKeyRuleJoinLayout();
    const resolved = resolveKeyAddress(layout, mainKeyParts("phone", "default", "T_DOTTED"));
    expect(resolved?.key.id).toBe("T_DOTTED");
    expect(resolved?.rowIndex).toBe(3);
  });

  // An address with no occurrence means "the first", which is exactly what this
  // resolver always returned — so every address written before occurrences
  // existed (persisted overlay ops, `deletedTouchKeyIds` entries) still names
  // the same key. That backward compatibility is the whole reason the suffix is
  // additive rather than mandatory.
  it("returns the FIRST match when an id is duplicated in-layer and no occurrence is named", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const resolved = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.duplicate),
    );
    expect(resolved?.keyIndex).toBe(0);
  });

  it("resolves the NAMED occurrence when an id is duplicated in-layer", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const first = resolveKeyAddress(layout, {
      ...mainKeyParts("phone", "default", TOUCH_JOIN_IDS.duplicate),
      occurrence: 0,
    });
    const second = resolveKeyAddress(layout, {
      ...mainKeyParts("phone", "default", TOUCH_JOIN_IDS.duplicate),
      occurrence: 1,
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // Genuinely different keys — this is what makes an individual blank
    // selectable and editable rather than every edit landing on the first.
    expect(`${second!.rowIndex}:${second!.keyIndex}`).not.toBe(
      `${first!.rowIndex}:${first!.keyIndex}`,
    );
    expect(second!.key.id).toBe(TOUCH_JOIN_IDS.duplicate);
  });

  it("counts occurrences ROW-MAJOR across the layer, not per row", () => {
    // Two rows, each holding two `T_DUPE`s: occurrence 2 must be the first key
    // of the SECOND row. A per-row tally would resolve it to row 0 and hand the
    // author a different key than the one whose address they hold.
    const dupe = (n: number) => ({ nodeId: `n${n}`, id: "T_DUPE", text: String(n) });
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            {
              id: "default",
              rows: [{ keys: [dupe(0), dupe(1)] }, { keys: [dupe(2), dupe(3)] }],
            },
          ],
        },
      ],
      nodeIds: [],
    };

    for (const occurrence of [0, 1, 2, 3]) {
      const resolved = resolveKeyAddress(layout, {
        ...mainKeyParts("phone", "default", "T_DUPE"),
        occurrence,
      });
      expect(resolved?.key.text).toBe(String(occurrence));
    }
    expect(resolved0RowOf(layout, 2)).toBe(1);
  });

  it("returns undefined for an occurrence past the last matching key", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    expect(
      resolveKeyAddress(layout, {
        ...mainKeyParts("phone", "default", TOUCH_JOIN_IDS.duplicate),
        occurrence: 99,
      }),
    ).toBeUndefined();
  });

  it("distinguishes platforms carrying the same key id", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const onPhone = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.mark),
    );
    const onTablet = resolveKeyAddress(
      layout,
      mainKeyParts("tablet", "default", TOUCH_JOIN_IDS.mark),
    );
    expect(onPhone?.platformIndex).not.toBe(onTablet?.platformIndex);
    expect(onTablet?.key.id).toBe(TOUCH_JOIN_IDS.mark);
  });

  it("returns undefined for an unknown platform", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    expect(
      resolveKeyAddress(layout, mainKeyParts("desktop", "default", TOUCH_JOIN_IDS.mark)),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown layer", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    expect(
      resolveKeyAddress(layout, mainKeyParts("phone", "no-such-layer", TOUCH_JOIN_IDS.mark)),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown key id", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    expect(
      resolveKeyAddress(layout, mainKeyParts("phone", "default", "T_GHOST")),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveSubKeyEntry
// ---------------------------------------------------------------------------

describe("resolveSubKeyEntry", () => {
  it("resolves an sk (longpress) sub-entry by id", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const host = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.longpressHost),
    );
    const loc = resolveSubKeyEntry(host!.key, { kind: "sk", id: "U_00A1" });
    expect(loc?.collection).toBe("sk");
    expect(loc?.key.id).toBe("U_00A1");
  });

  it("resolves a flick sub-entry by direction", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const host = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.longpressHost),
    );
    const loc = resolveSubKeyEntry(host!.key, { kind: "flick", id: "n" });
    expect(loc).toEqual({ collection: "flick", direction: "n", key: expect.objectContaining({ id: "U_2049" }) });
  });

  it("resolves a multitap sub-entry by id (ad hoc key; fixture carries none)", () => {
    const hostWithMultitap: AddressableKeyLike = {
      id: "T_HOST",
      multitap: [
        { id: "T_HOST_2" },
        { id: "T_HOST_3" },
      ],
    };
    const loc = resolveSubKeyEntry(hostWithMultitap, { kind: "multitap", id: "T_HOST_3" });
    expect(loc).toEqual({ collection: "multitap", index: 1, key: { id: "T_HOST_3" } });
  });

  it("returns undefined when the named collection is absent", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const host = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.longpressHost),
    );
    // The host has sk + flick, but no multitap entries.
    expect(resolveSubKeyEntry(host!.key, { kind: "multitap", id: "anything" })).toBeUndefined();
  });

  it("returns undefined when the collection exists but the id/direction does not match", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const host = resolveKeyAddress(
      layout,
      mainKeyParts("phone", "default", TOUCH_JOIN_IDS.longpressHost),
    );
    expect(resolveSubKeyEntry(host!.key, { kind: "sk", id: "U_NOPE" })).toBeUndefined();
    expect(resolveSubKeyEntry(host!.key, { kind: "flick", id: "sw" })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyFieldSemantics
// ---------------------------------------------------------------------------

describe("applyFieldSemantics", () => {
  const current: EditableKeyFields = {
    id: "T_A",
    text: "a",
    output: "a",
    sp: 0,
    nextlayer: "shift",
  };

  it("merges a plain field patch, leaving output/nextlayer untouched", () => {
    const merged = applyFieldSemantics(current, { text: "A" });
    expect(merged).toEqual({ id: "T_A", text: "A", output: "a", sp: 0, nextlayer: "shift" });
  });

  it("clears a stale output when id changes and the patch supplies no output", () => {
    const merged = applyFieldSemantics(current, { id: "T_B" });
    expect(merged.id).toBe("T_B");
    expect("output" in merged).toBe(false);
  });

  it("does NOT clear output when the patch supplies its own output alongside the id change", () => {
    const merged = applyFieldSemantics(current, { id: "T_B", output: "b" });
    expect(merged.id).toBe("T_B");
    expect(merged.output).toBe("b");
  });

  it("does NOT clear output when patch.id is present but equal to the current id", () => {
    // Re-asserting the same id is not a "change" — this is the subtlety
    // `idChanged = patch.id !== undefined && patch.id !== current.id` guards.
    const merged = applyFieldSemantics(current, { id: "T_A" });
    expect(merged.output).toBe("a");
  });

  it("overrides nextlayer when the patch supplies one, and keeps the current one otherwise", () => {
    const overridden = applyFieldSemantics(current, { nextlayer: "symbol" });
    expect(overridden.nextlayer).toBe("symbol");

    const untouched = applyFieldSemantics(current, { text: "A" });
    expect(untouched.nextlayer).toBe("shift");
  });

  it("drops output/nextlayer keys entirely when neither current nor patch supplies them", () => {
    const bare: EditableKeyFields = { id: "T_C", text: "c", sp: 0 };
    const merged = applyFieldSemantics(bare, { text: "C" });
    expect("output" in merged).toBe(false);
    expect("nextlayer" in merged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// proposeSuppressFields — the paired (spClass, sentinelId) proposal
// ---------------------------------------------------------------------------

describe("proposeSuppressFields", () => {
  it("proposes sp:9 + T_BLANK for a keycap-shaped hole", () => {
    expect(proposeSuppressFields("keycap-hole")).toEqual({ spClass: 9, sentinelId: "T_BLANK" });
  });

  it("proposes sp:10 + T_SPACER for a spacer", () => {
    expect(proposeSuppressFields("spacer")).toEqual({ spClass: 10, sentinelId: "T_SPACER" });
  });
});

// ---------------------------------------------------------------------------
// applySuppressSemantics — the shared compound derivation (FR-029b)
// ---------------------------------------------------------------------------

describe("applySuppressSemantics", () => {
  const current: EditableKeyFields = {
    id: "T_LIVE",
    text: "a",
    output: "a",
    sp: 0,
  };

  function suppressOp(overrides: Partial<SuppressKeyOp> = {}): SuppressKeyOp {
    return {
      seq: 0,
      kind: "suppress",
      address: "phone:default:T_LIVE",
      spClass: 9,
      sentinelId: "T_BLANK",
      ...overrides,
    };
  }

  it("sets sp AND neutralizes id in the same result, for each reserved sentinel", () => {
    for (const { spClass, sentinelId } of [
      { spClass: 9 as const, sentinelId: "T_BLANK" },
      { spClass: 10 as const, sentinelId: "T_SPACER" },
      { spClass: 9 as const, sentinelId: "T_NUL" },
    ]) {
      const result = applySuppressSemantics(current, suppressOp({ spClass, sentinelId }));
      expect(result).toEqual({
        ok: true,
        fields: { id: sentinelId, text: "a", sp: spClass },
      });
    }
  });

  it("clears the stale output through applyFieldSemantics — a suppressed key never keeps a live output", () => {
    const result = applySuppressSemantics(current, suppressOp());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("output" in result.fields).toBe(false);
    }
  });

  it("rejects a sentinelId that is not one of the reserved ruleless sentinels", () => {
    const result = applySuppressSemantics(current, suppressOp({ sentinelId: "T_NOT_A_SENTINEL" }));
    expect(result).toEqual({ ok: false, reason: "sentinel-not-reserved" });
  });

  it("rejects an author-typed live id masquerading as a suppression", () => {
    // The exact desync FR-029c names: an sp change with an id that was never
    // meant to be a ruleless sentinel must not be silently accepted as "the
    // key is suppressed now".
    const result = applySuppressSemantics(current, suppressOp({ sentinelId: "T_MY_REAL_KEY" }));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overlay replay — ordering, totality, purity, idempotency
// ---------------------------------------------------------------------------

describe("replayKeyEditOverlay", () => {
  /** Build the rename-then-edit pair used by the headline ordering tests. */
  function renameThenEditOps(): { rename: RenameKeyOp; edit: SetKeyOp } {
    const rename: RenameKeyOp = {
      seq: 0,
      kind: "rename",
      address: touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.dead),
      toId: "T_RENAMED_NORULE",
    };
    const edit: SetKeyOp = {
      seq: 1,
      kind: "set",
      address: touchKeyAddress("phone", "default", "T_RENAMED_NORULE"),
      fields: { text: "renamed!" },
    };
    return { rename, edit };
  }

  it("resolves rename-then-edit in commit order: the edit lands on the renamed key", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const { rename, edit } = renameThenEditOps();
    const overlay: KeyEditOverlay = { ops: [rename, edit] };

    const result = replayKeyEditOverlay(layout, overlay);

    expect(result.orphaned).toEqual([]);
    const renamed = resolveKeyAddress(
      result.layout,
      mainKeyParts("phone", "default", "T_RENAMED_NORULE"),
    );
    expect(renamed?.key.id).toBe("T_RENAMED_NORULE");
    expect(renamed?.key.text).toBe("renamed!");
  });

  it("HEADLINE: the same two ops with seq reversed do NOT silently succeed against the wrong key — the mis-ordered edit orphans", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const { rename, edit } = renameThenEditOps();
    // Same two operations; seq swapped, so the edit is now committed BEFORE
    // the rename that would make its address resolvable.
    const reversedRename: RenameKeyOp = { ...rename, seq: 1 };
    const reversedEdit: SetKeyOp = { ...edit, seq: 0 };
    const overlay: KeyEditOverlay = { ops: [reversedRename, reversedEdit] };

    const result = replayKeyEditOverlay(layout, overlay);

    // The edit could not have resolved to ANY key (T_RENAMED_NORULE did not
    // exist yet when it ran) — it must be reported, not silently dropped or
    // silently applied elsewhere.
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0]).toMatchObject({ kind: "set", address: reversedEdit.address });
    expect(result.warnings.some((w) => w.includes(reversedEdit.address))).toBe(true);

    // The rename still lands (it did not depend on the edit).
    const renamed = resolveKeyAddress(
      result.layout,
      mainKeyParts("phone", "default", "T_RENAMED_NORULE"),
    );
    expect(renamed).toBeDefined();

    // And critically: the renamed key's text is UNCHANGED — the orphaned
    // edit's patch never landed on it, or on any other key in the layout.
    expect(renamed?.key.text).not.toBe("renamed!");
    expect(allTextValues(result.layout)).not.toContain("renamed!");
  });

  it("is resilient to an ops array stored out of seq order (seq is the commit order, not array position)", () => {
    // Two edits to the SAME key; seq 0 sets "A", seq 1 sets "B" — the final
    // value must be "B" regardless of which physical array slot each op
    // occupies (models an undo that spliced an entry out and back).
    const address = touchKeyAddress("phone", "default", TOUCH_JOIN_IDS.dead);
    const first: SetKeyOp = { seq: 0, kind: "set", address, fields: { text: "A" } };
    const second: SetKeyOp = { seq: 1, kind: "set", address, fields: { text: "B" } };
    // Stored in REVERSE of commit order.
    const overlay: KeyEditOverlay = { ops: [second, first] };

    const result = replayKeyEditOverlay(makeTouchKeyRuleJoinLayout(), overlay);

    const key = resolveKeyAddress(result.layout, mainKeyParts("phone", "default", TOUCH_JOIN_IDS.dead));
    expect(key?.key.text).toBe("B");
  });

  it("is total: an unresolvable address (unknown platform) never throws and lands in orphaned", () => {
    const op: SetKeyOp = {
      seq: 0,
      kind: "set",
      address: touchKeyAddress("desktop", "default", "T_GHOST"),
      fields: { text: "x" },
    };
    const overlay: KeyEditOverlay = { ops: [op] };

    expect(() => replayKeyEditOverlay(makeTouchKeyRuleJoinLayout(), overlay)).not.toThrow();
    const result = replayKeyEditOverlay(makeTouchKeyRuleJoinLayout(), overlay);
    expect(result.orphaned).toEqual([op]);
  });

  it("is total: a malformed address string never throws and lands in orphaned", () => {
    const op: SetKeyOp = { seq: 0, kind: "set", address: "not-an-address", fields: { text: "x" } };
    const overlay: KeyEditOverlay = { ops: [op] };

    expect(() => replayKeyEditOverlay(makeTouchKeyRuleJoinLayout(), overlay)).not.toThrow();
    const result = replayKeyEditOverlay(makeTouchKeyRuleJoinLayout(), overlay);
    expect(result.orphaned).toEqual([op]);
  });

  it("is pure: the input layout is never mutated", () => {
    const layout = makeTouchKeyRuleJoinLayout();
    const snapshot = structuredClone(layout);
    const { rename, edit } = renameThenEditOps();
    const overlay: KeyEditOverlay = { ops: [rename, edit] };

    replayKeyEditOverlay(layout, overlay);

    expect(layout).toEqual(snapshot);
  });

  it("is pure: the SAME overlay carries no reference to the layout it was authored against — replaying it against a different seed resolves against THAT seed", () => {
    const seedA = makeTouchKeyRuleJoinLayout();
    const seedB = structuredClone(seedA);
    // Simulate a re-derivation that dropped the dead key entirely from seed B.
    const phoneB = seedB.platforms.find((p) => p.id === "phone")!;
    const defaultLayerB = phoneB.layers.find((l) => l.id === "default")!;
    const row = defaultLayerB.rows.find((r) => r.keys.some((k) => k.id === TOUCH_JOIN_IDS.dead))!;
    row.keys = row.keys.filter((k) => k.id !== TOUCH_JOIN_IDS.dead);

    const { rename, edit } = renameThenEditOps();
    const overlay: KeyEditOverlay = { ops: [rename, edit] };

    const resultA = replayKeyEditOverlay(seedA, overlay);
    expect(resultA.orphaned).toEqual([]);

    // The very same overlay object, replayed against seed B, must resolve
    // against seed B's (missing-the-key) reality — both ops orphan there —
    // not silently succeed as if it still held seed A's shape.
    const resultB = replayKeyEditOverlay(seedB, overlay);
    expect(resultB.orphaned).toHaveLength(2);
    expect(resultB.orphaned.map((o: KeyEditOperation) => o.kind).sort()).toEqual(["rename", "set"]);
  });

  it("is idempotent for a fixed op list: replaying the same overlay against the same seed twice yields an equal result", () => {
    const seed = makeTouchKeyRuleJoinLayout();
    const { rename, edit } = renameThenEditOps();
    const overlay: KeyEditOverlay = { ops: [rename, edit] };

    const first = replayKeyEditOverlay(seed, overlay);
    const second = replayKeyEditOverlay(seed, overlay);

    expect(second.layout).toEqual(first.layout);
    expect(second.orphaned).toEqual(first.orphaned);
    expect(second.warnings).toEqual(first.warnings);
  });
});
