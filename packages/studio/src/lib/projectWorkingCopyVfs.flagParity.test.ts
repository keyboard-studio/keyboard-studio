// T011 / spec-014 flag-parity — the carve IR projection produces a BYTE-IDENTICAL
// emitted .kmn whether the mutate seam flag is on or off.
//
// Flag-off runs today's path (applyStoreSlotRemovals + applyCarveToVfs's internal
// filter). Flag-on routes the carve IR derivation through the single mutate()
// write seam (applyCarveMutate → applyMutatePatch / CARVE_WRITES). Both must emit
// identical artifacts for the same overlay (M6/SC-008).
//
// This file does NOT mock @keyboard-studio/engine — it exercises the real emit
// pipeline so the comparison is on actual emitted bytes.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6)
//   specs/014-mutate-seam-touch-propagation/contracts/flag-and-validator.contract.md (F2)

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import { runAllChecks } from "@keyboard-studio/engine";
import type {
  IRGroup,
  IRRule,
  IRStore,
  StoreItem,
  KeyboardIR,
  MechanismAssignment,
  Pattern,
  LintFinding,
} from "@keyboard-studio/contracts";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function parallelRule(nodeId: string, dkId: number, inN: string, outN: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inN },
    ],
    output: [{ kind: "index", storeRef: outN, offset: 2 }],
  };
}

function group(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function store(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return { nodeId, name, items, isSystem: false };
}

/** A keyboard with two groups, a parallel-store deadkey pattern, and a stray store. */
function makeFixtureIr(): KeyboardIR {
  const outStore = store("store#dkt", "dktX", [
    { kind: "char", value: "À" },
    { kind: "char", value: "ε" },
    { kind: "char", value: "Z" },
  ]);
  const inStore = store("store#dkf", "dkfX", [
    { kind: "char", value: "a" },
    { kind: "char", value: "b" },
    { kind: "char", value: "c" },
  ]);
  const extra = store("store#extra", "extraX", [{ kind: "char", value: "Q" }]);

  const main = group("group#main", "main", [
    rule("rule#a", "K_A", "x"),
    rule("rule#b", "K_B", "y"),
    parallelRule("rule#dk", 0x003b, "dkfX", "dktX"),
  ]);
  // A second, deleteable group (NOT the entry group → safe to drop).
  const second = group("group#second", "second", [rule("rule#c", "K_C", "z")]);

  return makeTestIR([main, second], [outStore, inStore, extra]);
}

function makeVfs(keyboardId: string) {
  return createVirtualFS([
    { path: `source/${keyboardId}.kmn`, content: "c stub\n", isBinary: false },
  ]);
}

/** Run the real projection for one overlay and return the emitted .kmn content. */
function projectKmn(
  overlay: { deletedNodeIds?: Set<string>; deletedItemIds?: Set<string> },
): string {
  const vfs = makeVfs("kb");
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: makeFixtureIr(),
    deletedNodeIds: overlay.deletedNodeIds ?? new Set(),
    deletedItemIds: overlay.deletedItemIds ?? new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
  });
  return vfs.get("source/kb.kmn")?.content as string;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const SCENARIOS: Array<{
  name: string;
  overlay: { deletedNodeIds?: Set<string>; deletedItemIds?: Set<string> };
}> = [
  { name: "no edits (no re-emit)", overlay: {} },
  { name: "whole-group deletion", overlay: { deletedNodeIds: new Set(["group#second"]) } },
  { name: "single-rule deletion", overlay: { deletedNodeIds: new Set(["rule#a"]) } },
  { name: "whole-store deletion", overlay: { deletedNodeIds: new Set(["store#extra"]) } },
  { name: "store-slot nul rewrite", overlay: { deletedItemIds: new Set(["store#dkt#1"]) } },
  {
    name: "slot + whole-rule combined",
    overlay: {
      deletedNodeIds: new Set(["rule#b"]),
      deletedItemIds: new Set(["store#dkt#0"]),
    },
  },
  {
    name: "bare rule item id (whole-node path)",
    overlay: { deletedItemIds: new Set(["rule#c"]) },
  },
  {
    // #523 — a drop-class store chip (store#extra/extraX is unreferenced by
    // any rule, so classifyStoreSlotEdit returns "drop", not "nul-fill").
    // Inline fixture only (no golden file), per the flagParity CRLF-golden
    // caveat: this scenario is proved through the SCENARIOS loop, not a
    // committed golden artifact.
    name: "store-chip drop-class rewrite (unreferenced store)",
    overlay: { deletedItemIds: new Set(["store#extra#0"]) },
  },
];

