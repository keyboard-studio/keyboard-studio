/**
 * Tests for the spec-083 Phase 1 contracts surface: `listDeadkeys`,
 * `allocateDeadkeyId`, the `@deadkey:<hexid> name=<name>` metadata helpers,
 * and `validateDeadkeyLifecycle` (validator.ts).
 *
 * All IRs are built by hand with the shared fixtures; the one claim that
 * needs the real codec (trailing-comment survival across parse → emit →
 * parse) is proven in the engine package instead
 * (`packages/engine/src/codec/deadkey-name-token.test.ts`), because
 * contracts is the dependency root and cannot import the codec.
 */
import { describe, it, expect } from "vitest";
import {
  allocateDeadkeyId,
  getDeadkeyName,
  listDeadkeys,
  setDeadkeyName,
} from "./deadkeys.js";
import { validateDeadkeyLifecycle } from "../validator.js";
import { makeTestIR } from "../fixtures/keyboard-ir.js";
import { charStore, irGroup } from "../fixtures/ir-builders.js";
import type {
  ContextElement,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  OutputElement,
  RawKmnFragment,
  StoreItem,
} from "../keyboard-ir.js";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

let seq = 0;

function rule(
  context: ContextElement[],
  output: OutputElement[],
  trailingComment?: string,
): IRRule {
  const r: IRRule = { nodeId: `r#${++seq}`, context, output };
  if (trailingComment !== undefined) r.trailingComment = trailingComment;
  return r;
}

/** `+ [VKEY] > dk(id)` — vkey context may also be a single char literal. */
function trigger(
  vkey: string,
  id: number,
  trailingComment?: string,
): IRRule {
  return rule(
    [{ kind: "vkey", name: vkey, modifiers: [] }],
    [{ kind: "deadkey", id }],
    trailingComment,
  );
}

function charTrigger(ch: string, id: number): IRRule {
  return rule(
    [{ kind: "char", value: ch }],
    [{ kind: "deadkey", id }],
  );
}

/** `dk(id) + any(base) > index(out, offset)` */
function fanout(id: number, base: string, out: string, offset = 2): IRRule {
  return rule(
    [
      { kind: "deadkey", id },
      { kind: "raw", text: "+" },
      { kind: "any", storeRef: base },
    ],
    [{ kind: "index", storeRef: out, offset }],
  );
}

/** `dk(id) + [VKEY] > 'ch'` (double-tap escape) */
function escape(vkey: string, id: number, ch: string): IRRule {
  return rule(
    [
      { kind: "deadkey", id },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: [] },
    ],
    [{ kind: "char", value: ch }],
  );
}

function deadkeyStore(name: string, items: StoreItem[]): IRStore {
  return {
    nodeId: `store#${name}`,
    name,
    items,
    isSystem: false,
  };
}

function namedRaw(sourceText: string): RawKmnFragment {
  return {
    nodeId: `raw#${++seq}`,
    origin: "imported",
    sourceText,
    // Mirrors engine's OPAQUE_REASONS.NAMED_DEADKEY ("named-deadkey").
    reason: "named-deadkey",
  };
}

function groupWith(rules: IRRule[]): IRGroup {
  return irGroup({ name: "main", rules });
}

// ---------------------------------------------------------------------------
// listDeadkeys
// ---------------------------------------------------------------------------

