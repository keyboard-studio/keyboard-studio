/**
 * touchProduction — the ONE production resolver (spec 104 FR-003) and the
 * key-id destination decision (FR-005/FR-010).
 *
 * Normative sources: specs/104-touch-key-id-criteria/contracts/key-id-criteria.md
 * §1 (the resolver) and §2 (the decision table), and data-model.md §1. Where
 * this module and those documents differ in substance, the documents win and
 * this module is the defect.
 *
 * ## The resolver
 *
 * `resolveTouchProduction` answers, for ONE key occurrence in ONE layer-state:
 * what does this key produce, from which source? Every consumer named in
 * FR-003 (coverage, enumeration, carve, placement replay, propagation,
 * scaffolder, the proposer inherit gate, diagnostics) takes production from
 * here; a consumer that classifies by prefix, keycap text, or U_-decode alone
 * is non-conformant.
 *
 * It is built ON the spec 063 rule-join (`buildTouchKeyRuleIndex`), not beside
 * it: bindings, roles, and produced sets come from the index. Two readings of
 * §1 are pinned here and worth knowing:
 *
 *   - **Producing binding.** §1's "producing" is the join's `produces` role
 *     PLUS a `transitions` binding whose rule emits a deadkey — the join
 *     classifies deadkey-only outputs as transitions because they emit no
 *     CHARACTERS, but §1's production record has a `deadkey(name)` output
 *     kind precisely for them. useGroup-only and beep-only transitions remain
 *     non-producing.
 *   - **Ruled U_ fall-through.** A rule governs only the keystrokes it
 *     matches; for a decodable `U_` id the keystrokes no rule matches fall
 *     through to the U_ decode (§1: "its U_ decode is the production only
 *     for keystrokes no rule matches"). The rule arm therefore APPENDS the
 *     decode as an extra production entry, marked `viaFallback: true` with
 *     condition `"no rule matches"`, so consumers distinguish it from rule
 *     productions by the typed marker — never by matching the label. Its
 *     presence makes the record context-conditional.
 *   - **State matching is RAW.** Binding modifier words are the join's raw
 *     upper-cased words; the canonical combo vocabulary (chirality
 *     unification, the NCAPS fold) lives in engine, which contracts cannot
 *     import — the same forcing that put the join here. Callers pass state
 *     words in the same raw vocabulary; engine callers canonicalize first.
 *     The caps-family words (CAPS/CAPITAL/NCAPS) are Lstate words, not
 *     modifiers: they are matched against {@link TouchKeyState.caps}, and a
 *     binding naming no caps word is not gated by the Lstate (Keyman treats
 *     CAPITAL as an Lstate orthogonal to the modifier set).
 *
 * ## The decision table
 *
 * `decideKeyIdForm` is contracts §2 as a pure function: first matching arm
 * wins, tested against the key's full role set (FR-006). It computes no id
 * strings itself beyond reporting the desired output — encoding a U_ id from
 * an output stays with the engine minter (`charToUnicodeKeyId`), the same
 * split `decodeUnicodeKeyId` documents in reverse.
 *
 * Pure, browser-safe, no I/O.
 */

import type { KeyboardIR, OutputElement, TouchKeyIR } from "./keyboard-ir.js";
import { listDeadkeys } from "./ir/deadkeys.js";
import { US_BASE_LAYOUT } from "./ir/usBaseLayout.js";
import { decodeUnicodeKeyId, isSpacerKeyClass } from "./touch-key-ids.js";
import { bindingsForKeyId } from "./touch-key-rule-join.js";
import type { TouchKeyRuleBinding, TouchKeyRuleIndex } from "./touch-key-rule-join.js";

// ---------------------------------------------------------------------------
// The production record (contracts §1 / data-model.md §1)
// ---------------------------------------------------------------------------

/** Where a key's production comes from in one state. The six §1 sources. */
export type TouchProductionSource =
  | "rule"
  | "u-decode"
  | "k-fallback"
  | "emulation"
  | "none"
  | "unclassified";

