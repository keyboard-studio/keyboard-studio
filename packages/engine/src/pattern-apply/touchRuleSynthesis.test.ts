/**
 * Unit tests for touchRuleSynthesis (spec 058 T084; contract:
 * specs/058-touch-key-editor/contracts/touch-key-rule-join.md §6.1/§8).
 *
 * Fixture: reuses the SINGLE reduced, deliberately-defective Cameroon-derived
 * fixture from `@keyboard-studio/contracts/fixtures` (`makeTouchKeyRuleJoinFixture`
 * + its `TOUCH_JOIN_*` named ids) — the same fixture behind the touch key<->rule
 * join tests, `touchCoverage.test.ts`, `keyEditOps.test.ts`, and the applier-twin
 * suite. No second fixture is authored here (contract §8, "why there is exactly
 * ONE fixture").
 *
 * Grouped to match tasks.md T084's obligation list, one exemption per `it()`:
 *   1. idempotence
 *   2. semantic dedupe against a hand-written Cameroon rule
 *   3. guard-store reuse vs mint (plus the no-repertoire refusal)
 *   4. guard-before-producing adjacency (fresh pair, and existing-guard case)
 *   5. insertion before an existing terminal rule
 *   6. the CAPS/NCAPS triple gated on existing CAPS handling
 *   7. rename + remove synchronization, including the node-id map, and the
 *      "must not cascade silently" key-deletion proposal
 *   8. the opaque carve-out, including gate-before-group-choice ordering
 *   9. the emit -> parse -> re-emit round-trip with opaque fragments present
 */

import { describe, it, expect } from "vitest";
import {
  makeTouchKeyRuleJoinFixture,
  TOUCH_JOIN_IDS,
  TOUCH_JOIN_STORES,
  TOUCH_JOIN_PRODUCED,
} from "@keyboard-studio/contracts/fixtures";
import { buildTouchKeyRuleIndex, bindingsForKeyId } from "@keyboard-studio/contracts";
import type { KeyboardIR, IRRule } from "@keyboard-studio/contracts";
import {
  ensureTouchKeyRule,
  planGuardSynthesis,
  applyGuardSynthesis,
  planCaseTripleSynthesis,
  applyCaseTripleSynthesis,
  removeTouchKeyRule,
  planKeyDeletionRuleRemoval,
  applyKeyDeletionRuleRemoval,
  renameTouchKeyRule,
  renameTouchKey,
  TOUCH_SYNTH_GUARD_STORE_NAME,
} from "./touchRuleSynthesis.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { normaliseForComparison } from "../codec/normalise-ir.js";

// ---------------------------------------------------------------------------
// Small local helpers over the shared fixture — no second fixture, just
// convenience readers/mutators over the one contracts exports.
// ---------------------------------------------------------------------------

const MAIN_GROUP_NAME = "Main";

function mainGroupRules(ir: KeyboardIR): readonly IRRule[] {
  return ir.groups.find((g) => g.name === MAIN_GROUP_NAME)?.rules ?? [];
}

/** Insert one or more hand-built rules into the fixture's Main group, before its terminal match rule — mirrors what the module under test itself must do. */
function insertIntoMainGroup(ir: KeyboardIR, ...rules: IRRule[]): KeyboardIR {
  const groups = ir.groups.map((g) => {
    if (g.name !== MAIN_GROUP_NAME) return g;
    const idx = g.rules.findIndex((r) => r.matchKind === "match" || r.matchKind === "nomatch");
    const at = idx === -1 ? g.rules.length : idx;
    return { ...g, rules: [...g.rules.slice(0, at), ...rules, ...g.rules.slice(at)] };
  });
  return { ...ir, groups };
}

/** The vkey name a rule is keyed on, or undefined if it has none. */
function vkeyNameOf(rule: IRRule): string | undefined {
  const el = rule.context.find((c) => c.kind === "vkey");
  return el?.kind === "vkey" ? el.name : undefined;
}

/** Drop the reusable guard-shaped store, forcing the "mint" branch. */
function withoutGuardStore(ir: KeyboardIR): KeyboardIR {
  return { ...ir, stores: ir.stores.filter((s) => s.name !== TOUCH_JOIN_STORES.guard) };
}

// ---------------------------------------------------------------------------
// 1. Idempotence
// ---------------------------------------------------------------------------

