/**
 * kmAssist diacritic-guard analysis — spec 082 FR-020 / FR-022 (Track C read-only v1).
 *
 * Intent-gated guard suggestions, pure and deterministic (no LLM). The
 * studio calls this when the author signals diacritic-blocking intent
 * (creates/edits/selects a rule in the guard family, opens the family
 * card, or installs a pack containing a block behaviour) — never
 * auto-applied, never shown without the intent signal. The studio owns the
 * suggestion-card UI; this module owns only the computation.
 *
 * Two directions (FR-022):
 * - missing: combining-mark keys (Unicode General_Category M*) with no
 *   guard rule, each suggestion scoped to THAT mark's non-base set from
 *   the orthography model (`alphabet − markAttachments[mark]`), not to a
 *   global non-letter store. Carries a `reasoning` string naming the mark's
 *   attachment set.
 * - overBroad: guard rules that block a mark after a character the
 *   orthography says the mark attaches to — rendered as a question, never
 *   an error. Keep/Narrow actions are studio-side.
 *
 * The orthography model is threaded in from the Rules step (downstream of
 * character-discovery / 071 mark-classes); kmAssist never re-derives it.
 * Unicode categories/names come from `./unicodeAdapter.js` (FR-021 stub
 * until the pinned table lands); unknown data degrades honestly — marks
 * simply aren't detected, and nothing is suggested on a guess.
 *
 * READ-ONLY: pure functions, no mutation, no IR writes.
 */
import type { IRRule } from "@keyboard-studio/contracts";
import { isSuppressionOnlyOutput, shapeContext, shapeOutput } from "./classify.js";
import { getCategory, getName } from "./unicodeAdapter.js";
import { describeKey } from "./explain.js";

/**
 * Orthography knowledge threaded through from the Rules step (downstream
 * of character-discovery / 071 mark-classes). kmAssist does NOT derive
 * this; it is an input.
 */
export interface OrthographyModel {
  /** Confirmed alphabet, in a stable order. */
  alphabet: string[];
  /** Combining-mark char → base chars it attaches to in this orthography. */
  markAttachments: Map<string, string[]>;
}

/** One combining-mark key missing its guard rule. */
export interface MissingGuard {
  /** Author-language key label, e.g. "Right Alt+C". */
  key: string;
  /** The combining mark the key emits. */
  outputChar: string;
  /** Unicode name of the mark, when known. */
  outputName?: string;
  /** Store to guard with: the family's existing guard store, or a proposed name. */
  suggestedStore: string;
  /**
   * Why this guard is suggested, scoped to this mark: names the mark's
   * attachment set and the non-base set the guard should cover, e.g.
   * "acute attaches to {a e i o u ɔ ɛ} in your orthography — guard it
   * after everything else: {b c d f …}."
   */
  reasoning: string;
}

/** Missing guards sharing one guard store (one family). */
export interface MissingGuardGroup {
  /** Guard store name (existing or proposed). */
  store: string;
  /** Author-language family name. */
  familyName: string;
  missing: MissingGuard[];
}

/**
 * A guard that contradicts the orthography: it blocks mark M after a
 * character C that `markAttachments[M]` lists as a base. Rendered as a
 * question, not an error.
 */
export interface OverBroadGuard {
  /** Author-language key label of the guarded mark key. */
  markKey: string;
  /** The combining mark the key emits. */
  markChar: string;
  /** The blocked character that IS a valid base for the mark. */
  blockedChar: string;
  /** nodeId of the guard rule, for the studio to locate it. */
  guardRuleId: string;
  /** The question to put to the author, e.g. "You block the acute key
   * after 'e', but your orthography says acute combines with e.
   * Intentional?" */
  question: string;
}

/** The two-direction guard analysis. */
export interface DiacriticGuardAnalysis {
  missing: MissingGuardGroup[];
  overBroad: OverBroadGuard[];
}

interface KeyId {
  name: string;
  modifiers: string[];
  sig: string;
}