describe("listDeadkeys", () => {
  it("lists a full cluster: trigger, fan-out stores, pair count, studio origin", () => {
    const ir = makeTestIR(
      [
        groupWith([
          trigger("K_QUOTE", 1, "@deadkey:0001"),
          fanout(1, "acuteK", "acuteO"),
          escape("K_QUOTE", 1, "'"),
        ]),
      ],
      [
        charStore({ name: "acuteK", chars: "aeiou" }),
        charStore({ name: "acuteO", chars: "áéíóú" }),
      ],
    );
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 1,
      triggerKey: "K_QUOTE",
      baseStore: "acuteK",
      outputStore: "acuteO",
      pairCount: 5,
      origin: "studio",
    });
    expect(listed[0]?.authorName).toBeUndefined();
  });

  it("lists a partial cluster (trigger but no fan-out) with nulls, never dropped", () => {
    const ir = makeTestIR([groupWith([trigger("K_X", 0x1234)])]);
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 0x1234,
      triggerKey: "K_X",
      baseStore: null,
      outputStore: null,
      pairCount: 0,
      origin: "imported",
    });
  });

  it("classifies codepoint-derived ids as s02-legacy", () => {
    // ';' is U+003B; the old S-02 path minted dk(003b) for a K_COLON trigger.
    const ir = makeTestIR([groupWith([trigger("K_COLON", 0x003b)])]);
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.origin).toBe("s02-legacy");
  });

  it("classifies a literal-char trigger by its own codepoint", () => {
    const ir = makeTestIR([groupWith([charTrigger(";", 0x003b)])]);
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 0x003b,
      triggerKey: ";",
      origin: "s02-legacy",
    });
  });

  it("takes any/index storeRefs as-is (corpus-style non-dk_* names)", () => {
    const ir = makeTestIR(
      [groupWith([trigger("K_QUOTE", 1), fanout(1, "acuteK", "acuteO", 3)])],
      [
        charStore({ name: "acuteK", chars: "aeiou" }),
        charStore({ name: "acuteO", chars: "áéíóú" }),
      ],
    );
    const listed = listDeadkeys(ir);
    expect(listed[0]?.baseStore).toBe("acuteK");
    expect(listed[0]?.outputStore).toBe("acuteO");
    expect(listed[0]?.pairCount).toBe(5);
  });

  it("counts pairs as the shorter store's char items", () => {
    const ir = makeTestIR(
      [groupWith([fanout(1, "bases", "output")])],
      [
        charStore({ name: "bases", chars: "aeiou" }),
        charStore({ name: "output", chars: "áéí" }),
      ],
    );
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.pairCount).toBe(3);
    // No trigger rule: listed with nulls, never dropped.
    expect(listed[0]?.triggerKey).toBeNull();
  });

  it("lists named/opaque dk(name) from raw fragments with id null", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [
        charStore({ name: "acuteK", chars: "aei" }),
        charStore({ name: "acuteO", chars: "áéí" }),
      ],
      [
        namedRaw("+ [K_A] > dk(acute)"),
        namedRaw("dk(acute) + any(acuteK) > index(acuteO, 2)"),
      ],
    );
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: null,
      name: "acute",
      triggerKey: "K_A",
      baseStore: "acuteK",
      outputStore: "acuteO",
      pairCount: 3,
      origin: "imported",
    });
  });

  it("ignores raw fragments that are not named-deadkey shaped", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [],
      [
        namedRaw("+ [K_A] > dk(003b)"), // numeric — not a named deadkey
        {
          ...namedRaw("+ [K_B] > dk(grave)"),
          reason: "SMP 5-digit literal", // wrong reason — ignored
        },
      ],
    );
    expect(listDeadkeys(ir)).toHaveLength(0);
  });

  it("sorts numeric ids ascending with named entries last", () => {
    const ir = makeTestIR(
      [
        groupWith([
          trigger("K_X", 0x3000),
          trigger("K_COLON", 0x003b),
        ]),
      ],
      [],
      [namedRaw("+ [K_A] > dk(acute)")],
    );
    const listed = listDeadkeys(ir);
    expect(listed.map((d) => d.id)).toEqual([0x003b, 0x3000, null]);
    expect(listed[2]?.name).toBe("acute");
  });

  it("collapses duplicate numeric ids to a single entry (validator flags them)", () => {
    const ir = makeTestIR([
      groupWith([trigger("K_A", 5), trigger("K_B", 5)]),
    ]);
    const listed = listDeadkeys(ir);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// allocateDeadkeyId
// ---------------------------------------------------------------------------

describe("allocateDeadkeyId", () => {
  it("returns 0x3000 for an IR with no deadkeys", () => {
    const ir = makeTestIR([groupWith([])]);
    expect(allocateDeadkeyId(ir)).toBe(0x3000);
  });

  it("never re-mints legacy codepoint-derived ids", () => {
    const ir = makeTestIR([
      groupWith([
        trigger("K_COLON", 0x003b), // ';' — 59
        trigger("K_BKQUOTE", 0x0060), // '`' — 96
        trigger("K_X", 0x3000), // already studio-minted
      ]),
    ]);
    const id = allocateDeadkeyId(ir);
    expect(id).toBe(0x3001);
    expect([0x003b, 0x0060, 0x3000]).not.toContain(id);
  });

  it("accounts for ids hiding in store items", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [deadkeyStore("weird", [{ kind: "deadkey", id: 0x4000 }])],
    );
    expect(allocateDeadkeyId(ir)).toBe(0x4001);
  });

  it("accounts for ids in rule contexts without trigger rules", () => {
    const ir = makeTestIR([groupWith([fanout(0x5000, "b", "o")])]);
    expect(allocateDeadkeyId(ir)).toBe(0x5001);
  });
});

// ---------------------------------------------------------------------------
// validateDeadkeyLifecycle
// ---------------------------------------------------------------------------

