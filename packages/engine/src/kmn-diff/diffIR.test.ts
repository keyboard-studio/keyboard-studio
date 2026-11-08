/**
 * diffIR (spec 113 T089): empty for a formatting-only edit (FR-066), one test per
 * IRChange kind, LCS alignment (an early insert is one insert), an opaque fragment edit is
 * one replace, a renamed group is remove + add.
 */
import { describe, expect, it } from "vitest";
import type { IRChange } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { diffIR } from "./diffIR.js";
import { BASE_KMN, RAW_KMN, editLine, parseText } from "./kmn-diff-fixtures.js";

function kinds(changes: readonly IRChange[]): string[] {
  return changes.map((c) => c.change);
}

describe("diffIR", () => {
  it("is empty for an IR and its own re-parse (FR-066)", () => {
    for (const text of [BASE_KMN, RAW_KMN]) {
      const a = parseText(text);
      expect(diffIR(a, parseText(emit(a)))).toEqual([]);
    }
  });

  it("is empty when only whitespace and blank lines change", () => {
    const a = parseText(BASE_KMN);
    const spaced = BASE_KMN.replace(/^\+ \[K_A\] > 'a'$/m, "+   [K_A]   >   'a'").replace("group(tail)", "\n\ngroup(tail)");
    expect(diffIR(a, parseText(spaced))).toEqual([]);
  });

  it("insert: a new rule is one insert anchored after its predecessor", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "+ [K_B] > 'b'", "+ [K_B] > 'b'\n+ [K_F] > 'f'"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["insert"]);
    const c = changes[0]!;
    if (c.change !== "insert") throw new Error("unreachable");
    expect(c.at.text).toBe("+ [K_B] > U+0062");
    expect(c.at.container).toEqual({ kind: "group", name: "main", usingKeys: true });
  });

  it("an inserted rule early in a group is one insert, not a cascade", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "+ [K_A] > 'a'", "+ [K_Z] > 'z'\n+ [K_A] > 'a'"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["insert"]);
    const c = changes[0]!;
    if (c.change !== "insert") throw new Error("unreachable");
    expect(c.at.text).toBe("");
  });

  it("remove: a deleted rule is one remove carrying the old node", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "+ [K_D] > 'd'\n", ""));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["remove"]);
    const c = changes[0]!;
    if (c.change !== "remove") throw new Error("unreachable");
    expect(c.at.text).toBe("+ [K_D] > U+0064");
    expect("context" in c.old).toBe(true);
  });

  it("replace: a changed rule is one replace holding both nodes", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "+ [K_D] > 'd'", "+ [K_D] > 'D'"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["replace"]);
  });

  it("a comment change is a comment insert, remove, or replace", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "c a leading comment", "c a different comment"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["replace"]);
    const c = changes[0]!;
    if (c.change !== "replace") throw new Error("unreachable");
    expect("anchor" in c.node).toBe(true);
  });

  it("an opaque fragment edit is one replace", () => {
    const a = parseText(RAW_KMN);
    expect(a.raw.length).toBeGreaterThan(0);
    const b = parseText(editLine(RAW_KMN, "outs(base) 'def'", "outs(base) 'xyz'"));
    const changes = diffIR(a, b);
    // The fragment (an opaque store) is the only difference.
    expect(kinds(changes)).toEqual(["replace"]);
    const c = changes[0]!;
    if (c.change !== "replace") throw new Error("unreachable");
    expect("sourceText" in c.node).toBe(true);
  });

  it("set-store: a changed store carries previous; an added one does not", () => {
    const withStore = editLine(BASE_KMN, "begin Unicode", "store(keys) 'abc'\nbegin Unicode");
    const a = parseText(BASE_KMN);
    const added = diffIR(a, parseText(withStore));
    expect(kinds(added)).toEqual(["set-store"]);
    const addedChange = added[0]!;
    if (addedChange.change !== "set-store") throw new Error("unreachable");
    expect(addedChange.previous).toBeUndefined();

    const changed = diffIR(parseText(withStore), parseText(editLine(withStore, "'abc'", "'abd'")));
    expect(kinds(changed)).toEqual(["set-store"]);
    const changedChange = changed[0]!;
    if (changedChange.change !== "set-store") throw new Error("unreachable");
    expect(changedChange.previous).toBeDefined();
  });

  it("remove-store: a deleted store is one remove-store", () => {
    const withStore = editLine(BASE_KMN, "begin Unicode", "store(keys) 'abc'\nbegin Unicode");
    const changes = diffIR(parseText(withStore), parseText(BASE_KMN));
    expect(kinds(changes)).toEqual(["remove-store"]);
  });

  it("set-begin: a changed entry group", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "begin Unicode > use(main)", "begin Unicode > use(tail)"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toContain("set-begin");
    const c = changes.find((x) => x.change === "set-begin")!;
    if (c.change !== "set-begin") throw new Error("unreachable");
    expect(c.begin.main).toBe("tail");
    expect(c.previous.main).toBe("main");
  });

  it("set-header: a header edit is a system-store change plus a header patch", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(editLine(BASE_KMN, "'diff-test'", "'diff-renamed'"));
    const changes = diffIR(a, b);
    expect(kinds(changes)).toEqual(["set-store", "set-header"]);
    const h = changes[1]!;
    if (h.change !== "set-header") throw new Error("unreachable");
    expect(h.header).toEqual({ name: "diff-renamed" });
    expect(h.previous).toEqual({ name: "diff-test" });
  });

  it("a renamed group is remove-group plus add-group", () => {
    const a = parseText(BASE_KMN);
    const b = parseText(
      BASE_KMN.replace("group(tail)", "group(rear)").replace("match > use(tail)", "match > use(rear)"),
    );
    const changes = diffIR(a, b);
    expect(kinds(changes)).toContain("remove-group");
    expect(kinds(changes)).toContain("add-group");
    const removed = changes.find((c) => c.change === "remove-group")!;
    const added = changes.find((c) => c.change === "add-group")!;
    if (removed.change !== "remove-group" || added.change !== "add-group") throw new Error("unreachable");
    expect(removed.previous.name).toBe("tail");
    expect(added.group.name).toBe("rear");
    // Neither group travels with rules: its items are separate changes.
    expect(removed.previous.rules).toEqual([]);
    expect(added.group.rules).toEqual([]);
  });
});
