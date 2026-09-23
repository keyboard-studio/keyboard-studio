// T011 / spec-014 flag-parity — the working-copy projection produces a
// BYTE-IDENTICAL emitted .kmn and .keyman-touch-layout side-car whether the
// mutate seam flag is on or off.
//
// Flag-off runs today's path (applyStoreSlotRemovals + applyCarveToVfs's internal
// filter; text-based mechanism injection). Flag-on also routes the carve and
// add-gallery IR derivations through the single mutate() write seam
// (applyCarveMutate / applyAddGalleryMutate → applyMutatePatch). Both must emit
// identical artifacts for the same edits (M6/SC-008). One scenario table covers
// carve, add-gallery (spec 014 T017), touch inject and the whole spine (spec 021
// T010-T012); each row also asserts its edit really changed the output.
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
import { charStore, irGroup, latinDeadkeyAcuteSingle, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { parseKmn, runAllChecks } from "@keyboard-studio/engine";
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
import { stubKmnVfs } from "../test/workingCopy.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rule(nodeId: string, vkey: string, char: string): IRRule {
  return vkeyRule({ nodeId, vkey, output: char });
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
  return irGroup({ nodeId, name, rules });
}

function store(nodeId: string, name: string, items: StoreItem[]): IRStore {
  return charStore({ nodeId, name, items });
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

/** A representative physical mechanism assignment (the acute-deadkey gallery item). */
function makeAssignment(): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      {
        patternId: latinDeadkeyAcuteSingle.id,
        slotValues: {
          triggerKey: "K_QUOTE",
          accentChar: "\u0301",
          baseLetters: "aeiouAEIOU",
          accentedForms: "\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da",
        },
      },
    ],
  };
}

function patternResolver(id: string): Pattern | undefined {
  return id === latinDeadkeyAcuteSingle.id ? latinDeadkeyAcuteSingle : undefined;
}

/** A minimal, pretty-printed Phase E touch layout JSON (one phone/default key). */
const TOUCH_JSON =
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

/** A bare scaffold: the add-gallery seam parses the injected .kmn back to IR. */
const SCAFFOLD_KMN =
  "c Auto-generated scaffold\n" + "store(&VERSION) '10.0'\n" + "begin Unicode > use(main)\n";

interface Projected {
  kmn: string;
  /** The .keyman-touch-layout side-car text; undefined when no layout was injected. */
  touch: string | undefined;
}

interface Scenario {
  name: string;
  deletedNodeIds?: readonly string[];
  deletedItemIds?: readonly string[];
  assignments?: readonly MechanismAssignment[];
  touchLayoutJson?: string;
  /** Start from the bare scaffold (parsed to IR) instead of the fixture keyboard. */
  scaffoldBase?: boolean;
  /** Non-vacuity: the edit really changed (or deliberately did not change) the output. */
  effect: (out: Projected) => void;
}

