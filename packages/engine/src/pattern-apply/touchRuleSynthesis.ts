/**
 * touchRuleSynthesis — `ensure` / `remove` / `rename` operations that keep a
 * touch key's `.kmn` rules in sync with the studio's key-level editing surface
 * (spec 063 FR-026, FR-027, FR-027a; contracts/touch-key-rule-join.md §6.1,
 * which is the normative spec for everything in this module).
 *
 * Four invariants are load-bearing here and MUST NOT be "tidied away" by a
 * later refactor:
 *
 * 1. **Ordering is correctness, not cosmetics.** A synthesized guard rule and
 *    the producing rule it protects are always emitted as a CONTIGUOUS pair,
 *    guard first. When a guard already exists for a key+combo, the producing
 *    rule is inserted immediately AFTER it — never at the group tail — because
 *    a producing rule that precedes its guard silently defeats it. See
 *    {@link ensureTouchKeyRule} and {@link applyGuardSynthesis}.
 * 2. **Idempotence is semantic, not nodeId-based.** Re-running synthesis over
 *    a key that already carries an EQUIVALENT rule — ours or hand-written —
 *    adds nothing. We recognize our own output by the `gen-touch-*` nodeId
 *    prefix, but the dedupe match itself is (normalized id, canonical combo,
 *    role) via the join, against ANY existing binding. A hand-written match is
 *    NEVER rewritten.
 * 3. **The opaque gate is a carve-out, not a courtesy, and it runs BEFORE
 *    group choice.** When `TouchKeyRuleIndex.opaqueFragmentCount > 0`, every
 *    rule-adding operation in this module downgrades to warn-and-confirm and
 *    writes nothing until the caller passes `opaqueAcknowledged: true`. The
 *    join cannot prove an equivalent rule isn't already hiding inside a
 *    `RawKmnFragment`; nothing below the gate runs unconfirmed. `remove` and
 *    `rename` are NOT gated — they only ever touch rules the join can already
 *    see, so the "something might be hidden" risk does not apply to them.
 * 4. **Delete must not cascade silently.** A `T_`/`U_`/`K_` id can legitimately
 *    be carried by several layers and platforms. Removing a key's rules is
 *    only ever PROPOSED after recomputing presence across every layer of
 *    every platform (including `sk`/`multitap`/`flick`), and only our own
 *    generated rules are ever actually removed — a hand-written or imported
 *    rule is left for the orphan-rule check to report, never silently deleted.
 *
 * ## Naming (mirrors mark-guards.ts exactly — do not mint a third scheme)
 *
 * Rule/store NODE IDS live under `gen-touch-*`; store/group NAMES live under
 * `generated_touch_*`. Same split mark-guards.ts uses for its own
 * `gen-marks-*` / `generated_marks_*` pair, deliberately kept distinct so the
 * two synthesizers' generated content never collides or gets cross-attributed.
 *
 * ## Normalization
 *
 * Synthesized output text is NFC-normalized before being split into
 * `{kind:"char"}` elements — the same normalization `collectFromElements`
 * (contracts) applies when reading a rule's output back out. This module does
 * not invent a second normalization path.
 *
 * **Explicitly out of scope (stated decision, not a silent gap): canonical
 * ordering ACROSS successive keystrokes ("mark stacking").** If an author
 * wires two synthesized mark keys in sequence, the resulting combining-mark
 * order is whatever order the keystrokes occurred in. Reordering to canonical
 * combining-class order is the author's domain, not something this module
 * attempts.
 *
 * Pure IR -> IR throughout: no I/O, no React, no VFS, structural sharing, and
 * an input `IRRule`/`IRGroup`/`IRStore` object is never mutated in place — a
 * changed node is always a new object. No function in this module throws;
 * every outcome is a returned result object.
 */

import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  IRStore,
  IRNodeRef,
  OutputElement,
  TouchKeyIR,
  TouchLayoutIR,
  TouchKeyRuleIndex,
  TouchKeyRuleBinding,
} from "@keyboard-studio/contracts";
import { normalizeTouchKeyId, bindingsForKeyId, toUPlusNotation } from "@keyboard-studio/contracts";

import {
  entryGroupOf,
  insertBeforeTerminalRules,
  insertBlockBeforeTerminalRules,
  insertAfterRule,
} from "./ir-insert.js";
import { canonicalizeCombo, comboToKeySpec, MODIFIER_EXCLUSIONS, type ModifierToken } from "./modifierCombos.js";
import { keyHasCapsHandling } from "./shiftRules.js";
import { parseTouchKeyAddress, touchKeyAddress, touchSubKeyAddress, touchFlickAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Naming (see module doc)
// ---------------------------------------------------------------------------

export const TOUCH_SYNTH_NODE_ID_PREFIX = "gen-touch-";
export const TOUCH_SYNTH_STORE_NAME_PREFIX = "generated_touch_";
export const TOUCH_SYNTH_GUARD_STORE_NAME = "generated_touch_guard";

function isGeneratedNodeId(nodeId: string): boolean {
  return nodeId.startsWith(TOUCH_SYNTH_NODE_ID_PREFIX);
}

function comboSuffix(combo: readonly ModifierToken[]): string {
  return combo.length === 0 ? "base" : combo.map((t) => t.toLowerCase()).join("-");
}

function synthRuleNodeId(role: "guard" | "produce", keyId: string, combo: readonly ModifierToken[]): string {
  return `${TOUCH_SYNTH_NODE_ID_PREFIX}${role}-${normalizeTouchKeyId(keyId)}-${comboSuffix(combo)}`;
}

function synthStoreNodeId(storeName: string): string {
  return `${TOUCH_SYNTH_NODE_ID_PREFIX}store-${storeName}`;
}

// ---------------------------------------------------------------------------
// Modifier-combo helpers (the join returns raw strings — see contract §2.4;
// canonicalization happens here, engine-side)
// ---------------------------------------------------------------------------

const KNOWN_MODIFIER_TOKENS: ReadonlySet<string> = new Set(Object.keys(MODIFIER_EXCLUSIONS));

function isKnownModifierToken(word: string): word is ModifierToken {
  return KNOWN_MODIFIER_TOKENS.has(word);
}

/** Canonicalize a binding's raw modifier words. Exclusion-inconsistent input (cannot come from a source kmcmplib would accept) resolves to `[]` rather than throwing, matching modifierCombos.ts's own defensive IR-scan skips. */
function toCanonicalCombo(words: readonly string[]): ModifierToken[] {
  const tokens = words.filter(isKnownModifierToken);
  try {
    return canonicalizeCombo(tokens);
  } catch {
    return [];
  }
}

function comboJoinKey(tokens: readonly ModifierToken[]): string {
  return tokens.join("+");
}

/** The single combining-mark predicate that triggers guard synthesis (contract §6.1). */
export function isSingleCombiningMark(text: string): boolean {
  const chars = [...text.normalize("NFC")];
  if (chars.length !== 1) return false;
  return /^[\p{Mn}\p{Mc}\p{Me}]$/u.test(chars[0]!);
}

// ---------------------------------------------------------------------------
// The opaque carve-out (invariant 3)
// ---------------------------------------------------------------------------

export type OpaqueGateResult =
  | { readonly blocked: false; readonly opaqueFragmentCount: number }
  | { readonly blocked: true; readonly warning: string; readonly opaqueFragmentCount: number };

/**
 * Gate every rule-ADDING operation on `TouchKeyRuleIndex.opaqueFragmentCount`.
 * `remove`/`rename` do not call this — see the module doc, invariant 3.
 */
export function checkOpaqueGate(ruleIndex: TouchKeyRuleIndex, acknowledged: boolean): OpaqueGateResult {
  const opaqueFragmentCount = ruleIndex.opaqueFragmentCount;
  if (opaqueFragmentCount === 0 || acknowledged) {
    return { blocked: false, opaqueFragmentCount };
  }
  return {
    blocked: true,
    warning:
      "This keyboard has raw fragments the codec could not parse. Synthesis cannot prove an " +
      "equivalent rule does not already exist inside one of them. Confirm to proceed anyway.",
    opaqueFragmentCount,
  };
}

/** Shared shape for every blocked (never-written) outcome in this module. */
export interface TouchRuleSynthesisBlocked {
  readonly ok: false;
  readonly ir: KeyboardIR;
  readonly reason: "opaque-fragments-present" | "no-entry-group" | "no-repertoire" | "caps-not-handled";
  readonly warning: string;
  readonly opaqueFragmentCount: number;
}

// ---------------------------------------------------------------------------
// Shared rule-building / lookup helpers
// ---------------------------------------------------------------------------

function outputElementsFor(text: string): OutputElement[] {
  return [...text.normalize("NFC")].map((value) => ({ kind: "char" as const, value }));
}

function buildProducingRule(nodeId: string, keyId: string, combo: readonly ModifierToken[], outputText: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: keyId, modifiers: [...combo] }],
    output: outputElementsFor(outputText),
    trailingComment: "generated: touch key rule synthesis (spec 063)",
  };
}