describe("idempotence: re-running ensureTouchKeyRule adds nothing", () => {
  it("a second call with the same request changes nothing and returns the same IR object", () => {
    const ir0 = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx0 = buildTouchKeyRuleIndex(ir0);

    const request = { keyId: "T_IDEMPOTENT", combo: [], outputText: "Ω" } as const;
    const first = ensureTouchKeyRule(ir0, idx0, request);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.changed).toBe(true);

    const idx1 = buildTouchKeyRuleIndex(first.ir);
    const second = ensureTouchKeyRule(first.ir, idx1, request);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.changed).toBe(false);
    // Nothing was rewritten at all — the exact same IR object comes back.
    expect(second.ir).toBe(first.ir);
    expect(mainGroupRules(second.ir).length).toBe(mainGroupRules(first.ir).length);
  });
});

// ---------------------------------------------------------------------------
// 2. Semantic dedupe against a hand-written Cameroon rule
// ---------------------------------------------------------------------------

describe("semantic dedupe against a hand-written Cameroon rule", () => {
  it("recognizes the fixture's hand-written T_0300 guard+producing pair as already satisfied, and never rewrites it", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, {
      keyId: TOUCH_JOIN_IDS.mark,
      combo: [],
      outputText: TOUCH_JOIN_PRODUCED.mark,
      guardStoreName: TOUCH_JOIN_STORES.guard,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.changed).toBe(false);
    expect(outcome.reusedHandWritten).toBe(true);
    // The ORIGINAL hand-written nodeIds survive — not just an unchanged count.
    expect(outcome.ruleNodeId).toBe("rule#mark");
    expect(outcome.guardRuleNodeId).toBe("rule#mark-guard");
    expect(outcome.ir).toBe(ir);

    const rules = mainGroupRules(outcome.ir);
    expect(rules.some((r) => r.nodeId === "rule#mark")).toBe(true);
    expect(rules.some((r) => r.nodeId === "rule#mark-guard")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Guard-store reuse vs mint
// ---------------------------------------------------------------------------

describe("guard-store reuse vs mint", () => {
  it("reuses the existing guard-shaped store (Cameroon's diablock) rather than minting one", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planGuardSynthesis(ir, idx, "T_REUSEMARK", [], "̈");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.storeSource).toBe("reuse");
    expect(plan.storeName).toBe(TOUCH_JOIN_STORES.guard);
    expect(plan.storeItems).toBeUndefined();
  });

  it("mints a new store under generated_touch_* from the caller's OWN repertoire when nothing is reusable", () => {
    const ir = withoutGuardStore(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const idx = buildTouchKeyRuleIndex(ir);
    const repertoire = [" ", "0", "1", "2", ".", ","];

    const plan = planGuardSynthesis(ir, idx, "T_MINTMARK", [], "̈", { repertoire });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.storeSource).toBe("mint");
    expect(plan.storeName).toBe(TOUCH_SYNTH_GUARD_STORE_NAME);
    expect(plan.storeItems).toEqual(repertoire);
  });

  it("refuses to mint when no repertoire is supplied — never falls back to a hardcoded ASCII literal", () => {
    const ir = withoutGuardStore(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planGuardSynthesis(ir, idx, "T_NOREPERTOIRE", [], "̈");
    expect(plan.ok).toBe(false);
    if (plan.ok) return;

    expect(plan.reason).toBe("no-repertoire");
    expect(plan.warning).toMatch(/never a hardcoded ASCII/i);
    expect(plan.ir).toBe(ir);
  });
});

// ---------------------------------------------------------------------------
// 4. Guard-before-producing adjacency
// ---------------------------------------------------------------------------

describe("guard-before-producing adjacency", () => {
  it("a fresh guard+producing pair is emitted as a contiguous block, guard first", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, {
      keyId: "T_FRESHPAIR",
      combo: [],
      outputText: "̂",
      guardStoreName: TOUCH_JOIN_STORES.guard,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const rules = mainGroupRules(outcome.ir);
    const guardIdx = rules.findIndex((r) => r.nodeId === outcome.guardRuleNodeId);
    const produceIdx = rules.findIndex((r) => r.nodeId === outcome.ruleNodeId);

    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(produceIdx).toBe(guardIdx + 1);
  });

  it("when a guard already exists for the key+combo, the new producing rule lands immediately after it — never at the group tail", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const handGuard: IRRule = {
      nodeId: "hand-guard-only",
      context: [
        { kind: "any", storeRef: TOUCH_JOIN_STORES.guard },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "T_GUARDONLY", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "context" }],
    };
    const ir = insertIntoMainGroup(base, handGuard);
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, {
      keyId: "T_GUARDONLY",
      combo: [],
      outputText: "̊",
      guardStoreName: TOUCH_JOIN_STORES.guard,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.guardRuleNodeId).toBe("hand-guard-only");

    const rules = mainGroupRules(outcome.ir);
    const guardIdx = rules.findIndex((r) => r.nodeId === "hand-guard-only");
    const produceIdx = rules.findIndex((r) => r.nodeId === outcome.ruleNodeId);

    expect(produceIdx).toBe(guardIdx + 1);
    // Several rules — including the terminal match — still follow: NOT the tail.
    expect(produceIdx).toBeLessThan(rules.length - 1);
  });
});

// ---------------------------------------------------------------------------
// 5. Insertion before an existing terminal rule
// ---------------------------------------------------------------------------

describe("insertion before an existing terminal rule", () => {
  it("a new plain producing rule lands before the group's terminal match rule, never after", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, {
      keyId: "T_BEFORETERMINAL",
      combo: [],
      outputText: "z",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const rules = mainGroupRules(outcome.ir);
    const produceIdx = rules.findIndex((r) => r.nodeId === outcome.ruleNodeId);
    const terminalIdx = rules.findIndex((r) => r.matchKind === "match");

    expect(terminalIdx).toBeGreaterThanOrEqual(0);
    expect(produceIdx).toBeLessThan(terminalIdx);
  });
});

// ---------------------------------------------------------------------------
// 6. CAPS/NCAPS triple gated on existing CAPS handling
// ---------------------------------------------------------------------------

describe("CAPS/NCAPS triple gated on existing CAPS handling", () => {
  it("proposes the CAPS/NCAPS triple when the key's group already handles CAPS", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const capsFlag: IRRule = {
      nodeId: "capsflag-rule",
      context: [{ kind: "vkey", name: "T_CAPSKEY", modifiers: ["CAPS"] }],
      output: [{ kind: "char", value: "Z" }],
    };
    const ir = insertIntoMainGroup(base, capsFlag);
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planGuardSynthesis(ir, idx, "T_CAPSKEY", [], "̀");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.capsHandling).toBe(true);
    const roles = plan.rules.map((r) => r.comboLabel).sort();
    expect(roles).toEqual(["CAPS", "NCAPS", "base"].sort());
  });

  it("proposes only the base producing rule when the key's group has no CAPS handling", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planGuardSynthesis(ir, idx, "T_NOCAPSKEY", [], "̀");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.capsHandling).toBe(false);
    expect(plan.rules.map((r) => r.comboLabel)).toEqual(["base", "base"]);
    const produces = plan.rules.filter((r) => r.role === "produces");
    expect(produces).toHaveLength(1);
    expect(produces[0]?.comboLabel).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// 6b. Case-triple synthesis (FR-025) — the NCAPS / SHIFT+NCAPS / CAPS trio for
// TWO different output characters, distinct from the CAPS/NCAPS pair above.
// ---------------------------------------------------------------------------

describe("case-triple synthesis (FR-025)", () => {
  it("blocks with caps-not-handled when the key has no existing CAPS handling — never silently degrades to a partial rule set", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planCaseTripleSynthesis(ir, idx, "T_NOCAPSTRIPLE", "s", "S");

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("caps-not-handled");
    expect(plan.ir).toBe(ir);
  });

  it("respects the opaque gate before group choice, identically to planGuardSynthesis", () => {
    const ir = makeTouchKeyRuleJoinFixture(); // opaqueFragmentCount > 0 by default
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planCaseTripleSynthesis(ir, idx, "T_TRIPLEOPAQUE", "s", "S");

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("opaque-fragments-present");
    expect(plan.ir).toBe(ir);
  });

  it("proposes and applies the NCAPS / SHIFT+NCAPS / CAPS trio as a contiguous ordered block once CAPS handling exists", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    // A pre-existing CAPS+SHIFT rule for the SAME key satisfies keyHasCapsHandling
    // without colliding with any of the triple's own three combos (NCAPS,
    // SHIFT+NCAPS, CAPS), so this test exercises the fully-fresh insertion path.
    const capsFlag: IRRule = {
      nodeId: "capsflag-triple",
      context: [{ kind: "vkey", name: "T_TRIPLE", modifiers: ["CAPS", "SHIFT"] }],
      output: [{ kind: "char", value: "X" }],
    };
    const ir = insertIntoMainGroup(base, capsFlag);
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planCaseTripleSynthesis(ir, idx, "T_TRIPLE", "s", "S");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rules.map((r) => r.comboLabel)).toEqual(["NCAPS", "SHIFT+NCAPS", "CAPS"]);
    expect(plan.rules.map((r) => r.outputText)).toEqual(["s", "S", "S"]);

    const applied = applyCaseTripleSynthesis(ir, idx, plan, "T_TRIPLE");
    expect(applied.ok).toBe(true);
    expect(applied.changed).toBe(true);
    expect(applied.producingRuleNodeIds).toHaveLength(3);

    const rules = mainGroupRules(applied.ir);
    const indices = applied.producingRuleNodeIds.map((id) => rules.findIndex((r) => r.nodeId === id));
    expect(indices.every((i) => i >= 0)).toBe(true);
    expect(indices[1]).toBe(indices[0]! + 1);
    expect(indices[2]).toBe(indices[1]! + 1);

    const idx2 = buildTouchKeyRuleIndex(applied.ir);
    const produces = bindingsForKeyId(idx2, "T_TRIPLE").filter((b) => b.role === "produces");
    const ncaps = produces.find((b) => b.modifiers.length === 1 && b.modifiers[0] === "NCAPS");
    const shiftNcaps = produces.find((b) => b.modifiers.includes("SHIFT") && b.modifiers.includes("NCAPS"));
    const caps = produces.find((b) => b.modifiers.length === 1 && b.modifiers[0] === "CAPS");
    expect(ncaps?.produced).toEqual(["s"]);
    expect(shiftNcaps?.produced).toEqual(["S"]);
    expect(caps?.produced).toEqual(["S"]);

    // Idempotence: re-planning/re-applying over the result changes nothing.
    const idx3 = buildTouchKeyRuleIndex(applied.ir);
    const plan2 = planCaseTripleSynthesis(applied.ir, idx3, "T_TRIPLE", "s", "S");
    expect(plan2.ok).toBe(true);
    if (!plan2.ok) return;
    const applied2 = applyCaseTripleSynthesis(applied.ir, idx3, plan2, "T_TRIPLE");
    expect(applied2.ok).toBe(true);
    expect(applied2.changed).toBe(false);
  });

  it("never rewrites a hand-written rule that already satisfies one of the trio's three combos", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const capsFlag: IRRule = {
      nodeId: "capsflag-triple2",
      context: [{ kind: "vkey", name: "T_TRIPLE2", modifiers: ["CAPS", "SHIFT"] }],
      output: [{ kind: "char", value: "X" }],
    };
    const handNcaps: IRRule = {
      nodeId: "hand-ncaps-triple2",
      context: [{ kind: "vkey", name: "T_TRIPLE2", modifiers: ["NCAPS"] }],
      output: [{ kind: "char", value: "s" }],
    };
    const ir = insertIntoMainGroup(base, capsFlag, handNcaps);
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planCaseTripleSynthesis(ir, idx, "T_TRIPLE2", "s", "S");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const applied = applyCaseTripleSynthesis(ir, idx, plan, "T_TRIPLE2");
    expect(applied.ok).toBe(true);
    expect(applied.producingRuleNodeIds).toContain("hand-ncaps-triple2");

    // The hand-written rule object itself is untouched (same reference).
    const before = mainGroupRules(ir).find((r) => r.nodeId === "hand-ncaps-triple2");
    const after = mainGroupRules(applied.ir).find((r) => r.nodeId === "hand-ncaps-triple2");
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 7a. Rename synchronization
// ---------------------------------------------------------------------------

describe("rename", () => {
  it("rewrites EVERY binding for the old id — guard and producing alike", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKeyRule(ir, TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.changed).toBe(true);
    expect([...result.renamedRuleNodeIds].sort()).toEqual(["rule#mark", "rule#mark-guard"].sort());

    const rules = mainGroupRules(result.ir);
    const guard = rules.find((r) => r.nodeId === "rule#mark-guard");
    const produce = rules.find((r) => r.nodeId === "rule#mark");
    expect(guard && vkeyNameOf(guard)).toBe("T_0300RENAMED");
    expect(produce && vkeyNameOf(produce)).toBe("T_0300RENAMED");
  });

  it("leaves a different key's rules untouched", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKeyRule(ir, TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    const multichar = mainGroupRules(result.ir).find((r) => r.nodeId === "rule#multichar");
    expect(multichar && vkeyNameOf(multichar)).toBe(TOUCH_JOIN_IDS.multiChar);
  });
});

