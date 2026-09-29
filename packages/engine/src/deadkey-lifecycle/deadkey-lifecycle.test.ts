/**
 * Tests for the spec-083 (issue #1849) Phase 2 engine surface:
 * `defineDeadkey` / `renameDeadkey` / `deleteDeadkey` / `retargetDeadkey`
 * (`packages/engine/src/deadkey-lifecycle/`).
 *
 * IRs are built by parsing real KMN text through the codec (not hand-built
 * node graphs), so every test also proves the emitted cluster is exactly the
 * shape `listDeadkeys` (contracts, Phase 1) recognizes. After every
 * successful mutation the §10 `validateDeadkeyLifecycle` guards run: no
 * dangling references, no duplicate ids, no orphaned `dk_<hex>_*` stores.
 *
 * @see specs/083-deadkey-lifecycle/spec.md (User Stories 1, 3–6)
 * @see specs/083-deadkey-lifecycle/plan.md (Phase 2)
 */
import { describe, it, expect } from "vitest";
import {
  allocateDeadkeyId,
  listDeadkeys,
  scanDeadkeyRefs,
  validateDeadkeyLifecycle,
} from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import {
  defineDeadkey,
  deleteDeadkey,
  renameDeadkey,
  retargetDeadkey,
} from "./index.js";
import type { DeadkeyMutationResult } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-lifecycle-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

/** Parse KMN text into a working IR. */
function parseKmn(kmn: string): KeyboardIR {
  return parse(kmn, "deadkey-lifecycle-test").ir;
}

/** Assert the §10 deadkey-lifecycle guards are clean. */
function expectLifecycleClean(ir: KeyboardIR): void {
  expect(validateDeadkeyLifecycle(ir)).toEqual([]);
}

/** Unwrap an ok result (fails the test loudly otherwise). */
function expectOk(
  result: DeadkeyMutationResult,
): Extract<DeadkeyMutationResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      `expected ok, got conflicts: ${JSON.stringify(result.conflicts)}`,
    );
  }
  return result;
}

/** Unwrap a conflict result's kinds (fails the test loudly otherwise). */
function conflictKinds(result: DeadkeyMutationResult): string[] {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected conflicts, got ok");
  return result.conflicts.map((c) => c.kind);
}

/** A canonical S-02-style cluster hand-written in KMN. */
function clusterKmn(
  hex: string,
  triggerKey: string,
  baseStore: string,
  outputStore: string,
  token = "",
): string {
  return (
    `store(${baseStore}) 'ae'\n` +
    `store(${outputStore}) 'áé'\n` +
    `+ [${triggerKey}] > dk(${hex})${token}\n` +
    `dk(${hex}) + any(${baseStore}) > index(${outputStore}, 2)\n` +
    `dk(${hex}) + [${triggerKey}] > '́'\n`
  );
}

// ---------------------------------------------------------------------------
// defineDeadkey
// ---------------------------------------------------------------------------