function buildGuardRule(nodeId: string, keyId: string, combo: readonly ModifierToken[], storeName: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: storeName },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: keyId, modifiers: [...combo] },
    ],
    output: [{ kind: "raw", text: "context" }],
    trailingComment: "generated: touch key rule guard (spec 063)",
  };
}

function outputElementsEqual(a: readonly OutputElement[], b: readonly OutputElement[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((el, i) => {
    const other = b[i];
    if (other === undefined || el.kind !== other.kind) return false;
    if (el.kind === "char" && other.kind === "char") return el.value === other.value;
    if (el.kind === "raw" && other.kind === "raw") return el.text === other.text;
    return true;
  });
}

function findBinding(
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
  combo: readonly ModifierToken[],
  role: "produces" | "guard",
): TouchKeyRuleBinding | undefined {
  const targetKey = comboJoinKey(canonicalizeCombo(combo));
  return bindingsForKeyId(ruleIndex, keyId).find(
    (b) => b.role === role && comboJoinKey(toCanonicalCombo(b.modifiers)) === targetKey,
  );
}

function findRuleAndGroup(ir: KeyboardIR, nodeId: string): { readonly group: IRGroup; readonly rule: IRRule } | undefined {
  for (const group of ir.groups) {
    const rule = group.rules.find((r) => r.nodeId === nodeId);
    if (rule !== undefined) return { group, rule };
  }
  return undefined;
}

/** Insert `rule` immediately BEFORE `anchor` — {@link insertAfterRule}'s mirror, needed for the (rare) case where a hand-written producing rule already exists but its guard does not yet. Falls back to {@link insertBeforeTerminalRules}, same convention as insertAfterRule. */
function insertBeforeAnchor(rules: readonly IRRule[], anchor: IRRule, rule: IRRule): IRRule[] {
  const idx = rules.indexOf(anchor);
  if (idx === -1) return insertBeforeTerminalRules([...rules], rule);
  return [...rules.slice(0, idx), rule, ...rules.slice(idx)];
}

// ---------------------------------------------------------------------------
// T080 — ensure (plain producing rule, optionally guarded)
// ---------------------------------------------------------------------------

export interface EnsureTouchKeyRuleRequest {
  readonly keyId: string;
  readonly combo: readonly ModifierToken[];
  readonly outputText: string;
  /**
   * Present when this producing rule must be preceded by a guard against this
   * store (the guard-then-producing pair, invariant 1). Absent for an
   * unguarded producing rule. Callers wiring a single-combining-mark output
   * should resolve this via {@link planGuardSynthesis}/{@link applyGuardSynthesis}
   * rather than calling this function directly with a hand-picked store.
   */
  readonly guardStoreName?: string;
}

export interface EnsureTouchKeyRuleResult {
  readonly ok: true;
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  readonly ruleNodeId: string;
  readonly guardRuleNodeId?: string;
  readonly reusedHandWritten: boolean;
  readonly warning?: string;
}

export type EnsureTouchKeyRuleOutcome = EnsureTouchKeyRuleResult | TouchRuleSynthesisBlocked;

/**
 * Ensure a producing rule (and, when requested, its guard) exists for
 * `request.keyId` under `request.combo`. Semantic idempotence (invariant 2):
 * a hand-written match is left untouched; a previously-generated match is
 * rewritten in place only if its content differs from what is requested now.
 */
export function ensureTouchKeyRule(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  request: EnsureTouchKeyRuleRequest,
  options: { readonly opaqueAcknowledged?: boolean } = {},
): EnsureTouchKeyRuleOutcome {
  const gate = checkOpaqueGate(ruleIndex, options.opaqueAcknowledged === true);
  if (gate.blocked) {
    return { ok: false, ir, reason: "opaque-fragments-present", warning: gate.warning, opaqueFragmentCount: gate.opaqueFragmentCount };
  }

  const entry = entryGroupOf(ir.groups);
  if (entry === undefined) {
    return {
      ok: false,
      ir,
      reason: "no-entry-group",
      warning: "No writable `using keys` group found to host a synthesized touch key rule.",
      opaqueFragmentCount: gate.opaqueFragmentCount,
    };
  }

  const combo = canonicalizeCombo(request.combo);
  const desiredOutput = outputElementsFor(request.outputText);

  // --- producing rule status ---
  const existingProducing = findBinding(ruleIndex, request.keyId, combo, "produces");
  let producingRuleNodeId: string;
  let producingIsNew = false;
  let producingUpdated = false;
  let reusedHandWritten = false;
  let workingRules = entry.rules;

  if (existingProducing !== undefined) {
    producingRuleNodeId = existingProducing.ruleNodeId;
    if (!isGeneratedNodeId(existingProducing.ruleNodeId)) {
      reusedHandWritten = true;
    } else {
      const located = findRuleAndGroup(ir, existingProducing.ruleNodeId);
      if (located !== undefined && !outputElementsEqual(located.rule.output, desiredOutput)) {
        const updated: IRRule = { ...located.rule, output: desiredOutput };
        workingRules = workingRules.map((r) => (r.nodeId === updated.nodeId ? updated : r));
        producingUpdated = true;
      }
    }
  } else {
    producingRuleNodeId = synthRuleNodeId("produce", request.keyId, combo);
    producingIsNew = true;
  }

  // --- guard status (only when requested) ---
  let guardRuleNodeId: string | undefined;
  let guardIsNew = false;
  let crossGroupWarning: string | undefined;

  if (request.guardStoreName !== undefined) {
    const existingGuard = findBinding(ruleIndex, request.keyId, combo, "guard");
    if (existingGuard !== undefined) {
      guardRuleNodeId = existingGuard.ruleNodeId;
      if (existingGuard.groupName !== entry.name) {
        crossGroupWarning = `An existing guard for ${request.keyId} lives in group "${existingGuard.groupName}", not the entry group; left in place.`;
      }
    } else {
      guardRuleNodeId = synthRuleNodeId("guard", request.keyId, combo);
      guardIsNew = true;
    }
  }

  // --- insertion (invariant 1: guard-then-producing, contiguous) ---
  if (producingIsNew && guardIsNew && guardRuleNodeId !== undefined && request.guardStoreName !== undefined) {
    const guardRule = buildGuardRule(guardRuleNodeId, request.keyId, combo, request.guardStoreName);
    const producingRule = buildProducingRule(producingRuleNodeId, request.keyId, combo, request.outputText);
    workingRules = insertBlockBeforeTerminalRules(workingRules, [guardRule, producingRule]);
  } else if (producingIsNew && !guardIsNew && guardRuleNodeId !== undefined) {
    const producingRule = buildProducingRule(producingRuleNodeId, request.keyId, combo, request.outputText);
    const anchor = findRuleAndGroup(ir, guardRuleNodeId);
    if (anchor !== undefined && anchor.group.nodeId === entry.nodeId) {
      workingRules = insertAfterRule(workingRules, anchor.rule, producingRule);
    } else {
      workingRules = insertBeforeTerminalRules(workingRules, producingRule);
    }
  } else if (producingIsNew) {
    const producingRule = buildProducingRule(producingRuleNodeId, request.keyId, combo, request.outputText);
    workingRules = insertBeforeTerminalRules(workingRules, producingRule);
  } else if (guardIsNew && guardRuleNodeId !== undefined && request.guardStoreName !== undefined) {
    const guardRule = buildGuardRule(guardRuleNodeId, request.keyId, combo, request.guardStoreName);
    const anchor = findRuleAndGroup(ir, producingRuleNodeId);
    if (anchor !== undefined && anchor.group.nodeId === entry.nodeId) {
      workingRules = insertBeforeAnchor(workingRules, anchor.rule, guardRule);
    } else {
      workingRules = insertBeforeTerminalRules(workingRules, guardRule);
    }
  }

  const changed = producingIsNew || producingUpdated || guardIsNew;
  if (!changed) {
    return {
      ok: true,
      ir,
      changed: false,
      ruleNodeId: producingRuleNodeId,
      ...(guardRuleNodeId !== undefined ? { guardRuleNodeId } : {}),
      reusedHandWritten,
      ...(crossGroupWarning !== undefined ? { warning: crossGroupWarning } : {}),
    };
  }

  const updatedEntry: IRGroup = { ...entry, rules: workingRules };
  const groups = ir.groups.map((g) => (g.nodeId === entry.nodeId ? updatedEntry : g));

  return {
    ok: true,
    ir: { ...ir, groups },
    changed: true,
    ruleNodeId: producingRuleNodeId,
    ...(guardRuleNodeId !== undefined ? { guardRuleNodeId } : {}),
    reusedHandWritten,
    ...(crossGroupWarning !== undefined ? { warning: crossGroupWarning } : {}),
  };
}

// ---------------------------------------------------------------------------
// T081 — guard synthesis (single combining mark): plan, then apply
// ---------------------------------------------------------------------------

/** True for a store this module can reuse as a guard: non-system, all `char` items, contains both a space and a digit, contains no letters (contract §6.1 — the `store(diablock)` shape). */
export function isGuardShapedStore(store: IRStore): boolean {
  if (store.isSystem) return false;
  if (store.items.length === 0) return false;
  if (!store.items.every((item) => item.kind === "char")) return false;
  const text = store.items.map((item) => (item as { kind: "char"; value: string }).value).join("");
  return /\s/u.test(text) && /[0-9]/u.test(text) && !/\p{L}/u.test(text);
}

/** First guard-shaped store in the IR, in declaration order, or `undefined` if none exists. */
export function findReusableGuardStore(ir: KeyboardIR): IRStore | undefined {
  return ir.stores.find(isGuardShapedStore);
}

export interface GuardRuleDescription {
  readonly role: "guard" | "produces";
  readonly comboLabel: "base" | "NCAPS" | "CAPS";
  readonly combo: readonly ModifierToken[];
  /** Literal `.kmn` rule text for the propose-then-confirm UI (T085). */
  readonly kmnText: string;
}

export interface GuardSynthesisPlan {
  readonly ok: true;
  readonly storeSource: "reuse" | "mint";
  readonly storeName: string;
  /** Present only when `storeSource === "mint"` — items copied from the caller-supplied repertoire, never a hardcoded literal. */
  readonly storeItems?: readonly string[];
  /** Whether the CAPS/NCAPS triple was proposed (contract §6.1 case-variant rule). */
  readonly capsHandling: boolean;
  readonly rules: readonly GuardRuleDescription[];
}

export type GuardSynthesisPlanResult = GuardSynthesisPlan | TouchRuleSynthesisBlocked;

/**
 * Propose a guard store (reuse or mint) plus the guard + producing rule(s)
 * for a single-combining-mark output on `keyId`+`combo`. Propose-then-confirm:
 * this function never mutates the IR — see {@link applyGuardSynthesis}.
 *
 * `options.repertoire` MUST be supplied by the caller from the keyboard's own
 * declared exemplars or discovered inventory when no existing guard-shaped
 * store can be reused; this module never falls back to a hardcoded ASCII set.
 */
export function planGuardSynthesis(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
  combo: readonly ModifierToken[],
  outputMark: string,
  options: { readonly repertoire?: readonly string[]; readonly opaqueAcknowledged?: boolean } = {},
): GuardSynthesisPlanResult {
  const gate = checkOpaqueGate(ruleIndex, options.opaqueAcknowledged === true);
  if (gate.blocked) {
    return { ok: false, ir, reason: "opaque-fragments-present", warning: gate.warning, opaqueFragmentCount: gate.opaqueFragmentCount };
  }

  const baseCombo = canonicalizeCombo(combo);
  const entry = entryGroupOf(ir.groups);
  const capsHandling = entry !== undefined ? keyHasCapsHandling(ir, entry.name, keyId) : false;

  const reusable = findReusableGuardStore(ir);
  let storeSource: "reuse" | "mint";
  let storeName: string;
  let storeItems: readonly string[] | undefined;

  if (reusable !== undefined) {
    storeSource = "reuse";
    storeName = reusable.name;
  } else {
    const cleaned = [...new Set((options.repertoire ?? []).filter((ch) => ch.length > 0 && !/\p{L}/u.test(ch)))];
    if (cleaned.length === 0) {
      return {
        ok: false,
        ir,
        reason: "no-repertoire",
        warning:
          "No existing guard-shaped store to reuse, and no repertoire was supplied to mint one from. " +
          "Pass the keyboard's own declared exemplars or discovered inventory — never a hardcoded ASCII set.",
        opaqueFragmentCount: gate.opaqueFragmentCount,
      };
    }
    storeSource = "mint";
    storeName = TOUCH_SYNTH_GUARD_STORE_NAME;
    storeItems = cleaned;
  }

  const comboVariants: Array<{ readonly label: "base" | "NCAPS" | "CAPS"; readonly combo: readonly ModifierToken[] }> = capsHandling
    ? [
        { label: "NCAPS", combo: canonicalizeCombo([...baseCombo, "NCAPS"]) },
        { label: "CAPS", combo: canonicalizeCombo([...baseCombo, "CAPS"]) },
      ]
    : [{ label: "base", combo: baseCombo }];

  const bracket = (c: readonly ModifierToken[]): string => comboToKeySpec(c, keyId);

  const rules: GuardRuleDescription[] = [
    { role: "guard", comboLabel: "base", combo: baseCombo, kmnText: `any(${storeName}) + ${bracket(baseCombo)} > context` },
    ...comboVariants.map((v) => ({
      role: "produces" as const,
      comboLabel: v.label,
      combo: v.combo,
      kmnText: `+ ${bracket(v.combo)} > ${toUPlusNotation(outputMark)}`,
    })),
  ];

  return {
    ok: true,
    storeSource,
    storeName,
    ...(storeItems !== undefined ? { storeItems } : {}),
    capsHandling,
    rules,
  };
}

export interface ApplyGuardSynthesisResult {
  readonly ok: boolean;
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  readonly guardRuleNodeId?: string;
  readonly producingRuleNodeIds: readonly string[];
  readonly mintedStoreName?: string;
  readonly reason?: "opaque-fragments-present" | "no-entry-group" | "plan-not-ok";
  readonly warning?: string;
}

/**
 * Apply a plan from {@link planGuardSynthesis}: mint the store if needed
 * (idempotent — skipped if a store of that name already exists), then write
 * the guard and its producing rule(s) as a contiguous block (invariant 1).
 * Semantic idempotence and the never-rewrite-hand-written rule both apply
 * per-rule, exactly as in {@link ensureTouchKeyRule}.
 */
export function applyGuardSynthesis(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  plan: GuardSynthesisPlanResult,
  keyId: string,
  outputMark: string,
  options: { readonly opaqueAcknowledged?: boolean } = {},
): ApplyGuardSynthesisResult {
  if (!plan.ok) {
    return { ok: false, ir, changed: false, producingRuleNodeIds: [], reason: "plan-not-ok", warning: plan.warning };
  }
  const gate = checkOpaqueGate(ruleIndex, options.opaqueAcknowledged === true);
  if (gate.blocked) {
    return { ok: false, ir, changed: false, producingRuleNodeIds: [], reason: "opaque-fragments-present", warning: gate.warning };
  }
  const entry = entryGroupOf(ir.groups);
  if (entry === undefined) {
    return {
      ok: false,
      ir,
      changed: false,
      producingRuleNodeIds: [],
      reason: "no-entry-group",
      warning: "No writable `using keys` group found to host a synthesized touch key rule.",
    };
  }

  let stores = ir.stores;
  let mintedStoreName: string | undefined;
  if (plan.storeSource === "mint" && !stores.some((s) => s.name === plan.storeName)) {
    const store: IRStore = {
      nodeId: synthStoreNodeId(plan.storeName),
      name: plan.storeName,
      items: (plan.storeItems ?? []).map((value) => ({ kind: "char" as const, value })),
      isSystem: false,
    };
    stores = [...stores, store];
    mintedStoreName = plan.storeName;
  }

  const guardDesc = plan.rules.find((r) => r.role === "guard");
  const producingDescs = plan.rules.filter((r) => r.role === "produces");

  let guardRuleNodeId: string | undefined;
  let guardIsNew = false;
  let guardRuleObj: IRRule | undefined;
  if (guardDesc !== undefined) {
    const existingGuard = findBinding(ruleIndex, keyId, guardDesc.combo, "guard");
    if (existingGuard !== undefined) {
      guardRuleNodeId = existingGuard.ruleNodeId;
    } else {
      guardRuleNodeId = synthRuleNodeId("guard", keyId, guardDesc.combo);
      guardRuleObj = buildGuardRule(guardRuleNodeId, keyId, guardDesc.combo, plan.storeName);
      guardIsNew = true;
    }
  }

  const producingRuleNodeIds: string[] = [];
  const newProducingRules: IRRule[] = [];
  const inPlaceUpdates = new Map<string, IRRule>();
  let anyProducingUpdated = false;

  for (const desc of producingDescs) {
    const existing = findBinding(ruleIndex, keyId, desc.combo, "produces");
    if (existing !== undefined) {
      producingRuleNodeIds.push(existing.ruleNodeId);
      if (!isGeneratedNodeId(existing.ruleNodeId)) continue;
      const located = findRuleAndGroup(ir, existing.ruleNodeId);
      const desired = outputElementsFor(outputMark);
      if (located !== undefined && !outputElementsEqual(located.rule.output, desired)) {
        inPlaceUpdates.set(existing.ruleNodeId, { ...located.rule, output: desired });
        anyProducingUpdated = true;
      }
      continue;
    }
    const nodeId = synthRuleNodeId("produce", keyId, desc.combo);
    producingRuleNodeIds.push(nodeId);
    newProducingRules.push(buildProducingRule(nodeId, keyId, desc.combo, outputMark));
  }

  const changed = mintedStoreName !== undefined || guardIsNew || newProducingRules.length > 0 || anyProducingUpdated;
  if (!changed) {
    return {
      ok: true,
      ir,
      changed: false,
      ...(guardRuleNodeId !== undefined ? { guardRuleNodeId } : {}),
      producingRuleNodeIds,
    };
  }

  let rules = entry.rules.map((r) => inPlaceUpdates.get(r.nodeId) ?? r);

  if (guardIsNew && guardRuleObj !== undefined && newProducingRules.length > 0) {
    rules = insertBlockBeforeTerminalRules(rules, [guardRuleObj, ...newProducingRules]);
  } else if (guardIsNew && guardRuleObj !== undefined) {
    rules = insertBeforeTerminalRules(rules, guardRuleObj);
  } else if (newProducingRules.length > 0) {
    if (guardRuleNodeId !== undefined) {
      const anchor = findRuleAndGroup(ir, guardRuleNodeId);
      if (anchor !== undefined && anchor.group.nodeId === entry.nodeId) {
        let after = anchor.rule;
        for (const p of newProducingRules) {
          rules = insertAfterRule(rules, after, p);
          after = p;
        }
      } else {
        rules = insertBlockBeforeTerminalRules(rules, newProducingRules);
      }
    } else {
      rules = insertBlockBeforeTerminalRules(rules, newProducingRules);
    }
  }

  const updatedEntry: IRGroup = { ...entry, rules };
  const groups = ir.groups.map((g) => (g.nodeId === entry.nodeId ? updatedEntry : g));

  return {
    ok: true,
    ir: { ...ir, stores, groups },
    changed: true,
    ...(guardRuleNodeId !== undefined ? { guardRuleNodeId } : {}),
    producingRuleNodeIds,
    ...(mintedStoreName !== undefined ? { mintedStoreName } : {}),
  };
}

// ---------------------------------------------------------------------------
// Case-triple synthesis (FR-025): plan, then apply
//
// `keyIdMinting.ts` proposes the case triple's PREVIEW text (`CaseTripleRuleLines`)
// but deliberately does not write it — that is this module's job (its own
// header says so). Kept independent on purpose: this module takes the two
// output characters and the id as plain parameters and never imports
// keyIdMinting.ts, so the two stay decoupled.
//
// A case triple is NOT the CAPS/NCAPS pair `ensureTouchKeyRule`/
// `planGuardSynthesis` build for ONE output character — it is three rules for
// TWO different output characters (lowercase under NCAPS; the uppercase
// counterpart under both SHIFT+NCAPS and CAPS), so it gets its own plan/apply
// pair rather than being folded into either of those.
// ---------------------------------------------------------------------------

export interface CaseTripleRuleDescription {
  readonly role: "produces";
  readonly comboLabel: "NCAPS" | "SHIFT+NCAPS" | "CAPS";
  readonly combo: readonly ModifierToken[];
  readonly outputText: string;
  /** Literal `.kmn` rule text for the propose-then-confirm UI (T085). */
  readonly kmnText: string;
}

export interface CaseTriplePlan {
  readonly ok: true;
  readonly rules: readonly CaseTripleRuleDescription[];
}

export type CaseTriplePlanResult = CaseTriplePlan | TouchRuleSynthesisBlocked;

/**
 * Propose the NCAPS / SHIFT+NCAPS / CAPS trio for `keyId`, producing
 * `lowerChar` under NCAPS and `upperChar` under both SHIFT+NCAPS and CAPS.
 * Gated on the SAME predicate {@link planGuardSynthesis} uses
 * (`keyHasCapsHandling`) — a case triple only means something once the
 * keyboard already treats this key's CAPS state explicitly; when it does not,
 * this returns `reason: "caps-not-handled"` rather than silently degrading to
 * a partial rule set. Never mutates the IR.
 */
export function planCaseTripleSynthesis(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
  lowerChar: string,
  upperChar: string,
  options: { readonly opaqueAcknowledged?: boolean } = {},
): CaseTriplePlanResult {
  const gate = checkOpaqueGate(ruleIndex, options.opaqueAcknowledged === true);
  if (gate.blocked) {
    return { ok: false, ir, reason: "opaque-fragments-present", warning: gate.warning, opaqueFragmentCount: gate.opaqueFragmentCount };
  }

  const entry = entryGroupOf(ir.groups);
  if (entry === undefined) {
    return {
      ok: false,
      ir,
      reason: "no-entry-group",
      warning: "No writable `using keys` group found to host a synthesized touch key rule.",
      opaqueFragmentCount: gate.opaqueFragmentCount,
    };
  }

  if (!keyHasCapsHandling(ir, entry.name, keyId)) {
    return {
      ok: false,
      ir,
      reason: "caps-not-handled",
      warning: `${keyId}'s group does not yet handle CAPS explicitly; a case triple needs CAPS/NCAPS handling already present.`,
      opaqueFragmentCount: gate.opaqueFragmentCount,
    };
  }

  const ncapsCombo = canonicalizeCombo(["NCAPS"]);
  const shiftNcapsCombo = canonicalizeCombo(["SHIFT", "NCAPS"]);
  const capsCombo = canonicalizeCombo(["CAPS"]);
  const bracket = (c: readonly ModifierToken[]): string => comboToKeySpec(c, keyId);

  const rules: CaseTripleRuleDescription[] = [
    {
      role: "produces",
      comboLabel: "NCAPS",
      combo: ncapsCombo,
      outputText: lowerChar,
      kmnText: `+ ${bracket(ncapsCombo)} > ${toUPlusNotation(lowerChar)}`,
    },
    {
      role: "produces",
      comboLabel: "SHIFT+NCAPS",
      combo: shiftNcapsCombo,
      outputText: upperChar,
      kmnText: `+ ${bracket(shiftNcapsCombo)} > ${toUPlusNotation(upperChar)}`,
    },
    {
      role: "produces",
      comboLabel: "CAPS",
      combo: capsCombo,
      outputText: upperChar,
      kmnText: `+ ${bracket(capsCombo)} > ${toUPlusNotation(upperChar)}`,
    },
  ];

  return { ok: true, rules };
}

export interface ApplyCaseTripleSynthesisResult {
  readonly ok: boolean;
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  readonly producingRuleNodeIds: readonly string[];
  readonly reason?: "opaque-fragments-present" | "no-entry-group" | "plan-not-ok";
  readonly warning?: string;
}

/**
 * Apply a plan from {@link planCaseTripleSynthesis}. The three rules are
 * inserted together as a single CONTIGUOUS ordered block (NCAPS, SHIFT+NCAPS,
 * CAPS) via {@link insertBlockBeforeTerminalRules} — the trio is a unit, not
 * three independent inserts. Semantic idempotence and the never-rewrite-
 * hand-written rule both apply per-rule via the join, exactly as in
 * {@link ensureTouchKeyRule}/{@link applyGuardSynthesis}: a rule already
 * satisfying (normalized id, canonical combo, role) is left alone (hand-
 * written) or rewritten in place only if its content differs (ours).
 */
export function applyCaseTripleSynthesis(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  plan: CaseTriplePlanResult,
  keyId: string,
  options: { readonly opaqueAcknowledged?: boolean } = {},
): ApplyCaseTripleSynthesisResult {
  if (!plan.ok) {
    return { ok: false, ir, changed: false, producingRuleNodeIds: [], reason: "plan-not-ok", warning: plan.warning };
  }
  const gate = checkOpaqueGate(ruleIndex, options.opaqueAcknowledged === true);
  if (gate.blocked) {
    return { ok: false, ir, changed: false, producingRuleNodeIds: [], reason: "opaque-fragments-present", warning: gate.warning };
  }
  const entry = entryGroupOf(ir.groups);
  if (entry === undefined) {
    return {
      ok: false,
      ir,
      changed: false,
      producingRuleNodeIds: [],
      reason: "no-entry-group",
      warning: "No writable `using keys` group found to host a synthesized touch key rule.",
    };
  }

  const producingRuleNodeIds: string[] = [];
  const newRules: IRRule[] = [];
  const inPlaceUpdates = new Map<string, IRRule>();
  let anyUpdated = false;

  for (const desc of plan.rules) {
    const existing = findBinding(ruleIndex, keyId, desc.combo, "produces");
    if (existing !== undefined) {
      producingRuleNodeIds.push(existing.ruleNodeId);
      if (!isGeneratedNodeId(existing.ruleNodeId)) continue;
      const located = findRuleAndGroup(ir, existing.ruleNodeId);
      const desired = outputElementsFor(desc.outputText);
      if (located !== undefined && !outputElementsEqual(located.rule.output, desired)) {
        inPlaceUpdates.set(existing.ruleNodeId, { ...located.rule, output: desired });
        anyUpdated = true;
      }
      continue;
    }
    const nodeId = synthRuleNodeId("produce", keyId, desc.combo);
    producingRuleNodeIds.push(nodeId);
    newRules.push(buildProducingRule(nodeId, keyId, desc.combo, desc.outputText));
  }

  const changed = newRules.length > 0 || anyUpdated;
  if (!changed) {
    return { ok: true, ir, changed: false, producingRuleNodeIds };
  }

  let rules = entry.rules.map((r) => inPlaceUpdates.get(r.nodeId) ?? r);
  if (newRules.length > 0) {
    rules = insertBlockBeforeTerminalRules(rules, newRules);
  }

  const updatedEntry: IRGroup = { ...entry, rules };
  const groups = ir.groups.map((g) => (g.nodeId === entry.nodeId ? updatedEntry : g));

  return { ok: true, ir: { ...ir, groups }, changed: true, producingRuleNodeIds };
}

// ---------------------------------------------------------------------------
// T080 — remove (low-level: generated rules only, ever)
// ---------------------------------------------------------------------------

export interface RemoveTouchKeyRuleResult {
  readonly ok: true;
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  readonly removedRuleNodeIds: readonly string[];
  readonly removedStoreNames: readonly string[];
  readonly keptHandWrittenRuleNodeIds: readonly string[];
}

function isStoreReferencedAnywhere(ir: KeyboardIR, storeName: string): boolean {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if ((el.kind === "any" || el.kind === "notany" || el.kind === "index") && el.storeRef === storeName) return true;
      }
      for (const el of rule.output) {
        if ((el.kind === "index" || el.kind === "outs") && el.storeRef === storeName) return true;
      }
    }
  }
  return false;
}

