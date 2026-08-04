/**
 * touch-key-rule-join — the canonical join between a touch layout's keys and the
 * `.kmn` rules keyed on them (spec 058 FR-001…FR-004,
 * [contracts/touch-key-rule-join.md](../../../specs/058-touch-key-editor/contracts/touch-key-rule-join.md)).
 *
 * ## Why this primitive exists
 *
 * A `T_XXXX` touch key has no intrinsic output. It produces only via a `.kmn`
 * rule keyed on it. The repo's two producibility calculations each know one half
 * of that relation and never meet, so one over-credits and the other
 * under-credits the same keyboard:
 *
 *   - `buildProducedSet` walks rules and credits everything they emit — including
 *     a rule keyed on an id no key carries, which nothing can actually type.
 *   - `computeTouchCoverage` walks the layout and credits keycaps and `U_` ids —
 *     so a `T_0300` key labelled `◌̀`, whose output lives entirely in a rule,
 *     reads as producing nothing.
 *
 * This module is the missing relation. It is deliberately a *primitive*: it
 * classifies and indexes, and takes no position on what any consumer should do
 * with the result. The per-consumer view assignments are normative and live in
 * §4.4 of the contract and in `ir/reachableProducedSet.ts`'s header.
 *
 * ## Why it lives in contracts
 *
 * Placement is forced, not stylistic: `@keymanapp/keyboard-lint` must use this
 * and cannot import engine (dependency-cruiser's `lint-not-to-engine` rule, spec
 * §10). `buildProducedSet` and `computeTouchCoverage` set the same precedent.
 * Consequences of that placement, both deliberate:
 *
 *   - **Modifiers are returned RAW, not canonical.** The modifier-combo
 *     vocabulary (chirality unification, the NCAPS case-pair fold) lives in
 *     engine. Duplicating it here would create a second source of truth for a
 *     convention that has already gone stale once. Engine callers canonicalize
 *     themselves; see {@link TouchKeyRuleBinding.modifiers}.
 *   - Production is collected **only** through `collectFromElements`, the walk
 *     `buildProducedSet` itself uses, so store expansion, NFC run-merging, and
 *     the control-character filters cannot drift between the two.
 *
 * Pure, browser-safe, no I/O.
 */

import type {
  ContextElement,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
} from "./keyboard-ir.js";
import { collectFromElements } from "./ir/producedSet.js";
import { isPlusSeparator } from "./rule-shape.js";

// ---------------------------------------------------------------------------
// Ids and normalization
// ---------------------------------------------------------------------------

/** Upper-cased key id — the kmcmplib interning/lookup key. */
export type NormalizedTouchKeyId = string;

/**
 * Normalize a key id for joining: upper-case.
 *
 * This matches what the compiler does, which is the whole point — the join must
 * find the rule the compiler will find. The case-insensitivity has two distinct
 * sources depending on the id kind, and only one is VKDictionary interning:
 *
 *   - an unknown/custom name (`T_…`, `U_…`) is interned into the VKDictionary
 *     case-insensitively (`Compiler.cpp`'s `GetVKCode`/`BuildVKDictionary`);
 *   - a `K_` name resolves instead against a compiled-in keyword table
 *     (`VKeyNames` / `KeymanWebTouchStandardKeyNames` / `KMWAdditionalKeyNames`).
 *
 * Upper-casing is correct for both. The attribution is recorded because anyone
 * reading the compiler source for where a `K_` id resolves will not find it in
 * the interning path.
 *
 * Every as-written spelling is retained separately (see
 * {@link TouchKeyRuleIndex.spellings}), because a key whose layout id and rule id
 * differ only by case JOINS here — correct for our arithmetic — while remaining
 * REPORTABLE, since Keyman Developer's validator compares case-sensitively and
 * warns on a file our compile accepts. That asymmetry is the entire reason the
 * case hint exists.
 */
export function normalizeTouchKeyId(id: string): NormalizedTouchKeyId {
  return id.toUpperCase();
}

/** Id prefixes this join indexes. `K_` inclusion is deliberate — see below. */
const INDEXED_PREFIXES = ["T_", "U_", "K_"] as const;

/**
 * True when an id is in scope for the join.
 *
 * All three prefixes by default. Including `K_` is the larger win and not an
 * afterthought: `sil_cameroon_qwerty.kmn` carries `+ [K_QUOTE] > U+0300` under a
 * `◌̀` keycap — the *identical* under-credit shape as `T_0300`, and equally
 * invisible today. One join fixes both classes.
 */