describe("projectWorkingCopyVfs — carve flag parity (flag-on === flag-off emit)", () => {
  for (const { name, overlay } of SCENARIOS) {
    it(`emits byte-identical .kmn with the seam on vs off — ${name}`, () => {
      vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
      const off = projectKmn(overlay);

      vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
      const on = projectKmn(overlay);

      expect(on).toBe(off);
    });
  }

  it("preserves the entry-group safety gate under the seam (deleting the entry group warns + skips, no re-emit)", () => {
    // group#main is the entry group (first non-readonly). Deleting it must warn
    // and leave the VFS unchanged in BOTH flag states.
    const overlay = { deletedNodeIds: new Set(["group#main"]) };

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const offVfs = makeVfs("kb");
    const offRes = projectWorkingCopyVfs({
      vfs: offVfs,
      keyboardId: "kb",
      baseIr: makeFixtureIr(),
      deletedNodeIds: overlay.deletedNodeIds,
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    const onVfs = makeVfs("kb");
    const onRes = projectWorkingCopyVfs({
      vfs: onVfs,
      keyboardId: "kb",
      baseIr: makeFixtureIr(),
      deletedNodeIds: overlay.deletedNodeIds,
      deletedItemIds: new Set(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
    });

    // Both paths warn (entry-group gate) and leave the fetched stub untouched.
    expect(onRes.warnings).toEqual(offRes.warnings);
    expect(onRes.warnings.some((w) => w.includes("entry group"))).toBe(true);
    expect(onVfs.get("source/kb.kmn")?.content).toBe(offVfs.get("source/kb.kmn")?.content);
    expect(onVfs.get("source/kb.kmn")?.content).toBe("c stub\n"); // never re-emitted
  });
});

// ===========================================================================
// spec-014 Phase 5 step 1 — the FULL-SPINE flag-on proof.
//
// The per-scenario block above proves carve emit parity in isolation. This
// block drives a single representative keyboard through the WHOLE projection
// spine in one run — carve (whole-node + store-slot) + add-gallery (a real
// physical mechanism assignment) + an injected Phase E touch layout — and
// pins the flag-on === flag-off guarantee for the surfaces that MUST match:
//
//   - the emitted .kmn (carve filter + mechanism injection), and
//   - the .keyman-touch-layout text artifact: the add-gallery seam
//     intentionally does NOT re-emit touch (keycap/touch projection is
//     deferred), so the injected layout must come back byte-identical to the
//     flag-off path.
//
// Both artifacts are also asserted against committed golden fixtures
// (__fixtures__/flagParity/fullSpine.*) so a future regression in EITHER flag
// state — not just a flag-on/flag-off drift — is caught.
//
// The complementary touch re-propagation DIVERGENCE (the one surface that is
// flag-on-only, because the reducer gates repropagate() on the flag) is proved
// in serializeWorkingCopy.flagParity.test.ts.
//
// Source of truth:
//   specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md (M6/SC-001/SC-008)
// ===========================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "__fixtures__/flagParity");
function golden(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

/** A representative physical mechanism assignment (the acute-deadkey gallery item). */
function makeFullSpineAssignment(): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      {
        patternId: latinDeadkeyAcuteSingle.id,
        slotValues: {
          triggerKey: "K_QUOTE",
          accentChar: "́",
          baseLetters: "aeiouAEIOU",
          accentedForms: "áéíóúÁÉÍÓÚ",
        },
      },
    ],
  };
}

function fullSpineResolver(id: string): Pattern | undefined {
  return id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined;
}

/** A minimal, pretty-printed Phase E touch layout JSON (one phone/default key). */
const FULL_SPINE_TOUCH_JSON =
  JSON.stringify(
    {
      phone: {
        font: "Tahoma",
        layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
      },
    },
    null,
    2,
  ) + "\n";

/**
 * Run the WHOLE projection spine for one flag state and return both projected
 * artifacts. Carve drops a non-entry group + a whole store + nuls one output
 * slot of the parallel-store deadkey; add-gallery injects the acute mechanism;
 * the Phase E touch layout is injected at step 0.
 */
function projectFullSpine(seamOn: boolean): { kmn: string; touch: string } {
  vi.stubEnv("VITE_KM_MUTATE_SEAM", seamOn ? "1" : "");
  const vfs = makeVfs("kb");
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: makeFixtureIr(),
    // Carve: whole-group + whole-store deletion, plus a store-slot nul rewrite
    // (slot 1 of the dktX output store referenced by the parallel deadkey rule).
    deletedNodeIds: new Set(["group#second", "store#extra"]),
    deletedItemIds: new Set(["store#dkt#1"]),
    // Add-gallery: a real physical mechanism assignment.
    assignments: [makeFullSpineAssignment()],
    getPattern: fullSpineResolver,
    // Phase E touch layout injected at step 0.
    touchLayoutJson: FULL_SPINE_TOUCH_JSON,
    identity: null,
  });
  return {
    kmn: vfs.get("source/kb.kmn")?.content as string,
    touch: vfs.get("source/kb.keyman-touch-layout")?.content as string,
  };
}