/**
 * Remove every GENERATED (`gen-touch-*`) binding for `keyId` — guard and
 * producing alike — plus its guard store if that store is now unreferenced
 * and is itself one we generated (`generated_touch_*`). Hand-written or
 * imported bindings for the same id are left untouched (invariant 4) and
 * reported in `keptHandWrittenRuleNodeIds` so the caller can surface them via
 * the orphan-rule check rather than deleting them.
 */
export function removeTouchKeyRule(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
): RemoveTouchKeyRuleResult {
  const bindings = bindingsForKeyId(ruleIndex, keyId);
  const toRemove = bindings.filter((b) => isGeneratedNodeId(b.ruleNodeId));
  const keptHandWrittenRuleNodeIds = bindings
    .filter((b) => !isGeneratedNodeId(b.ruleNodeId))
    .map((b) => b.ruleNodeId);

  if (toRemove.length === 0) {
    return { ok: true, ir, changed: false, removedRuleNodeIds: [], removedStoreNames: [], keptHandWrittenRuleNodeIds };
  }

  const removeNodeIds = new Set(toRemove.map((b) => b.ruleNodeId));
  const touchedStoreNames = new Set<string>();
  for (const b of toRemove) for (const ref of b.storeRefs ?? []) touchedStoreNames.add(ref);

  const groups = ir.groups.map((g) => ({
    ...g,
    rules: g.rules.filter((r) => !removeNodeIds.has(r.nodeId)),
  }));

  const afterRemoval: KeyboardIR = { ...ir, groups };
  const removedStoreNames: string[] = [];
  let stores = ir.stores;
  for (const storeName of touchedStoreNames) {
    if (!storeName.startsWith(TOUCH_SYNTH_STORE_NAME_PREFIX)) continue;
    if (isStoreReferencedAnywhere(afterRemoval, storeName)) continue;
    stores = stores.filter((s) => s.name !== storeName);
    removedStoreNames.push(storeName);
  }

  return {
    ok: true,
    ir: { ...afterRemoval, stores },
    changed: true,
    removedRuleNodeIds: [...removeNodeIds],
    removedStoreNames,
    keptHandWrittenRuleNodeIds,
  };
}

