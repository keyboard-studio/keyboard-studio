// Layer B shadowing audit for carve-suppression synthesis
// (spec 076, FR-021; task T021).
//
// AUDIT METHODOLOGY
// -----------------
// Every guard rule synthesized by `compileSlotGuards` (T013) and every
// suppression rewrite by `compileCarveSuppression` (T009) is checked against
// the validator's shadowing/unreachability logic — spec FR-014's check #11,
// the WASM-oracle "unreachable rules" check surfaced as
// `KM_HINT_UNREACHABLE_RULE` (the task's "Layer B" surface).
//
// For each representative carve scenario the harness:
//   1. builds the scenario IR,
//   2. runs `compileCarveSuppression` to get the carved IR,
//   3. emits canonical KMN from BOTH the pre-carve IR and the carved IR
//      (via `emit`, the same IR→KMN path the studio validates),
//   4. runs `validateWithOracle(kmn, { groups: ["behavior"] })` on both,
//   5. diffs the unreachable-rule findings: a finding counts as
//      carve-introduced only if its rule text was NOT already flagged in the
//      baseline. Comparing rule texts (not line numbers) keeps the diff
//      stable across the additive guard insertions.
//
// AUDIT RESULT (2026-09-28, kmcmplib WASM oracle, live)
// -----------------------------------------------------
// The carve introduced ZERO new unreachable-rule findings in every scenario.
// In particular:
// - A synthesized guard sits immediately ahead of its paired `any()`/`index()`
//   rule and is strictly more specific (one `any()` occurrence replaced by
//   the carved selector char), so it shadows the paired rule for exactly the
//   carved character while the paired rule stays reachable via the store's
//   remaining characters. The oracle flags neither.
// - Block rewrites are IN PLACE (same group.rules index, LHS untouched), so
//   shadowing relations are unchanged by construction; only the output verb
//   changes (`nul` / `context` / `nul beep` — all ordinary KMN statements the
//   oracle parses without reachability side effects).
// - The derived deadkey-arming rewrite is likewise in place.
// - `allow-host` removals can only remove shadowing edges, never add them.
// - Even a deliberately REDUNDANT guard (an author rule with the guard's
//   exact LHS already ahead of the paired rule) produced no new finding:
//   the oracle does not flag exact-duplicate deadkey-context shadowing, and
//   the guard is truthful dead code only in the pathological case — the
//   validator remains free to report it in future (spec §8: "Layer B reports
//   any remaining shadowing"; the compiler does not suppress the validator).
//
// This file is the permanent regression gate for that audit: if a future
// change to the synthesis (ordering, guard shape, verb table) introduces a
// NEW unreachable rule, the corresponding test fails. The duplicate-LHS
// "methodology pin" test additionally fails if the WASM oracle goes down,
// so the gate can never pass vacuously.
//
// NOTE: each test asserts the absence of KM_WARN_ORACLE_UNAVAILABLE, because
// a down oracle would make every "no new findings" assertion meaningless.