describe("defineDeadkey", () => {
  it("emits the canonical cluster recognized by listDeadkeys, with authorship marker, name, and validator clean", () => {
    const ir = parseKmn(BASE_KMN);
    const before = JSON.stringify(ir);

    const result = expectOk(
      defineDeadkey(ir, {
        triggerKey: "K_QUOTE",
        accentChar: "́",
        authorName: "acute",
      }),
    );
    const id = result.deadkey.id;
    expect(id).not.toBeNull();
    const hex = (id as number).toString(16).padStart(4, "0");

    // Round-trip through listDeadkeys: the inventory sees the new deadkey.
    const listed = listDeadkeys(result.ir).find((d) => d.id === id);
    expect(listed).toBeDefined();
    expect(listed?.triggerKey).toBe("K_QUOTE");
    expect(listed?.origin).toBe("studio");
    expect(listed?.authorName).toBe("acute");
    expect(listed?.baseStore).toBe(`dk_${hex}_bases`);
    expect(listed?.outputStore).toBe(`dk_${hex}_output`);
    expect(listed?.pairCount).toBe(0);

    // The emitted KMN carries the same cluster the deadkey-single-tap
    // pattern emits, plus the authorship marker on the trigger rule.
    const kmn = emit(result.ir);
    expect(kmn).toContain(`+ [K_QUOTE] > dk(${hex})`);
    expect(kmn).toContain(
      `dk(${hex}) + any(dk_${hex}_bases) > index(dk_${hex}_output, 2)`,
    );
    expect(kmn).toContain(`dk(${hex}) + [K_QUOTE] > U+0301`);
    expect(kmn).toContain(`@deadkey:${hex} name=acute`);

    expectLifecycleClean(result.ir);

    // The caller's IR is never mutated.
    expect(JSON.stringify(ir)).toBe(before);
  });

  it("define without authorName writes the bare marker: origin studio, no name", () => {
    const ir = parseKmn(BASE_KMN);
    const result = expectOk(
      defineDeadkey(ir, { triggerKey: "K_BKQUOTE", accentChar: "`" }),
    );
    expect(result.deadkey.origin).toBe("studio");
    expect(result.deadkey.authorName).toBeUndefined();
    expect(emit(result.ir)).toContain(
      `@deadkey:${(result.deadkey.id as number).toString(16).padStart(4, "0")}`,
    );
    expectLifecycleClean(result.ir);
  });

  it("the default id is allocateDeadkeyId: unique, and never re-mints grandfathered legacy ids", () => {
    // A legacy S-02 deadkey: codepoint-derived id coupled to its trigger.
    const ir = parseKmn(
      BASE_KMN + clusterKmn("003b", "K_COLON", "dk_003b_bases", "dk_003b_output"),
    );
    expect(listDeadkeys(ir)[0]?.origin).toBe("s02-legacy");

    const result = expectOk(
      defineDeadkey(ir, { triggerKey: "K_QUOTE", accentChar: "́" }),
    );
    const id = result.deadkey.id as number;
    expect(id).toBeGreaterThan(0x2fff);
    expect(id).not.toBe(0x003b);
    expect(id).toBe(allocateDeadkeyId(ir));
    expectLifecycleClean(result.ir);
  });

  it("conflict: requested id already in use → id-in-use, input untouched", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("003b", "K_COLON", "dk_003b_bases", "dk_003b_output"),
    );
    const before = JSON.stringify(ir);
    const result = defineDeadkey(ir, {
      triggerKey: "K_QUOTE",
      accentChar: "́",
      id: 0x003b,
    });
    expect(conflictKinds(result)).toEqual(["id-in-use", "store-in-use"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.ids).toEqual([0x003b]);
      // The id's own stores exist too — a second define would clobber them.
      expect(result.conflicts[1]?.kind).toBe("store-in-use");
    }
    expect(JSON.stringify(ir)).toBe(before);
  });

  it("conflict: trigger already triggers a different deadkey → trigger-in-use", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("003b", "K_COLON", "dk_003b_bases", "dk_003b_output"),
    );
    const result = defineDeadkey(ir, {
      triggerKey: "K_COLON",
      accentChar: "́",
    });
    expect(conflictKinds(result)).toEqual(["trigger-in-use"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.ids).toEqual([0x003b]);
      expect(result.conflicts[0]?.keys).toEqual(["K_COLON"]);
    }
  });

  it("conflict: conventional store names already exist → store-in-use, no duplicate store() emitted", () => {
    // Orphaned dk_<hex>_* stores (e.g. left by a hand-edited IR) are
    // invisible to allocateDeadkeyId and pass id-in-use — define must refuse
    // rather than emit a second store() with the same name.
    const ir = parseKmn(
      BASE_KMN +
        `store(dk_3001_bases) 'ae'\n` +
        `store(dk_3001_output) 'áé'\n`,
    );
    const before = JSON.stringify(ir);
    const result = defineDeadkey(ir, {
      triggerKey: "K_QUOTE",
      accentChar: "́",
      id: 0x3001,
    });
    expect(conflictKinds(result)).toEqual(["store-in-use"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.message).toContain("dk_3001_bases");
      expect(result.conflicts[0]?.ids).toEqual([0x3001]);
    }
    expect(JSON.stringify(ir)).toBe(before);
    expect(
      ir.stores.filter((s) => s.name === "dk_3001_bases"),
    ).toHaveLength(1);
  });

  it("the cluster survives parse → emit → parse with marker and name intact", () => {
    const ir = parseKmn(BASE_KMN);
    const defined = expectOk(
      defineDeadkey(ir, {
        triggerKey: "K_QUOTE",
        accentChar: "́",
        authorName: "acute",
      }),
    );
    const reparsed = parseKmn(emit(defined.ir));
    const listed = listDeadkeys(reparsed).find(
      (d) => d.id === defined.deadkey.id,
    );
    expect(listed?.triggerKey).toBe("K_QUOTE");
    expect(listed?.origin).toBe("studio");
    expect(listed?.authorName).toBe("acute");
    expectLifecycleClean(reparsed);
  });
});

// ---------------------------------------------------------------------------
// renameDeadkey
// ---------------------------------------------------------------------------

