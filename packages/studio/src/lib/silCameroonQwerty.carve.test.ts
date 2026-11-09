// T022 regression (spec 076, FR-019/FR-020, SC-008): the real sil_cameroon_qwerty
// keyboard through the carve-suppression pipeline (`deriveCarvedIr`).
//
// Fixture provenance: `__fixtures__/sil_cameroon_qwerty.kmn` is a byte-identical
// copy (cmp-verified) of `~/workspace/keyboard-studio-notes/082-fixtures/
// sil_cameroon_qwerty.kmn` — the real keyboard source (docs/import-corpus.json
// records keyboardId `sil_cameroon_qwerty` as 269 rules / 2 groups,
// parse-clean; "Cameroon QWERTY" per docs/keyboard-index.md). The sibling
// `../keyboards` checkout is absent on this machine, so the corpus convention
// (skip when absent, as in carveViaSplice.corpus.test.ts) would prove nothing
// here; the source is vendored verbatim instead. Nothing about the keyboard is
// fabricated — every rule the tests touch is read out of this file.
//
// Scenarios (the ruling verification plan):
//   1. Single RALT layer carve (block): bare-key text rule -> `nul`.
//   2. Two-level RALT+SHIFT carve (block): modifiers preserved, -> `nul`.
//   3. Text-context rule carve (block): `any(diablock) + [RALT K_C] > context`.
//   4. Deadkey-context carves (block): deadkey-only -> `nul`, mixed -> `context`.
//   5. Loud: BEEP rules carved with loud:true -> `nul beep` (never bare beep).
//   6. Touch-layer variants: block -> `nul`; allow-host -> removed.
//   7. UK-English host leak: `lookupHostOutput("uk","K_4",["RALT"])` is €
//      pre-carve; post-carve every blocked combo is consumed by an
//      ownedByBehaviour suppression rule, so the keystroke never reaches the
//      host — asserted for all five reference hosts.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import {
  parseKmn,
  emitKmn,
  deriveCarvedIr,
  collectCharContributors,
  removedTouchKeyRuleIds,
  applyDesktopModificationsToRawJson,
} from "@keyboard-studio/engine";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import {
  lookupHostOutput,
  REFERENCE_BASES,
  type BaseLayoutId,
} from "./referenceBaseLayouts.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const KMN_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");
// Fixture provenance: downloaded verbatim from
// https://github.com/keymanapp/keyboards/blob/master/release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.keyman-touch-layout
// (2026-11-01) — the real keyboard's touch layout, needed for the #2418
// carve-continue case (which keys the carve removes from the touch surface).
const TOUCH_LAYOUT_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.keyman-touch-layout");

const FIVE_BASES = Object.keys(REFERENCE_BASES) as BaseLayoutId[];

// ---------------------------------------------------------------------------
// Rule location helpers — everything is derived from the parsed fixture.
// ---------------------------------------------------------------------------

interface Combo {
  vkey: string;
  modifiers: string[];
}

function modSet(modifiers: readonly string[] | undefined): Set<string> {
  return new Set((modifiers ?? []).map((m) => m.toUpperCase()));
}

function sameMods(a: readonly string[] | undefined, b: string[]): boolean {
  const sa = modSet(a);
  const sb = modSet(b);
  return sa.size === sb.size && [...sb].every((m) => sa.has(m));
}

function allRules(ir: KeyboardIR): IRRule[] {
  return ir.groups.flatMap((g) => g.rules);
}

/**
 * The codec keeps some source syntax (the `+` separator, `platform(...)`
 * guards) as `raw` context elements. Shape matching below works on the
 * significant elements; LHS-preservation assertions still compare the full
 * context verbatim.
 */
function significant(context: IRRule["context"]): IRRule["context"] {
  return context.filter((el) => el.kind !== "raw");
}

function sigKinds(rule: IRRule): string[] {
  return significant(rule.context).map((el) => el.kind);
}

/** Rule whose LHS is exactly one vkey (bare key, modifiers allowed). */
function findBareKeyRule(ir: KeyboardIR, vkey: string, modifiers: string[]): IRRule {
  const found = allRules(ir).find((r) => {
    const sig = significant(r.context);
    return (
      sig.length === 1 &&
      sig[0].kind === "vkey" &&
      sig[0].name === vkey &&
      sameMods(sig[0].modifiers, modifiers)
    );
  });
  if (!found) throw new Error(`no bare-key rule for ${vkey} [${modifiers}]`);
  return found;
}