// ---------------------------------------------------------------------------
// T083 — delete must not cascade silently: propose, then apply
// ---------------------------------------------------------------------------

function collectAllTouchKeyIds(touchLayout: TouchLayoutIR): Set<string> {
  const ids = new Set<string>();
  const visit = (key: TouchKeyIR): void => {
    ids.add(normalizeTouchKeyId(key.id));
    for (const sub of key.sk ?? []) visit(sub);
    for (const tap of key.multitap ?? []) visit(tap);
    if (key.flick !== undefined) {
      for (const dir of Object.values(key.flick)) {
        if (dir !== undefined) visit(dir);
      }
    }
  };
  for (const platform of touchLayout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key);
      }
    }
  }
  return ids;
}

export interface KeyDeletionRuleRemovalPlan {
  /** True when `keyId` is still carried by at least one key of at least one layer of at least one platform. */
  readonly stillPresentElsewhere: boolean;
  /** True only when `stillPresentElsewhere` is false AND at least one generated binding exists to remove. */
  readonly proposeRemoval: boolean;
  readonly generatedRuleNodeIds: readonly string[];
  readonly handWrittenRuleNodeIds: readonly string[];
  readonly warning?: string;
}

/**
 * Recompute `keyId`'s presence across EVERY layer of EVERY platform
 * (including `sk`/`multitap`/`flick`) before proposing anything (invariant 4).
 * When the id is still carried anywhere, nothing is proposed — a `T_` id
 * legitimately appears on several layers/platforms and one deleted key must
 * not cascade into removing rules another surviving key still relies on.
 */