// ---------------------------------------------------------------------------
// 7a-complete. renameTouchKey — the T091 complete fix-up: rules + layout key
// id (every platform/layer) + nodeIds, as one atomic operation.
// ---------------------------------------------------------------------------

describe("renameTouchKey — the complete T091 reference fix-up", () => {
  it("renames the rule bindings, the layout key id on EVERY platform, and the nodeIds entries, in one call", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKey(ir, TOUCH_JOIN_IDS.mark, "T_0300RENAMED");

    expect(result.changed).toBe(true);
    expect([...result.renamedRuleNodeIds].sort()).toEqual(["rule#mark", "rule#mark-guard"].sort());

    const rules = mainGroupRules(result.ir);
    const guard = rules.find((r) => r.nodeId === "rule#mark-guard");
    const produce = rules.find((r) => r.nodeId === "rule#mark");
    expect(guard && vkeyNameOf(guard)).toBe("T_0300RENAMED");
    expect(produce && vkeyNameOf(produce)).toBe("T_0300RENAMED");

    const layout = result.ir.touchLayout!;
    const phoneKey = layout.platforms.find((p) => p.id === "phone")!.layers[0]!.rows[0]!.keys[0]!;
    const tabletKey = layout.platforms.find((p) => p.id === "tablet")!.layers[0]!.rows[0]!.keys[0]!;
    expect(phoneKey.id).toBe("T_0300RENAMED");
    expect(tabletKey.id).toBe("T_0300RENAMED");

    const addresses = layout.nodeIds.map(([addr]) => addr);
    expect(addresses).toContain("phone:default:T_0300RENAMED");
    expect(addresses).toContain("tablet:default:T_0300RENAMED");
    expect(addresses).not.toContain("phone:default:T_0300");
    expect(addresses).not.toContain("tablet:default:T_0300");

    expect([...result.renamedAddresses].sort((a, b) => a.oldAddress.localeCompare(b.oldAddress))).toEqual(
      [
        { oldAddress: "phone:default:T_0300", newAddress: "phone:default:T_0300RENAMED" },
        { oldAddress: "tablet:default:T_0300", newAddress: "tablet:default:T_0300RENAMED" },
      ].sort((a, b) => a.oldAddress.localeCompare(b.oldAddress)),
    );
  });

  it("descends into `flick` — an OBJECT, not an array — so a flick sub-key is not silently missed (key-id-policy.md §4's first named failure mode)", () => {
    const withoutLayout = makeTouchKeyRuleJoinFixture({
      withoutOpaqueFragments: true,
      withoutTouchLayout: true,
    });
    const ir: KeyboardIR = {
      ...withoutLayout,
      touchLayout: {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [
                  {
                    keys: [
                      {
                        nodeId: "host",
                        id: "T_HOST",
                        flick: { n: { nodeId: "flicksub", id: "T_FLICKME" } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        nodeIds: [],
      },
    };

    const result = renameTouchKey(ir, "T_FLICKME", "T_FLICKRENAMED");

    expect(result.changed).toBe(true);
    const key = result.ir.touchLayout!.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    expect(key.id).toBe("T_HOST");
    expect(key.flick?.n?.id).toBe("T_FLICKRENAMED");
  });

  it("rewrites a `sk` sub-entry's nodeIds address without touching its host key's own address", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKey(ir, "U_00A1", "U_00A1RENAMED");

    expect(result.changed).toBe(true);
    expect(result.renamedAddresses).toEqual([
      { oldAddress: "phone:default:T_0021:sk:U_00A1", newAddress: "phone:default:T_0021:sk:U_00A1RENAMED" },
    ]);

    const addresses = result.ir.touchLayout!.nodeIds.map(([addr]) => addr);
    expect(addresses).toContain("phone:default:T_0021:sk:U_00A1RENAMED");
    expect(addresses).toContain("phone:default:T_0021");

    const host = result.ir.touchLayout!.platforms[0]!.layers[0]!.rows[1]!.keys[0]!;
    expect(host.id).toBe(TOUCH_JOIN_IDS.longpressHost);
    expect(host.sk?.[0]?.id).toBe("U_00A1RENAMED");
  });

  it("is a no-op (same `ir` reference) when the id matches nothing anywhere — atomicity's trivial case", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKey(ir, "T_DOES_NOT_EXIST", "T_WHATEVER");

    expect(result.changed).toBe(false);
    expect(result.ir).toBe(ir);
    expect(result.renamedAddresses).toEqual([]);
    expect(result.renamedRuleNodeIds).toEqual([]);
  });

  it("bundles a rules-only match (no layout occurrence) into ONE consistent result — a partial rename is never observable", () => {
    // T_03B1: the fixture's injected AZERTY orphan — rules exist for it, but
    // the layout carries only its self-outputting U_03B1 near-miss.
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const result = renameTouchKey(ir, TOUCH_JOIN_IDS.orphan, "T_03B1RENAMED");

    expect(result.changed).toBe(true);
    expect([...result.renamedRuleNodeIds].sort()).toEqual(["rule#orphan", "rule#orphan-guard"].sort());
    // Nothing on the layout/nodeIds side matched T_03B1 itself, so this is [].
    expect(result.renamedAddresses).toEqual([]);

    // The near-miss U_03B1 key is untouched by this rename of a DIFFERENT id.
    const addresses = result.ir.touchLayout!.nodeIds.map(([addr]) => addr);
    expect(addresses.some((a) => a.endsWith(":U_03B1"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7b. Remove synchronization — generated only, ever
// ---------------------------------------------------------------------------

describe("remove", () => {
  it("removes only the generated bindings for a key — guard and producing alike", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx0 = buildTouchKeyRuleIndex(base);
    const synth = ensureTouchKeyRule(base, idx0, {
      keyId: "T_REMOVEME",
      combo: [],
      outputText: "q",
      guardStoreName: TOUCH_JOIN_STORES.guard,
    });
    expect(synth.ok).toBe(true);
    if (!synth.ok) return;

    const idx1 = buildTouchKeyRuleIndex(synth.ir);
    const removed = removeTouchKeyRule(synth.ir, idx1, "T_REMOVEME");

    expect(removed.changed).toBe(true);
    expect([...removed.removedRuleNodeIds].sort()).toEqual(
      [synth.ruleNodeId, synth.guardRuleNodeId].sort(),
    );
    expect(removed.keptHandWrittenRuleNodeIds).toEqual([]);
    expect(mainGroupRules(removed.ir).some((r) => r.nodeId === synth.ruleNodeId)).toBe(false);
  });

  it("keeps a hand-written rule instead of removing it, reporting it for the orphan-rule check", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    const result = removeTouchKeyRule(ir, idx, TOUCH_JOIN_IDS.mark);

    expect(result.changed).toBe(false);
    expect([...result.keptHandWrittenRuleNodeIds].sort()).toEqual(
      ["rule#mark", "rule#mark-guard"].sort(),
    );
  });

  it("removes a minted guard store once it is no longer referenced by any rule", () => {
    const base = withoutGuardStore(makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true }));
    const idx0 = buildTouchKeyRuleIndex(base);

    const plan = planGuardSynthesis(base, idx0, "T_MINTREMOVE", [], "̌", {
      repertoire: [" ", "1", "2"],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const applied = applyGuardSynthesis(base, idx0, plan, "T_MINTREMOVE", "̌");
    expect(applied.ok).toBe(true);
    expect(applied.mintedStoreName).toBe(TOUCH_SYNTH_GUARD_STORE_NAME);
    expect(applied.ir.stores.some((s) => s.name === TOUCH_SYNTH_GUARD_STORE_NAME)).toBe(true);

    const idx1 = buildTouchKeyRuleIndex(applied.ir);
    const removed = removeTouchKeyRule(applied.ir, idx1, "T_MINTREMOVE");

    expect(removed.changed).toBe(true);
    expect(removed.removedStoreNames).toEqual([TOUCH_SYNTH_GUARD_STORE_NAME]);
    expect(removed.ir.stores.some((s) => s.name === TOUCH_SYNTH_GUARD_STORE_NAME)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7c. Key deletion must not cascade silently
// ---------------------------------------------------------------------------

describe("key-deletion rule removal must not cascade silently", () => {
  it("proposes nothing when the id is still carried elsewhere (another platform)", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    // TOUCH_JOIN_IDS.mark lives on BOTH the "phone" and "tablet" platforms.
    const plan = planKeyDeletionRuleRemoval(ir, idx, TOUCH_JOIN_IDS.mark);

    expect(plan.stillPresentElsewhere).toBe(true);
    expect(plan.proposeRemoval).toBe(false);
  });

  it("counts presence inside a longpress (sk) sub-key, not just top-level keys", () => {
    const withoutLayout = makeTouchKeyRuleJoinFixture({
      withoutOpaqueFragments: true,
      withoutTouchLayout: true,
    });
    const ir: KeyboardIR = {
      ...withoutLayout,
      touchLayout: {
        platforms: [
          {
            id: "phone",
            layers: [
              {
                id: "default",
                rows: [
                  {
                    keys: [
                      {
                        nodeId: "host",
                        id: "T_HOST",
                        sk: [{ nodeId: "sub", id: "T_INSK" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        nodeIds: [],
      },
    };
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planKeyDeletionRuleRemoval(ir, idx, "T_INSK");

    expect(plan.stillPresentElsewhere).toBe(true);
    expect(plan.proposeRemoval).toBe(false);
  });

  it("proposes removal for our own generated rules once the id is carried nowhere", () => {
    const base = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx0 = buildTouchKeyRuleIndex(base);
    const synth = ensureTouchKeyRule(base, idx0, {
      keyId: "T_GONE",
      combo: [],
      outputText: "g",
      guardStoreName: TOUCH_JOIN_STORES.guard,
    });
    expect(synth.ok).toBe(true);
    if (!synth.ok) return;

    const idx1 = buildTouchKeyRuleIndex(synth.ir);
    // T_GONE was never added to the fixture's touch layout.
    const plan = planKeyDeletionRuleRemoval(synth.ir, idx1, "T_GONE");

    expect(plan.stillPresentElsewhere).toBe(false);
    expect(plan.proposeRemoval).toBe(true);
    expect([...plan.generatedRuleNodeIds].sort()).toEqual(
      [synth.ruleNodeId, synth.guardRuleNodeId].sort(),
    );

    const applied = applyKeyDeletionRuleRemoval(synth.ir, idx1, plan, "T_GONE");
    expect(applied.changed).toBe(true);
    expect([...applied.removedRuleNodeIds].sort()).toEqual([...plan.generatedRuleNodeIds].sort());
  });

  it("defaults to KEEP for a hand-written binding whose key is carried nowhere — the AZERTY orphan itself", () => {
    const ir = makeTouchKeyRuleJoinFixture({ withoutOpaqueFragments: true });
    const idx = buildTouchKeyRuleIndex(ir);

    // T_03B1: the layout carries only the U_03B1 near-miss, never T_03B1 itself.
    const plan = planKeyDeletionRuleRemoval(ir, idx, TOUCH_JOIN_IDS.orphan);

    expect(plan.stillPresentElsewhere).toBe(false);
    expect(plan.proposeRemoval).toBe(false);
    expect(plan.generatedRuleNodeIds).toEqual([]);
    expect([...plan.handWrittenRuleNodeIds].sort()).toEqual(
      ["rule#orphan", "rule#orphan-guard"].sort(),
    );
    expect(plan.warning).toBeDefined();

    const applied = applyKeyDeletionRuleRemoval(ir, idx, plan, TOUCH_JOIN_IDS.orphan);
    expect(applied.changed).toBe(false);
    expect(applied.keptHandWrittenRuleNodeIds).toEqual(plan.handWrittenRuleNodeIds);
  });
});

// ---------------------------------------------------------------------------
// 8. The opaque carve-out — fires before group choice, blocks every write
// ---------------------------------------------------------------------------

describe("opaque carve-out", () => {
  it("blocks ensureTouchKeyRule when opaque fragments are present and unacknowledged, writing nothing", () => {
    const ir = makeTouchKeyRuleJoinFixture(); // opaqueFragmentCount > 0 by default
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, { keyId: "T_BLOCKED", combo: [], outputText: "z" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("opaque-fragments-present");
    expect(outcome.opaqueFragmentCount).toBeGreaterThan(0);
    expect(outcome.ir).toBe(ir);
  });

  it("blocks planGuardSynthesis identically", () => {
    const ir = makeTouchKeyRuleJoinFixture();
    const idx = buildTouchKeyRuleIndex(ir);

    const plan = planGuardSynthesis(ir, idx, "T_BLOCKED2", [], "̈");

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("opaque-fragments-present");
    expect(plan.ir).toBe(ir);
  });

  it("proceeds and writes once opaqueAcknowledged is true", () => {
    const ir = makeTouchKeyRuleJoinFixture();
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(
      ir,
      idx,
      { keyId: "T_ACKED", combo: [], outputText: "z" },
      { opaqueAcknowledged: true },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.changed).toBe(true);
  });

  it("the gate fires BEFORE group choice: an IR with no writable entry group still reports the opaque reason, not no-entry-group, when unacknowledged", () => {
    const base = makeTouchKeyRuleJoinFixture();
    const groups = base.groups.map((g) => (g.name === MAIN_GROUP_NAME ? { ...g, readonly: true } : g));
    const ir: KeyboardIR = { ...base, groups };
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(ir, idx, { keyId: "T_ORDERING", combo: [], outputText: "z" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("opaque-fragments-present");
  });

  it("once acknowledged, that same no-entry-group IR correctly falls through to no-entry-group", () => {
    const base = makeTouchKeyRuleJoinFixture();
    const groups = base.groups.map((g) => (g.name === MAIN_GROUP_NAME ? { ...g, readonly: true } : g));
    const ir: KeyboardIR = { ...base, groups };
    const idx = buildTouchKeyRuleIndex(ir);

    const outcome = ensureTouchKeyRule(
      ir,
      idx,
      { keyId: "T_ORDERING2", combo: [], outputText: "z" },
      { opaqueAcknowledged: true },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("no-entry-group");
  });
});

// ---------------------------------------------------------------------------
// 9. emit -> parse -> re-emit round-trip, opaque fragments present
// ---------------------------------------------------------------------------

describe("emit -> parse -> re-emit round-trip on the Cameroon fixture with opaque fragments present", () => {
  it("a synthesized guard+producing pair survives the cycle, and the cycle stabilizes after one real parse", () => {
    const base = makeTouchKeyRuleJoinFixture(); // opaqueFragmentCount > 0
    const idx0 = buildTouchKeyRuleIndex(base);

    const synth = ensureTouchKeyRule(
      base,
      idx0,
      { keyId: "T_ROUNDTRIP", combo: [], outputText: "̃", guardStoreName: TOUCH_JOIN_STORES.guard },
      { opaqueAcknowledged: true },
    );
    expect(synth.ok).toBe(true);
    if (!synth.ok) return;

    // The synthesized rules carry no sourceLine — the risk this test exists to
    // check rather than assume (§6.2): the position-faithful emit path is keyed
    // on source lines, and these have none.
    const text1 = emit(synth.ir);
    expect(() => parse(text1, "touch_join_fixture")).not.toThrow();

    const { ir: ir2 } = parse(text1, "touch_join_fixture");
    const text2 = emit(ir2);
    const { ir: ir3 } = parse(text2, "touch_join_fixture");
    const text3 = emit(ir3);

    // Stability: once the fixture has been through one real parse (so every
    // node carries a real sourceLine), further emit/parse cycles are a fixed
    // point rather than continuing to drift.
    expect(text3).toBe(text2);
    expect(normaliseForComparison(ir3)).toEqual(normaliseForComparison(ir2));

    // Survival: the synthesized pair is still findable by the join, by CONTENT
    // (nodeIds are re-minted by parse, so this cannot be checked by nodeId).
    const idx2 = buildTouchKeyRuleIndex(ir2);
    const bindings = bindingsForKeyId(idx2, "T_ROUNDTRIP");
    const produces = bindings.find((b) => b.role === "produces");
    const guard = bindings.find((b) => b.role === "guard");

    expect(produces?.produced).toEqual(["̃"]);
    expect(guard?.storeRefs).toContain(TOUCH_JOIN_STORES.guard);
  });
});
