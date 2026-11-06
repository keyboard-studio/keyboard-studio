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
import { emitRule } from "../codec/emit.js";
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

  it("delete removes only that rule's lines and keeps CRLF", () => {
    const start = parsed(text);
    const ir = structuredClone(start);
    const { group, rule } = firstSourcedRule(ir);
    ir.groups[group]!.rules = ir.groups[group]!.rules.filter((r) => r.nodeId !== rule.nodeId);
    const r = projectKmnText(text, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = linesOf(text);
    const after = linesOf(r.text);
    expect(before.length - after.length).toBeGreaterThanOrEqual(1);
    // Everything before the deleted rule is untouched; everything after it
    // lines up with the original tail.
    expect(after.slice(0, rule.sourceLine! - 1)).toEqual(before.slice(0, rule.sourceLine! - 1));
    const tail = before.length - (rule.sourceLine! - 1) - (before.length - after.length);
    expect(after.slice(after.length - tail)).toEqual(before.slice(before.length - tail));
    expect(r.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("replace changes only that rule's lines", () => {
    const start = parsed(text);
    const ir = structuredClone(start);
    const { group, rule } = firstSourcedRule(ir);
    const target = ir.groups[group]!.rules.find((r) => r.nodeId === rule.nodeId)!;
    target.output = [{ kind: "char", value: "Z" }];
    const r = projectKmnText(text, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = linesOf(text);
    const after = linesOf(r.text);
    expect(after.slice(0, rule.sourceLine! - 1)).toEqual(before.slice(0, rule.sourceLine! - 1));
    expect(after[rule.sourceLine! - 1]).not.toBe(before[rule.sourceLine! - 1]);
    // The line after the rule is unchanged (single-line rule on this keyboard
    // unless it is continued; either way the suffix still matches).
    const suffix = 10;
    expect(after.slice(-suffix)).toEqual(before.slice(-suffix));
    expect(r.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("insert leaves every original line in place", () => {
    const start = parsed(text);
    const ir = structuredClone(start);
    const { group, rule } = firstSourcedRule(ir);
    const added: IRRule = { ...structuredClone(rule), nodeId: "new-corpus-rule" };
    delete added.sourceLine;
    added.output = [{ kind: "char", value: "Z" }];
    ir.groups[group]!.rules.push(added);
    const r = projectKmnText(text, start, ir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = linesOf(text);
    const after = linesOf(r.text);
    expect(after.length).toBeGreaterThan(before.length);
    let bi = 0;
    for (const l of after) if (bi < before.length && l === before[bi]) bi++;
    expect(bi).toBe(before.length);
    expect(r.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});