export function planKeyDeletionRuleRemoval(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  keyId: string,
): KeyDeletionRuleRemovalPlan {
  const stillPresentElsewhere =
    ir.touchLayout !== undefined && collectAllTouchKeyIds(ir.touchLayout).has(normalizeTouchKeyId(keyId));

  if (stillPresentElsewhere) {
    return { stillPresentElsewhere: true, proposeRemoval: false, generatedRuleNodeIds: [], handWrittenRuleNodeIds: [] };
  }

  const bindings = bindingsForKeyId(ruleIndex, keyId);
  const generatedRuleNodeIds = bindings.filter((b) => isGeneratedNodeId(b.ruleNodeId)).map((b) => b.ruleNodeId);
  const handWrittenRuleNodeIds = bindings.filter((b) => !isGeneratedNodeId(b.ruleNodeId)).map((b) => b.ruleNodeId);

  return {
    stillPresentElsewhere: false,
    proposeRemoval: generatedRuleNodeIds.length > 0,
    generatedRuleNodeIds,
    handWrittenRuleNodeIds,
    ...(handWrittenRuleNodeIds.length > 0
      ? {
          warning:
            `${keyId} is no longer carried by any key, but ${handWrittenRuleNodeIds.length} hand-written or ` +
            "imported rule(s) still reference it. Left untouched for the orphan-rule check to report.",
        }
      : {}),
  };
}