function keyIdOf(name: string, modifiers: string[]): KeyId {
  return { name, modifiers, sig: `${name}|${[...modifiers].sort().join(",")}` };
}

function isMarkCategory(cp: number): boolean {
  const cat = getCategory(cp);
  return cat !== undefined && cat.startsWith("M");
}

/**
 * Short author-language mark label: "COMBINING ACUTE ACCENT" → "acute",
 * "COMBINING CEDILLA" → "cedilla". Falls back to "U+XXXX".
 */
function markLabel(cp: number): string {
  const name = getName(cp);
  if (name === undefined) return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return name.toLowerCase().replace(/^combining\s+/, "").replace(/\s+accent$/, "");
}

function markSlug(cp: number): string {
  return markLabel(cp).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `u${cp.toString(16)}`;
}

interface MarkEmission {
  key: KeyId;
  char: string;
  cp: number;
}

/**
 * Bare `+ [key] > <single char>` rules whose output is a combining mark
 * (Unicode General_Category Mn/Mc/Me). One entry per key (first wins) —
 * a key emitting two different marks is pathological; suggesting twice
 * would double-count it.
 */
function collectMarkEmissions(rules: IRRule[]): MarkEmission[] {
  const seen = new Set<string>();
  const out: MarkEmission[] = [];
  for (const rule of rules) {
    const ctx = shapeContext(rule);
    if (ctx.length !== 1) continue;
    const first = ctx[0];
    if (first === undefined || first.kind !== "vkey") continue;
    const outEls = shapeOutput(rule);
    if (outEls.length !== 1) continue;
    const el = outEls[0];
    if (el === undefined || el.kind !== "char" || [...el.value].length !== 1) continue;
    const cp = el.value.codePointAt(0);
    if (cp === undefined || !isMarkCategory(cp)) continue;
    const key = keyIdOf(first.name, first.modifiers);
    if (seen.has(key.sig)) continue;
    seen.add(key.sig);
    out.push({ key, char: el.value, cp });
  }
  return out;
}

interface GuardRule {
  key: KeyId;
  store: string;
  nodeId: string;
}

/**
 * Guard rules of the form `any(store) + [key] > context|nul`
 * (suppression-only output).
 */
function collectGuardRules(rules: IRRule[]): GuardRule[] {
  const out: GuardRule[] = [];
  for (const rule of rules) {
    const ctx = shapeContext(rule);
    if (ctx.length !== 2) continue;
    const guardEl = ctx[0];
    const keyEl = ctx[1];
    if (guardEl === undefined || guardEl.kind !== "any") continue;
    if (keyEl === undefined || keyEl.kind !== "vkey") continue;
    if (!isSuppressionOnlyOutput(shapeOutput(rule))) continue;
    out.push({ key: keyIdOf(keyEl.name, keyEl.modifiers), store: guardEl.storeRef, nodeId: rule.nodeId });
  }
  return out;
}

/**
 * The characters a guard store should hold.
 *
 * - With `forMark`: that mark's non-base set — `alphabet −
 *   markAttachments[mark]` (FR-022 direction A scoping).
 * - Without: the default block set — characters that never appear as any
 *   mark's base, for an author starting fresh ("we drafted the block set
 *   from your orthography" instead of a blank store).
 *
 * Alphabet order is preserved; deterministic.
 */
export function proposeGuardStore(ortho: OrthographyModel, forMark?: string): string[] {
  if (forMark !== undefined) {
    const bases = new Set(ortho.markAttachments.get(forMark) ?? []);
    return ortho.alphabet.filter((ch) => !bases.has(ch));
  }
  const allBases = new Set<string>();
  for (const bases of ortho.markAttachments.values()) {
    for (const b of bases) allBases.add(b);
  }
  return ortho.alphabet.filter((ch) => !allBases.has(ch));
}

function previewList(items: string[], max: number): string {
  const shown = items.slice(0, max).join(" ");
  return items.length > max ? `${shown} …` : shown;
}

