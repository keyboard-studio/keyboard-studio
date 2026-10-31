// Unit tests for checkConsistencyGates (spec 106 T010): one passing and one
// failing case per gate, on synthetic keyboards.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompilerDiagnostic, KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import type { Decision, DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { checkConsistencyGates, type GateId, type GateInput, type GateResult } from "./consistencyGates.ts";

const ID = "t";
const HEADER = "store(&VERSION) '10.0'\nstore(&NAME) 'T'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n";
const kmn = (body: string): string => `${HEADER}${body}`;

function vfsOf(body: string, extra: Record<string, string> = {}): VirtualFS {
  return createVirtualFS([
    { path: `source/${ID}.kmn`, content: kmn(body), isBinary: false },
    ...Object.entries(extra).map(([path, content]) => ({ path, content, isBinary: false })),
  ]);
}

const irOf = (body: string): KeyboardIR => parseKmn(kmn(body), ID).ir;

const decision = (id: string, value: unknown): [DecisionId, Decision<unknown>] => [
  id as DecisionId,
  { id: id as DecisionId, value, provenance: "asked" },
];

function marksDecision(opts: { blocked: boolean; marks: boolean; outputForm?: "ready-made" | "base-plus-mark" }) {
  return decision("marks-treatment", {
    answers: opts.marks ? { "marks.marks_attachment.̀": ["a"] } : {},
    completion: {
      worklist: {
        ownLetterUnits: [],
        markUnits: [],
        blockedCombinations: opts.blocked ? [{ base: "a", mark: "̀" }] : [],
      },
      outputForm: opts.outputForm ?? "ready-made",
    },
    contextTolerance: null,
  });
}

const setOf = (...entries: [DecisionId, Decision<unknown>][]): DecisionSet => Object.fromEntries(entries);

async function gate(id: GateId, input: Partial<GateInput> & { vfs: VirtualFS }): Promise<GateResult> {
  const results = await checkConsistencyGates({
    keyboardId: ID,
    compileDiagnostics: [],
    decisions: {},
    point: "assignments",
    ...input,
  });
  const found = results.find((r) => r.gate === id);
  if (found === undefined) throw new Error(`no ${id} result`);
  return found;
}

const diag = (code: string): CompilerDiagnostic =>
  ({ code, severity: "hint", message: "x", layer: "A" }) as unknown as CompilerDiagnostic;

const KEY_A = "group(main) using keys\n+ [K_A] > 'a'\n";