/** Apply {@link planKeyDeletionRuleRemoval}'s decision. A no-op (never a call to {@link removeTouchKeyRule}) when `plan.proposeRemoval` is false. */
export function applyKeyDeletionRuleRemoval(
  ir: KeyboardIR,
  ruleIndex: TouchKeyRuleIndex,
  plan: KeyDeletionRuleRemovalPlan,
  keyId: string,
): RemoveTouchKeyRuleResult {
  if (!plan.proposeRemoval) {
    return {
      ok: true,
      ir,
      changed: false,
      removedRuleNodeIds: [],
      removedStoreNames: [],
      keptHandWrittenRuleNodeIds: plan.handWrittenRuleNodeIds,
    };
  }
  return removeTouchKeyRule(ir, ruleIndex, keyId);
}

// ---------------------------------------------------------------------------
// T080 — rename (the .kmn half; layout/nodeIds/overlay half is the caller's, T091)
// ---------------------------------------------------------------------------

export interface RenameTouchKeyRuleResult {
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  readonly renamedRuleNodeIds: readonly string[];
}

/**
 * Rewrite the vkey name on every binding for `fromKeyId` — guard and
 * producing alike, in any group, any role — to `toKeyId`. Matches
 * case-insensitively (the same normalization the join itself uses), so a
 * binding spelled with different case than `fromKeyId` is still caught. Not
 * gated on opaque fragments: this only ever touches rules the join can already
 * see (see module doc, invariant 3). Reports every touched rule nodeId so the
 * caller can perform the layout id / `touchLayout.nodeIds` / deletion-overlay
 * half of the rename.
 */