export function isJoinableKeyId(id: string): boolean {
  const upper = normalizeTouchKeyId(id);
  return INDEXED_PREFIXES.some((p) => upper.startsWith(p));
}

/** True for a custom (non-`K_`) key id — the 0x092-parity dead-key scope. */
export function isCustomTouchKeyId(id: string): boolean {
  const upper = normalizeTouchKeyId(id);
  return upper.startsWith("T_") || upper.startsWith("U_");
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * What a rule keyed on a touch key actually does.
 *
 * Only `produces` credits production. The other four all mean "this key is
 * WIRED" — which is a different and equally important fact, because it is what
 * keeps `+ [T_CAM] > nul` from being reported as a dead key.
 */
export type TouchKeyRuleRole =
  /** Emits characters. */
  | "produces"
  /** `> context` — re-emits the pre-context; produces NOTHING. */
  | "guard"
  /** `> nul`, or an empty output. */
  | "suppresses"
  /** Only useGroup / deadkey / beep — wired, produces nothing. */
  | "transitions"
  /** Unclassifiable raw output — wired, production unknown. */
  | "opaque";

/**
 * `context`, `context(1)`, and `context(N)` for N ≥ 2.
 *
 * The `context(N)` offset re-emit form re-emits context exactly as the bare
 * spelling does and produces nothing, so it classifies as a guard rather than
 * falling through to `opaque`. It must be recognized as *text distinct from* the
 * bare spelling — not as a numeric variant the classifier fails to parse, which
 * is what would silently demote Cameroon-style guards to opaque and take the
 * dead-key check's downgrade path with them.
 */
const CONTEXT_RE = /^context(?:\(\s*\d+\s*\))?$/i;

/** `nul` — the explicit suppression output. */
const NUL_RE = /^nul$/i;

/**
 * Classify a rule's output into a role. Evaluated in a FIXED order; the order is
 * the specification, not an implementation detail.
 *
 *   1. empty output, or a lone `nul`            → suppresses
 *   2. a lone `context` / `context(N)`          → guard
 *   3. every element is useGroup/deadkey/beep   → transitions
 *   4. any remaining raw element                → opaque
 *   5. otherwise                                → produces
 *
 * This is what makes Cameroon's guard-first idiom correct WITHOUT special-casing
 * the store name:
 *
 *     any(diablock) + [T_0300] > context     → guard,    produces nothing
 *     + [T_0300] > U+0300                    → produces, U+0300
 */
export function classifyTouchRuleRole(output: readonly { kind: string; text?: string }[]): TouchKeyRuleRole {
  if (output.length === 0) return "suppresses";

  if (output.length === 1) {
    const only = output[0];
    if (only?.kind === "raw") {
      const text = only.text?.trim() ?? "";
      if (NUL_RE.test(text)) return "suppresses";
      if (CONTEXT_RE.test(text)) return "guard";
    }
  }

  const allWiring = output.every(
    (el) => el.kind === "useGroup" || el.kind === "deadkey" || el.kind === "beep",
  );
  if (allWiring) return "transitions";

  if (output.some((el) => el.kind === "raw")) return "opaque";

  return "produces";
}

// ---------------------------------------------------------------------------
// Bindings and the index
// ---------------------------------------------------------------------------

export interface TouchKeyRuleBinding {
  readonly ruleNodeId: string;
  readonly groupName: string;
  readonly usingKeys: boolean;
  /** Id exactly as spelled in the `.kmn` (case preserved) — feeds the case diagnostic. */
  readonly keyIdAsWritten: string;
  /**
   * Modifier words from the vkey element: uppercased, deduped, sorted.
   *
   * **NOT chirality-unified and NOT narrowed to `ModifierToken`.** The canonical
   * combo vocabulary lives in engine, which contracts cannot import (see the
   * module doc). Callers that need canonical combos must canonicalize these
   * themselves. If canonical combos are ever needed *inside* contracts, the clean
   * fix is a pure move of the combo module into contracts, re-exported from its
   * engine home — a separate mechanical change, not something to approximate here.
   */
  readonly modifiers: readonly string[];
  readonly role: TouchKeyRuleRole;
  /** NFC, one JS char per entry. Non-empty only when `role === "produces"`. */
  readonly produced: readonly string[];
  /**
   * Verbatim leading char-run, unsplit: `T_FCFA` → `"FCFA"`.
   *
   * Absent when the output is store-driven, because a store-driven key has no
   * single keycap string — and the coverage consumer needs to KNOW that rather
   * than guess at one. Computed separately from `produced` for exactly that
   * reason: `produced` is the per-codepoint set (store-expanded, run-merged),
   * this is the literal text a keycap could show.
   */
  readonly producedText?: string;
  /** True when the context carries pre-context beyond the struck key. */
  readonly contextGuarded: boolean;
  /** Stores this rule reads from, in first-seen order. */
  readonly storeRefs?: readonly string[];
}

export interface TouchKeyRuleIndex {
  /** Every binding, grouped by normalized struck-key id. */
  readonly byId: ReadonlyMap<NormalizedTouchKeyId, readonly TouchKeyRuleBinding[]>;
  /** Every as-written spelling seen for each normalized id, in first-seen order. */
  readonly spellings: ReadonlyMap<NormalizedTouchKeyId, readonly string[]>;
  /** Ids with at least one `produces` binding. */
  readonly producingIds: ReadonlySet<NormalizedTouchKeyId>;
  /**
   * `ir.raw.length`.
   *
   * Consumers MUST degrade when this is above zero: an opaque fragment can hold a
   * rule for any key, so the join cannot prove a key is unwired or that an
   * equivalent rule does not already exist. Whole-IR scope, not per-group —
   * finer scoping is not attempted because a fragment's group attribution is
   * precisely the information the codec failed to recover when it fell back to
   * `RawKmnFragment` in the first place.
   */
  readonly opaqueFragmentCount: number;
}

export interface BuildTouchKeyRuleIndexOptions {
  /** Include U+0020 in `produced`. Default false, matching `buildProducedSet`. */
  readonly includeSpace?: boolean;
  /** Index only `T_`/`U_` ids, skipping `K_`. For the 0x092-parity dead-key check. */
  readonly customIdsOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Struck-key resolution
// ---------------------------------------------------------------------------

/**
 * The vkey element a rule is keyed on: the FIRST `{kind:"vkey"}` in the context,
 * after filtering plus-separators. Rules with no vkey element are not indexed.
 *
 * The plus-separator filter is not optional. The codec inserts a synthetic
 * `{kind:"raw", text:"+"}` element to mark where pre-context ends and the matched
 * keystroke begins, so a Cameroon-style `any(diablock) + [T_0300] > context`
 * carries three context elements, and a scan that did not filter would still find
 * the vkey here — but a rule written with the `+` in other positions would not.
 * This is deliberately a stronger rule than the engine's private
 * `extractRuleVkey`, which does not filter separators.
 */
function resolveStruckVkey(
  context: readonly ContextElement[],
): { name: string; modifiers: readonly string[] } | undefined {
  for (const el of context) {
    if (isPlusSeparator(el)) continue;
    if (el.kind === "vkey") return { name: el.name, modifiers: el.modifiers };
  }
  return undefined;
}

/** Normalize a vkey element's modifier words: uppercase, dedupe, sort. */
function normalizeModifiers(modifiers: readonly string[]): readonly string[] {
  return [...new Set(modifiers.map((m) => m.trim().toUpperCase()).filter((m) => m.length > 0))].sort();
}

/**
 * True when the context carries meaning beyond the struck key itself — i.e. the
 * rule only fires in a particular preceding context.
 */
function hasPreContext(context: readonly ContextElement[], struckIndex: number): boolean {
  return context.some((el, i) => {
    if (i === struckIndex) return false;
    if (isPlusSeparator(el)) return false;
    return true;
  });
}

function indexOfStruckVkey(context: readonly ContextElement[]): number {
  for (let i = 0; i < context.length; i++) {
    const el = context[i];
    if (el === undefined || isPlusSeparator(el)) continue;
    if (el.kind === "vkey") return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/**
 * The leading run of literal `char` output elements, concatenated verbatim.
 *
 * `undefined` when the output leads with anything else — most importantly when it
 * is store-driven (`index()` / `outs()`), where there is no single keycap string
 * to show.
 */
function leadingCharRun(output: IRRule["output"]): string | undefined {
  let text = "";
  for (const el of output) {
    if (el.kind !== "char") break;
    text += el.value;
  }
  return text.length > 0 ? text : undefined;
}

function collectStoreRefs(rule: IRRule): readonly string[] | undefined {
  const refs: string[] = [];
  const push = (ref: string) => {
    if (!refs.includes(ref)) refs.push(ref);
  };
  for (const el of rule.context) {
    if (el.kind === "any" || el.kind === "notany" || el.kind === "index") push(el.storeRef);
  }
  for (const el of rule.output) {
    if (el.kind === "index" || el.kind === "outs") push(el.storeRef);
  }
  return refs.length > 0 ? refs : undefined;
}

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

/**
 * Build the touch key ↔ rule index for a keyboard.
 *
 * One pass over every rule of every group. Rules whose struck key is out of scope
 * (no vkey, or an id outside the indexed prefixes) are skipped silently — this is
 * an index, not a validator.
 *
 * Opaque fragments are NOT walked for bindings: a fragment by definition has no
 * recoverable struck key. Their existence is reported through
 * {@link TouchKeyRuleIndex.opaqueFragmentCount} so every consumer can degrade
 * instead of trusting an index that cannot see inside them.
 */
export function buildTouchKeyRuleIndex(
  ir: KeyboardIR,
  options: BuildTouchKeyRuleIndexOptions = {},
): TouchKeyRuleIndex {
  const includeSpace = options.includeSpace === true;
  const customIdsOnly = options.customIdsOnly === true;

  const storeMap = new Map<string, IRStore>(ir.stores.map((s) => [s.name, s]));

  const byId = new Map<NormalizedTouchKeyId, TouchKeyRuleBinding[]>();
  const spellings = new Map<NormalizedTouchKeyId, string[]>();
  const producingIds = new Set<NormalizedTouchKeyId>();

  const inScope = (id: string): boolean =>
    customIdsOnly ? isCustomTouchKeyId(id) : isJoinableKeyId(id);

  for (const group of ir.groups as readonly IRGroup[]) {
    for (const rule of group.rules) {
      const struck = resolveStruckVkey(rule.context);
      if (struck === undefined) continue;
      if (!inScope(struck.name)) continue;

      const normalized = normalizeTouchKeyId(struck.name);
      const role = classifyTouchRuleRole(rule.output);

      // Production is collected ONLY through the shared walk, with a fresh
      // collector per binding — which is precisely why `collectFromElements` is
      // exported. Anything else would fork store expansion, NFC run-merging, and
      // the control-character filters away from `buildProducedSet`.
      let produced: readonly string[] = [];
      if (role === "produces") {
        const collector = new Set<string>();
        collectFromElements(rule.output, storeMap, collector, includeSpace);
        produced = [...collector];
        if (produced.length > 0) producingIds.add(normalized);
      }

      const struckIndex = indexOfStruckVkey(rule.context);
      const producedText = role === "produces" ? leadingCharRun(rule.output) : undefined;
      const storeRefs = collectStoreRefs(rule);

      const binding: TouchKeyRuleBinding = {
        ruleNodeId: rule.nodeId,
        groupName: group.name,
        usingKeys: group.usingKeys,
        keyIdAsWritten: struck.name,
        modifiers: normalizeModifiers(struck.modifiers),
        role,
        produced,
        ...(producedText !== undefined ? { producedText } : {}),
        contextGuarded: hasPreContext(rule.context, struckIndex),
        ...(storeRefs !== undefined ? { storeRefs } : {}),
      };

      const existing = byId.get(normalized);
      if (existing === undefined) byId.set(normalized, [binding]);
      else existing.push(binding);

      const seen = spellings.get(normalized);
      if (seen === undefined) spellings.set(normalized, [struck.name]);
      else if (!seen.includes(struck.name)) seen.push(struck.name);
    }
  }

  return {
    byId,
    spellings,
    producingIds,
    opaqueFragmentCount: ir.raw.length,
  };
}

// ---------------------------------------------------------------------------
// Convenience readers — so consumers do not each re-implement the same lookups
// ---------------------------------------------------------------------------

/** Every binding for a key id, or an empty array. Case-insensitive. */
export function bindingsForKeyId(
  index: TouchKeyRuleIndex,
  keyId: string,
): readonly TouchKeyRuleBinding[] {
  return index.byId.get(normalizeTouchKeyId(keyId)) ?? [];
}

/**
 * The characters a key's PRODUCING bindings emit, deduped.
 *
 * This is the credit that touch coverage adds. Guard, suppresses, transitions,
 * and opaque bindings contribute nothing here by construction — `produced` is
 * empty for all four — so a caller cannot accidentally credit a guard rule's
 * re-emitted context as production.
 */
export function producedByKeyId(index: TouchKeyRuleIndex, keyId: string): readonly string[] {
  const out = new Set<string>();
  for (const b of bindingsForKeyId(index, keyId)) {
    for (const ch of b.produced) out.add(ch);
  }
  return [...out];
}

/**
 * True when a key has at least one binding of ANY role — i.e. it is wired.
 *
 * This, not `producingIds`, is the dead-key question: a key whose only bindings
 * are guard/suppresses/transitions/opaque is wired, and only *zero bindings at
 * all* means dead.
 */
export function hasAnyBinding(index: TouchKeyRuleIndex, keyId: string): boolean {
  return bindingsForKeyId(index, keyId).length > 0;
}