describe("validateDeadkeyLifecycle", () => {
  function cleanCluster(): KeyboardIR {
    return makeTestIR(
      [
        groupWith([
          trigger("K_QUOTE", 1),
          fanout(1, "dk_0001_bases", "dk_0001_output"),
          escape("K_QUOTE", 1, "'"),
        ]),
      ],
      [
        charStore({ name: "dk_0001_bases", chars: "aeiou" }),
        charStore({ name: "dk_0001_output", chars: "áéíóú" }),
      ],
    );
  }

  it("passes a clean cluster with no findings", () => {
    expect(validateDeadkeyLifecycle(cleanCluster())).toEqual([]);
  });

  it("detects a dangling context reference", () => {
    const ir = makeTestIR(
      [groupWith([fanout(9, "b", "o")])],
      [charStore({ name: "b", chars: "a" }), charStore({ name: "o", chars: "á" })],
    );
    const findings = validateDeadkeyLifecycle(ir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DANGLING_DEADKEY_REFERENCE");
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.layer).toBe("A");
    expect(findings[0]?.message).toContain("dk(0009)");
  });

  it("detects a dangling store-item reference", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [deadkeyStore("weird", [{ kind: "deadkey", id: 11 }])],
    );
    const findings = validateDeadkeyLifecycle(ir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DANGLING_DEADKEY_REFERENCE");
    expect(findings[0]?.message).toContain("dk(000b)");
  });

  it("detects duplicate numeric ids across trigger rules", () => {
    const ir = makeTestIR([
      groupWith([trigger("K_A", 0xbeef), trigger("K_B", 0xbeef)]),
    ]);
    const findings = validateDeadkeyLifecycle(ir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_ERROR_DUPLICATE_DEADKEY_ID");
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("dk(beef)");
  });

  it("detects orphaned dk_* stores", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [
        charStore({ name: "dk_00ff_bases", chars: "a" }),
        charStore({ name: "dk_00ff_output", chars: "á" }),
      ],
    );
    const findings = validateDeadkeyLifecycle(ir);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.code)).toEqual([
      "KM_ERROR_ORPHANED_DEADKEY_STORE",
      "KM_ERROR_ORPHANED_DEADKEY_STORE",
    ]);
    expect(findings[0]?.message).toContain("dk_00ff_bases");
  });

  it("does not flag dk_* stores attached to a live deadkey", () => {
    expect(validateDeadkeyLifecycle(cleanCluster())).toEqual([]);
  });

  it("ignores store names that merely start with dk_", () => {
    const ir = makeTestIR(
      [groupWith([])],
      [charStore({ name: "dk_notes", chars: "abc" })],
    );
    expect(validateDeadkeyLifecycle(ir)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDeadkeyName / setDeadkeyName
// ---------------------------------------------------------------------------

describe("deadkey name metadata", () => {
  it("round-trips a name on a trigger rule", () => {
    const r = trigger("K_QUOTE", 1);
    expect(getDeadkeyName(r)).toBeUndefined();
    setDeadkeyName(r, "acute");
    expect(getDeadkeyName(r)).toBe("acute");
    expect(r.trailingComment).toBe("@deadkey:0001 name=acute");
  });

  it("coexists with surrounding user comment text", () => {
    const r = trigger("K_QUOTE", 1, "minted by hand, do not touch");
    setDeadkeyName(r, "acute");
    expect(r.trailingComment).toBe(
      "minted by hand, do not touch @deadkey:0001 name=acute",
    );
    expect(getDeadkeyName(r)).toBe("acute");
  });

  it("replaces an existing token in place, preserving neighbours", () => {
    const r = trigger("K_QUOTE", 1, "note @deadkey:0001 name=acute tail");
    setDeadkeyName(r, "grave");
    expect(r.trailingComment).toBe("note @deadkey:0001 name=grave tail");
    expect(getDeadkeyName(r)).toBe("grave");
  });

  it("clearing the name keeps the studio authorship marker", () => {
    const r = trigger("K_QUOTE", 1);
    setDeadkeyName(r, "acute");
    setDeadkeyName(r, undefined);
    expect(r.trailingComment).toBe("@deadkey:0001");
    expect(getDeadkeyName(r)).toBeUndefined();
    // Still classified studio-authored by the bare marker.
    const listed = listDeadkeys(makeTestIR([groupWith([r])]));
    expect(listed[0]?.origin).toBe("studio");
  });

  it("treats a hex mismatch as absent and self-heals on write", () => {
    const r = trigger("K_QUOTE", 1, "@deadkey:0002 name=acute");
    expect(getDeadkeyName(r)).toBeUndefined();
    setDeadkeyName(r, "grave");
    expect(r.trailingComment).toBe("@deadkey:0001 name=grave");
    expect(getDeadkeyName(r)).toBe("grave");
  });

  it("rejects names that cannot survive the token format", () => {
    const r = trigger("K_QUOTE", 1);
    expect(() => setDeadkeyName(r, "has space")).toThrow(/invalid name/);
    expect(() => setDeadkeyName(r, "")).toThrow(/invalid name/);
    expect(() => setDeadkeyName(r, "semi;colon")).toThrow(/invalid name/);
    expect(r.trailingComment).toBeUndefined();
  });

  it("throws on a rule with no single deadkey output", () => {
    const r = rule(
      [{ kind: "vkey", name: "K_A", modifiers: [] }],
      [{ kind: "char", value: "a" }],
    );
    expect(() => setDeadkeyName(r, "acute")).toThrow(/not a trigger rule/);
    expect(getDeadkeyName(r)).toBeUndefined();
  });
});
