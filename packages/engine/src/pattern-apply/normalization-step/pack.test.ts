import { describe, it, expect } from "vitest";
import type { ContextElement, IRRule, NormalizationMap, OutputRepertoire } from "@keyboard-studio/contracts";
import { packNormalization, type PackedRules } from "./pack.js";

const GRAVE = "\u0300";
const ACUTE = "\u0301";
const DOT = "\u0323";
const RING = "\u0325";

function rep(clusters: string[], marks: string[]): OutputRepertoire {
  return { clusters: new Set(clusters), marks, bases: [], stackDepth: 2, unresolved: [] };
}
const map = (from: string, to: string): NormalizationMap => ({ from, to });

/** Coarse shape of a rule: the kinds of its context elements, any() as "A", literal as "c". */
function shape(r: IRRule): string {
  return r.context.map((c: ContextElement) => (c.kind === "any" ? "A" : c.kind === "char" ? "c" : c.kind)).join("");
}

/** Every context each rule can match, with the text it writes back. */
function rewrites(packed: PackedRules): Map<string, string> {
  const items = new Map(packed.stores.map((s) => [s.name, s.items.map((i) => (i.kind === "char" ? i.value : ""))]));
  const out = new Map<string, string>();
  for (const r of packed.rules) {
    if (r.matchKind !== undefined) continue;
    // Each context position's options, as store indexes (a literal has one).
    const opts = r.context.map((c) => (c.kind === "any" ? (items.get(c.storeRef) ?? []).map((_, i) => i) : [0]));
    const picks = opts.reduce<number[][]>((acc, o) => acc.flatMap((t) => o.map((x) => [...t, x])), [[]]);
    for (const pick of picks) {
      const at = (j: number): string => {
        const c = r.context[j] as ContextElement;
        if (c.kind === "any") return items.get(c.storeRef)?.[pick[j] as number] ?? "";
        return c.kind === "char" ? c.value : "";
      };
      const from = r.context.map((_, j) => at(j)).join("");
      const to = r.output
        .map((o) => {
          if (o.kind === "char") return o.value;
          if (o.kind === "index") return items.get(o.storeRef)?.[pick[o.offset - 1] as number] ?? "";
          return "";
        })
        .join("");
      if (!out.has(from)) out.set(from, to);
    }
  }
  return out;
}

/** The FR-003 invariant: rules match only map alternates, writing exactly each map's target. */
function expectOnlyMappedRewrites(maps: NormalizationMap[], r: OutputRepertoire): void {
  const targets = new Map(maps.map((m) => [m.from, m.to]));
  for (const [from, to] of rewrites(packNormalization(maps, r) as PackedRules)) {
    expect(targets.has(from), `rewrites unmapped ${JSON.stringify(from)}`).toBe(true);
    expect(to).toBe(targets.get(from));
  }
}

function pack(maps: NormalizationMap[], r: OutputRepertoire): IRRule[] {
  const packed = packNormalization(maps, r);
  expect(packed).not.toBeNull();
  return (packed as { rules: IRRule[] }).rules;
}

