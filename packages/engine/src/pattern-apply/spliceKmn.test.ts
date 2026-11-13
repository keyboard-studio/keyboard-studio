// Contract tests for the .kmn text projection (spec 111, contracts/kmn-projection.md).
//
// Built from real parse() output: the splice depends on real sourceLine
// correspondence with the original text. Corpus cases skip when the sibling
// keyboards checkout is absent (same convention as carveViaSplice.corpus.test).

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emitRule, emitStore } from "../codec/emit.js";
import { diffIrToKmnEdits, spliceKmn, projectKmnText } from "./spliceKmn.js";

const HEAD =
  `store(&VERSION) '10.0'\n` +
  `store(&NAME) 'Test'\n` +
  `\n` +
  `begin Unicode > use(main)\n` +
  `\n` +
  `group(main) using keys\n` +
  `\n`;

function parsed(kmn: string): KeyboardIR {
  return parse(kmn, "test").ir;
}

function findRule(ir: KeyboardIR, ch: string): IRRule {
  for (const g of ir.groups) {
    const r = g.rules.find((x) => x.output.some((o) => o.kind === "char" && o.value === ch));
    if (r) return r;
  }
  throw new Error(`no rule outputting ${ch}`);
}

function crlf(s: string): string {
  return s.replace(/\n/g, "\r\n");
}