function missingGuardReasoning(char: string, cp: number, ortho: OrthographyModel): string {
  const label = markLabel(cp);
  const bases = ortho.markAttachments.get(char) ?? [];
  const nonBases = proposeGuardStore(ortho, char);
  const nonBasePreview = previewList(nonBases, 12);
  if (bases.length === 0) {
    return `${label} has no attachment bases in your orthography — guard it after every character: {${nonBasePreview}}.`;
  }
  const basePreview = previewList(bases, 8);
  return `${label} attaches to {${basePreview}} in your orthography — guard it after everything else: {${nonBasePreview}}.`;
}

/**
 * Intent-gated diacritic-guard analysis (FR-020/FR-022). Pure.
 *
 * @param rules all rules of the keyboard.
 * @param ortho orthography model from the Rules step.
 * @param stores store name → characters; needed only for the over-broad
 *   direction (to see which characters a guard actually blocks). When a
 *   guard's store is absent here, that guard is skipped for over-broad
 *   detection rather than guessed at.
 */
export function analyzeDiacriticGuards(
  rules: IRRule[],
  ortho: OrthographyModel,
  stores: ReadonlyMap<string, string[]> = new Map(),
): DiacriticGuardAnalysis {
  const emissions = collectMarkEmissions(rules);
  const guards = collectGuardRules(rules);
  const guardedSigs = new Set(guards.map((g) => g.key.sig));
  const guardStores = [...new Set(guards.map((g) => g.store))];

  // --- Direction A: missing guards, grouped by store family. ---
  const groups = new Map<string, MissingGuard[]>();
  const groupOrder: string[] = [];
  for (const e of emissions) {
    if (guardedSigs.has(e.key.sig)) continue;
    // One existing guard store → the missing mark joins that family; otherwise
    // propose a per-mark store (its contents come from proposeGuardStore).
    const suggestedStore = guardStores.length === 1
      ? (guardStores[0] as string)
      : `block-${markSlug(e.cp)}`;
    const name = getName(e.cp);
    const item: MissingGuard = {
      key: describeKey(e.key.name, e.key.modifiers),
      outputChar: e.char,
      ...(name !== undefined ? { outputName: name } : {}),
      suggestedStore,
      reasoning: missingGuardReasoning(e.char, e.cp, ortho),
    };
    const list = groups.get(suggestedStore);
    if (list === undefined) {
      groups.set(suggestedStore, [item]);
      groupOrder.push(suggestedStore);
    } else {
      list.push(item);
    }
  }
  const missing: MissingGuardGroup[] = groupOrder.map((store) => ({
    store,
    familyName: guardStores.includes(store) ? `Guards using "${store}"` : `Proposed "${store}" guards`,
    missing: groups.get(store) ?? [],
  }));

  // --- Direction B: over-broad guards (contradictions with the orthography). ---
  const emissionBySig = new Map(emissions.map((e) => [e.key.sig, e]));
  const overBroad: OverBroadGuard[] = [];
  const seenFlags = new Set<string>();
  for (const g of guards) {
    const e = emissionBySig.get(g.key.sig);
    if (e === undefined) continue; // guards a key that emits no mark: not our contradiction
    const bases = ortho.markAttachments.get(e.char) ?? [];
    if (bases.length === 0) continue;
    const baseSet = new Set(bases);
    const blocked = stores.get(g.store) ?? [];
    if (blocked.length === 0) continue; // store contents unknown: skip, never guess
    const label = markLabel(e.cp);
    for (const ch of blocked) {
      if (!baseSet.has(ch)) continue;
      const flagKey = `${g.nodeId}|${ch}`;
      if (seenFlags.has(flagKey)) continue;
      seenFlags.add(flagKey);
      overBroad.push({
        markKey: describeKey(g.key.name, g.key.modifiers),
        markChar: e.char,
        blockedChar: ch,
        guardRuleId: g.nodeId,
        question: `You block the ${label} key after '${ch}', but your orthography says ${label} combines with ${ch}. Intentional?`,
      });
    }
  }

  return { missing, overBroad };
}