/** One thing a key does when tapped. */
export type TouchProductionOutput =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "deadkey"; readonly name: string }
  | { readonly kind: "layerSwitch"; readonly layerId: string }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

export interface TouchProductionEntry {
  readonly output: TouchProductionOutput;
  /**
   * The context condition this production holds under, present when the
   * record is context-conditional. `"otherwise"` marks the default
   * production a guard carve-out excepts from; `"no rule matches"` marks
   * the ruled-U_ decode fall-through (see `viaFallback`).
   */
  readonly condition?: string;
  /**
   * True on exactly one kind of entry: a ruled `U_` key's decode
   * fall-through. The entry is produced by the U_ decode for keystrokes
   * no rule matches — NOT by a rule — and consumers (coverage above all)
   * distinguish it by this marker rather than by its condition label or
   * by re-decoding the id themselves.
   */
  readonly viaFallback?: true;
}

export interface TouchKeyProduction {
  readonly productions: readonly TouchProductionEntry[];
  readonly source: TouchProductionSource;
  /**
   * True when production is a function of context, not of state alone —
   * consumers MUST handle the production set, never collapse it to one
   * output.
   */
  readonly contextConditional: boolean;
  /** Node ids of ALL bindings of this id in this state, any role. */
  readonly ruleRefs: readonly string[];
  /**
   * False in exactly one case (data-model.md §1): presumptive u-decode
   * (a `nomatch` rule exists, or any rule binds the id). Caps-state K_
   * fallback was the second case until the T022 probe settled it —
   * the fallback fires in caps state (contracts §5), so caps records
   * are certain like any other k-fallback record.
   */
  readonly fallbackCertain: boolean;
}

/**
 * The layer-state a key occurrence is exercised in: the modifier state the
 * layer's name encodes (FR-001). `modifiers` are RAW words in the join's
 * vocabulary (upper-case; e.g. `["SHIFT"]`, `["RALT"]`), caps-family words
 * excluded — caps is the separate Lstate flag.
 */
export interface TouchKeyState {
  readonly modifiers: readonly string[];
  /** True when the layer is a caps layer (CAPITAL Lstate). */
  readonly caps?: boolean;
}

export interface ResolveTouchProductionInputs {
  readonly ir: KeyboardIR;
  readonly ruleIndex: TouchKeyRuleIndex;
}

/**
 * Derive the layer-state a key on `layerId` is exercised in (FR-001: the
 * layer name IS the modifier state on touch).
 *
 * This mirrors the substring grammar of KeymanWeb's
 * `Codes.getModifierState` + `Codes.getStateFromLayer` (vendored at
 * packages/engine/src/simulator/vendor/keyman/engine/keyboard/codes.ts):
 * a lower-case substring scan of the layer id — `shift`, the chiral
 * `leftctrl`/`rightctrl`/`leftalt`/`rightalt` before the generic
 * `ctrl`/`alt`, and `caps` selecting the CAPITAL Lstate (every other
 * layer is NCAPS, expressed here as `caps: false`). Words are returned in
 * the rule-join's raw .kmn vocabulary (SHIFT / LCTRL / RCTRL / CTRL /
 * LALT / RALT / ALT), the same words bindings carry. Contracts has no
 * other layer→state mechanism; consumers (diagnostics, coverage) derive
 * state through this function rather than re-scanning layer ids.
 */
export function touchKeyStateFromLayerId(layerId: string): TouchKeyState {
  const id = layerId.toLowerCase();
  const modifiers: string[] = [];
  if (id.includes("shift")) modifiers.push("SHIFT");
  let ctrlMatched = false;
  if (id.includes("leftctrl")) {
    modifiers.push("LCTRL");
    ctrlMatched = true;
  }
  if (id.includes("rightctrl")) {
    modifiers.push("RCTRL");
    ctrlMatched = true;
  }
  if (id.includes("ctrl") && !ctrlMatched) modifiers.push("CTRL");
  let altMatched = false;
  if (id.includes("leftalt")) {
    modifiers.push("LALT");
    altMatched = true;
  }
  if (id.includes("rightalt")) {
    modifiers.push("RALT");
    altMatched = true;
  }
  if (id.includes("alt") && !altMatched) modifiers.push("ALT");
  return { modifiers, caps: id.includes("caps") };
}

