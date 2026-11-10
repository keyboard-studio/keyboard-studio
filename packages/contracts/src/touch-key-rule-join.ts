/**
 * touch-key-rule-join — the canonical join between a touch layout's keys and the
 * `.kmn` rules keyed on them (spec 063 FR-001…FR-004,
 * [contracts/touch-key-rule-join.md](../../../specs/063-touch-key-editor/contracts/touch-key-rule-join.md)).
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
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  OutputElement,
} from "./keyboard-ir.js";
import { collectFromElements } from "./ir/producedSet.js";
import {
  ruleConditions,
  ruleContextElements,
  ruleExtraKeystrokeElements,
  ruleHasNulContext,
  ruleKeystroke,
  rulePreContext,
} from "./rule-shape.js";

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

/**
 * The identifier grammar `kmcmplib` accepts for a touch-layout key id — a
 * leading letter or underscore followed by word characters, the same shape
 * `KMN_IDENT` enforces elsewhere in the codec. Anything else (a leading digit,
 * whitespace, punctuation, an empty string) is what `0x05A`
 * (`ERROR_TouchLayoutInvalidIdentifier`) rejects.
 */
const VALID_TOUCH_KEY_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * True when `id` is an identifier the compiler will accept (spec 063 FR-040's
 * `0x05A`).
 *
 * ONE grammar, two very different consumers, which is why it lives here rather
 * than beside either of them:
 *
 * - **imported content** — `checkTouchLayoutIdentifiers` (engine's
 *   `layer-a-prime.ts`, T043) reports every existing id the compiler would
 *   reject, as a Layer A′ import-fidelity *finding*;
 * - **author input** — `checkKeyEditRejections` (engine's `keyEditOps.ts`, T118)
 *   *refuses the mutation* and emits no finding at all, because the invalid
 *   state never comes into existence (FR-045).
 *
 * FR-040 requires both paths to agree on what "invalid" means. Before T118 the
 * regex was private to `layer-a-prime.ts`; a second copy in the edit path is
 * exactly the drift this predicate exists to prevent.
 */
export function isValidTouchKeyIdentifier(id: string): boolean {
  return id.length > 0 && VALID_TOUCH_KEY_ID_RE.test(id);
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
    // 076 FR-004: the codec now types `nul` / `context` / `context(N)` in
    // output position instead of leaving them raw. Mirror the raw-text
    // semantics above for the typed forms.
    if (only?.kind === "nul") return "suppresses";
    if (only?.kind === "context") return "guard";
  }

  const allWiring = output.every(
    (el) =>
      el.kind === "useGroup" ||
      el.kind === "deadkey" ||
      el.kind === "namedDeadkey" ||
      el.kind === "beep",
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
 * The vkey element a rule is keyed on: the rule's keystroke (see
 * `ruleKeystroke`), when it is a vkey. Rules whose keystroke is not a vkey fall
 * to the key-position `any()` expansion (see {@link StruckAny}); rules with
 * neither are not indexed.
 *
 * The keystroke is the one element after the `+` separator, or the last element
 * when there is no separator, and only in a `using keys` group; the separator
 * itself is never an element of any part.
 */
function resolveStruckVkey(
  rule: IRRule,
  group: IRGroup,
): { name: string; modifiers: readonly string[] } | undefined {
  const keystroke = ruleKeystroke(rule, group);
  if (keystroke === undefined || keystroke.kind !== "vkey") return undefined;
  return { name: keystroke.name, modifiers: keystroke.modifiers };
}

/** Normalize a vkey element's modifier words: uppercase, dedupe, sort. */
function normalizeModifiers(modifiers: readonly string[]): readonly string[] {
  return [...new Set(modifiers.map((m) => m.trim().toUpperCase()).filter((m) => m.length > 0))].sort();
}

/**
 * True when the rule carries meaning beyond the struck key itself — i.e. the
 * rule only fires in a particular preceding context. A `nul`, a head `if()`
 * guard, pre-context, or extra keystroke elements all count.
 */
function hasPreContext(rule: IRRule, group: IRGroup): boolean {
  return (
    ruleHasNulContext(rule) ||
    ruleConditions(rule).length > 0 ||
    rulePreContext(rule, group).length > 0 ||
    ruleExtraKeystrokeElements(rule, group).length > 0
  );
}

// ---------------------------------------------------------------------------
// Key-position any() expansion (spec 104 foundation gap)
// ---------------------------------------------------------------------------

/**
 * A struck key that arrives through a key-position `any(store)` instead of a
 * literal vkey element — the fv_ fan shape:
 *
 *     store(fanHkeys) [T_H] [T_HI] [T_HU]
 *     store(fanH) "ᐸᐱᐲ"
 *     + any(fanHkeys) > index(fanH,1)
 *
 * Real KeymanWeb produces ᐸ/ᐱ/ᐲ from the T_H/T_HI/T_HU touch keys, but a join
 * that only indexes literal vkeys sees no rule for them at all — the spec 104
 * resolver then reports production `none`, coverage under-credits, diagnostics
 * can call the keys dead, and carve of a fan character silently no-ops.
 */
interface StruckAny {
  /**
   * The element's 1-based offset over `[nul?, ...conditions, ...preContext,
   * keystroke]` — the offset an output `index(store, n)` uses to refer to it
   * (the same numbering `elementAtOffset` resolves). The synthetic `+`
   * separator is not a Keyman context element and does not count; every other
   * element (including an `if()` guard, per spec 103) does.
   */
  readonly position: number;
  readonly storeRef: string;
}

/**
 * Find the key-position `any()` of a rule that has no vkey keystroke, or
 * `undefined` when the rule's struck key does not arrive through `any()`.
 *
 * Key position is the rule's keystroke (see `ruleKeystroke`). An `any()` in
 * pre-context is a condition, never the struck key, and never expands.
 */
function resolveStruckAny(rule: IRRule, group: IRGroup): StruckAny | undefined {
  const keystroke = ruleKeystroke(rule, group);
  if (keystroke === undefined || keystroke.kind !== "any") return undefined;
  const position =
    (ruleHasNulContext(rule) ? 1 : 0) +
    ruleConditions(rule).length +
    rulePreContext(rule, group).length +
    1;
  return { position, storeRef: keystroke.storeRef };
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
  for (const el of ruleContextElements(rule)) {
    if (el.kind === "any" || el.kind === "notany" || el.kind === "index") push(el.storeRef);
  }
  for (const el of rule.output) {
    if (el.kind === "index" || el.kind === "outs") push(el.storeRef);
  }
  return refs.length > 0 ? refs : undefined;
}

/**
 * Per-key production for one expanded fan key (see {@link StruckAny}): the
 * rule's output with each `index()` resolved for THIS key, collected through
 * the same shared walk as every other binding.
 *
 * Resolution is positional, which is the fan semantics: when the struck key
 * matched the `itemIndex`-th item of the key store, an output
 * `index(outStore, n)` whose `n` is the struck `any()`'s context position
 * yields the `itemIndex`-th item of `outStore`. Every other element is
 * deterministic per key and passes through unchanged — a literal output
 * therefore applies to every expanded key, and `outs()` expands its store
 * exactly as the shared walk already does.
 *
 * An `index()` pointing anywhere else (a pre-context position, most often)
 * cannot be resolved for this key: the element contributes NOTHING rather
 * than the whole store the shared walk would expand it to. Inventing the
 * aligned output would over-credit exactly as the pre-expansion join
 * under-credited; the binding still stands (the key is wired), with only
 * the determinable outputs in `produced`.
 */
function collectAlignedProduction(
  output: IRRule["output"],
  itemIndex: number,
  struckPosition: number,
  storeMap: Map<string, IRStore>,
  includeSpace: boolean,
): readonly string[] {
  const resolved: OutputElement[] = [];
  for (const el of output) {
    if (el.kind !== "index") {
      resolved.push(el);
      continue;
    }
    if (el.offset !== struckPosition) continue;
    const item = storeMap.get(el.storeRef)?.items[itemIndex];
    if (item === undefined) continue;
    if (item.kind === "char") resolved.push({ kind: "char", value: item.value });
    else if (item.kind === "deadkey") resolved.push({ kind: "deadkey", id: item.id });
    else if (item.kind === "namedDeadkey") resolved.push({ kind: "namedDeadkey", name: item.name });
    // A vkey/any item in an output store is not a determinable output for
    // this key; it contributes nothing.
  }
  const collector = new Set<string>();
  collectFromElements(resolved, storeMap, collector, includeSpace);
  return [...collector];
}

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

/**
 * Build the touch key ↔ rule index for a keyboard.
 *
 * One pass over every rule of every group. Rules whose struck key is out of scope
 * (no vkey and no key-position `any()`, or an id outside the indexed prefixes)
 * are skipped silently — this is an index, not a validator.
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

  const addBinding = (binding: TouchKeyRuleBinding, normalized: NormalizedTouchKeyId): void => {
    const existing = byId.get(normalized);
    if (existing === undefined) byId.set(normalized, [binding]);
    else existing.push(binding);

    const seen = spellings.get(normalized);
    if (seen === undefined) spellings.set(normalized, [binding.keyIdAsWritten]);
    else if (!seen.includes(binding.keyIdAsWritten)) seen.push(binding.keyIdAsWritten);
  };

  for (const group of ir.groups as readonly IRGroup[]) {
    for (const rule of group.rules) {
      const role = classifyTouchRuleRole(rule.output);
      const storeRefs = collectStoreRefs(rule);

      const struck = resolveStruckVkey(rule, group);
      if (struck !== undefined) {
        if (!inScope(struck.name)) continue;

        const normalized = normalizeTouchKeyId(struck.name);

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

        const producedText = role === "produces" ? leadingCharRun(rule.output) : undefined;

        addBinding(
          {
            ruleNodeId: rule.nodeId,
            groupName: group.name,
            usingKeys: group.usingKeys,
            keyIdAsWritten: struck.name,
            modifiers: normalizeModifiers(struck.modifiers),
            role,
            produced,
            ...(producedText !== undefined ? { producedText } : {}),
            contextGuarded: hasPreContext(rule, group),
            ...(storeRefs !== undefined ? { storeRefs } : {}),
          },
          normalized,
        );
        continue;
      }

      // No literal vkey: the struck key may arrive through a key-position
      // `any(store)` (the fv_ fan — see StruckAny). Expand it into one
      // binding per vkey item of the key store. Store items that are
      // characters match typed context, not struck keys, and never expand;
      // a missing store expands nothing.
      const struckAny = resolveStruckAny(rule, group);
      if (struckAny === undefined) continue;
      const keyStore = storeMap.get(struckAny.storeRef);
      if (keyStore === undefined) continue;

      const hasAlignedIndex = rule.output.some(
        (el) => el.kind === "index" && el.offset === struckAny.position,
      );

      keyStore.items.forEach((item, itemIndex) => {
        if (item.kind !== "vkey") return;
        if (!inScope(item.name)) return;

        const normalized = normalizeTouchKeyId(item.name);
        let produced: readonly string[] = [];
        if (role === "produces") {
          produced = collectAlignedProduction(
            rule.output,
            itemIndex,
            struckAny.position,
            storeMap,
            includeSpace,
          );
          if (produced.length > 0) producingIds.add(normalized);
        }

        // An aligned index() makes the output store-driven for this key, so
        // there is no single keycap string; a purely literal output keeps
        // its verbatim leading run, as for a vkey-struck rule.
        const producedText =
          role === "produces" && !hasAlignedIndex ? leadingCharRun(rule.output) : undefined;

        addBinding(
          {
            ruleNodeId: rule.nodeId,
            groupName: group.name,
            usingKeys: group.usingKeys,
            keyIdAsWritten: item.name,
            // An `any()` carries no modifier words; the fan fires unmodified.
            modifiers: [],
            role,
            produced,
            ...(producedText !== undefined ? { producedText } : {}),
            contextGuarded: hasPreContext(rule, group),
            ...(storeRefs !== undefined ? { storeRefs } : {}),
          },
          normalized,
        );
      });
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
