// A whole new group (mark-guard shape) is placed as ONE insert-group edit, so
// Open keeps the author's text instead of falling back to a full re-emit.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR, PlacementWorklist } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emitRule, emitStore } from "../codec/emit.js";
import { applyMarkGuards } from "./mark-guards.js";
import { diffIrToKmnEdits, projectKmnText, spliceKmn } from "./spliceKmn.js";

const ACUTE = "́";

const KMN = [
  "c a small keyboard",
  "store(&NAME) 'Tiny'",
  "store(&VERSION) '10.0'",
  "store(zeta) 'xyz'   c kept out of order",
  "store(alpha) 'abc'",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "c vowels",
  "+ [K_A] > 'a'   c keep spacing",
  "+ [K_B] > 'b'",
  "",
].join("\n");

const WL: PlacementWorklist = {
  ownLetterUnits: ["a", "b"],
  markUnits: [
    { mark: ACUTE, inputOrder: "postfix" },
    { mark: "̀", inputOrder: "postfix" },
  ],
  blockedCombinations: [
    { base: "b", mark: ACUTE },
    { base: "a", mark: "̀" },
  ],
};

/** Group/store content as the reader sees it, independent of node ids and store position. */
function summary(ir: KeyboardIR): unknown {
  return {
    groups: ir.groups.map((g) => ({ n: g.name, k: g.usingKeys, r: g.rules.map((r) => emitRule(r, g.usingKeys)) })),
    stores: ir.stores.map(emitStore).sort(),
  };
}

function guarded(text: string, form: "ready-made" | "base-plus-mark", wl = WL) {
  const start = parse(text, "k").ir;
  const next = applyMarkGuards(start, wl, form).ir;
  return { start, next };
}

describe("insert-group: a new group is one edit", () => {
  const { start, next } = guarded(KMN, "base-plus-mark");

  it("diff emits one insert-group carrying the header and every rule, and no per-rule insert into it", () => {
    const edits = diffIrToKmnEdits(start, next);
    const groups = edits.filter((e) => e.kind === "insert-group");
    expect(groups).toHaveLength(1);
    const g = next.groups.find((x) => x.nodeId === (groups[0] as { groupNodeId: string }).groupNodeId)!;
    const lines = (groups[0] as { text: string }).text.split("\n");
    expect(lines[0]).toBe(`group(${g.name})`.replace(/\)$/, g.usingKeys ? ") using keys" : ")"));
    expect(lines).toHaveLength(1 + g.rules.length);
    expect(g.rules.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(g.rules.map((r) => r.nodeId));
    expect(edits.some((e) => e.kind === "insert" && e.anchor.after === "group-start" && ids.has(e.anchor.groupNodeId))).toBe(false);
  });

  for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    it(`projects the guard change precisely (${label})`, () => {
      const text = KMN.replace(/\n/g, eol);
      const r = projectKmnText(text, start, next);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const out = r.text;
      if (eol === "\r\n") expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
      // The text re-reads as the intended keyboard.
      expect(summary(parse(out, "k").ir)).toEqual(summary(next));
      // Every original line outside the replaced version store survives, in order, byte-identical.
      const outLines = out.split(/(?<=\n)/);
      const kept = text.split(/(?<=\n)/).filter((l) => !/VERSION/.test(l) && !/^\+ \[K_B\]/.test(l) && !/^begin/.test(l));
      let at = 0;
      for (const l of kept) {
        const i = outLines.indexOf(l, at);
        expect(i, `line kept: ${JSON.stringify(l)}`).toBeGreaterThanOrEqual(at);
        at = i + 1;
      }
      // Comments and store order kept.
      expect(out.indexOf("store(zeta)")).toBeLessThan(out.indexOf("store(alpha)"));
      expect(out).toContain("c kept out of order");
      expect(out).toContain("c vowels");
      // The new group is after the original content, behind a blank line.
      const gi = out.indexOf("group(generated_marks_guard)");
      expect(gi).toBeGreaterThan(out.indexOf("group(main)"));
      expect(out.slice(0, gi).endsWith(`${eol}${eol}`)).toBe(true);
    });
  }

  it("a file with no trailing newline still gets the group on its own lines", () => {
    const text = KMN.replace(/\n+$/, "");
    const r = projectKmnText(text, start, next);
    expect(r.ok).toBe(true);
    if (r.ok) expect(summary(parse(r.text, "k").ir)).toEqual(summary(next));
  });

  it("a new group placed before an existing one still asks (reorder)", () => {
    const flipped = structuredClone(next);
    flipped.groups.reverse();
    expect(projectKmnText(KMN, start, flipped).ok).toBe(false);
  });
});