/** Run the real projection for one scenario and one flag state. */
function project(seamOn: boolean, sc: Omit<Scenario, "name" | "effect">): Projected {
  vi.stubEnv("VITE_KM_MUTATE_SEAM", seamOn ? "1" : "");
  const vfs = sc.scaffoldBase === true ? stubKmnVfs("kb", SCAFFOLD_KMN) : stubKmnVfs("kb");
  const assignments = [...(sc.assignments ?? [])];
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "kb",
    baseIr: sc.scaffoldBase === true ? parseKmn(SCAFFOLD_KMN, "kb").ir : makeFixtureIr(),
    deletedNodeIds: new Set(sc.deletedNodeIds ?? []),
    deletedItemIds: new Set(sc.deletedItemIds ?? []),
    assignments,
    getPattern: assignments.length > 0 ? patternResolver : () => undefined,
    ...(sc.touchLayoutJson !== undefined ? { touchLayoutJson: sc.touchLayoutJson } : {}),
    identity: null,
  });
  return {
    kmn: vfs.get("source/kb.kmn")?.content as string,
    touch: vfs.get("source/kb.keyman-touch-layout")?.content as string | undefined,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The whole spine in one run: carve (whole-node + store-slot) + add-gallery + touch inject. */
const FULL_SPINE: Omit<Scenario, "name" | "effect"> = {
  deletedNodeIds: ["group#second", "store#extra"],
  deletedItemIds: ["store#dkt#1"],
  assignments: [makeAssignment()],
  touchLayoutJson: TOUCH_JSON,
};

const SCENARIOS: readonly Scenario[] = [
  {
    name: "no edits (no re-emit)",
    effect: (out) => {
      expect(out.kmn).toBe("c stub\n");
      expect(out.touch).toBeUndefined();
    },
  },
  {
    name: "whole-group deletion",
    deletedNodeIds: ["group#second"],
    effect: (out) => expect(out.kmn).not.toMatch(/group\(second\)/),
  },
  {
    name: "single-rule deletion",
    deletedNodeIds: ["rule#a"],
    effect: (out) => {
      expect(out.kmn).not.toContain("[K_A]");
      expect(out.kmn).toContain("[K_B]");
    },
  },
  {
    name: "whole-store deletion",
    deletedNodeIds: ["store#extra"],
    effect: (out) => expect(out.kmn).not.toMatch(/store\(extraX\)/),
  },
  {
    name: "whole-group + whole-store deletion",
    deletedNodeIds: ["group#second", "store#extra"],
    effect: (out) => {
      expect(out.kmn).not.toMatch(/group\(second\)/);
      expect(out.kmn).not.toMatch(/store\(extraX\)/);
    },
  },
  {
    name: "store-slot nul rewrite",
    deletedItemIds: ["store#dkt#1"],
    effect: (out) => expect(out.kmn).toContain("store(dktX) '\u00c0Z'"),
  },
  {
    name: "slot + whole-rule combined",
    deletedNodeIds: ["rule#b"],
    deletedItemIds: ["store#dkt#0"],
    effect: (out) => {
      expect(out.kmn).not.toContain("[K_B]");
      expect(out.kmn).toContain("store(dktX) '\u03b5Z'");
    },
  },
  {
    name: "whole-group + slot combined",
    deletedNodeIds: ["group#second"],
    deletedItemIds: ["store#dkt#0"],
    effect: (out) => {
      expect(out.kmn).not.toMatch(/group\(second\)/);
      expect(out.kmn).toContain("store(dktX) '\u03b5Z'");
    },
  },
  {
    name: "bare rule item id (whole-node path)",
    deletedItemIds: ["rule#c"],
    effect: (out) => {
      expect(out.kmn).toMatch(/group\(second\)/);
      expect(out.kmn).not.toContain("[K_C]");
    },
  },
  {
    // #523 — store#extra/extraX is unreferenced by any rule, so its chip is a
    // drop-class edit (classifyStoreSlotEdit returns "drop", not "nul-fill").
    name: "store-chip drop-class rewrite (unreferenced store)",
    deletedItemIds: ["store#extra#0"],
    effect: (out) => {
      expect(out.kmn).toMatch(/store\(extraX\)/);
      expect(out.kmn).not.toContain("'Q'");
    },
  },
  {
    name: "physical mechanism assignment (add-gallery), no touch layout",
    assignments: [makeAssignment()],
    effect: (out) => {
      expect(out.kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/);
      // No layout injected: no side-car file in either flag state.
      expect(out.touch).toBeUndefined();
    },
  },
  {
    name: "physical mechanism assignment over a bare scaffold",
    assignments: [makeAssignment()],
    scaffoldBase: true,
    effect: (out) => expect(out.kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/),
  },
  {
    name: "carve + physical assignment",
    deletedNodeIds: ["group#second", "store#extra"],
    deletedItemIds: ["store#dkt#1"],
    assignments: [makeAssignment()],
    effect: (out) => {
      expect(out.kmn).not.toMatch(/group\(second\)/);
      expect(out.kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/);
    },
  },
  {
    name: "physical assignment + touch layout inject",
    assignments: [makeAssignment()],
    touchLayoutJson: TOUCH_JSON,
    // The add-gallery seam never re-emits touch, so the injected layout returns verbatim.
    effect: (out) => expect(out.touch).toBe(TOUCH_JSON),
  },
  {
    name: "full spine: carve + add-gallery + touch inject",
    ...FULL_SPINE,
    effect: (out) => {
      expect(out.kmn).not.toMatch(/group\(second\)/);
      expect(out.kmn).not.toMatch(/store\(extraX\)/);
      expect(out.kmn).toMatch(/store\(dktX\) '\u00c0Z'/);
      expect(out.kmn).toMatch(/\[K_QUOTE\] > deadkey\(accent\)/);
      expect(out.touch).toBe(TOUCH_JSON);
    },
  },
];

describe("projectWorkingCopyVfs — seam flag parity (flag-on === flag-off emit)", () => {
  it.each(SCENARIOS)("emits byte-identical .kmn and touch side-car with the seam on vs off — $name", (sc) => {
    const off = project(false, sc);
    const on = project(true, sc);
    expect(typeof off.kmn).toBe("string");
    expect(on.kmn).toBe(off.kmn);
    expect(on.touch).toBe(off.touch);
    sc.effect(off);
  });

  it("preserves the entry-group safety gate under the seam (deleting the entry group warns + skips, no re-emit)", () => {
    // group#main is the entry group (first non-readonly). Deleting it must warn
    // and leave the VFS unchanged in BOTH flag states.
    const overlay = { deletedNodeIds: new Set(["group#main"]) };

    vi.stubEnv("VITE_KM_MUTATE_SEAM", "");
    const offVfs = stubKmnVfs("kb");
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
    const onVfs = stubKmnVfs("kb");
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
// The "full spine" row above drives a single representative keyboard through
// the WHOLE projection spine in one run — carve (whole-node + store-slot) +
// add-gallery (a real physical mechanism assignment) + an injected Phase E
// touch layout — and pins flag-on === flag-off for the .kmn and for the
// .keyman-touch-layout text artifact (the add-gallery seam intentionally does
// NOT re-emit touch, so the injected layout comes back verbatim).
//
// This block asserts both artifacts against committed golden fixtures
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

function projectFullSpine(seamOn: boolean): Projected {
  return project(seamOn, FULL_SPINE);
}

describe("projectWorkingCopyVfs — FULL-SPINE flag parity (carve + add-gallery + touch inject)", () => {
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
    expect(goldenTouch).toBe(TOUCH_JSON);
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

    // The full-spine projected .kmn is a VALID keyboard, so a correct Layer-A
    // validator produces ZERO findings over it. (It once produced a few, but
    // those were false positives from keyword-shaped text — index(), deadkey(),
    // any() — inside a `c` comment; removed by the validator's stripNonCode
    // pass.) Keep the equality above non-vacuous by confirming the validator is
    // actually wired: a deliberately-broken variant (an out-of-range codepoint,
    // real code — not in a comment or quote) yields a finding.
    expect(offFindings).toEqual([]);
    expect(runAllChecks(off.kmn + "\n+ [K_A] > U+110000\n").length).toBeGreaterThan(0);

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