describe("projectWorkingCopyVfs — FULL-SPINE flag parity (carve + add-gallery + touch inject)", () => {
  it("emits a byte-identical .kmn with the seam on vs off across the whole spine", () => {
    const off = projectFullSpine(false);
    const on = projectFullSpine(true);

    expect(typeof off.kmn).toBe("string");
    expect(on.kmn).toBe(off.kmn);

    // The spine actually took effect (not a vacuous pass):
    //   - carve whole-node deletions removed the second group + extra store,
    //   - the store-slot deletion nul'd slot 1 of the dktX output store,
    //   - the add-gallery mechanism injected the acute deadkey trigger.
    expect(on.kmn).not.toMatch(/group\(second\)/);
    expect(on.kmn).not.toMatch(/store\(extraX\)/);
    expect(on.kmn).toMatch(/store\(dktX\) 'À' nul 'Z'/);
    expect(on.kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/);
  });

  it("emits a byte-identical .keyman-touch-layout with the seam on vs off (add-gallery does NOT re-emit touch)", () => {
    const off = projectFullSpine(false);
    const on = projectFullSpine(true);

    expect(typeof off.touch).toBe("string");
    // The add-gallery seam derives the assignment IR but never re-emits the
    // touch artifact, so the injected Phase E layout is returned verbatim in
    // BOTH flag states.
    expect(on.touch).toBe(off.touch);
    expect(on.touch).toBe(FULL_SPINE_TOUCH_JSON);
  });

  it("matches the committed golden artifacts in BOTH flag states (regression pin)", () => {
    const goldenKmn = golden("fullSpine.kmn");
    const goldenTouch = golden("fullSpine.keyman-touch-layout");

    const off = projectFullSpine(false);
    expect(off.kmn).toBe(goldenKmn);
    expect(off.touch).toBe(goldenTouch);

    const on = projectFullSpine(true);
    expect(on.kmn).toBe(goldenKmn);
    expect(on.touch).toBe(goldenTouch);
  });

  // Hardening pass #1 — CRLF guard. The byte-identical guarantee is meaningless
  // if the golden fixtures carry CR bytes a future Windows checkout / .gitattributes
  // slip introduced (the projection emits LF-only; a CRLF golden would either drift
  // the comparison or mask a real regression). Assert the raw fixture bytes contain
  // no `\r`, independent of git core.autocrlf / .gitattributes config.
  it("golden fixtures are LF-only — no CR bytes (Windows-checkout robustness)", () => {
    const kmnBytes = readFileSync(resolve(FIXTURES, "fullSpine.kmn"), "utf8");
    const touchBytes = readFileSync(resolve(FIXTURES, "fullSpine.keyman-touch-layout"), "utf8");
    expect(kmnBytes).not.toContain("\r");
    expect(touchBytes).not.toContain("\r");
  });

  // Hardening pass #2 — emitter-coupling note for the touch side-car golden.
  //
  // The add-gallery seam injects the Phase E touch layout VERBATIM and never
  // routes it through emitTouchLayout (keycap/touch re-emit is deferred to US2),
  // so the side-car golden here is a hand-authored, pretty-printed artifact — it
  // is INTENTIONALLY NOT emitTouchLayout output (which is compact, key-reordered,
  // and carries `defaultHint`). Coupling THIS golden to emitTouchLayout would
  // assert a falsehood. The emitter-coupled touch pin lives where the text
  // genuinely comes FROM emitTouchLayout: the touch re-propagation DIVERGENCE
  // block in serializeWorkingCopy.flagParity.test.ts (runTouchLeg → emitTouchLayout).
  // This assertion documents+locks the decoupling so a future reader does not
  // "fix" the side-car golden to match the emitter.
  it("touch side-car golden is the verbatim injected artifact, NOT emitTouchLayout output", () => {
    const goldenTouch = golden("fullSpine.keyman-touch-layout");
    // It IS the injected Phase E JSON (pretty-printed, font-first, no defaultHint).
    expect(goldenTouch).toBe(FULL_SPINE_TOUCH_JSON);
    // It is NOT the compact emitTouchLayout shape (which would carry defaultHint).
    expect(goldenTouch).not.toContain("defaultHint");
  });

  // Hardening pass #4 — validator-verdict equality across flag states.
  //
  // The byte-identical .kmn assertion already implies an identical validator
  // verdict, but only transitively. This asserts the verdict DIRECTLY: run the
  // real Layer-A engine validator (runAllChecks — pure, text-over-.kmn) over the
  // full-spine projected .kmn in BOTH flag states and assert the SAME finding set.
  // This closes "bytes match" → "validator verdict matches" and guards against a
  // future US5 wiring that reads VITE_KM_MUTATE_SEAM and could diverge the verdict
  // even while the emitted bytes stay equal.
  it("the Layer-A validator verdict over the full-spine .kmn is identical in both flag states", () => {
    const off = projectFullSpine(false);
    const on = projectFullSpine(true);

    const offFindings: LintFinding[] = runAllChecks(off.kmn);
    const onFindings: LintFinding[] = runAllChecks(on.kmn);

    // The whole finding set (codes + severities + locations) must match exactly.
    expect(onFindings).toEqual(offFindings);

    // Non-vacuous: runAllChecks produces a real, non-empty verdict over this .kmn,
    // so the equality is checking a populated finding set, not two empty arrays.
    expect(offFindings.length).toBeGreaterThan(0);

    // Mirror the dashboard's unshippablePrefixes signal: the BLOCKING subset
    // (the input checkSpinePrefixShippability reads) is likewise flag-invariant.
    // isBlockingFinding is private to completeness.ts, so its predicate is
    // replicated here (origin !== "upstream" && severity in {error,fatal}); this
    // is exactly the rule that drives report.unshippablePrefixes.
    const blocking = (f: LintFinding): boolean =>
      f.origin !== "upstream" && (f.severity === "error" || f.severity === "fatal");
    expect(onFindings.filter(blocking)).toEqual(offFindings.filter(blocking));
  });
});
