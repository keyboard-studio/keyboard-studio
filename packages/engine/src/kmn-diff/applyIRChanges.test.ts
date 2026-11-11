/**
 * applyIRChanges, findOwners, invertChanges (spec 117 T091).
 */
import { describe, expect, it } from "vitest";
import type { IRChange, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { emit, emitRule } from "../codec/emit.js";
import { applyIRChanges } from "./applyIRChanges.js";
import { diffIR } from "./diffIR.js";
import { findOwners } from "./findOwners.js";
import { invertChanges } from "./invertChanges.js";
import { BASE_KMN, RAW_KMN, editLine, parseText } from "./kmn-diff-fixtures.js";

const EDITS: Array<[string, string, string, string]> = [
  ["insert early", BASE_KMN, "+ [K_A] > 'a'", "+ [K_Z] > 'z'\n+ [K_A] > 'a'"],
  ["insert late", BASE_KMN, "+ [K_E] > 'e'", "+ [K_E] > 'e'\n+ [K_F] > 'f'"],
  ["delete", BASE_KMN, "+ [K_D] > 'd'\n", ""],
  ["change", BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'"],
  ["comment", BASE_KMN, "c a leading comment", "c a different comment"],
  ["new comment", BASE_KMN, "+ [K_D] > 'd'", "c brand new\n+ [K_D] > 'd'"],
  ["store added", BASE_KMN, "begin Unicode", "store(keys) 'abc'\nbegin Unicode"],
  ["header", BASE_KMN, "'diff-test'", "'diff-renamed'"],
  ["begin", BASE_KMN, "begin Unicode > use(main)", "begin Unicode > use(tail)"],
  ["new group", BASE_KMN, "group(tail)\n", "group(extra)\n\n'q' > 'Q'\n\ngroup(tail)\n"],
  ["raw: change fragment", RAW_KMN, "outs(base) 'def'", "outs(base) 'xyz'"],
  ["raw: insert rule", RAW_KMN, "+ [K_B] > 'b'", "+ [K_B] > 'b'\n+ [K_G] > 'g'"],
  ["raw: insert first", RAW_KMN, "+ [K_A] > 'a'", "+ [K_Z] > 'z'\n+ [K_A] > 'a'"],
  ["raw: delete rule", RAW_KMN, "+ [K_B] > 'b'\n", ""],
  ["raw: new store", RAW_KMN, "store(more)", "store(mid) 'mmm'\nstore(more)"],
];

describe("applyIRChanges", () => {
  it.each(EDITS)("emit(apply(a, diff(a, b))) === emit(b): %s", (_name, text, from, to) => {
    const a = parseText(text);
    const b = parseText(editLine(text, from, to));
    const changes = diffIR(a, b);
    expect(changes.length).toBeGreaterThan(0);
    const result = applyIRChanges(a, changes);
    expect(result.misses).toEqual([]);
    expect(emit(result.ir)).toBe(emit(b));
  });

  describe("keystroke anchor (ruling 10)", () => {
    const main = { kind: "group" as const, name: "main", usingKeys: true };
    const keyed = (vkey: string, modifiers: string[] = []) => ({ vkey, modifiers });
    const ruleOf = (text: string): IRRule => parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", text)).groups[0]!.rules[3]!;

    const outputOf = (ir: KeyboardIR, vkey: string): string | undefined => {
      const r = ir.groups[0]!.rules.find((x) => x.context.some((c) => c.kind === "vkey" && c.name === vkey));
      return r?.output.map((o) => (o.kind === "char" ? o.value : "?")).join("");
    };

    it("replaces the rule by key when the text anchor misses", () => {
      const a = parseText(BASE_KMN);
      const result = applyIRChanges(a, [
        {
          change: "replace",
          at: { container: main, text: "+ [K_D] > 'something the assignment rewrote'", keystroke: keyed("K_D") },
          old: ruleOf("+ [K_D] > 'd'"),
          node: ruleOf("+ [K_D] > 'D'"),
        },
      ]);
      expect(result.misses).toEqual([]);
      expect(outputOf(result.ir, "K_D")).toBe("D");
    });

    it("removes the rule by key when the text anchor misses", () => {
      const a = parseText(BASE_KMN);
      const result = applyIRChanges(a, [
        { change: "remove", at: { container: main, text: "stale", keystroke: keyed("K_D") }, old: ruleOf("+ [K_D] > 'd'") },
      ]);
      expect(result.misses).toEqual([]);
      expect(outputOf(result.ir, "K_D")).toBeUndefined();
    });

    it("prefers the text anchor when it is found", () => {
      const a = parseText(BASE_KMN);
      const result = applyIRChanges(a, [
        {
          change: "replace",
          at: { container: main, text: emitRule(ruleOf("+ [K_D] > 'd'"), true), keystroke: keyed("K_E") },
          old: ruleOf("+ [K_D] > 'd'"),
          node: ruleOf("+ [K_D] > 'D'"),
        },
      ]);
      expect(outputOf(result.ir, "K_D")).toBe("D");
      expect(outputOf(result.ir, "K_E")).toBe("e");
    });

    it("is a miss when no rule answers the key or the modifiers differ", () => {
      const a = parseText(BASE_KMN);
      const miss = (k: ReturnType<typeof keyed>): number[] =>
        applyIRChanges(a, [{ change: "remove", at: { container: main, text: "stale", keystroke: k }, old: ruleOf("+ [K_D] > 'd'") }]).misses;
      expect(miss(keyed("K_Q"))).toEqual([0]);
      expect(miss(keyed("K_D", ["SHIFT"]))).toEqual([0]);
    });
  });

  it("does not mutate its input", () => {
    const a = parseText(BASE_KMN);
    const before = emit(a);
    const snapshot = JSON.stringify(a);
    applyIRChanges(a, diffIR(a, parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'"))));
    expect(emit(a)).toBe(before);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it("untouched nodes keep their ids", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'"));
    const result = applyIRChanges(a, diffIR(a, b));
    const idsBefore = a.groups[0]!.rules.map((r) => r.nodeId);
    const idsAfter = result.ir.groups[0]!.rules.map((r) => r.nodeId);
    const kept = idsAfter.filter((id) => idsBefore.includes(id));
    expect(kept.length).toBe(idsBefore.length - 1);
    expect(result.ir.groups[1]).toBe(a.groups[1]);
  });

  it("inserted and replaced rules carry authorEdit code-tab and fresh ids above the highest", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(
      editLine(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'"), "+ [K_B] > 'b'", "+ [K_B] > 'b'\n+ [K_F] > 'f'"),
    );
    const result = applyIRChanges(a, diffIR(a, b));
    const highest = Math.max(
      ...a.groups.flatMap((g) => g.rules.map((r) => Number(/rule#(\d+)/.exec(r.nodeId)?.[1] ?? -1))),
    );
    const stamped = result.ir.groups[0]!.rules.filter((r) => r.authorEdit === "code-tab");
    expect(stamped).toHaveLength(2);
    for (const r of stamped) expect(Number(/rule#(\d+)/.exec(r.nodeId)![1])).toBeGreaterThan(highest);
    const ids = result.ir.groups.flatMap((g) => g.rules.map((r) => r.nodeId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.effect.inserted).toEqual(stamped.map((r) => r.nodeId).sort());
  });

  it("a change whose anchor is gone is listed in misses, not thrown or dropped", () => {
    const a = parseText(BASE_KMN);
    const changes = diffIR(a, parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'")));
    const without = parseText(editLine(BASE_KMN, "+ [K_D] > 'd'\n", ""));
    const result = applyIRChanges(without, changes);
    expect(result.misses).toEqual([0]);
    expect(emit(result.ir)).toBe(emit(without));
  });

  it("an unknown store or group in a change is a miss", () => {
    const a = parseText(BASE_KMN);
    const changes: IRChange[] = [
      { change: "remove-store", name: "nothere", previous: { name: "nothere", items: [], isSystem: false } },
      { change: "remove-group", previous: { nodeId: "x", name: "nothere", usingKeys: false, rules: [], readonly: false } },
    ];
    expect(applyIRChanges(a, changes).misses).toEqual([0, 1]);
  });

  it("identical rules are told apart by their neighbours", () => {
    const dup = editLine(BASE_KMN, "+ [K_B] > 'b'", "+ [K_B] > 'b'\n+ [K_X] > 'x'\n+ [K_B] > 'b'");
    const a = parseText(dup);
    const b = parseText(editLine(dup, "+ [K_X] > 'x'", "+ [K_X] > 'x'\n+ [K_Y] > 'y'"));
    const result = applyIRChanges(a, diffIR(a, b));
    expect(result.misses).toEqual([]);
    expect(emit(result.ir)).toBe(emit(b));
  });
});

describe("invertChanges", () => {
  it.each(EDITS)("apply then invert restores the text: %s", (_name, text, from, to) => {
    const a = parseText(text);
    const changes = diffIR(a, parseText(editLine(text, from, to)));
    const forward = applyIRChanges(a, changes);
    const back = applyIRChanges(forward.ir, invertChanges(changes));
    expect(back.misses).toEqual([]);
    expect(emit(back.ir)).toBe(emit(a));
  });

  it("inverting twice gives the original change kinds", () => {
    const a = parseText(BASE_KMN);
    const changes = diffIR(a, parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'")));
    expect(invertChanges(invertChanges(changes)).map((c) => c.change)).toEqual(changes.map((c) => c.change));
  });
});

function withMarker(ir: KeyboardIR, text: string, patch: Partial<IRRule>): KeyboardIR {
  return {
    ...ir,
    groups: ir.groups.map((g) => ({
      ...g,
      rules: g.rules.map((r) => (r.output.some((o) => o.kind === "char" && o.value === text) ? { ...r, ...patch } : r)),
    })),
  };
}

describe("findOwners", () => {
  const start = parseText(BASE_KMN);
  const edited = (from: string, to: string): KeyboardIR => parseText(editLine(BASE_KMN, from, to));

  it("returns nothing for a startIr-identical node", () => {
    const changes = diffIR(start, edited("+ [K_D] > 'd'", "+ [K_D] > 'D'"));
    expect(findOwners(start, start, changes)).toEqual([]);
  });

  it("names each marker's owner, and another-step when there is no marker", () => {
    const changes = diffIR(start, edited("+ [K_D] > 'd'", "+ [K_D] > 'D'"));
    // The working IR differs from the starting point: the rule being replaced was authored elsewhere.
    const working = (patch: Partial<IRRule>): KeyboardIR => {
      const w = withMarker(start, "d", patch);
      return { ...w, groups: w.groups.map((g) => ({ ...g, rules: g.rules.map((r) => ({ ...r, nodeId: r.nodeId })) })) };
    };
    // Make the working rule differ from startIr so "identical to startIr" does not apply.
    const differ = (patch: Partial<IRRule>): { ir: KeyboardIR; changes: IRChange[] } => {
      const ir = working(patch);
      const bumped: KeyboardIR = {
        ...ir,
        groups: ir.groups.map((g) => ({
          ...g,
          rules: g.rules.map((r) =>
            r.output.some((o) => o.kind === "char" && o.value === "d") ? { ...r, trailingComment: (r.trailingComment ?? "") + (patch.trailingComment ?? "") } : r,
          ),
        })),
      };
      return { ir: bumped, changes: diffIR(bumped, edited("+ [K_D] > 'd'", "+ [K_D] > 'D'")) };
    };
    const cases: Array<[Partial<IRRule>, string]> = [
      [{ trailingComment: "@deadkey:0001" }, "deadkeys"],
      [{ rulesStepAdded: true, trailingComment: "x" }, "rules-step"],
      [{ authorEdit: "layout-tab", trailingComment: "x" }, "layout-tab"],
      [{ authorEdit: "code-tab", trailingComment: "x" }, "code-tab"],
      [{ trailingComment: "plain" }, "another-step"],
    ];
    for (const [patch, owner] of cases) {
      const { ir, changes: ch } = differ(patch);
      expect(findOwners(ir, start, ch).map((o) => o.owner)).toEqual([owner]);
    }
    expect(changes.length).toBe(1);
  });

  it("names identity for a changed header store and deadkeys for a dk_ store", () => {
    const renamed = parseText(editLine(BASE_KMN, "'diff-test'", "'diff-renamed'"));
    const changedName = diffIR(renamed, start);
    expect(findOwners(renamed, start, changedName).map((o) => o.owner)).toEqual(["identity"]);

    const withDk = parseText(editLine(BASE_KMN, "begin Unicode", "store(dk_acute) 'a'\nbegin Unicode"));
    const startWithOther = parseText(editLine(BASE_KMN, "begin Unicode", "store(dk_acute) 'b'\nbegin Unicode"));
    const change = diffIR(withDk, startWithOther);
    expect(findOwners(withDk, start, change).map((o) => o.owner)).toEqual(["deadkeys"]);
  });
});