describe("insert-group: applying the same guards again is byte-identical", () => {
  for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    it(`strip then reinsert leaves the text unchanged (${label})`, () => {
      const text = KMN.replace(/\n/g, eol);
      const first = guarded(text, "base-plus-mark");
      const r1 = projectKmnText(text, first.start, first.next);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const second = guarded(r1.text, "base-plus-mark");
      const r2 = projectKmnText(r1.text, second.start, second.next);
      expect(r2).toEqual({ ok: true, text: r1.text });
    });
  }
});

describe("splice keeps a leading BOM and the quote style of a value-only replace", () => {
  for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    it(`first-line replace (${label})`, () => {
      const text = `\uFEFF${KMN.replace(/\n/g, eol)}`.replace("store(&NAME) 'Tiny'", 'store(&NAME) "Tiny"');
      // Put the version store first so the guard's version bump replaces line 1.
      const lines = text.split(/(?<=\n)/);
      const reordered = [lines[0]!.replace("\uFEFF", ""), ...lines.slice(1)];
      const v = reordered.findIndex((l) => l.includes("&VERSION"));
      const first = `\uFEFFstore(&VERSION) "10.0"${eol}`;
      const body = reordered.filter((_, i) => i !== v);
      const t = first + body.join("");
      const { start, next } = guarded(t, "base-plus-mark");
      const r = projectKmnText(t, start, next);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.text.startsWith("\uFEFFstore(&VERSION) ")).toBe(true);
      expect(r.text.startsWith('\uFEFFstore(&VERSION) "14.0"')).toBe(true);
      expect(r.text.indexOf("\uFEFF", 1)).toBe(-1);
    });
  }

  it("a BOM survives a delete of the first line too", () => {
    const t = `\uFEFF${KMN}`;
    const ir = parse(t, "k").ir;
    const r = spliceKmn(t, ir, [{ kind: "delete", nodeId: ir.stores[0]!.nodeId }]);
    expect(r.ok && r.text.startsWith("\uFEFF")).toBe(true);
  });
});

describe("insert-group lands after a group-end insert on the same group", () => {
  it("a fragment inserted after a deleted last rule stays above the new group", () => {
    const ir = parse(KMN, "k").ir;
    const main = ir.groups[0]!;
    const lastRule = main.rules[main.rules.length - 1]!;
    const r = spliceKmn(KMN, ir, [
      { kind: "delete", nodeId: lastRule.nodeId },
      { kind: "insert-group", groupNodeId: "new", text: "group(extra)\n+ [K_Z] > 'z'" },
      { kind: "insert", anchor: { after: "group-end", groupNodeId: main.nodeId }, text: "c fragment" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.indexOf("c fragment")).toBeLessThan(r.text.indexOf("group(extra)"));
    expect(r.text).toContain("c fragment\n\ngroup(extra)");
  });
});

// --- corpus ---------------------------------------------------------------

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
if (!rootExists) console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping guard splice corpus test`);

const CORPUS: [string, string][] = [
  ["sil_cameroon_qwerty", "release/sil/sil_cameroon_qwerty"],
  ["gandhari", "release/g/gandhari"],
  ["sil_indic_roman", "release/sil/sil_indic_roman"],
  ["coptic_greek", "release/c/coptic_greek"],
  ["swanalekha_malayalam", "release/s/swanalekha_malayalam"],
];

describe.skipIf(!rootExists)("mark guards place precisely on corpus keyboards", () => {
  it.each(CORPUS)("%s", (id, rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel, "source", `${id}.kmn`), "utf8");
    const start = parse(text, id).ir;
    const { next } = guarded(text, "ready-made");
    expect(next).not.toBe(start);
    const r = projectKmnText(text, start, next);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;
    expect(summary(parse(r.text, id).ir)).toEqual(summary(next));
    const a = text.split(/(?<=\n)/);
    const b = r.text.split(/(?<=\n)/);
    const inB = new Set(b);
    const lost = a.filter((l) => !inB.has(l)).length;
    const added = b.length - (a.length - lost);
    console.log(`[OK] ${id}: ${lost + added} lines changed (${lost} replaced/removed, ${added} added) of ${a.length}`);
    if (text.startsWith("\uFEFF")) expect(r.text.startsWith("\uFEFF")).toBe(true);
    const again = guarded(r.text, "ready-made");
    expect(projectKmnText(r.text, again.start, again.next)).toEqual({ ok: true, text: r.text });
    // Precise: the change is a small fraction of the file, not a reformat.
    expect(lost).toBeLessThan(Math.max(10, a.length * 0.05));
  }, 60_000);
});
