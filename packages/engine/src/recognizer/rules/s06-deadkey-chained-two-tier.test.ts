/**
 * Unit tests for the S-06 two-trigger chain recognizer (#2235,
 * queue-2235-ruling.md §3 predicate verbatim).
 *
 * Pins: the admitted chain shape (numeric + named union), the mandatory
 * pure-edge gate (flush edges — the pending-letter sense — are NOT
 * claimed), boundedness (an onward edge from T disqualifies), the
 * T≠F self-loop exclusion, S-06-first pre-emption in the pipeline
 * (tier-2 resolutions are NOT also S-02-owned), and the Pattern naming.
 */

import { describe, it, expect } from "vitest";
import type { IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";
import { s06Recognizer } from "./s06-deadkey-chained-two-tier.js";
import { findS06Families } from "../s06-families.js";
import { recognizePatterns } from "../index.js";
import { buildChainIR, buildNamedChainIR } from "./__fixtures__/s06ChainIr.js";

function group(nodeId: string, name: string, usingKeys: boolean, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys, readonly: false, rules };
}

describe("s06Recognizer — admitted shapes", () => {
  it("claims the numeric chain as ONE Pattern per family F, owning arming + edges + resolutions + tier-1 direct + double-press", () => {
    const { ir } = buildChainIR();
    const matches = s06Recognizer.match(structuredClone(ir));
    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.patternId).toBe("latin_deadkey_chained_two_tier#dk_0021");
    expect(m.slotValues["subClusterCount"]).toBe("5");
    const owned = m.ownedNodes.map((n) => n.nodeId).sort();
    expect(owned).toEqual(
      [
        "rule#arm-1",
        "rule#arm-2",
        "rule#edge-0060",
        "rule#edge-00b4",
        "rule#edge-005e",
        "rule#edge-007e",
        "rule#edge-00a8",
        "rule#res-0060",
        "rule#res-00b4",
        "rule#res-005e",
        "rule#res-007e",
        "rule#res-00a8",
        "rule#res-tier1",
        "rule#double-press",
      ].sort(),
    );
  });

  it("lift produces the library Pattern identity with the explicit title", () => {
    const { ir } = buildChainIR();
    const match = s06Recognizer.match(structuredClone(ir))[0]!;
    const pattern = s06Recognizer.lift(match);
    expect(pattern.id).toBe("latin_deadkey_chained_two_tier#dk_0021");
    expect(pattern.title).toBe("Chained deadkeys (two-tier)");
    expect(pattern.strategyId).toBe("S-06");
    expect(pattern.origin).toBe("recognized");
    expect(pattern.questions.map((q) => q.id)).toContain("tier1FamilyName");
  });

  it("claims the NAMED chain (deadkey-element union, ASCII case-folded identity)", () => {
    const { ir } = buildNamedChainIR();
    const matches = s06Recognizer.match(structuredClone(ir));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.patternId).toBe(
      "latin_deadkey_chained_two_tier#dk(grave_family)",
    );
    expect(matches[0]!.ownedNodes.map((n) => n.nodeId).sort()).toEqual(
      ["rule#arm-named", "rule#edge-named", "rule#fallback-named", "rule#res-named"].sort(),
    );
  });

  it("pipeline: recognizePatterns stamps the chain S-06 and does NOT double-claim its resolutions as S-02", () => {
    const { ir } = buildChainIR();
    const { ir: out } = recognizePatterns(ir);
    const s06 = out.recognizedPatterns.filter((p) => p.strategyId === "S-06");
    expect(s06).toHaveLength(1);
    const res = out.groups
      .flatMap((g) => g.rules)
      .find((r) => r.nodeId === "rule#res-0060");
    expect(res?.ownedByPattern).toBe("latin_deadkey_chained_two_tier#dk_0021");
    // No S-02 pattern claims any chain member.
    const s02Owned = new Set(
      out.recognizedPatterns
        .filter((p) => p.strategyId === "S-02")
        .flatMap((p) => (p.ownedNodes ?? []).map((n) => n.nodeId)),
    );
    for (const node of s06[0]!.ownedNodes ?? []) {
      expect(s02Owned.has(node.nodeId)).toBe(false);
    }
  });
});