describe("packNormalization shapes", () => {
  it("P0: rewrites the head and passes the marks through", () => {
    const maps = [
      map(`\u1eb9${ACUTE}`, `e${DOT}${ACUTE}`),
      map(`\u1eb9${GRAVE}`, `e${DOT}${GRAVE}`),
      map(`\u1ecd${ACUTE}`, `o${DOT}${ACUTE}`),
      map(`\u1ecd${GRAVE}`, `o${DOT}${GRAVE}`),
    ];
    const rules = pack(maps, rep([`e${DOT}${ACUTE}`, `e${DOT}${GRAVE}`, `o${DOT}${ACUTE}`, `o${DOT}${GRAVE}`], [GRAVE, ACUTE, DOT]));
    expect(rules.map(shape)).toEqual(["AA"]);
    expect(rules[0]?.output.at(-1)).toEqual({ kind: "index", storeRef: expect.any(String), offset: 2 });
  });

  it("T: a literal tail with an any() head", () => {
    const maps = [map(`a${"\u0308"}`, "\u00e4"), map(`e${"\u0308"}`, "\u00eb")];
    const rules = pack(maps, rep(["\u00e4", "\u00eb"], ["\u0308"]));
    expect(rules.map(shape)).toEqual(["Ac"]);
  });

  it("H: a literal head with an any() tail", () => {
    const maps = [map(`a${"\u0308"}`, "\u00e4"), map(`a${ACUTE}`, "\u00e1"), map(`a${GRAVE}`, "\u00e0")];
    const rules = pack(maps, rep(["\u00e4", "\u00e1", "\u00e0"], ["\u0308", ACUTE, GRAVE]));
    expect(rules.map(shape)).toEqual(["cA"]);
    expect(rules[0]?.output.every((o) => o.kind === "index" && o.offset === 2)).toBe(true);
  });

  it("P: a fixed first mark, the rest passes through", () => {
    const maps = [
      map(`h${DOT}${ACUTE}`, `H${ACUTE}`),
      map(`h${DOT}${GRAVE}`, `H${GRAVE}`),
      map(`k${DOT}${ACUTE}`, `K${ACUTE}`),
      map(`k${DOT}${GRAVE}`, `K${GRAVE}`),
    ];
    const rules = pack(maps, rep([`H${ACUTE}`, `H${GRAVE}`, `K${ACUTE}`, `K${GRAVE}`], [GRAVE, ACUTE, DOT]));
    expect(rules.map(shape)).toEqual(["AcA"]);
  });

  it("P2: a learned middle-mark set before a literal last mark", () => {
    const maps = [
      map(`h${DOT}${ACUTE}`, `H${DOT}`),
      map(`h${RING}${ACUTE}`, `H${RING}`),
      map(`k${DOT}${ACUTE}`, `K${DOT}`),
      map(`k${RING}${ACUTE}`, `K${RING}`),
    ];
    const rules = pack(maps, rep([`H${DOT}`, `H${RING}`, `K${DOT}`, `K${RING}`], [GRAVE, ACUTE, DOT, RING]));
    expect(rules.map(shape)).toEqual(["AAc"]);
  });
});

describe("packNormalization learned pass sets", () => {
  it("P: passes only the marks the maps show when the full mark set would collide with a produced cluster", () => {
    const maps = [
      map(`h${DOT}${ACUTE}`, `H${ACUTE}`),
      map(`h${DOT}${GRAVE}`, `H${GRAVE}`),
      map(`k${DOT}${ACUTE}`, `K${ACUTE}`),
      map(`k${DOT}${GRAVE}`, `K${GRAVE}`),
    ];
    const produced = [`H${ACUTE}`, `H${GRAVE}`, `K${ACUTE}`, `K${GRAVE}`, `h${DOT}${RING}`, `k${DOT}${RING}`];
    const rules = pack(maps, rep(produced, [GRAVE, ACUTE, DOT, RING]));
    expect(rules.map(shape)).toEqual(["AcA"]);
  });
});