import { describe, it, expect } from "vitest";
import { compileCarveSuppression } from "./carveSuppression.js";
import { emit } from "../codec/emit.js";
import { validateWithOracle } from "../validator/oracle.js";
import {
  makeTestIR,
  irGroup,
  vkeyRule,
  charRule,
  charStore,
} from "@keyboard-studio/contracts/fixtures";
import type {
  CarveDisposition,
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface AuditScenario {
  /** Human-readable scenario name (used as the test title). */
  name: string;
  /** The PRE-carve IR: carved rules and carved store slots still present. */
  ir: KeyboardIR;
  dispositions: CarveDisposition[];
  loud?: boolean;
}

function blockDisposition(comboId: string): CarveDisposition {
  return { comboId, disposition: "block", provenance: "closed-keyboard-card" };
}

/**
 * The `KM_HINT_UNREACHABLE_RULE` findings for one KMN source, as the flagged
 * rule's source text (trimmed). Fails loudly when the WASM oracle is down:
 * without the oracle there is no Layer B signal and a "no new findings"
 * assertion would pass vacuously.
 */
async function unreachableRuleTexts(kmn: string): Promise<string[]> {
  const findings = await validateWithOracle(kmn, { groups: ["behavior"] });
  expect(
    findings.some((f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE"),
    "WASM oracle unavailable — Layer B audit cannot run; failing loudly rather than passing vacuously",
  ).toBe(false);
  const lines = kmn.split("\n");
  const texts: string[] = [];
  for (const f of findings) {
    if (f.code !== "KM_HINT_UNREACHABLE_RULE") continue;
    const line = (f as { location?: { line?: number } }).location?.line;
    if (line !== undefined) texts.push(lines[line - 1]?.trim() ?? "<no line>");
  }
  return texts;
}

/**
 * The unreachable-rule findings the CARVE introduced: flagged rule texts
 * present in the carved output but absent from the pre-carve baseline.
 * Pre-existing findings (author shadowing the carve did not create) are
 * expected to survive unchanged and are NOT reported here.
 */
async function newlyUnreachable(scenario: AuditScenario): Promise<string[]> {
  const carved = compileCarveSuppression(scenario.ir, scenario.dispositions, {
    loud: scenario.loud ?? false,
  }).ir;
  const baselineTexts = new Set(await unreachableRuleTexts(emit(scenario.ir)));
  const carvedTexts = await unreachableRuleTexts(emit(carved));
  return carvedTexts.filter((t) => !baselineTexts.has(t));
}

// ---------------------------------------------------------------------------
// Scenario fixtures
// ---------------------------------------------------------------------------

/** A bare-key rule `+ [K_E] > "é"`. */
function bareKeyRule(nodeId: string, output = "é"): IRRule {
  return vkeyRule({ nodeId, vkey: "K_E", output });
}

/** A text-context rule `'a' + [K_Q] > "x"`. */
function textContextRule(nodeId: string): IRRule {
  return charRule({
    nodeId,
    context: [
      { kind: "char", value: "a" },
      { kind: "vkey", name: "K_Q", modifiers: [] },
    ],
    output: "x",
  });
}

/** A deadkey-only-context rule `dk(1) + [K_A] > "a"`. */
function deadkeyContextRule(nodeId: string, dkId = 1): IRRule {
  return charRule({
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ],
    output: "a",
  });
}

/** A deadkey-arming rule `+ [K_X] > dk(1)`. */
function armingRule(nodeId: string, dkId = 1): IRRule {
  return vkeyRule({ nodeId, vkey: "K_X", output: [{ kind: "deadkey", id: dkId }] });
}

function singleRuleIr(rule: IRRule): KeyboardIR {
  return makeTestIR([irGroup({ nodeId: "group#main", name: "main", rules: [rule] })]);
}

/**
 * Deadkey fan-out pair (Cameroon pattern): the paired rule consumes the
 * input store via `any()` and emits from the output store via `index()`.
 * Carving slot 1 of `dkt003b` ("É") synthesizes a guard substituting "E"
 * (the pair-set peer's char at the same index) ahead of the paired rule.
 */
function deadkeySlotIR(extraRules: IRRule[] = []): KeyboardIR {
  return makeTestIR(
    [
      irGroup({
        nodeId: "group#main",
        name: "main",
        rules: [
          charRule({ nodeId: "lead", context: "z", output: "z" }),
          ...extraRules,
          charRule({
            nodeId: "paired",
            context: [
              { kind: "deadkey", id: 3 },
              { kind: "any", storeRef: "dkf003b" },
            ],
            output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
          }),
        ],
      }),
    ],
    [
      charStore({ nodeId: "store#dkf003b", name: "dkf003b", chars: ["e", "E"] }),
      charStore({ nodeId: "store#dkt003b", name: "dkt003b", chars: ["é", "É"] }),
    ],
  );
}

// ---------------------------------------------------------------------------
// The audit gate
// ---------------------------------------------------------------------------

describe("carve suppression — Layer B shadowing audit (T021)", () => {
  it(
    "slot guard: synthesized guard ahead of the paired rule introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none. The guard `dk(3) "E" > context` is
      // strictly more specific than the paired `dk(3) any(dkf003b) > …` rule
      // and precedes it, shadowing it for exactly the carved character; the
      // paired rule stays reachable via "e", so neither is unreachable.
      const introduced = await newlyUnreachable({
        name: "slot-guard",
        ir: deadkeySlotIR(),
        dispositions: [blockDisposition("store#dkt003b#1")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "bare-key block: `+ [K_E] > nul` rewrite introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none. The rewrite is in place (same index,
      // LHS untouched); only the output verb changes, which cannot affect
      // reachability.
      const introduced = await newlyUnreachable({
        name: "bare-key-nul",
        ir: singleRuleIr(bareKeyRule("r1")),
        dispositions: [blockDisposition("r1")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "text-context block: `'a' + [K_Q] > context` rewrite introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none — in-place rewrite, LHS untouched.
      const introduced = await newlyUnreachable({
        name: "text-context",
        ir: singleRuleIr(textContextRule("r2")),
        dispositions: [blockDisposition("r2")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "deadkey-context block: `dk(1) + [K_A] > nul` rewrite introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none — in-place rewrite, LHS untouched.
      const introduced = await newlyUnreachable({
        name: "deadkey-context",
        ir: singleRuleIr(deadkeyContextRule("r5")),
        dispositions: [blockDisposition("r5")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "loud block: `> nul beep` rewrite introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none. `beep` is an ordinary KMN output
      // statement with no reachability side effects.
      const introduced = await newlyUnreachable({
        name: "loud-bare-key",
        ir: singleRuleIr(bareKeyRule("r1")),
        dispositions: [blockDisposition("r1")],
        loud: true,
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "derived arming rewrite: `+ [K_X] > nul` introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none. The derived rewrite (all consumers
      // carved, so the armed deadkey is itself a leak) is in place at the
      // arming rule's original index.
      const introduced = await newlyUnreachable({
        name: "derived-arming",
        ir: makeTestIR([
          irGroup({
            nodeId: "group#main",
            name: "main",
            rules: [armingRule("arm"), deadkeyContextRule("consumer")],
          }),
        ]),
        dispositions: [blockDisposition("consumer")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "redundant guard: author rule already covering the guard's LHS introduces no new unreachable rules",
    async () => {
      // Expected Layer B outcome: none (benign overlap, documented). An
      // author rule `dk(3) "E" > "Q"` ahead of the paired rule already
      // intercepts the guard's exact context, so the synthesized guard can
      // never fire — truthful dead code, not a synthesis bug: the guard is
      // still the correct shape and position, and Layer B remains free to
      // report it in future (the compiler never suppresses the validator).
      // The oracle currently does not flag this pattern.
      const introduced = await newlyUnreachable({
        name: "redundant-guard",
        ir: deadkeySlotIR([
          charRule({
            nodeId: "authorIntercept",
            context: [
              { kind: "deadkey", id: 3 },
              { kind: "char", value: "E" },
            ],
            output: "Q",
          }),
        ]),
        dispositions: [blockDisposition("store#dkt003b#1")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );

  it(
    "methodology pin: the oracle flags a genuinely shadowed duplicate, and carving the shadowing rule changes nothing new",
    async () => {
      // Guards the gate itself: if the WASM oracle ever goes silent, this
      // test fails instead of letting the "no new findings" assertions pass
      // vacuously. Baseline: `+ 'a' > 'c'` is shadowed by `+ 'a' > 'b'`.
      // Carving the shadowing rule (block, in place → `> context`) keeps the
      // shadowed rule flagged with the identical finding — pre-existing
      // shadowing survives the carve unchanged, and nothing new appears.
      const dupIR = makeTestIR([
        irGroup({
          nodeId: "group#main",
          name: "main",
          rules: [
            charRule({ nodeId: "dup1", context: "a", output: "b" }),
            charRule({ nodeId: "dup2", context: "a", output: "c" }),
          ],
        }),
      ]);
      const baselineFlagged = await unreachableRuleTexts(emit(dupIR));
      expect(baselineFlagged).toContain("+ U+0061 > U+0063");

      const introduced = await newlyUnreachable({
        name: "carve-shadowing-rule",
        ir: dupIR,
        dispositions: [blockDisposition("dup1")],
      });
      expect(introduced).toEqual([]);
    },
    60_000,
  );
});