describe("s06Recognizer — predicate gates (mechanism exclusions)", () => {
  it("flush edges are NOT claimed (pending-letter sense excluded by output purity)", () => {
    // armenian-style: dk(F) + char > char + dk(T) — output also emits a char.
    const main = group("group#main", "main", true, [
      {
        nodeId: "rule#arm",
        context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
        output: [{ kind: "deadkey", id: 1 }],
      },
    ]);
    const dk = group("group#deadkeys", "deadkeys", false, [
      {
        nodeId: "rule#flush",
        context: [
          { kind: "deadkey", id: 1 },
          { kind: "char", value: "a" },
        ],
        output: [
          { kind: "char", value: "a" },
          { kind: "deadkey", id: 2 },
        ],
      },
      {
        nodeId: "rule#res",
        context: [
          { kind: "deadkey", id: 2 },
          { kind: "any", storeRef: "in" },
        ],
        output: [{ kind: "index", storeRef: "out", offset: 2 }],
      },
    ]);
    const ir = makeTestIR(
      [main, dk],
      [makeCharStore("store#in", "in", "ae"), makeCharStore("store#out", "out", "àè")],
    );
    expect(findS06Families(ir)).toEqual([]);
  });

  it("an onward edge from T disqualifies the sub-cluster (boundedness)", () => {
    const { ir } = buildChainIR([0x60]);
    const deadkeys = ir.groups.find((g) => g.name === "deadkeys")!;
    deadkeys.rules.push({
      nodeId: "rule#onward",
      context: [
        { kind: "deadkey", id: 0x60 },
        { kind: "char", value: "x" },
      ],
      output: [{ kind: "deadkey", id: 0x61 }],
    });
    expect(findS06Families(ir)).toEqual([]);
  });

  it("a self-loop edge (T == F) is not a pure edge (sil_euro_latin exclusion)", () => {
    const main = group("group#main", "main", true, [
      {
        nodeId: "rule#arm",
        context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
        output: [{ kind: "deadkey", id: 1 }],
      },
    ]);
    const dk = group("group#deadkeys", "deadkeys", false, [
      {
        nodeId: "rule#self",
        context: [
          { kind: "deadkey", id: 1 },
          { kind: "char", value: "a" },
        ],
        output: [{ kind: "deadkey", id: 1 }],
      },
      {
        nodeId: "rule#res",
        context: [
          { kind: "deadkey", id: 1 },
          { kind: "any", storeRef: "in" },
        ],
        output: [{ kind: "index", storeRef: "out", offset: 2 }],
      },
    ]);
    const ir: KeyboardIR = makeTestIR(
      [main, dk],
      [makeCharStore("store#in", "in", "ae"), makeCharStore("store#out", "out", "àè")],
    );
    expect(findS06Families(ir)).toEqual([]);
  });

  it("no arming rule -> no claim; tier-2 resolution alone stays for S-02", () => {
    const { ir } = buildChainIR([0x60]);
    const main = ir.groups.find((g) => g.name === "main")!;
    main.rules = main.rules.filter((r) => !r.nodeId.startsWith("rule#arm"));
    expect(findS06Families(ir)).toEqual([]);
  });

  it("a [dk(T), vkey] > char rule (S-02 escape shape) is NOT swept in as a tier-2 double-press", () => {
    const { ir } = buildChainIR([0x60]);
    const deadkeys = ir.groups.find((g) => g.name === "deadkeys")!;
    deadkeys.rules.push({
      nodeId: "rule#escape-0060",
      context: [
        { kind: "deadkey", id: 0x60 },
        { kind: "vkey", name: "K_7", modifiers: [] },
      ],
      output: [{ kind: "char", value: "`" }],
    });
    const families = findS06Families(ir);
    expect(families).toHaveLength(1);
    expect(families[0]!.ownedRules.map((r) => r.nodeId)).not.toContain(
      "rule#escape-0060",
    );
  });
});