describe("renameDeadkey", () => {
  it("atomically rewrites trigger outputs, contexts, stores, and token hex; validator clean", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn(
          "3001",
          "K_QUOTE",
          "dk_3001_bases",
          "dk_3001_output",
          " c @deadkey:3001 name=acute",
        ),
    );
    const before = JSON.stringify(ir);

    const result = expectOk(renameDeadkey(ir, { from: 0x3001, to: 0x3002 }));
    expect(result.deadkey.id).toBe(0x3002);
    expect(result.deadkey.triggerKey).toBe("K_QUOTE");
    expect(result.deadkey.authorName).toBe("acute");
    expect(result.deadkey.baseStore).toBe("dk_3002_bases");
    expect(result.deadkey.outputStore).toBe("dk_3002_output");
    expect(result.deadkey.pairCount).toBe(2);

    // No reference to the old id survives anywhere.
    const ids = scanDeadkeyRefs(result.ir).map((r) => r.id);
    expect(ids).not.toContain(0x3001);
    expect(ids.filter((i) => i === 0x3002).length).toBeGreaterThan(0);

    // Old store names are gone; the token hex moved with the id.
    const kmn = emit(result.ir);
    expect(kmn).not.toContain("dk_3001");
    expect(kmn).toContain("dk_3002_bases");
    expect(kmn).toContain("dk_3002_output");
    expect(kmn).toContain("@deadkey:3002 name=acute");

    expectLifecycleClean(result.ir);
    expect(JSON.stringify(ir)).toBe(before);
  });

  it("refuses a non-numeric target: named-id-unavailable, never writes dk(name)", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output"),
    );
    // A name slipping through the type boundary (FR-004 hasn't landed).
    const result = renameDeadkey(ir, {
      from: 0x3001,
      to: Number.NaN as unknown as number,
    });
    expect(conflictKinds(result)).toEqual(["named-id-unavailable"]);
    // The IR is untouched and no dk(name) was written anywhere.
    expect(listDeadkeys(ir).some((d) => d.id === 0x3001)).toBe(true);
    expect(emit(ir)).not.toContain("dk(acute)");
  });

  it("refuses renaming onto an existing id: id-in-use", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output") +
        clusterKmn("3002", "K_BKQUOTE", "dk_3002_bases", "dk_3002_output"),
    );
    const result = renameDeadkey(ir, { from: 0x3001, to: 0x3002 });
    expect(conflictKinds(result)).toEqual(["id-in-use"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.ids).toEqual([0x3001, 0x3002]);
    }
  });

  it("leaves imported non-pattern store names untouched (found via storeRefs, never by pattern)", () => {
    // Imported keyboard: custom store names, no authorship marker.
    const ir = parseKmn(
      BASE_KMN + clusterKmn("0001", "K_QUOTE", "acuteK", "acuteO"),
    );
    expect(listDeadkeys(ir)[0]?.origin).toBe("imported");

    const result = expectOk(renameDeadkey(ir, { from: 1, to: 0x3005 }));
    expect(result.deadkey.baseStore).toBe("acuteK");
    expect(result.deadkey.outputStore).toBe("acuteO");
    expect(result.deadkey.origin).toBe("imported");
    const kmn = emit(result.ir);
    expect(kmn).toContain("acuteK");
    expect(kmn).toContain("acuteO");
    // Renaming an unmarked deadkey does not newly author it as studio-made.
    expect(kmn).not.toContain("@deadkey:");
    expectLifecycleClean(result.ir);
  });

  it("renaming onto the same id is an idempotent no-op", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output"),
    );
    const result = expectOk(renameDeadkey(ir, { from: 0x3001, to: 0x3001 }));
    expect(result.deadkey.id).toBe(0x3001);
    expectLifecycleClean(result.ir);
  });
});

// ---------------------------------------------------------------------------
// deleteDeadkey
// ---------------------------------------------------------------------------