describe("packNormalization safety", () => {
  const maps = [
    map(`\u1eb9${ACUTE}`, `e${DOT}${ACUTE}`),
    map(`\u1eb9${GRAVE}`, `e${DOT}${GRAVE}`),
  ];
  const base = [`e${DOT}${ACUTE}`, `e${DOT}${GRAVE}`];

  it("never matches a repertoire cluster", () => {
    const r = rep([...base, `\u1eb9${DOT}`], [GRAVE, ACUTE, DOT]);
    expect([...rewrites(packNormalization(maps, r) as PackedRules).keys()]).not.toContain(`\u1eb9${DOT}`);
    expectOnlyMappedRewrites(maps, r);
  });

  it("never disagrees with a covered map", () => {
    const bad = [...maps, map(`\u1eb9${DOT}`, "Q")];
    expectOnlyMappedRewrites(bad, rep([...base, "Q"], [GRAVE, ACUTE, DOT]));
  });

  it("never rewrites a cluster with no map, even when its marks are repertoire marks (FR-003)", () => {
    // DOT is a repertoire mark, but pasted U+1EB9 + DOT has no map: it is left as is.
    const r = rep(base, [GRAVE, ACUTE, DOT]);
    const matched = [...rewrites(packNormalization(maps, r) as PackedRules).keys()].sort();
    expect(matched).toEqual(maps.map((m) => m.from).sort());
    expectOnlyMappedRewrites(maps, r);
  });

  it("learns a pass-through set per position for three-character alternates", () => {
    const three = [
      map(`\u1eb9${ACUTE}${GRAVE}`, `e${DOT}${ACUTE}${GRAVE}`),
      map(`\u1eb9${GRAVE}${ACUTE}`, `e${DOT}${GRAVE}${ACUTE}`),
      map(`\u1eb9${ACUTE}${ACUTE}`, `e${DOT}${ACUTE}${ACUTE}`),
      map(`\u1eb9${GRAVE}${GRAVE}`, `e${DOT}${GRAVE}${GRAVE}`),
    ];
    const r = rep(three.map((m) => m.to), [GRAVE, ACUTE, DOT, RING]);
    expect(pack(three, r).map(shape)).toEqual(["AAA"]);
    expectOnlyMappedRewrites(three, r);
  });

  it("emits no if() and no backspace rule, only char/any/index elements", () => {
    const rules = pack(maps, rep(base, [GRAVE, ACUTE, DOT]));
    for (const r of rules) {
      for (const c of r.context) expect(["char", "any"]).toContain(c.kind);
      for (const o of r.output) expect(["char", "index"]).toContain(o.kind);
    }
  });

  it("never needs more rules than one literal rule per map", () => {
    const many = [
      map(`a${"\u0308"}`, "\u00e4"),
      map(`a${ACUTE}`, "\u00e1"),
      map(`e${"\u0308"}`, "\u00eb"),
      map(`o${GRAVE}`, "\u00f2"),
      ...maps,
    ];
    const rules = pack(many, rep(["\u00e4", "\u00e1", "\u00eb", "\u00f2", ...base], [GRAVE, ACUTE, DOT, "\u0308"]));
    expect(rules.length).toBeLessThanOrEqual(many.length);
  });

  it("is deterministic and returns null when told to stop", () => {
    const r = rep(base, [GRAVE, ACUTE, DOT]);
    expect(JSON.stringify(packNormalization(maps, r))).toBe(JSON.stringify(packNormalization(maps, r)));
    expect(packNormalization(maps, r, () => true)).toBeNull();
  });
});

describe("packNormalization bounds", () => {
  const cjk = (n: number, base = 0x4e00): string[] => Array.from({ length: n }, (_, i) => String.fromCodePoint(base + i));

  it("refuses with a reason when the mark-tuple product exceeds the cap, without hanging", () => {
    const marks = cjk(700, 0x0300).filter((c) => /^\p{M}/u.test(c)).concat(cjk(700, 0x20000));
    const maps = [map(`h${GRAVE}${ACUTE}`, `H${GRAVE}${ACUTE}`)];
    const t0 = performance.now();
    const packed = packNormalization(maps, rep([], [GRAVE, ACUTE, ...marks]));
    expect(packed).toMatchObject({ tooLarge: expect.stringContaining("combinations") });
    expect(performance.now() - t0).toBeLessThan(2000);
  }, 5000);

  it("polls shouldStop inside the tuple enumeration", () => {
    const marks = [GRAVE, ACUTE, ...cjk(400, 0x20000)];
    const maps = [map(`h${GRAVE}${ACUTE}`, `H${GRAVE}${ACUTE}`)];
    let calls = 0;
    // Allow the per-length and per-head polls, then stop on the first in-enumeration poll.
    const packed = packNormalization(maps, rep([], marks), () => ++calls > 2);
    expect(packed).toBeNull();
    expect(calls).toBeGreaterThan(2);
  }, 5000);

  it("refuses when the rule count passes the cap", () => {
    const maps = cjk(2100).map((h, i) => map(`${h}${String.fromCodePoint(0x30000 + i)}`, String.fromCodePoint(0x40000 + i)));
    expect(packNormalization(maps, rep([], []))).toMatchObject({ tooLarge: expect.stringContaining("rules") });
  }, 20000);

  it("refuses when the store count passes the cap", () => {
    const maps: NormalizationMap[] = [];
    for (let i = 0; i < 600; i++) {
      const t1 = String.fromCodePoint(0x30000 + i);
      const t2 = String.fromCodePoint(0x31000 + i);
      ["\u4e00", "\u4e01"].forEach((h, j) =>
        maps.push(map(`${h}${t1}${t2}`, `${String.fromCodePoint(0x40000 + 2 * i + j)}${String.fromCodePoint(0x50000 + 2 * i + j)}`)),
      );
    }
    expect(packNormalization(maps, rep([], []))).toMatchObject({ tooLarge: expect.stringContaining("stores") });
  }, 20000);
});