export function renameTouchKeyRule(ir: KeyboardIR, fromKeyId: string, toKeyId: string): RenameTouchKeyRuleResult {
  const target = normalizeTouchKeyId(fromKeyId);
  const renamedRuleNodeIds: string[] = [];

  const groups = ir.groups.map((group) => {
    let groupChanged = false;
    const rules = group.rules.map((rule) => {
      let ruleChanged = false;
      const context = rule.context.map((el) => {
        if (el.kind === "vkey" && normalizeTouchKeyId(el.name) === target) {
          ruleChanged = true;
          return { ...el, name: toKeyId };
        }
        return el;
      });
      if (!ruleChanged) return rule;
      groupChanged = true;
      renamedRuleNodeIds.push(rule.nodeId);
      return { ...rule, context };
    });
    return groupChanged ? { ...group, rules } : group;
  });

  if (renamedRuleNodeIds.length === 0) {
    return { ir, changed: false, renamedRuleNodeIds: [] };
  }
  return { ir: { ...ir, groups }, changed: true, renamedRuleNodeIds };
}

// ---------------------------------------------------------------------------
// T091 — the COMPLETE rename: rules (above) + layout key id (every layer and
// platform, `sk`/`multitap`/`flick` alike) + `touchLayout.nodeIds` entries,
// as ONE atomic operation (key-id-policy.md §4; touch-key-rule-join.md §6.1's
// final bullet). The studio's deletion-overlay remap is NOT done here — only
// the store can reach `deletedTouchKeyIds`; see workingCopyStore.ts's
// `commitTouchKeyRename`, which consumes `renamedAddresses` below for exactly
// that, riding the store's EXISTING delete/restore actions.
// ---------------------------------------------------------------------------

export interface RenameTouchKeyResult {
  readonly ir: KeyboardIR;
  readonly changed: boolean;
  /**
   * Every `.kmn` rule nodeId whose vkey binding was rewritten (guard and
   * producing alike) — {@link renameTouchKeyRule}'s own result, passed
   * through unchanged.
   */
  readonly renamedRuleNodeIds: readonly string[];
  /**
   * Old -> new `touchKeyAddress.ts`-format address, one pair per
   * `touchLayout.nodeIds` entry whose embedded id matched `fromKeyId` (main
   * key or `sk` sub-entry — the only two kinds `parseTouchLayoutString` ever
   * indexes). The caller (workingCopyStore.ts's `commitTouchKeyRename`) uses
   * this to remap any matching `deletedTouchKeyIds` address, and it is also
   * exactly what an address-matched provenance promotion
   * (`promoteKeyAtAddressToHandSet`, spec 063 T059) needs — never an
   * id-matched path (key-id-policy.md §4's second named failure mode).
   */
  readonly renamedAddresses: readonly { readonly oldAddress: string; readonly newAddress: string }[];
}

/** True when `id` normalizes to the same id as the already-normalized `target`. */
function idMatchesTarget(id: string, target: string): boolean {
  return normalizeTouchKeyId(id) === target;
}

/**
 * Whether any key — main, or nested at any depth in `sk` / `multitap` /
 * `flick` — anywhere in `touchLayout` carries `target`. `flick` is walked as
 * the OBJECT it is (`Object.values`), never a `forEach`-over-array — see
 * {@link renameKeyIdEverywhere}'s doc for why that distinction is the whole
 * point.
 */
function touchLayoutCarriesKeyId(touchLayout: TouchLayoutIR, target: string): boolean {
  const keyOrDescendantMatches = (key: TouchKeyIR): boolean => {
    if (idMatchesTarget(key.id, target)) return true;
    if ((key.sk ?? []).some(keyOrDescendantMatches)) return true;
    if ((key.multitap ?? []).some(keyOrDescendantMatches)) return true;
    if (key.flick !== undefined) {
      for (const sub of Object.values(key.flick)) {
        if (sub !== undefined && keyOrDescendantMatches(sub)) return true;
      }
    }
    return false;
  };
  return touchLayout.platforms.some((platform) =>
    platform.layers.some((layer) => layer.rows.some((row) => row.keys.some(keyOrDescendantMatches))),
  );
}

/**
 * Rename `key.id` to `toKeyId` wherever it matches `target`, recursing into
 * `sk` / `multitap` / `flick` alike. Only ever called once
 * {@link touchLayoutCarriesKeyId} has confirmed a match exists somewhere in
 * the layout, so this always allocates fresh objects top to bottom — no
 * structural-sharing short-circuit is needed at this level (the caller,
 * {@link renameTouchLayoutKeyIds}, is where that short-circuit lives).
 *
 * `flick` is a `Partial<Record<direction, TouchKeyIR>>` OBJECT, not an array.
 * Keyman Developer's own layer-rename fix-up iterates it with `forEach`
 * anyway and silently misses every flick sub-key (key-id-policy.md §4's
 * first named failure mode) — walked here with `Object.keys` instead, the
 * same discipline `keyGridViewModel.ts` and `useKeyEditGuards.ts` already use
 * for the identical reason.
 */