describe("deleteDeadkey", () => {
  it("removes the whole entity: rules, stores, nothing orphaned; validator clean", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn(
          "3001",
          "K_QUOTE",
          "dk_3001_bases",
          "dk_3001_output",
          " c @deadkey:3001 name=acute",
        ),
    );
    const result = expectOk(deleteDeadkey(ir, { id: 0x3001 }));

    // The returned info describes the deleted deadkey.
    expect(result.deadkey.id).toBe(0x3001);
    expect(result.deadkey.triggerKey).toBe("K_QUOTE");

    // Nothing references the id anymore — rules, contexts, stores.
    expect(listDeadkeys(result.ir).some((d) => d.id === 0x3001)).toBe(false);
    expect(
      scanDeadkeyRefs(result.ir).some((r) => r.id === 0x3001),
    ).toBe(false);
    const kmn = emit(result.ir);
    expect(kmn).not.toContain("dk_3001");
    expect(kmn).not.toContain("dk(3001)");

    expectLifecycleClean(result.ir);
  });

  it("refuses when a non-canonical rule references the id: referenced with referrers listed", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output") +
        // A hand-authored rule consuming the deadkey state outside the
        // canonical cluster: three-element context, not trigger/fan-out/escape.
        `dk(3001) + [K_A] [K_B] > 'q'\n`,
    );
    const before = JSON.stringify(ir);
    const result = deleteDeadkey(ir, { id: 0x3001 });
    expect(conflictKinds(result)).toEqual(["referenced"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.ids).toEqual([0x3001]);
      expect(result.conflicts[0]?.referrers).toHaveLength(1);
      expect(result.conflicts[0]?.referrers?.[0]).toContain("dk(3001)");
    }
    // The IR is untouched — never a half-deleted deadkey.
    expect(JSON.stringify(ir)).toBe(before);
    expect(listDeadkeys(ir).some((d) => d.id === 0x3001)).toBe(true);
  });

  it("refuses when a store item references the id", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output"),
    );
    ir.stores.push({
      nodeId: "store:probe",
      name: "probe",
      items: [{ kind: "deadkey", id: 0x3001 }],
      isSystem: false,
    });
    const result = deleteDeadkey(ir, { id: 0x3001 });
    expect(conflictKinds(result)).toEqual(["referenced"]);
    if (!result.ok) {
      expect(
        result.conflicts[0]?.referrers?.some((r) => r.includes('"probe"')),
      ).toBe(true);
    }
  });

  it("deleting one deadkey leaves the others intact", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output") +
        clusterKmn("3002", "K_BKQUOTE", "dk_3002_bases", "dk_3002_output"),
    );
    const result = expectOk(deleteDeadkey(ir, { id: 0x3001 }));
    const remaining = listDeadkeys(result.ir);
    expect(remaining.map((d) => d.id)).toEqual([0x3002]);
    expect(remaining[0]?.pairCount).toBe(2);
    expectLifecycleClean(result.ir);
  });
});

// ---------------------------------------------------------------------------
// retargetDeadkey
// ---------------------------------------------------------------------------

describe("retargetDeadkey", () => {
  it("rewrites only the trigger rule's context; id, stores, pairs, name token untouched", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn(
          "3001",
          "K_QUOTE",
          "dk_3001_bases",
          "dk_3001_output",
          " c @deadkey:3001 name=acute",
        ),
    );
    const result = expectOk(
      retargetDeadkey(ir, { id: 0x3001, newTriggerKey: "K_BKQUOTE" }),
    );

    expect(result.deadkey.id).toBe(0x3001);
    expect(result.deadkey.triggerKey).toBe("K_BKQUOTE");
    expect(result.deadkey.authorName).toBe("acute");
    expect(result.deadkey.baseStore).toBe("dk_3001_bases");
    expect(result.deadkey.pairCount).toBe(2);

    const kmn = emit(result.ir);
    // Trigger moved…
    expect(kmn).toContain("+ [K_BKQUOTE] > dk(3001)");
    // …but the escape rule is deliberately NOT rewritten (separately
    // authorable; the engine does not presume).
    expect(kmn).toContain("dk(3001) + [K_QUOTE] > U+0301");
    // Fan-out untouched.
    expect(kmn).toContain(
      "dk(3001) + any(dk_3001_bases) > index(dk_3001_output, 2)",
    );
    // Name token hex untouched (id unchanged), name preserved.
    expect(kmn).toContain("@deadkey:3001 name=acute");

    expectLifecycleClean(result.ir);
  });

  it("conflict: new trigger already triggers another deadkey → trigger-in-use", () => {
    const ir = parseKmn(
      BASE_KMN +
        clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output") +
        clusterKmn("3002", "K_BKQUOTE", "dk_3002_bases", "dk_3002_output"),
    );
    const before = JSON.stringify(ir);
    const result = retargetDeadkey(ir, {
      id: 0x3001,
      newTriggerKey: "K_BKQUOTE",
    });
    expect(conflictKinds(result)).toEqual(["trigger-in-use"]);
    if (!result.ok) {
      expect(result.conflicts[0]?.ids).toEqual([0x3002]);
      expect(result.conflicts[0]?.keys).toEqual(["K_BKQUOTE"]);
    }
    expect(JSON.stringify(ir)).toBe(before);
  });

  it("retargeting onto the current trigger is a no-op success", () => {
    const ir = parseKmn(
      BASE_KMN + clusterKmn("3001", "K_QUOTE", "dk_3001_bases", "dk_3001_output"),
    );
    const result = expectOk(
      retargetDeadkey(ir, { id: 0x3001, newTriggerKey: "K_QUOTE" }),
    );
    expect(result.deadkey.triggerKey).toBe("K_QUOTE");
    expectLifecycleClean(result.ir);
  });
});