// ---------------------------------------------------------------------------
// State matching
// ---------------------------------------------------------------------------

const CAPS_WORDS: ReadonlySet<string> = new Set(["CAPS", "CAPITAL"]);
const NCAPS_WORDS: ReadonlySet<string> = new Set(["NCAPS"]);

function normalizeWords(words: readonly string[]): readonly string[] {
  return [...new Set(words.map((w) => w.trim().toUpperCase()).filter((w) => w.length > 0))].sort();
}

/**
 * True when a binding's modifier words match the state: the non-caps words
 * must be set-equal, and any caps-family word the binding names must agree
 * with the state's Lstate. A binding naming no caps word is not Lstate-gated.
 */
function bindingAppliesInState(binding: TouchKeyRuleBinding, state: TouchKeyState): boolean {
  const stateWords = normalizeWords(state.modifiers);
  const bindingWords = normalizeWords(binding.modifiers);
  const bindingPlain = bindingWords.filter((w) => !CAPS_WORDS.has(w) && !NCAPS_WORDS.has(w));
  if (bindingPlain.length !== stateWords.length) return false;
  if (!bindingPlain.every((w, i) => w === stateWords[i])) return false;

  const caps = state.caps === true;
  if (bindingWords.some((w) => CAPS_WORDS.has(w)) && !caps) return false;
  if (bindingWords.some((w) => NCAPS_WORDS.has(w)) && caps) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Binding → production entries
// ---------------------------------------------------------------------------

/** The condition label for a context-guarded binding, naming what guards it. */
function guardCondition(binding: TouchKeyRuleBinding): string {
  if (binding.storeRefs !== undefined && binding.storeRefs.length > 0) {
    return `context: any(${binding.storeRefs.join(", ")})`;
  }
  return "guarded context";
}

/**
 * True when a binding bears production under §1: a `produces` role, or a
 * `transitions` binding whose rule emits at least one deadkey. The rule
 * lookup by node id is why the resolver takes the IR alongside the index —
 * the join's binding deliberately does not retain output elements.
 */
function isProductionBearing(
  binding: TouchKeyRuleBinding,
  ruleByNodeId: ReadonlyMap<string, { output: readonly OutputElement[] }>,
): boolean {
  if (binding.role === "produces") return true;
  if (binding.role !== "transitions") return false;
  const rule = ruleByNodeId.get(binding.ruleNodeId);
  return rule?.output.some((el) => el.kind === "deadkey" || el.kind === "namedDeadkey") ?? false;
}

/** Production entries for one production-bearing binding. */
function entriesForBinding(
  binding: TouchKeyRuleBinding,
  ruleByNodeId: ReadonlyMap<string, { output: readonly OutputElement[] }>,
  deadkeyNames: ReadonlyMap<number, string>,
): TouchProductionEntry[] {
  const condition = binding.contextGuarded ? guardCondition(binding) : undefined;
  const withCondition = (output: TouchProductionOutput): TouchProductionEntry =>
    condition !== undefined ? { output, condition } : { output };

  if (binding.role === "produces") {
    if (binding.producedText !== undefined) {
      return [withCondition({ kind: "text", text: binding.producedText })];
    }
    // Store-driven production: no single literal string — one entry per
    // alternative character the shared walk collected.
    return binding.produced.map((ch) =>
      withCondition({ kind: "text", text: ch }),
    );
  }

  // Deadkey-bearing transitions binding.
  const rule = ruleByNodeId.get(binding.ruleNodeId);
  const entries: TouchProductionEntry[] = [];
  for (const el of rule?.output ?? []) {
    if (el.kind === "namedDeadkey") {
      entries.push(withCondition({ kind: "deadkey", name: el.name }));
    } else if (el.kind === "deadkey") {
      entries.push(
        withCondition({ kind: "deadkey", name: deadkeyNames.get(el.id) ?? `deadkey(${el.id})` }),
      );
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

type IdFamily = "K_" | "T_" | "U_" | undefined;

function idFamily(id: string): IdFamily {
  const upper = id.toUpperCase();
  if (upper.startsWith("K_")) return "K_";
  if (upper.startsWith("T_")) return "T_";
  if (upper.startsWith("U_")) return "U_";
  return undefined;
}

/**
 * Engine-defined special-function K_ ids: they produce through KMW's special
 * emulation / command handling / numpad arm, not through rules or the base
 * table (contracts §1). Deliberately conservative — an id NOT listed here
 * falls through to the rule/fallback logic rather than being presumed
 * emulation. Numpad ids (`K_NP0`…`K_NP9`, `K_NPSTAR`, …) match by prefix.
 */
const EMULATION_KEY_IDS: ReadonlySet<string> = new Set([
  "K_BKSP",
  "K_ENTER",
  "K_TAB",
  "K_LOPT",
  "K_ROPT",
]);

export function isEmulationKeyId(id: string): boolean {
  const upper = id.toUpperCase();
  return EMULATION_KEY_IDS.has(upper) || upper.startsWith("K_NP");
}

function noneRecord(ruleRefs: readonly string[]): TouchKeyProduction {
  return {
    productions: [{ output: { kind: "none" } }],
    source: "none",
    contextConditional: false,
    ruleRefs,
    fallbackCertain: true,
  };
}

/** Per-IR lookup maps the resolver needs on every call. */
interface ResolverIrMaps {
  readonly ruleByNodeId: ReadonlyMap<string, { output: readonly OutputElement[] }>;
  readonly deadkeyNames: ReadonlyMap<number, string>;
}

/**
 * The two IR-derived maps, memoised per IR object (plan.md Performance
 * Goals: the resolver must stay linear in rules-per-key — rebuilding
 * these maps per call made every call O(all rules), which corpus-scale
 * consumers (coverage, enumeration, the T021 gate) multiply by
 * keys × chars). Keyed on the IR object itself, WeakMap-held: sound
 * under the codebase's standing convention that a KeyboardIR is
 * immutable once built — every edit produces a new IR object (and a
 * new rule index), so a stale entry can never be reached through an
 * edited keyboard. A caller that constructs a partial IR inline gets
 * its own entry, exactly as the per-call build behaved.
 */
const irMapsCache = new WeakMap<KeyboardIR, ResolverIrMaps>();

function irMapsFor(ir: KeyboardIR): ResolverIrMaps {
  const cached = irMapsCache.get(ir);
  if (cached !== undefined) return cached;
  const ruleByNodeId = new Map<string, { output: readonly OutputElement[] }>();
  // Partial IRs (e.g. studio-constructed inspection inputs) may omit the
  // groups array entirely — treat a missing array as no rules, never crash.
  for (const group of ir.groups ?? []) {
    for (const rule of group.rules) ruleByNodeId.set(rule.nodeId, rule);
  }
  const deadkeyNames = new Map<number, string>();
  for (const dk of listDeadkeys(ir)) {
    if (dk.id !== null && dk.name !== undefined) deadkeyNames.set(dk.id, dk.name);
  }
  const maps: ResolverIrMaps = { ruleByNodeId, deadkeyNames };
  irMapsCache.set(ir, maps);
  return maps;
}

/**
 * Resolve what one key occurrence produces in one layer-state.
 *
 * Evaluation order (contracts §1): rules first for every family (a rule may
 * name K_, T_, or U_ ids alike) — then each family's fallback: U_ decode,
 * the state-0/SHIFT US base table for K_ — then the layer switch the key
 * itself carries (which rides alongside a rule or fallback production
 * when one exists, and is the whole record when nothing produces),
 * emulation for the special-function K_ ids, and nothing for T_.
 */
export function resolveTouchProduction(
  inputs: ResolveTouchProductionInputs,
  key: TouchKeyIR,
  state: TouchKeyState,
): TouchKeyProduction {
  const { ir, ruleIndex } = inputs;
  const family = idFamily(key.id);

  // Unclassified: no criterion may consume this production (data-model.md §1).
  if (family === undefined) {
    return {
      productions: [{ output: { kind: "unknown" } }],
      source: "unclassified",
      contextConditional: false,
      ruleRefs: [],
      fallbackCertain: true,
    };
  }

  const allBindings = bindingsForKeyId(ruleIndex, key.id);
  const applicable = allBindings.filter((b) => bindingAppliesInState(b, state));
  const ruleRefs = applicable.map((b) => b.ruleNodeId);

  const { ruleByNodeId, deadkeyNames } = irMapsFor(ir);

  const layerSwitch: TouchProductionEntry | undefined =
    key.nextlayer !== undefined && key.nextlayer.length > 0
      ? { output: { kind: "layerSwitch", layerId: key.nextlayer } }
      : undefined;

  // 1. Rules first: any production-bearing binding applicable in this state.
  const producing = applicable.filter((b) => isProductionBearing(b, ruleByNodeId));
  if (producing.length > 0) {
    const entries: TouchProductionEntry[] = [];
    if (layerSwitch !== undefined) entries.push(layerSwitch);
    for (const b of producing) entries.push(...entriesForBinding(b, ruleByNodeId, deadkeyNames));

    // Guard/suppresses carve-outs: a context-guarded non-producing binding
    // applicable in the same state means the production does NOT hold in
    // its context (the Cameroon idiom: the mark is swallowed) — the record
    // becomes conditional, with a `none` entry naming the guard.
    const carveOuts = applicable.filter(
      (b) =>
        (b.role === "guard" || b.role === "suppresses") &&
        b.contextGuarded &&
        !producing.includes(b),
    );
    if (carveOuts.length > 0) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (e.condition === undefined && e.output.kind !== "layerSwitch") {
          entries[i] = { output: e.output, condition: "otherwise" };
        }
      }
      for (const b of carveOuts) {
        entries.push({ output: { kind: "none" }, condition: guardCondition(b) });
      }
    }

    // Ruled U_ fall-through (§1): the rules above govern only the
    // keystrokes they match — keystrokes no rule matches reach the U_
    // decode. Append it as a marked entry (after any carve-out marking,
    // so the carve-out pass never rewrites its condition). An id that
    // does not decode has no fall-through to append.
    let decodeFallThrough = false;
    if (family === "U_") {
      const decoded = decodeUnicodeKeyId(key.id.toUpperCase());
      if (decoded !== undefined) {
        entries.push({
          output: { kind: "text", text: decoded },
          condition: "no rule matches",
          viaFallback: true,
        });
        decodeFallThrough = true;
      }
    }

    // The record is context-conditional when what the key does genuinely
    // varies by context: a carve-out exists, a decode fall-through exists
    // (matched vs unmatched keystrokes produce differently), a production
    // entry carries a condition (it holds only where its context does),
    // or the producing bindings offer more than one distinct
    // character/deadkey outcome (store-driven alternatives selected by
    // index context).
    const charEntries = entries.filter(
      (e) => e.output.kind === "text" || e.output.kind === "deadkey",
    );
    const contextConditional =
      carveOuts.length > 0 ||
      decodeFallThrough ||
      charEntries.some((e) => e.condition !== undefined) ||
      new Set(charEntries.map((e) => JSON.stringify(e.output))).size > 1;

    return {
      productions: entries,
      source: "rule",
      contextConditional,
      ruleRefs,
      fallbackCertain: true,
    };
  }

  // 2. U_ decode — a presumption, not a certainty, when a nomatch rule
  // exists or any rule binds the id in any role or state (§1). The layer
  // switch rides ALONGSIDE the decode, exactly as it rides alongside a
  // rule's output in step 1: a U_ key with `nextlayer` types its decoded
  // character and then switches. (This arm must run before the
  // layer-switch-only arm below — when the switch preempted the decode,
  // every rule-free U_ key carrying a layer return resolved `none`, and
  // the dead-key scan read working keys as dead.)
  if (family === "U_") {
    const decoded = decodeUnicodeKeyId(key.id.toUpperCase());
    if (decoded !== undefined) {
      const hasNomatch = (ir.groups ?? []).some((g) => g.rules.some((r) => r.matchKind === "nomatch"));
      const presumptive = hasNomatch || allBindings.length > 0;
      return {
        productions: [
          ...(layerSwitch !== undefined ? [layerSwitch] : []),
          { output: { kind: "text", text: decoded } },
        ],
        source: "u-decode",
        contextConditional: false,
        ruleRefs,
        fallbackCertain: !presumptive,
      };
    }
  }

  // 3. K_ fallback: the US base table, state 0 / SHIFT only. CAPITAL is an
  // Lstate, not a modifier, and the fallback does not inspect it (T022
  // probe, contracts §5): KMW's forBaseKeys gates on Lmodifiers alone, so
  // a caps-state key falls back exactly as the same modifier state does
  // without caps — state 0 gives the unshifted char, SHIFT the shifted
  // char, any other modifier state gives none. `state.caps` therefore
  // plays no part in this arm. The layer switch rides alongside, as in
  // the U_ arm above. Emulation ids are NOT settled here — they keep
  // their own arm below, exactly as before.
  if (family === "K_" && !isEmulationKeyId(key.id)) {
    const words = normalizeWords(state.modifiers);
    const isState0 = words.length === 0;
    const isShiftOnly = words.length === 1 && words[0] === "SHIFT";
    if (isState0 || isShiftOnly) {
      const tableKey = isShiftOnly ? `S+${key.id.toUpperCase()}` : key.id.toUpperCase();
      const base = US_BASE_LAYOUT.get(tableKey);
      if (base !== undefined) {
        return {
          productions: [
            ...(layerSwitch !== undefined ? [layerSwitch] : []),
            { output: { kind: "text", text: base } },
          ],
          source: "k-fallback",
          contextConditional: false,
          ruleRefs,
          fallbackCertain: true,
        };
      }
    }
  }

  // 4. The key's own layer switch, when nothing produces. This is the
  // T_ dead-key shape (a switch entry and source `none`), the T_CAM
  // shape, and the spacer/emulation-with-nextlayer shapes — all
  // unchanged from before the fallback arms above were hoisted.
  if (layerSwitch !== undefined) {
    return { ...noneRecord(ruleRefs), productions: [layerSwitch] };
  }

  // 5. Spacer/blank class: inert by construction.
  if (isSpacerKeyClass(key.sp)) {
    return noneRecord(ruleRefs);
  }

  // 6. Emulation: engine-defined special-function K_ ids.
  if (family === "K_" && isEmulationKeyId(key.id)) {
    return {
      productions: [],
      source: "emulation",
      contextConditional: false,
      ruleRefs,
      fallbackCertain: true,
    };
  }

  // 7. No fallback applies: a U_ id that does not decode, a K_ id in a
  // state with no base-table entry, and every T_ id (T_ has no fallback
  // at all: no production-bearing rule, no production). For a
  // producing-class T_ key this record IS the FR-009/FR-023 dead-key
  // finding — there is no second definition of dead.
  return noneRecord(ruleRefs);
}

// ---------------------------------------------------------------------------
// The destination decision (contracts §2 / FR-005)
// ---------------------------------------------------------------------------

/**
 * The roles a key fills (FR-006). Only `"producer"` produces; layer-switch
 * and subkey-host are properties carried under whichever arm wins.
 */
export type TouchKeyRole =
  | "producer"
  | "layer-switch"
  | "subkey-host"
  | "frame"
  | "navigation"
  | "spacer";

/** The contracts §2 arms, spelled as the contract table spells them. */
export type KeyIdArm = "0" | "a" | "b" | "c" | "c′" | "d" | "d′" | "d″" | "e";

export type KeyIdDestination =
  | { readonly form: "K_"; readonly action: "keep" }
  | { readonly form: "T_"; readonly action: "mint-with-rules" }
  | { readonly form: "T_"; readonly action: "keep-with-rules"; readonly id: string }
  | { readonly form: "U_"; readonly action: "keep-with-rules"; readonly id: string }
  | { readonly form: "U_"; readonly action: "mint"; readonly output: string }
  | { readonly form: "T_"; readonly action: "frame" };

export interface KeyIdDecision {
  readonly arm: KeyIdArm;
  readonly destination: KeyIdDestination;
  /** Why this arm fired, in terms an FR-025 surface can show verbatim. */
  readonly reason: string;
}

/** An identity the key already carries, when one does. */
export interface ExistingKeyIdentity {
  readonly id: string;
  readonly form: "K_" | "T_" | "U_";
  /** True when at least one rule names this id. */
  readonly ruled: boolean;
}

export interface KeyIdFormInput {
  /** The key's full role set (FR-006). */
  readonly roles: readonly TouchKeyRole[];
  /**
   * FR-002 equality against the linked physical key, host rider included.
   * `"undecidable"` defaults to keep-K_ (non-interference, FR-004). Absent:
   * `"undecidable"` when an existing K_ identity is present, else
   * `"no-physical-key"`.
   */
  readonly behaviourVsPhysical?: "equal" | "differs" | "undecidable" | "no-physical-key";
  /** True when the desired behaviour needs rule logic (guard, context, deadkey, per-state outputs, option/store effects). */
  readonly ruleLogicRequired?: boolean;
  readonly existingIdentity?: ExistingKeyIdentity;
  /** The fixed character or string the key should type when no rule logic is involved. */
  readonly plainOutput?: string;
  readonly isCombiningMark?: boolean;
  /** True when the mark is the output of a deadkey composition (arm d″). */
  readonly deadkeyComposedMark?: boolean;
  /**
   * Per-mark "start of line" box (#2374, replacing spec 104 FR-013's
   * keyboard-wide guard specification): `true` when the mark's box is
   * ticked (the bare mark may appear at buffer start — old `"emit"`).
   * Unticked or absent (a late-added mark with no survey row) mints
   * guarded `T_` (old `"swallow"`).
   */
  readonly bareMarkAllowed?: boolean;
  /** The keyboard's `&VERSION`, e.g. `"15.0"`. Absent reads as below every floor. */
  readonly keyboardVersion?: string;
}

/** The destination a rule-logic route (arm a, and the arms that fall to it) yields for this input. */
function ruleDestination(input: KeyIdFormInput): KeyIdDestination {
  const existing = input.existingIdentity;
  if (existing?.form === "U_") {
    return { form: "U_", action: "keep-with-rules", id: existing.id };
  }
  if (existing?.form === "T_" && existing.ruled) {
    return { form: "T_", action: "keep-with-rules", id: existing.id };
  }
  return { form: "T_", action: "mint-with-rules" };
}

/** True when `version` parses to at least `floor` (major compared numerically). Absent/unparseable ⇒ false. */
function versionAtLeast(version: string | undefined, floor: number): boolean {
  if (version === undefined) return false;
  const match = /^(\d+)(?:\.\d+)?/.exec(version.trim());
  if (match === null) return false;
  return Number.parseInt(match[1]!, 10) >= floor;
}

/** C0 (U+0000–U+001F) and C1 (U+0080–U+009F): the runtime decoder silently skips these segments. */
function isRuntimeDecodable(codePoint: number): boolean {
  return !(codePoint <= 0x1f || (codePoint >= 0x80 && codePoint <= 0x9f));
}

/**
 * Decide a key's destination id form — contracts §2, first matching arm wins.
 *
 * Arm 0 is judged only for a K_-linked key: a severed/converted key whose
 * behaviour again equals the physical key's is FR-029 re-linking's question,
 * offered through its own recorded action, never decided here.
 */
export function decideKeyIdForm(input: KeyIdFormInput): KeyIdDecision {
  const behaviour =
    input.behaviourVsPhysical ??
    (input.existingIdentity?.form === "K_" ? "undecidable" : "no-physical-key");
  const existing = input.existingIdentity;

  // Arm 0 — keep K_ (FR-002). Undecidable equality keeps the link:
  // non-interference (FR-004) — studio does not sever what it cannot prove
  // differs.
  if (
    (behaviour === "equal" || behaviour === "undecidable") &&
    (existing === undefined || existing.form === "K_")
  ) {
    return {
      arm: "0",
      destination: { form: "K_", action: "keep" },
      reason:
        behaviour === "equal"
          ? "Desired behaviour equals the linked physical key's in every exercised state (FR-002, host rider included)."
          : "Equality with the physical key is undecidable; the link is kept (non-interference, FR-004).",
    };
  }

  // Arms a/b — rule logic required.
  if (input.ruleLogicRequired === true) {
    if (existing?.form === "U_") {
      return {
        arm: "b",
        destination: { form: "U_", action: "keep-with-rules", id: existing.id },
        reason:
          "Rule logic is required and the key already carries a U_ identity; the rules are written against the U_ id. Fail-open rider: removing those rules later revives the U_ decode — rule removal is not key removal.",
      };
    }
    return {
      arm: "a",
      destination: ruleDestination(input),
      reason:
        existing?.form === "T_" && existing.ruled
          ? "Rule logic is required and the key already carries a ruled T_ identity; the rules are written against it."
          : "Rule logic is required and there is no existing ruled identity to write against; a T_ id is minted and its rules created atomically with it.",
    };
  }

  // Arms d″/d′/d — combining marks divert before the plain-output arm:
  // a mark is a plain character only when no guard and no deadkey route
  // applies to it.
  if (input.isCombiningMark === true && input.plainOutput !== undefined) {
    if (input.deadkeyComposedMark === true) {
      return {
        arm: "d″",
        destination: ruleDestination(input),
        reason:
          "The mark is the output of a deadkey composition; it routes to arm (a) as a deadkey output rule. The mark's guard is irrelevant to this route.",
      };
    }
    if (input.bareMarkAllowed === true) {
      return {
        arm: "d",
        destination: { form: "U_", action: "mint", output: input.plainOutput },
        reason:
          "The mark's \"start of line\" box is ticked, so the bare mark may appear at buffer start; it decodes directly from a U_ id.",
      };
    }
    return {
      arm: "d′",
      destination: ruleDestination(input),
      reason:
        "The mark's \"start of line\" box is unticked, so the mark is blocked at buffer start; it mints a guarded T_ id with the guard taken from the per-mark rule.",
    };
  }

  // Arms c/c′ — plain character or fixed string, no rule logic.
  if (input.plainOutput !== undefined) {
    const segments = [...input.plainOutput];
    const allDecodable = segments.every((ch) => isRuntimeDecodable(ch.codePointAt(0)!));
    const singleCodepoint = segments.length === 1;
    if (allDecodable && (singleCodepoint || versionAtLeast(input.keyboardVersion, 15))) {
      return {
        arm: "c",
        destination: { form: "U_", action: "mint", output: input.plainOutput },
        reason: singleCodepoint
          ? "A plain character with no rule logic decodes directly from a U_ id."
          : "A fixed string with no rule logic decodes from a multi-segment U_ id at &VERSION 15.0+.",
      };
    }
    return {
      arm: "c′",
      destination: ruleDestination(input),
      reason: !allDecodable
        ? "The output contains a C0/C1 segment the runtime decoder silently skips, so it cannot ride a U_ id; it falls to arm (a)."
        : "A multi-codepoint string below &VERSION 15.0 cannot ride a U_ id; it falls to arm (a). Raising &VERSION is the author's separate decision, never a minting side effect.",
    };
  }

  // Arm e — every role non-producing: frame class.
  if (!input.roles.includes("producer")) {
    return {
      arm: "e",
      destination: { form: "T_", action: "frame" },
      reason: "All roles are non-producing (frame / navigation / spacer); the key is a T_ frame-class key and carries no rules.",
    };
  }

  // A producer with no output specified and no rule-logic flag: the only
  // producer arm left is rule definition.
  return {
    arm: "a",
    destination: ruleDestination(input),
    reason: "The key has a producing role but no fixed output was specified; its production must be defined by rules (arm a).",
  };
}