/** Rule whose significant LHS is leading context + exactly one trailing vkey. */
function findVkeyWithContext(
  ir: KeyboardIR,
  vkey: string,
  modifiers: string[],
  leadingKinds: string[],
): IRRule {
  const found = allRules(ir).find((r) => {
    const sig = significant(r.context);
    if (sig.length !== leadingKinds.length + 1) return false;
    const tail = sig[sig.length - 1];
    if (tail.kind !== "vkey" || tail.name !== vkey) return false;
    if (!sameMods(tail.modifiers, modifiers)) return false;
    return sig.slice(0, -1).every((el, i) => el.kind === leadingKinds[i]);
  });
  if (!found)
    throw new Error(`no ${leadingKinds}+vkey rule for ${vkey} [${modifiers}]`);
  return found;
}

/** Rule whose significant LHS context kinds match exactly. */
function findContextKindsRule(ir: KeyboardIR, kinds: string[]): IRRule {
  const found = allRules(ir).find(
    (r) =>
      sigKinds(r).length === kinds.length &&
      sigKinds(r).every((k, i) => k === kinds[i]),
  );
  if (!found) throw new Error(`no rule with context kinds [${kinds}]`);
  return found;
}

function ruleById(ir: KeyboardIR, nodeId: string): IRRule | undefined {
  return allRules(ir).find((r) => r.nodeId === nodeId);
}

function vkeyOf(rule: IRRule): Combo {
  const sig = significant(rule.context);
  const tail = sig[sig.length - 1];
  if (!tail || tail.kind !== "vkey") throw new Error("expected trailing vkey");
  return { vkey: tail.name, modifiers: [...(tail.modifiers ?? [])] };
}

const SUPPRESSION_OUTPUT_KINDS = new Set(["nul", "context", "beep"]);

// ---------------------------------------------------------------------------
// The carve set, located from the real keyboard.
// ---------------------------------------------------------------------------

let startIr: KeyboardIR;
// The blocked rules. `combo` is set for physical-key rules; deadkey-context
// rules (no trailing vkey) carry no physical combo — they cannot leak to a
// host, so the host sweep skips them.
let blockedCombos: {
  nodeId: string;
  combo: Combo | undefined;
  lhs: IRRule["context"];
}[];
let derivedPassThrough: KeyboardIR;
let passThroughNodeId: string;
let derivedSoft: KeyboardIR;
let derivedLoud: KeyboardIR;

beforeAll(() => {
  startIr = parseKmn(readFileSync(KMN_PATH, "utf-8"), "sil_cameroon_qwerty").ir;

  const raltA = findBareKeyRule(startIr, "K_A", ["RALT"]); // + [RALT K_A] > U+025b
  const shiftRalt4 = findBareKeyRule(startIr, "K_4", ["SHIFT", "RALT"]); // > U+20ac
  const raltCContext = findVkeyWithContext(startIr, "K_C", ["RALT"], ["any"]); // any(diablock) + [RALT K_C] > context — the `+` joiner parses as a raw element, filtered by the significant-shape matcher
  const dkDk = findContextKindsRule(startIr, ["deadkey", "deadkey"]); // dk(003b) dk(003d) > U+003D
  const dkMixed = findContextKindsRule(startIr, ["deadkey", "any"]); // dk(003b) any(dkf003b) > index(...)
  const ralt4Beep = findBareKeyRule(startIr, "K_4", ["RALT"]); // + [RALT K_4] > BEEP
  const raltSBeep = findBareKeyRule(startIr, "K_S", ["RALT"]); // + [RALT K_S] > BEEP
  const tFcfa = findBareKeyRule(startIr, "T_FCFA", []); // + [T_FCFA] > 'FCFA'
  const t003b = findBareKeyRule(startIr, "T_003B", []); // + [T_003B] > U+003B

  const blockTargets = [
    raltA,
    shiftRalt4,
    raltCContext,
    dkDk,
    dkMixed,
    ralt4Beep,
    raltSBeep,
    tFcfa,
  ];
  const nodeIds = new Set(blockTargets.map((r) => r.nodeId));
  const itemIds = new Set(nodeIds);

  derivedSoft = deriveCarvedIr(startIr, {
    deletedNodeIds: itemIds,
    deletedItemIds: itemIds,
    fallbackPolicy: "swallow",
  }).ir;

  // Pass-through policy: the carved rule is removed outright, not suppressed.
  const passIds = new Set([t003b.nodeId]);
  derivedPassThrough = deriveCarvedIr(startIr, {
    deletedNodeIds: passIds,
    deletedItemIds: passIds,
    fallbackPolicy: "pass-through",
  }).ir;

  // Loud run: the two BEEP rules with the A6 loud flag.
  const loudIds = new Set([ralt4Beep.nodeId, raltSBeep.nodeId]);
  derivedLoud = deriveCarvedIr(startIr, {
    deletedNodeIds: loudIds,
    deletedItemIds: loudIds,
    fallbackPolicy: "swallow",
    loud: true,
  }).ir;

  blockedCombos = blockTargets.map((r) => {
    let combo: Combo | undefined;
    try {
      combo = vkeyOf(r);
    } catch {
      combo = undefined; // deadkey-context rule: no physical keystroke
    }
    return { nodeId: r.nodeId, combo, lhs: r.context };
  });
  passThroughNodeId = t003b.nodeId;
});