describe("G1: zero unreachable rules", () => {
  it("passes with no unreachable-rule hint", async () => {
    const r = await gate("G1", { vfs: vfsOf(KEY_A) });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails on an unreachable-rule hint", async () => {
    const r = await gate("G1", { vfs: vfsOf(KEY_A), compileDiagnostics: [diag("KM_HINT_KMCMP_3154094")] });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("does not apply before assignments", async () => {
    const r = await gate("G1", { vfs: vfsOf(KEY_A), point: "marks", compileDiagnostics: [diag("KM_HINT_KMCMP_3154094")] });
    expect(r.applicable).toBe(false);
  });
});

describe("G2: contexts are NFC/NFD tolerant", () => {
  it("passes a keyboard with nothing to tolerate", async () => {
    const r = await gate("G2", { vfs: vfsOf(KEY_A), point: "tolerance" });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails a rule whose precomposed context an NFD-typed buffer cannot match", async () => {
    const body = "group(main) using keys\n+ [K_A] > U+00E1\nU+00E1 + [K_X] > 'y'\n";
    const r = await gate("G2", { vfs: vfsOf(body), point: "tolerance" });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("only applies at the tolerance point", async () => {
    const r = await gate("G2", { vfs: vfsOf(KEY_A), point: "caps" });
    expect(r.applicable).toBe(false);
  });
});

describe("G3: guard present iff needed", () => {
  const guarded = `${KEY_A}\ngroup(generated_marks_guard)\n`;
  it("passes when the marks decision blocks and the guard group exists", async () => {
    const r = await gate("G3", {
      vfs: vfsOf(guarded),
      decisions: setOf(marksDecision({ blocked: true, marks: true })),
    });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails when the marks decision blocks and there is no guard group", async () => {
    const r = await gate("G3", {
      vfs: vfsOf(KEY_A),
      decisions: setOf(marksDecision({ blocked: true, marks: true })),
    });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("fails when a guard group exists though nothing is blocked", async () => {
    const r = await gate("G3", {
      vfs: vfsOf(guarded),
      decisions: setOf(marksDecision({ blocked: false, marks: false })),
    });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("does not apply without a completed marks decision", async () => {
    const r = await gate("G3", { vfs: vfsOf(KEY_A) });
    expect(r.applicable).toBe(false);
  });
});

describe("G4: one output form", () => {
  const ready = setOf(marksDecision({ blocked: false, marks: false, outputForm: "ready-made" }));
  const plusMark = setOf(marksDecision({ blocked: false, marks: false, outputForm: "base-plus-mark" }));
  it("passes precomposed output under ready-made", async () => {
    const r = await gate("G4", { vfs: vfsOf("group(main) using keys\n+ [K_A] > U+00E1\n"), decisions: ready });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails precomposed output under base-plus-mark", async () => {
    const r = await gate("G4", { vfs: vfsOf("group(main) using keys\n+ [K_A] > U+00E1\n"), decisions: plusMark });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("fails a precomposed generated store item under base-plus-mark", async () => {
    const body = "store(out) U+00E1\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const r = await gate("G4", { vfs: vfsOf(body), decisions: plusMark });
    expect(r.pass).toBe(false);
  });
  it("reports, but does not fail, a starting rule kept by carve", async () => {
    const body = "group(main) using keys\n+ [K_A] > U+00E1\n";
    const r = await gate("G4", { vfs: vfsOf(body), decisions: plusMark, startIr: irOf(body) });
    expect(r.pass).toBe(true);
    expect(r.detail.join(" ")).toContain("kept by carve");
  });
});

describe("G4: per-item attribution in a carved starting store", () => {
  const plusMark = setOf(marksDecision({ blocked: false, marks: false, outputForm: "base-plus-mark" }));
  const startBody = "store(out) U+00E1 U+00E9 U+00ED\ngroup(main) using keys\n+ [K_A] > 'a'\n";
  it("keeps starting items out of the failure and fails only the generated one", async () => {
    // Carved: U+00ED dropped; U+00F3 added by the session.
    const body = "store(out) U+00E1 U+00E9 U+00F3\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const r = await gate("G4", { vfs: vfsOf(body), decisions: plusMark, startIr: irOf(startBody) });
    expect(r.pass).toBe(false);
    const problems = r.detail.filter((d) => d.startsWith("store out"));
    expect(problems).toEqual(["store out: U+00F3 is not NFD"]);
    expect(r.detail.join(" ")).toContain("2 starting item(s) kept by carve");
  });
  it("passes a carved store holding only starting items", async () => {
    const body = "store(out) U+00E1 U+00E9\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const r = await gate("G4", { vfs: vfsOf(body), decisions: plusMark, startIr: irOf(startBody) });
    expect(r.pass).toBe(true);
  });
});

describe("G5: &CasedKeys iff cased", () => {
  const cased = setOf(decision("character-inventory", { chars: ["a", "A"] }));
  const caseless = setOf(decision("character-inventory", { chars: ["a", "b"] }));
  const pair = "group(main) using keys\n+ [K_A] > 'a'\n+ [SHIFT K_A] > 'A'\n";
  it("passes a cased alphabet whose key is covered", async () => {
    const r = await gate("G5", { vfs: vfsOf(`store(&CasedKeys) [K_A]\n${pair}`), decisions: cased, point: "caps" });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails a cased alphabet with no &CasedKeys", async () => {
    const r = await gate("G5", { vfs: vfsOf(pair), decisions: cased, point: "caps" });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("fails a cased alphabet whose assigned key is not covered", async () => {
    const r = await gate("G5", { vfs: vfsOf(`store(&CasedKeys) [K_B]\n${pair}`), decisions: cased, point: "caps" });
    expect(r.pass).toBe(false);
  });
  it("fails &CasedKeys on a caseless alphabet", async () => {
    const r = await gate("G5", { vfs: vfsOf(`store(&CasedKeys) [K_A]\n${pair}`), decisions: caseless, point: "caps" });
    expect(r.pass).toBe(false);
  });
});

describe("G6: no lost touch letters", () => {
  const layout = (texts: string[]): string =>
    JSON.stringify({
      phone: { layer: [{ id: "default", row: [{ key: texts.map((text) => ({ text })) }] }] },
    });
  const alphabet = setOf(decision("character-inventory", { chars: ["a", "ŋ", "A"] }));
  it("passes when every owed letter is on the default layer", async () => {
    const vfs = vfsOf(KEY_A, { "source/t.keyman-touch-layout": layout(["a", "ŋ"]) });
    const r = await gate("G6", { vfs, decisions: alphabet, includeTouch: true });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails when a letter is missing from the default layer", async () => {
    const vfs = vfsOf(KEY_A, { "source/t.keyman-touch-layout": layout(["a"]) });
    const r = await gate("G6", { vfs, decisions: alphabet, includeTouch: true });
    expect(r).toMatchObject({ applicable: true, pass: false });
    expect(r.detail.join(" ")).toContain("ŋ");
  });
  it("is walk-only unless asked", async () => {
    const r = await gate("G6", { vfs: vfsOf(KEY_A) });
    expect(r.applicable).toBe(false);
  });
});

describe("G7: deterministic", () => {
  it("passes two identical projections", async () => {
    const r = await gate("G7", { vfs: vfsOf(KEY_A), repeatVfs: vfsOf(KEY_A) });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails projections that differ", async () => {
    const other = vfsOf("group(main) using keys\n+ [K_B] > 'b'\n");
    const r = await gate("G7", { vfs: vfsOf(KEY_A), repeatVfs: other });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("ignores the staged build/ output", async () => {
    const withBuild = vfsOf(KEY_A);
    withBuild.set("build/t.kmx", new Uint8Array([1]), true);
    expect((await gate("G7", { vfs: withBuild, repeatVfs: vfsOf(KEY_A) })).pass).toBe(true);
  });
});

describe("G8: no nul/beep in stores", () => {
  const bad = "store(s) 'a' nul 'b'\ngroup(main) using keys\n+ [K_A] > 'a'\n";
  it("passes stores without nul or beep", async () => {
    const r = await gate("G8", { vfs: vfsOf("store(s) 'a' 'b'\n" + KEY_A) });
    expect(r).toMatchObject({ applicable: true, pass: true });
  });
  it("fails a generated store holding nul", async () => {
    const r = await gate("G8", { vfs: vfsOf(bad) });
    expect(r).toMatchObject({ applicable: true, pass: false });
  });
  it("fails a generated store holding beep", async () => {
    const r = await gate("G8", { vfs: vfsOf("store(s) 'a' beep\n" + KEY_A) });
    expect(r.pass).toBe(false);
  });
  it("counts a starting store separately: G8 passes, G8-start fails", async () => {
    const input = { vfs: vfsOf(bad), startIr: irOf(bad) };
    expect((await gate("G8", input)).pass).toBe(true);
    expect((await gate("G8-start", input)).pass).toBe(false);
  });
});

describe("G8: per-item attribution in a carved starting store", () => {
  const startBody = "store(s) 'a' nul 'b' 'c'\ngroup(main) using keys\n+ [K_A] > 'a'\n";
  it("puts the starting nul on G8-start when the carve trimmed the store", async () => {
    const body = "store(s) 'a' nul 'b'\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const input = { vfs: vfsOf(body), startIr: irOf(startBody) };
    expect((await gate("G8", input)).pass).toBe(true);
    expect((await gate("G8-start", input)).pass).toBe(false);
  });
  it("fails G8 only for the nul/beep beyond what the starting store held", async () => {
    const body = "store(s) 'a' nul 'b' beep\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const input = { vfs: vfsOf(body), startIr: irOf(startBody) };
    const g8 = await gate("G8", input);
    expect(g8.pass).toBe(false);
    expect(g8.detail).toEqual(["store s: 1 nul/beep item(s)"]);
    expect((await gate("G8-start", input)).detail).toEqual(["store s: 1 nul/beep item(s)"]);
  });
});