function renameKeyIdEverywhere(key: TouchKeyIR, target: string, toKeyId: string): TouchKeyIR {
  const sk = key.sk?.map((sub) => renameKeyIdEverywhere(sub, target, toKeyId));
  const multitap = key.multitap?.map((sub) => renameKeyIdEverywhere(sub, target, toKeyId));
  let flick: NonNullable<TouchKeyIR["flick"]> | undefined;
  if (key.flick !== undefined) {
    const nextFlick: NonNullable<TouchKeyIR["flick"]> = {};
    for (const direction of Object.keys(key.flick) as Array<keyof NonNullable<TouchKeyIR["flick"]>>) {
      const sub = key.flick[direction];
      if (sub !== undefined) nextFlick[direction] = renameKeyIdEverywhere(sub, target, toKeyId);
    }
    flick = nextFlick;
  }
  return {
    ...key,
    id: idMatchesTarget(key.id, target) ? toKeyId : key.id,
    ...(sk !== undefined ? { sk } : {}),
    ...(multitap !== undefined ? { multitap } : {}),
    ...(flick !== undefined ? { flick } : {}),
  };
}

/**
 * Rename every layout-key occurrence of `fromKeyId` to `toKeyId`, across
 * every platform and layer of `touchLayout`. Structural-sharing
 * short-circuit: returns `touchLayout` UNCHANGED (the same reference) when
 * nothing matches, matching this module's existing convention elsewhere.
 */
function renameTouchLayoutKeyIds(
  touchLayout: TouchLayoutIR,
  fromKeyId: string,
  toKeyId: string,
): { readonly touchLayout: TouchLayoutIR; readonly changed: boolean } {
  const target = normalizeTouchKeyId(fromKeyId);
  if (!touchLayoutCarriesKeyId(touchLayout, target)) {
    return { touchLayout, changed: false };
  }
  const platforms = touchLayout.platforms.map((platform) => ({
    ...platform,
    layers: platform.layers.map((layer) => ({
      ...layer,
      rows: layer.rows.map((row) => ({
        keys: row.keys.map((key) => renameKeyIdEverywhere(key, target, toKeyId)),
      })),
    })),
  }));
  return { touchLayout: { ...touchLayout, platforms }, changed: true };
}

/**
 * Rewrite every `touchLayout.nodeIds` entry whose embedded main-key id or
 * `sk` sub-id (the only two kinds `parseTouchLayoutString` ever indexes)
 * matches `fromKeyId`, to `toKeyId`. Never throws on a malformed entry (the
 * same never-throw convention `parseTouchKeyAddress` itself documents) — such
 * an entry is left untouched rather than raising.
 */
function renameNodeIdEntries(
  nodeIds: readonly (readonly [string, IRNodeRef])[],
  fromKeyId: string,
  toKeyId: string,
): {
  readonly nodeIds: Array<[string, IRNodeRef]>;
  readonly renamedAddresses: readonly { readonly oldAddress: string; readonly newAddress: string }[];
} {
  const target = normalizeTouchKeyId(fromKeyId);
  const renamedAddresses: { oldAddress: string; newAddress: string }[] = [];

  const next: Array<[string, IRNodeRef]> = nodeIds.map((entry) => {
    const [address, ref] = entry;
    const parts = parseTouchKeyAddress(address);
    if (parts === undefined) return [address, ref];

    const mainMatches = idMatchesTarget(parts.keyId, target);
    const subMatches = parts.sub !== undefined && idMatchesTarget(parts.sub.id, target);
    if (!mainMatches && !subMatches) return [address, ref];

    const newKeyId = mainMatches ? toKeyId : parts.keyId;
    let newAddress: string;
    if (parts.sub === undefined) {
      newAddress = touchKeyAddress(parts.platform, parts.layerId, newKeyId);
    } else {
      const sub = parts.sub;
      const newSubId = subMatches ? toKeyId : sub.id;
      newAddress =
        sub.kind === "flick"
          ? touchFlickAddress(parts.platform, parts.layerId, newKeyId, newSubId)
          : touchSubKeyAddress(parts.platform, parts.layerId, newKeyId, sub.kind, newSubId);
    }

    renamedAddresses.push({ oldAddress: address, newAddress });
    return [newAddress, ref];
  });

  return { nodeIds: next, renamedAddresses };
}

/**
 * The complete rename operation (spec 063 T091). One call rewrites every
 * `.kmn` binding for `fromKeyId` (guard and producing alike, via
 * {@link renameTouchKeyRule}), the layout key id itself on every layer and
 * platform (including `sk`/`multitap`/`flick`), and the `touchLayout.nodeIds`
 * entries that embed it — bundled into ONE returned `KeyboardIR`, so a
 * partial rename (some surfaces updated, others not) can never leak out to a
 * caller. The deletion-overlay remap is deliberately NOT performed here (only
 * the store can reach `deletedTouchKeyIds`) — see workingCopyStore.ts's
 * `commitTouchKeyRename`.
 *
 * Never throws. Not gated on opaque fragments — mirrors
 * {@link renameTouchKeyRule} (module doc, invariant 3): rename only ever
 * touches bindings and layout content the join can already see. A no-op
 * (`changed: false`, `ir` reference-equal to the input) when `fromKeyId`
 * matches nothing anywhere — rules, layout, or node-id map alike.
 */
export function renameTouchKey(ir: KeyboardIR, fromKeyId: string, toKeyId: string): RenameTouchKeyResult {
  const ruleResult = renameTouchKeyRule(ir, fromKeyId, toKeyId);

  if (ruleResult.ir.touchLayout === undefined) {
    return {
      ir: ruleResult.ir,
      changed: ruleResult.changed,
      renamedRuleNodeIds: ruleResult.renamedRuleNodeIds,
      renamedAddresses: [],
    };
  }

  const { touchLayout: renamedLayout, changed: layoutChanged } = renameTouchLayoutKeyIds(
    ruleResult.ir.touchLayout,
    fromKeyId,
    toKeyId,
  );
  const { nodeIds, renamedAddresses } = renameNodeIdEntries(
    ruleResult.ir.touchLayout.nodeIds,
    fromKeyId,
    toKeyId,
  );

  const changed = ruleResult.changed || layoutChanged || renamedAddresses.length > 0;
  if (!changed) {
    return {
      ir: ruleResult.ir,
      changed: false,
      renamedRuleNodeIds: ruleResult.renamedRuleNodeIds,
      renamedAddresses: [],
    };
  }

  return {
    ir: { ...ruleResult.ir, touchLayout: { ...renamedLayout, nodeIds } },
    changed: true,
    renamedRuleNodeIds: ruleResult.renamedRuleNodeIds,
    renamedAddresses,
  };
}