describe("spliceKmn contract", () => {
  const kmn =
    HEAD +
    `+ [K_A] > 'a'\n` +
    `+ [K_B] > 'b' c keep me\n` +
    `+ [K_C] > 'c'\n`;

  it("no edits returns identical text", () => {
    const ir = parsed(kmn);
    const r = spliceKmn(kmn, ir, []);
    expect(r).toEqual({ ok: true, text: kmn });
  });

  it("projectKmnText of an unchanged IR returns identical text", () => {
    const ir = parsed(kmn);
    expect(diffIrToKmnEdits(ir, structuredClone(ir))).toEqual([]);
    expect(projectKmnText(kmn, ir, structuredClone(ir))).toEqual({ ok: true, text: kmn });
  });

  it("delete touches only the deleted line", () => {
    const start = parsed(kmn);
    const ir = structuredClone(start);
    const b = findRule(ir, "b");
    ir.groups[0]!.rules = ir.groups[0]!.rules.filter((r) => r.nodeId !== b.nodeId);
    const r = projectKmnText(kmn, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe(kmn.replace(`+ [K_B] > 'b' c keep me\n`, ""));
  });

  it("replace touches only the replaced line", () => {
    const start = parsed(kmn);
    const ir = structuredClone(start);
    const g = ir.groups[0]!;
    const b = findRule(ir, "b");
    b.output = [{ kind: "char", value: "z" }];
    const r = projectKmnText(kmn, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newLine = emitRule(b, g.usingKeys);
    const a = kmn.split("\n");
    const t = r.text.split("\n");
    expect(t.length).toBe(a.length);
    const diff = a.map((l, i) => (l === t[i] ? -1 : i)).filter((i) => i >= 0);
    expect(diff).toHaveLength(1);
    expect(t[diff[0]!]).toBe(newLine.replace(/\n$/, ""));
    expect(t[diff[0]!]).toContain("U+007A");
  });

  it("insert adds a rule after the last rule of the group, leaving other lines intact", () => {
    const start = parsed(kmn);
    const ir = structuredClone(start);
    const g = ir.groups[0]!;
    const added: IRRule = { ...structuredClone(findRule(ir, "c")), nodeId: "new-rule-1" };
    delete added.sourceLine;
    added.output = [{ kind: "char", value: "q" }];
    g.rules.push(added);
    const r = projectKmnText(kmn, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.startsWith(kmn)).toBe(true);
    const tail = r.text.slice(kmn.length);
    expect(tail).toContain("U+0071");
    expect(tail.endsWith("\n")).toBe(true);
  });

  describe("insert placement follows rule order (rules match first to last)", () => {
    const inserted = (at: number): { start: KeyboardIR; ir: KeyboardIR } => {
      const start = parsed(kmn);
      const ir = structuredClone(start);
      const added: IRRule = { ...structuredClone(findRule(ir, "c")), nodeId: "new-rule-1" };
      delete added.sourceLine;
      added.output = [{ kind: "char", value: "q" }];
      ir.groups[0]!.rules.splice(at, 0, added);
      return { start, ir };
    };
    const order = (text: string): string[] =>
      text.split("\n").filter((l) => l.startsWith("+")).map((l) => l.replace(/^.*> /, "").trim());

    it("a rule in the middle lands right after the rule before it", () => {
      const { start, ir } = inserted(1);
      expect(diffIrToKmnEdits(start, ir)).toEqual([
        expect.objectContaining({ kind: "insert", anchor: { after: "rule", nodeId: start.groups[0]!.rules[0]!.nodeId } }),
      ]);
      const r = projectKmnText(kmn, start, ir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const o = order(r.text);
      expect(o[0]).toBe("'a'");
      expect(o[1]).toContain("U+0071");
      expect(o[2]).toContain("'b'");
      // Every original line survives byte-identical.
      for (const l of kmn.split("\n")) expect(r.text.split("\n")).toContain(l);
    });

    it("a rule at the start lands right after the group header", () => {
      const { start, ir } = inserted(0);
      expect(diffIrToKmnEdits(start, ir)).toEqual([
        expect.objectContaining({ kind: "insert", anchor: { after: "group-start", groupNodeId: start.groups[0]!.nodeId } }),
      ]);
      const r = projectKmnText(kmn, start, ir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const o = order(r.text);
      expect(o[0]).toContain("U+0071");
      expect(o[1]).toBe("'a'");
    });

    it("a rule at the end still lands after the last rule", () => {
      const { start, ir } = inserted(3);
      const r = projectKmnText(kmn, start, ir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const o = order(r.text);
      expect(o[3]).toContain("U+0071");
      expect(r.text.startsWith(kmn)).toBe(true);
    });

    it("an anchor rule that is itself deleted still places the insert at its position", () => {
      const { start, ir } = inserted(1);
      ir.groups[0]!.rules.splice(0, 1);
      const r = projectKmnText(kmn, start, ir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const o = order(r.text);
      expect(o[0]).toContain("U+0071");
      expect(o[1]).toContain("'b'");
    });
  });

  it("replaces a continued (backslash) rule as a whole", () => {
    const k =
      HEAD +
      `+ [K_A] > 'a'\n` +
      `+ [K_B] > \\\n` +
      `  'b'\n` +
      `+ [K_C] > 'c'\n`;
    const start = parsed(k);
    const ir = structuredClone(start);
    findRule(ir, "b").output = [{ kind: "char", value: "z" }];
    const r = projectKmnText(k, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).not.toContain("'b'");
    expect(r.text).not.toContain("\\");
    expect(r.text).toContain("U+007A");
    expect(r.text).toContain("+ [K_A] > 'a'\n");
    expect(r.text.endsWith("+ [K_C] > 'c'\n")).toBe(true);
  });

  it("an ineligible edit returns ok:false naming the node id", () => {
    const start = parsed(kmn);
    const b = findRule(start, "b");
    const noLine = structuredClone(start);
    delete findRule(noLine, "b").sourceLine;
    const bad = spliceKmn(kmn, noLine, [{ kind: "delete", nodeId: b.nodeId }]);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.nodeId).toBe(b.nodeId);
  });

  it("an edit naming an unknown node is ineligible", () => {
    const start = parsed(kmn);
    const r = spliceKmn(kmn, start, [{ kind: "delete", nodeId: "no-such-node" }]);
    expect(r.ok).toBe(false);
  });

  it("CRLF input stays CRLF and untouched lines are byte-identical", () => {
    const k = crlf(kmn);
    const start = parsed(k);
    const ir = structuredClone(start);
    const b = findRule(ir, "b");
    ir.groups[0]!.rules = ir.groups[0]!.rules.filter((r) => r.nodeId !== b.nodeId);
    const r = projectKmnText(k, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe(k.replace(`+ [K_B] > 'b' c keep me\r\n`, ""));
  });

  it("CRLF insert ends with CRLF, not a bare LF", () => {
    const k = crlf(kmn);
    const start = parsed(k);
    const ir = structuredClone(start);
    const added: IRRule = { ...structuredClone(findRule(ir, "c")), nodeId: "new-rule-2" };
    delete added.sourceLine;
    added.output = [{ kind: "char", value: "q" }];
    ir.groups[0]!.rules.push(added);
    const r = projectKmnText(k, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.startsWith(k)).toBe(true);
    expect(r.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});

const __dir = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(
  __dir,
  "../../../../../keyboards/release/basic/basic_kbdfr/source/basic_kbdfr.kmn",
);

describe.skipIf(!existsSync(CORPUS))("spliceKmn on a corpus keyboard (basic_kbdfr)", () => {
  const text = existsSync(CORPUS) ? readFileSync(CORPUS, "utf8") : "";
  const linesOf = (s: string) => s.split("\n");

  function firstSourcedRule(ir: KeyboardIR): { group: number; rule: IRRule } {
    for (let gi = 0; gi < ir.groups.length; gi++) {
      const rule = ir.groups[gi]!.rules.find((r) => r.sourceLine !== undefined);
      if (rule) return { group: gi, rule };
    }
    throw new Error("no sourced rule");
  }

  // The corpus file is LF as committed in the pinned snapshot, so the
  // line-ending assertions must follow the input, not assume CRLF. Each case
  // runs against the file as committed and against a CRLF conversion of it,
  // so CRLF preservation on real content stays covered too.
  for (const [label, input] of [
    ["as committed", text],
    ["CRLF", crlf(text)],
  ] as const) {
    describe(label, () => {
      // The output uses the input's line ending throughout: no lone CR or LF.
      const assertEol = (out: string): void => {
        const eol = input.includes("\r\n") ? "\r\n" : "\n";
        expect(out.replaceAll(eol, "")).not.toMatch(/[\r\n]/);
      };

      it("delete removes only that rule's lines and keeps the line endings", () => {
        const start = parsed(input);
        const ir = structuredClone(start);
        const { group, rule } = firstSourcedRule(ir);
        ir.groups[group]!.rules = ir.groups[group]!.rules.filter((r) => r.nodeId !== rule.nodeId);
        const r = projectKmnText(input, start, ir);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const before = linesOf(input);
        const after = linesOf(r.text);
        expect(before.length - after.length).toBeGreaterThanOrEqual(1);
        // Everything before the deleted rule is untouched; everything after it
        // lines up with the original tail.
        expect(after.slice(0, rule.sourceLine! - 1)).toEqual(before.slice(0, rule.sourceLine! - 1));
        const tail = before.length - (rule.sourceLine! - 1) - (before.length - after.length);
        expect(after.slice(after.length - tail)).toEqual(before.slice(before.length - tail));
        assertEol(r.text);
      });

      it("replace changes only that rule's lines", () => {
        const start = parsed(input);
        const ir = structuredClone(start);
        const { group, rule } = firstSourcedRule(ir);
        const target = ir.groups[group]!.rules.find((r) => r.nodeId === rule.nodeId)!;
        target.output = [{ kind: "char", value: "Z" }];
        const r = projectKmnText(input, start, ir);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const before = linesOf(input);
        const after = linesOf(r.text);
        expect(after.slice(0, rule.sourceLine! - 1)).toEqual(before.slice(0, rule.sourceLine! - 1));
        expect(after[rule.sourceLine! - 1]).not.toBe(before[rule.sourceLine! - 1]);
        // The line after the rule is unchanged (single-line rule on this keyboard
        // unless it is continued; either way the suffix still matches).
        const suffix = 10;
        expect(after.slice(-suffix)).toEqual(before.slice(-suffix));
        assertEol(r.text);
      });

      it("insert leaves every original line in place", () => {
        const start = parsed(input);
        const ir = structuredClone(start);
        const { group, rule } = firstSourcedRule(ir);
        const added: IRRule = { ...structuredClone(rule), nodeId: "new-corpus-rule" };
        delete added.sourceLine;
        added.output = [{ kind: "char", value: "Z" }];
        ir.groups[group]!.rules.push(added);
        const r = projectKmnText(input, start, ir);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const before = linesOf(input);
        const after = linesOf(r.text);
        expect(after.length).toBeGreaterThan(before.length);
        let bi = 0;
        for (const l of after) if (bi < before.length && l === before[bi]) bi++;
        expect(bi).toBe(before.length);
        assertEol(r.text);
      });
    });
  }
});

describe("a replaced line keeps the author's spelling (spec 111 Open)", () => {
  const kmn = (storeLine: string, ruleLine: string): string =>
    `store(&NAME) 'T'\nbegin Unicode > use(main)\n${storeLine}\ngroup(main) using keys\n${ruleLine}\n`;

  function drop(text: string, storeName: string, dropCp: number): string {
    const ir = parsed(text);
    const next = structuredClone(ir);
    const s = next.stores.find((x) => x.name === storeName)!;
    s.items = s.items.filter((it) => !(it.kind === "char" && [...it.value].every((c) => c.codePointAt(0) === dropCp)));
    const r = projectKmnText(text, ir, next);
    if (!r.ok) throw new Error(r.reason);
    return r.text;
  }

  it("a store that loses one item keeps U+ spelling and layout for the rest", () => {
    const text = kmn("store(dkf003b) U+0041 U+0042 U+0043 dk(003b)  c note", "+ [K_A] > 'a'");
    expect(drop(text, "dkf003b", 0x42)).toBe(
      kmn("store(dkf003b) U+0041 U+0043 dk(003b)  c note", "+ [K_A] > 'a'"),
    );
  });

  it("a quoted item loses only the dropped character", () => {
    const text = kmn("store(vow) 'abc' U+0064", "+ [K_A] > 'a'");
    expect(drop(text, "vow", 0x62)).toBe(kmn("store(vow) 'ac' U+0064", "+ [K_A] > 'a'"));
  });

  it("a rule replaced with a swallow keeps the gap before its trailing comment", () => {
    const text = kmn("store(x) 'a'", `+ [K_A] > "ṭ"  c line(0)`);
    const ir = parsed(text);
    const next = structuredClone(ir);
    const rule = next.groups[0]!.rules[0]!;
    rule.output = [{ kind: "nul" } as never];
    const r = projectKmnText(text, ir, next);
    expect(r.ok && r.text).toContain("> nul  c line(0)");
  });
});

describe("store-line editing: layouts, spellings and fallbacks", () => {
  const wrap = (storeLine: string, eol = "\n"): string =>
    [`store(&NAME) 'T'`, `begin Unicode > use(main)`, storeLine, `group(main) using keys`, `+ [K_A] > 'a'`, ""].join(eol);

  function dropFirst(text: string, name: string, n = 1): { out: string; ir: KeyboardIR; next: KeyboardIR } {
    const ir = parsed(text);
    const next = structuredClone(ir);
    const s = next.stores.find((x) => x.name === name)!;
    s.items = s.items.slice(n);
    const r = projectKmnText(text, ir, next);
    if (!r.ok) throw new Error(r.reason);
    return { out: r.text, ir, next };
  }

  it("keeps CRLF line endings and the original spelling", () => {
    const { out } = dropFirst(wrap("store(a) U+0041 U+0042 U+0043", "\r\n"), "a");
    expect(out).toBe(wrap("store(a) U+0042 U+0043", "\r\n"));
  });

  it("a store split over `\\` continuations keeps its layout", () => {
    const text = wrap("store(a) U+0041 U+0042 \\\n  U+0043 U+0044");
    expect(dropFirst(text, "a").out).toBe(wrap("store(a) U+0042 \\\n  U+0043 U+0044"));
    const ir = parsed(text);
    const next = structuredClone(ir);
    const s = next.stores.find((x) => x.name === "a")!;
    s.items = s.items.filter((_, i) => i !== 2);
    const r = projectKmnText(text, ir, next);
    expect(r.ok && r.text).toBe(wrap("store(a) U+0041 U+0042 U+0044"));
  });

  it("quotes inside a string and a backslash inside a string survive", () => {
    const { out } = dropFirst(wrap(`store(q) U+0041 "it's" 'a\\b'`), "q");
    expect(out).toBe(wrap(`store(q) "it's" 'a\\b'`));
  });

  it("a `c` inside a string is not a comment; a real trailing comment is kept with its gap", () => {
    const { out } = dropFirst(wrap("store(c1) U+0041 'a c b' U+0042   c  real c comment"), "c1");
    expect(out).toBe(wrap("store(c1) 'a c b' U+0042   c  real c comment"));
  });

  it("keeps `deadkey()` and `dk()` as the author spelled them", () => {
    const { out } = dropFirst(wrap("store(d) U+0041 deadkey(003b) U+0042 dk(0021)"), "d");
    expect(out).toBe(wrap("store(d) deadkey(003b) U+0042 dk(0021)"));
  });

  it("an `outs()` store is not edited in place: the emitted text is used", () => {
    const { out, next } = dropFirst(wrap("store(base) 'xy'\nstore(o) outs(base) U+0041 U+0042"), "o");
    const emitted = emitStore(next.stores.find((x) => x.name === "o")!);
    expect(out.split("\n")).toContain(emitted);
    expect(out).not.toContain("outs(base) U+0041");
  });
});