describe("T022 sil_cameroon_qwerty carve regression (real keyboard, FR-019/FR-020, SC-008)", () => {
  it("parses the vendored keyboard cleanly, matching the import-corpus record", () => {
    const ruleCount = startIr.groups.reduce((n, g) => n + g.rules.length, 0);
    expect(ruleCount).toBe(269);
    expect(startIr.groups).toHaveLength(2);
  });

  it("block carve of a single-RALT-layer bare-key rule rewrites to `nul` in place", () => {
    const target = blockedCombos[0]; // + [RALT K_A] > U+025b
    const rewritten = ruleById(derivedSoft, target.nodeId);
    expect(rewritten).toBeDefined();
    expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
    expect(rewritten!.output).toEqual([{ kind: "nul" }]);
    // LHS untouched: the suppression consumes exactly the carved combo.
    expect(rewritten!.context).toEqual(target.lhs);
  });

  it("block carve of a two-level RALT+SHIFT rule preserves modifiers and rewrites to `nul`", () => {
    const target = blockedCombos[1]; // + [SHIFT RALT K_4] > U+20ac
    const rewritten = ruleById(derivedSoft, target.nodeId);
    expect(rewritten).toBeDefined();
    expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
    expect(rewritten!.output).toEqual([{ kind: "nul" }]);
    const tail = rewritten!.context[rewritten!.context.length - 1];
    expect(tail.kind).toBe("vkey");
    if (tail.kind === "vkey") {
      expect(tail.name).toBe("K_4");
      expect(sameMods(tail.modifiers, ["SHIFT", "RALT"])).toBe(true);
    }
  });

  it("block carve of a text-context rule rewrites to `context` (matched text survives)", () => {
    const target = blockedCombos[2]; // any(diablock) + [RALT K_C] > context
    const rewritten = ruleById(derivedSoft, target.nodeId);
    expect(rewritten).toBeDefined();
    expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
    expect(rewritten!.output).toEqual([{ kind: "context", offset: 0 }]);
    expect(rewritten!.context).toEqual(target.lhs);
  });

  it("block carve of a deadkey-only context rule rewrites to `nul` (no deadkey re-arm)", () => {
    const target = blockedCombos[3]; // dk(003b) dk(003d) > U+003D
    const rewritten = ruleById(derivedSoft, target.nodeId);
    expect(rewritten).toBeDefined();
    expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
    expect(rewritten!.output).toEqual([{ kind: "nul" }]);
  });

  it("block carve of a mixed deadkey+text context rule rewrites to `context`", () => {
    const target = blockedCombos[4]; // dk(003b) any(dkf003b) > index(dkt003b,2)
    const rewritten = ruleById(derivedSoft, target.nodeId);
    expect(rewritten).toBeDefined();
    expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
    expect(rewritten!.output).toEqual([{ kind: "context", offset: 0 }]);
  });

  it("loud carve of BEEP rules emits `nul beep`, never bare `beep`", () => {
    for (const idx of [5, 6]) {
      // + [RALT K_4] > BEEP, + [RALT K_S] > BEEP
      const target = blockedCombos[idx];
      const rewritten = ruleById(derivedLoud, target.nodeId);
      expect(rewritten).toBeDefined();
      expect(rewritten!.ownedByBehaviour).toBe("carve-suppression");
      expect(rewritten!.output).toEqual([{ kind: "nul" }, { kind: "beep" }]);
    }
  });

  it("touch-layer variants: swallow rewrites to `nul`, pass-through removes the rule", () => {
    const tFcfa = ruleById(derivedSoft, blockedCombos[7].nodeId); // + [T_FCFA] > 'FCFA'
    expect(tFcfa).toBeDefined();
    expect(tFcfa!.ownedByBehaviour).toBe("carve-suppression");
    expect(tFcfa!.output).toEqual([{ kind: "nul" }]);

    // Pass-through: the rule is gone entirely — the compiler removed it and
    // the filter found nothing to double-remove.
    expect(ruleById(derivedPassThrough, passThroughNodeId)).toBeUndefined();
  });

  it("UK-English host leak is real pre-carve: AltGr+4 is € on the host", () => {
    // What the typist's computer would produce if the carved keystroke fell
    // through to the host layout (A3: the leak the suppression closes).
    expect(lookupHostOutput("uk", "K_4", ["RALT"])).toBe("€");
    // Shift+AltGr is its own layer; Windows UK defines nothing on Shift+AltGr+4.
    expect(lookupHostOutput("uk", "K_4", ["SHIFT", "RALT"])).toBeUndefined();
    // The keyboard's own ɛ on RALT+A vs the host's á — a second leak shape.
    expect(lookupHostOutput("uk", "K_A", ["RALT"])).toBe("á");
  });

  it("post-carve, every blocked physical combo is consumed by a suppression rule on all five reference hosts", () => {
    const physical = blockedCombos.flatMap((c) =>
      c.combo === undefined ? [] : [{ nodeId: c.nodeId, combo: c.combo }],
    );
    expect(physical.length).toBeGreaterThan(0);
    for (const { combo } of physical) {
      for (const host of FIVE_BASES) {
        const consuming = allRules(derivedSoft).find((r) => {
          if (r.ownedByBehaviour !== "carve-suppression") return false;
          const sig = significant(r.context);
          if (sig.length === 0) return false;
          const tail = sig[sig.length - 1];
          return (
            tail.kind === "vkey" &&
            tail.name === combo.vkey &&
            sameMods(tail.modifiers, combo.modifiers) &&
            r.output.every((o) => SUPPRESSION_OUTPUT_KINDS.has(o.kind))
          );
        });
        expect(
          consuming,
          `host ${host}: no suppression rule consumes ${combo.vkey} [${combo.modifiers}] — the keystroke would leak to the host`,
        ).toBeDefined();
        // Belt and braces: the host cell this combo would hit is irrelevant
        // because the keyboard consumes the keystroke first. Spot-check the
        // UK cell that motivated A3.
        if (host === "uk" && combo.vkey === "K_4") {
          expect(
            ["€", undefined].includes(
              lookupHostOutput(host, combo.vkey, combo.modifiers),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("emitted .kmn carries the canonical typed suppression forms", () => {
    const kmn = emitKmn(derivedSoft);
    expect(kmn).toContain("> nul");
    expect(kmn).toContain("> context");
    // The carved RALT+A rule's own line now suppresses instead of emitting ɛ.
    expect(kmn).toMatch(/\+\s*\[RALT K_A\]\s*>\s*nul/);
  });
});

// ---------------------------------------------------------------------------
// Issue #2418: carving a T_ mark key must DELETE its .kmn rules, not rewrite
// them to `> nul`.
//
// The issue's repro is the carve step's Continue (spec 106 FR-042) on a copy
// of sil_cameroon_qwerty with the combining marks discarded: the carved
// T_0301/T_0327/T_030D/T_0330/T_1DC4–T_1DC7 keys leave the touch layout, but
// the .kmn kept `+ [T_0301] > nul` plus dead `any(diablock)` guard lines.
//
// Root cause (the issue's second hypothesis, confirmed): the deletion sets
// DO reach the carve pipeline as whole-node deletions, but the
// fallback-policy ("swallow") expansion turns every deleted id into a
// `block` disposition, `compileCarveSuppression` rewrites the rules in
// place to `> nul`, and `carveFilterIr` skips suppression-owned rules —
// so the whole-node deletion never happens. The fix exempts rules bound
// only to touch keys the carve removes from the touch surface
// (`suppressionExemptIdsForRemovedTouchKeys`): their keystrokes can never
// fire, so the spec-104 contract is deletion, not suppression.
//
// The deletion sets below mirror carve-continue exactly: per discarded
// character, `collectCharContributors` — the same function the carve
// gallery's suggestion rows use — unions rule + store-slot contributors.
// ---------------------------------------------------------------------------

const CARVED_MARKS_2418 = [
  "́", // U+0301
  "̧", // U+0327
  "̍", // U+030D
  "̰", // U+0330
  "᷄", // U+1DC4
  "᷅", // U+1DC5
  "᷆", // U+1DC6
  "᷇", // U+1DC7
];

const CARVED_TOUCH_IDS_2418 = [
  "T_0301",
  "T_0327",
  "T_030D",
  "T_0330",
  "T_1DC4",
  "T_1DC5",
  "T_1DC6",
  "T_1DC7",
];

describe("issue #2418: carved T_ mark keys lose their .kmn rules (real keyboard)", () => {
  let carveRuleIds: Set<string>;
  let carveSlotIds: Set<string>;
  let layoutJson: string;

  beforeAll(() => {
    carveRuleIds = new Set();
    carveSlotIds = new Set();
    for (const ch of CARVED_MARKS_2418) {
      const contributors = collectCharContributors(startIr, ch);
      expect(contributors.blocked).toHaveLength(0);
      for (const id of contributors.ruleNodeIds) carveRuleIds.add(id);
      for (const id of contributors.storeSlotIds) carveSlotIds.add(id);
    }
    expect(carveRuleIds.size).toBeGreaterThan(0);
    layoutJson = readFileSync(TOUCH_LAYOUT_PATH, "utf-8");
  });

  it("control: without the exemption the pipeline reproduces the issue — `+ [T_0301] > nul`", () => {
    const buggy = deriveCarvedIr(startIr, {
      deletedNodeIds: carveRuleIds,
      deletedItemIds: new Set([...carveRuleIds, ...carveSlotIds]),
      fallbackPolicy: "swallow",
    });
    expect(emitKmn(buggy.ir)).toMatch(/\+\s*\[T_0301\]\s*>\s*nul/);
  });

  it("the outcome covers the carved T_ binding rules but not the desktop K_LBRKT producer of the same mark", () => {
    const outcome = removedTouchKeyRuleIds(startIr, layoutJson, {
      slotIds: carveSlotIds,
      wholeNodeIds: carveRuleIds,
    });
    // `+ [T_0301] > U+0301`: binds only T_0301, which the carve removes from
    // the touch layout — exempt from the suppression rewrite.
    const t0301Rule = findBareKeyRule(startIr, "T_0301", []);
    expect(carveRuleIds.has(t0301Rule.nodeId)).toBe(true);
    expect(outcome.suppressionExemptIds.has(t0301Rule.nodeId)).toBe(true);
    // `+ [K_LBRKT] > U+0301`: the desktop key stays pressable, so the FR-019
    // swallow suppression remains load-bearing — not exempt.
    const kLbrktRule = findBareKeyRule(startIr, "K_LBRKT", []);
    expect(carveRuleIds.has(kLbrktRule.nodeId)).toBe(true);
    expect(outcome.suppressionExemptIds.has(kLbrktRule.nodeId)).toBe(false);
    // The `any(diablock)` guard bound to T_0301 was never a carve
    // contributor, but its key is gone — it joins the deletion set as a
    // provably dead binding rule.
    const guard = findVkeyWithContext(startIr, "T_0301", [], ["any"]);
    expect(carveRuleIds.has(guard.nodeId)).toBe(false);
    expect(outcome.additionalDeletedRuleIds.has(guard.nodeId)).toBe(true);
  });

  it("with the outcome applied the carved T_ rules are deleted whole-node — no `> nul`, no T_ ids left", () => {
    const outcome = removedTouchKeyRuleIds(startIr, layoutJson, {
      slotIds: carveSlotIds,
      wholeNodeIds: carveRuleIds,
    });
    const fixed = deriveCarvedIr(startIr, {
      deletedNodeIds: new Set([...carveRuleIds, ...outcome.additionalDeletedRuleIds]),
      deletedItemIds: new Set([...carveRuleIds, ...carveSlotIds]),
      fallbackPolicy: "swallow",
      suppressionExemptIds: outcome.suppressionExemptIds,
    });
    const t0301Rule = findBareKeyRule(startIr, "T_0301", []);
    expect(ruleById(fixed.ir, t0301Rule.nodeId)).toBeUndefined();
    const fixedKmn = emitKmn(fixed.ir);
    for (const id of CARVED_TOUCH_IDS_2418) {
      expect(fixedKmn, `carved key ${id} must leave no rule behind`).not.toContain(id);
    }
    expect(fixedKmn).not.toMatch(/\+\s*\[T_0301\]\s*>\s*nul/);
    // Surgical: the desktop producer of the same carved mark is still
    // suppressed (`> nul`), not deleted — its key remains pressable.
    expect(fixedKmn).toMatch(/\+\s*\[K_LBRKT\]\s*>\s*nul/);
  });

  // The Ewondo hand test: the touch step's desktop-modification replay runs
  // first and blanks the carved keys, so the layout the projection sees has
  // already lost them. Two things went wrong there. The replay blanked only
  // the occurrences whose layer state has a rule (shift T_1DC4), keeping
  // the rightalt-caps copies as dead keys; and the projection, seeing no
  // carved key leave, rewrote every carved T_ rule to `> nul`.
  it("after the touch step's replay has blanked the carved keys, none survive and their rules are still deleted", () => {
    const { json: replayed } = applyDesktopModificationsToRawJson(
      layoutJson,
      { removals: CARVED_MARKS_2418, placements: [] },
      { ir: startIr, ruleIndex: buildTouchKeyRuleIndex(startIr) },
    );
    for (const id of CARVED_TOUCH_IDS_2418) {
      expect(replayed, `carved key ${id} must leave the touch layout on every layer`).not.toContain(`"${id}"`);
    }

    const outcome = removedTouchKeyRuleIds(startIr, replayed, {
      slotIds: carveSlotIds,
      wholeNodeIds: carveRuleIds,
    });
    const fixed = deriveCarvedIr(startIr, {
      deletedNodeIds: new Set([...carveRuleIds, ...outcome.additionalDeletedRuleIds]),
      deletedItemIds: new Set([...carveRuleIds, ...carveSlotIds]),
      fallbackPolicy: "swallow",
      suppressionExemptIds: outcome.suppressionExemptIds,
    });
    const fixedKmn = emitKmn(fixed.ir);
    for (const id of CARVED_TOUCH_IDS_2418) {
      expect(fixedKmn, `carved key ${id} must leave no rule behind`).not.toContain(id);
    }
    expect(fixedKmn).toMatch(/\+\s*\[K_LBRKT\]\s*>\s*nul/);
  });

  it("a rule for a key the layout never placed is left alone unless the carve names it", () => {
    // T_0300's rules are not carved here; drop the key from the layout and
    // the outcome must still not claim them.
    const withoutT0300 = layoutJson.replace(/"T_0300"/g, '"T_OTHER"');
    const outcome = removedTouchKeyRuleIds(startIr, withoutT0300, {
      slotIds: carveSlotIds,
      wholeNodeIds: carveRuleIds,
    });
    const t0300Rule = findBareKeyRule(startIr, "T_0300", []);
    expect(outcome.suppressionExemptIds.has(t0300Rule.nodeId)).toBe(false);
    expect(outcome.additionalDeletedRuleIds.has(t0300Rule.nodeId)).toBe(false);
  });
});
