import type {
  KeyboardIR,
  IRRule,
  IRGroup,
  IRStore,
} from "@keyboard-studio/contracts";
import { makePattern } from "@keyboard-studio/contracts";
import type { MatchResult } from "./types.js";
import type { Pattern } from "@keyboard-studio/contracts";
import { ruleRef, storeRef } from "./node-refs.js";
import { buildS02Fragment, findS02Families } from "./s02-families.js";
import {
  postfixMarkSequenceRefs,
  isBaseToMarkedRemap,
} from "../strategy-selector/import-mark-order.js";
import { toUPlus, storeItemsToCharString, formatVKeyModifiers, formatDkName, isBehaviourOwned } from "./utils.js";
import type {
  RecognizerRuleYaml,
  SlotMapping,
} from "./yaml-schema.js";

// rules_to_keystroke_char_map: produce "+ [MODS KEY] > U+XXXX" lines
function applyRulesToKeystrokeCharMap(rules: IRRule[]): string {
  const lines: string[] = [];
  for (const rule of rules) {
    const ctx = rule.context[0];
    const out = rule.output[0];
    if (
      ctx === undefined ||
      out === undefined ||
      out.kind !== "char"
    ) continue;
    if (ctx.kind === "vkey") {
      const mods = formatVKeyModifiers(ctx.modifiers);
      lines.push(`+ [${mods}${ctx.name}] > ${toUPlus(out.value)}`);
    } else if (ctx.kind === "char") {
      lines.push(`+ "${ctx.value}" > ${toUPlus(out.value)}`);
    }
  }
  return lines.join("\n");
}

// numeric_id_to_label: deadkey id -> underscore-hex label, e.g. 0x0060 -> "dk_0060".
// Delegates to formatDkName so this transform and the hand-written S-02 reference
// rule (s02-deadkey-single-tap.ts) emit byte-identical deadkeyName slot values.
function applyNumericIdToLabel(id: number): string {
  return formatDkName(id);
}

// ---------------------------------------------------------------------------
// Predicate helpers — check a single IRRule against a role definition
// ---------------------------------------------------------------------------

// S-02's role shapes (trigger / fan-out / escape) live in s02-families.ts,
// shared with the hand-written s02Recognizer (issue #2233): one reconciled
// shape definition, so the generated rule and the reference rule cannot
// diverge. The role matchers that used to live here were deleted with it.

// A "single" rule: one vkey-or-char context, one char output, no deadkey or store involvement.
function matchesSingleRole(rule: IRRule): boolean {
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined) return false;
  if (ctx.kind !== "vkey" && ctx.kind !== "char") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  return out !== undefined && out.kind === "char";
}

// ---------------------------------------------------------------------------
// Store-constraint validation
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Group guard
// ---------------------------------------------------------------------------

// IRGroup.usingKeys is the correct field per keyboard-ir.ts (boolean, not a name check)
function groupPassesConstraints(group: IRGroup, usingKeys?: boolean): boolean {
  if (usingKeys !== undefined && group.usingKeys !== usingKeys) return false;
  return true;
}

// ---------------------------------------------------------------------------
// S-01 predicate (single-rule-direct cluster)
// ---------------------------------------------------------------------------

interface S01ClusterMatch {
  group: IRGroup;
  rules: IRRule[];
}

function findS01Clusters(ir: KeyboardIR): S01ClusterMatch[] {
  const clusters: S01ClusterMatch[] = [];
  const MAX_DISTINCT_BASE_CHARS = 5;

  for (const group of ir.groups) {
    if (!groupPassesConstraints(group, true)) continue;

    const qualifying = group.rules.filter((rule) => {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) return false;
      if (!matchesSingleRole(rule)) return false;

      // Disqualify any rule that has deadkey, index, outs, beep, raw in output
      const out = rule.output[0];
      if (out === undefined) return false;
      if (out.kind !== "char") return false;

      // Disqualify if context has store references (storeRef field)
      const ctx = rule.context[0];
      if (ctx === undefined) return false;
      if (ctx.kind === "any" || ctx.kind === "notany") return false;

      return true;
    });

    if (qualifying.length === 0) continue;

    // Count distinct base key names
    const distinctBaseNames = new Set<string>();
    for (const rule of qualifying) {
      const ctx = rule.context[0];
      if (ctx === undefined) continue;
      if (ctx.kind === "vkey") distinctBaseNames.add(ctx.name);
      else if (ctx.kind === "char") distinctBaseNames.add(ctx.value);
    }

    if (distinctBaseNames.size > MAX_DISTINCT_BASE_CHARS) continue;

    clusters.push({ group, rules: qualifying });
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// S-02 predicate (three-rule-deadkey cluster)
// ---------------------------------------------------------------------------

// The S-02 cluster finder is findS02Families in s02-families.ts (shared with
// the hand-written rule since #2233). It returns one family per full cluster
// key (group, deadkey id, prefix char, base store, output store), with the
// escape optional and shared triggers/escapes recorded but not owned.

// ---------------------------------------------------------------------------
// S-03 predicate (sequence-replace cluster)
// ---------------------------------------------------------------------------
//
// Shape (spec §7.3 S-03 card; production semantics owned by
// strategy-selector/import-mark-order.ts, reused here verbatim):
//   [if(...)]* any(S_bases) + "<trigger>" > index(S_output, guardCount + 1)
// The codec may preserve the inline "+" as a {kind:"raw", text:"+"} context
// element; leading spec-103 `if` guards occupy context positions and shift
// the required index() offset. Evidence standard mirrors the production
// detector: a GUARDED rule qualifies on shape + offset alignment alone; an
// UNGUARDED rule additionally requires the two stores to form a genuine
// base→marked parallel remap (isBaseToMarkedRemap) — shape alone would claim
// any parallel-store remap (S-04/S-05 territory) as S-03. Unresolved store
// refs are no evidence, never a pass.
//
// A cluster is every qualifying rule in one group sharing one
// (base store, output store) pair — sil_ipa carries one rule per pair
// (equalD/equalU, greatD/greatU, …), each pair an independent cluster.

interface S03ClusterMatch {
  group: IRGroup;
  rules: IRRule[];
  baseStore: IRStore;
  outStore: IRStore;
}

function sequenceTriggerChar(rule: IRRule): string | undefined {
  const real = rule.context.filter(
    (el) => !(el.kind === "raw" && el.text.trim() === "+"),
  );
  let i = 0;
  while (real[i]?.kind === "if") i++;
  const trigger = real[i + 1];
  return trigger !== undefined && trigger.kind === "char" ? trigger.value : undefined;
}

function findS03Clusters(ir: KeyboardIR): S03ClusterMatch[] {
  const byKey = new Map<string, S03ClusterMatch>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;

      const refs = postfixMarkSequenceRefs(rule);
      if (refs === undefined) continue;

      // Evidence gate (see header): guarded → shape + offset; unguarded →
      // the store pair must be a genuine base→marked remap.
      if (
        refs.guardCount === 0 &&
        !isBaseToMarkedRemap(ir, refs.baseRef, refs.markedRef)
      ) {
        continue;
      }

      const baseStore = ir.stores.find((s) => s.name === refs.baseRef);
      const outStore = ir.stores.find((s) => s.name === refs.markedRef);
      if (baseStore === undefined || outStore === undefined) continue;

      const key = `${group.nodeId}|${refs.baseRef}|${refs.markedRef}`;
      const existing = byKey.get(key);
      if (existing !== undefined) {
        existing.rules.push(rule);
      } else {
        byKey.set(key, { group, rules: [rule], baseStore, outStore });
      }
    }
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// S-07 predicate (diacritic-cycling cluster)
// ---------------------------------------------------------------------------
//
// Shape (spec §7.3 S-07 card; vietnamese_telex head section):
//   cancel: any(S_marked) + "<key>" > index(S_unmarked, 1) "<key>"
//   apply:  any(S_unmarked) + "<key>" > index(S_marked, 1)   (paired, optional)
//
// The cancel rule is the defining member: the cycle key re-emitted in the
// output is what makes the pair a cycle rather than a one-way remap. The
// boundary conditions are the predicate, not decoration:
//   - output char === trigger char. Without it, this shape matches ~1,769
//     generic [index, char] diacritic-add rules across the corpus
//     (issue #2212 corpus scan).
//   - index() target store !== context any() store, and offset === 1: the
//     any() sits at context position 1 because guards are excluded (next
//     point), which is the spec-103 guard-adjusted offset invariant
//     (offset === guardCount + 1) at guardCount 0.
//   - NO leading if() guards. Spec 103 FR-007: a pattern may claim a
//     guarded rule only by explicit opt-in; this pattern does not opt in.
//     The guarded literal enumeration that dominates telex is not claimed.
// Cross-tone swap rules (any(marked) + otherKey > index(otherMarked, 1))
// match neither shape here (their output has no re-emitted char, and their
// index target is a third store) and are deliberately not claimed: a swap
// belongs to two tone families at once.
//
// A cluster is keyed by (group, marked store, unmarked store, trigger
// char) — one tone family in one case (telex: five tones × two cases =
// ten clusters). The paired apply rule attaches when present in the same
// group and not already owned (an earlier recognizer pass, e.g. S-03, may
// legitimately own it; the cluster forms regardless).

interface S07ClusterMatch {
  group: IRGroup;
  cancelRules: IRRule[];
  applyRules: IRRule[];
  markedStore: IRStore;
  unmarkedStore: IRStore;
  trigger: string;
}

// The codec may preserve the inline "+" as a {kind:"raw", text:"+"}
// context element; strip it, exactly as the S-03 path does.
function stripPlusSeparator(rule: IRRule): IRRule["context"] {
  return rule.context.filter(
    (el) => !(el.kind === "raw" && el.text.trim() === "+"),
  );
}

// The context walk shared by the cancel and apply shapes: after the "+"
// strip, exactly [any(store), char(trigger)] with no leading guards.
function cycleContextShape(
  rule: IRRule,
): { anyRef: string; trigger: string } | undefined {
  const real = stripPlusSeparator(rule);
  let guardCount = 0;
  while (real[guardCount]?.kind === "if") guardCount++;
  if (guardCount !== 0) return undefined;
  if (real.length !== 2) return undefined;
  const c0 = real[0];
  const c1 = real[1];
  if (c0 === undefined || c0.kind !== "any") return undefined;
  if (c1 === undefined || c1.kind !== "char") return undefined;
  return { anyRef: c0.storeRef, trigger: c1.value };
}

function cancelShape(
  rule: IRRule,
): { markedRef: string; unmarkedRef: string; trigger: string } | undefined {
  const ctx = cycleContextShape(rule);
  if (ctx === undefined) return undefined;
  if (rule.output.length !== 2) return undefined;
  const o0 = rule.output[0];
  const o1 = rule.output[1];
  if (o0 === undefined || o0.kind !== "index") return undefined;
  if (o1 === undefined || o1.kind !== "char") return undefined;
  if (o1.value !== ctx.trigger) return undefined;
  if (o0.storeRef === ctx.anyRef) return undefined;
  if (o0.offset !== 1) return undefined;
  return { markedRef: ctx.anyRef, unmarkedRef: o0.storeRef, trigger: ctx.trigger };
}

function applyShape(
  rule: IRRule,
): { unmarkedRef: string; markedRef: string; trigger: string } | undefined {
  const ctx = cycleContextShape(rule);
  if (ctx === undefined) return undefined;
  if (rule.output.length !== 1) return undefined;
  const o0 = rule.output[0];
  if (o0 === undefined || o0.kind !== "index") return undefined;
  if (o0.storeRef === ctx.anyRef) return undefined;
  if (o0.offset !== 1) return undefined;
  return { unmarkedRef: ctx.anyRef, markedRef: o0.storeRef, trigger: ctx.trigger };
}

function findS07Clusters(ir: KeyboardIR): S07ClusterMatch[] {
  const byKey = new Map<string, S07ClusterMatch>();

  // Pass 1: cancel rules define the clusters.
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;

      const shape = cancelShape(rule);
      if (shape === undefined) continue;

      const markedStore = ir.stores.find((s) => s.name === shape.markedRef);
      const unmarkedStore = ir.stores.find((s) => s.name === shape.unmarkedRef);
      if (markedStore === undefined || unmarkedStore === undefined) continue;

      const key = `${group.nodeId}|${shape.markedRef}|${shape.unmarkedRef}|${shape.trigger}`;
      const existing = byKey.get(key);
      if (existing !== undefined) {
        existing.cancelRules.push(rule);
      } else {
        byKey.set(key, {
          group,
          cancelRules: [rule],
          applyRules: [],
          markedStore,
          unmarkedStore,
          trigger: shape.trigger,
        });
      }
    }
  }

  // Pass 2: attach paired apply rules from the same group. An apply rule
  // already owned (e.g. lifted as S-03 by an earlier pass) is skipped by
  // the FR-021 filter above the shape check — the cluster still forms.
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;

      const shape = applyShape(rule);
      if (shape === undefined) continue;

      const key = `${group.nodeId}|${shape.markedRef}|${shape.unmarkedRef}|${shape.trigger}`;
      const cluster = byKey.get(key);
      if (cluster !== undefined && cluster.group === group) {
        cluster.applyRules.push(rule);
      }
    }
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// S-09 predicate (retroactive-reph cluster)
// ---------------------------------------------------------------------------
//
// Shape (spec §7.3 S-09 card; issue #2223 km-lead ruling): reph is the
// logical-order sequence ra + virama + ⟨following consonant⟩. The
// recognizer-relevant spelling is post-typed: the author types a consonant,
// then a reph key, and the rule re-emits the consonant after a fixed
// ra+virama prefix:
//   any(C) + "R" > U+0930 U+094D index(C, 1)          (sil_devanagari_phonetic)
//   any(C) + "'" > U+0930 U+094D context              (hindi_modular)
// The boundary conditions are the predicate, not decoration:
//   - output[0..1] are exactly the script's (ra, virama) pair from
//     REPH_PREFIX_PAIRS. This content pin is what separates reph from its
//     mirror image rakār (sil_devanagari_romanized:284 — SAME context and
//     SAME trigger "R", output [index, virama, ra]) and from generic
//     conjunct formation (virama follows the re-emitted consonant, not ra).
//     A shape-only [char, char, index] finder false-claims the taigi_telex
//     remap bulk (issue #2212 corpus scan).
//   - the output re-emits the ENTIRE pre-trigger context in order: an any()
//     element via index(its store, its position) or context(position), a
//     char element via the literal char or context(position) — or the whole
//     pre-trigger context via one bare `context` (the hindi spelling).
//     Scaled variants (consonant + matra already typed) re-emit every
//     element the same way (sil_devanagari_phonetic:117-118).
//   - the trigger contributes NO output element (it is consumed silently);
//     trigger identity itself is not evidence (rakār shares the trigger).
//   - NO if() guards anywhere (spec 103 FR-007 — no opt-in).
// ZWNJ-prefixed second-order reph (hindi_modular:182,185 — output begins
// with U+200C, before the ra) fails the prefix pin and is not claimed.
//
// A cluster is keyed by (group, consonant store, trigger char); the rules
// of one cluster are the base rule and its scaled variants over one store.

interface S09ClusterMatch {
  group: IRGroup;
  rules: IRRule[];
  consonantStore: IRStore;
  trigger: string;
}

// (ra, virama) pairs by Indic block, seeded with Devanagari — the only
// block with corpus witnesses (issue #2223 ruling). A block joins this
// table when a witness for it appears; the finder claims nothing outside
// the table.
const REPH_PREFIX_PAIRS: ReadonlyArray<readonly [ra: string, virama: string]> = [
  ["\u0930", "\u094D"], // Devanagari
];

interface RephShape {
  consonantRef: string;
  trigger: string;
  raChar: string;
  viramaChar: string;
}

function rephShape(rule: IRRule): RephShape | undefined {
  const real = stripPlusSeparator(rule);
  if (real.some((el) => el.kind === "if")) return undefined;
  if (real.length < 2) return undefined;

  const triggerEl = real[real.length - 1];
  if (triggerEl === undefined || triggerEl.kind !== "char") return undefined;

  const pre = real.slice(0, -1);
  const first = pre[0];
  if (first === undefined || first.kind !== "any") return undefined;
  for (const el of pre.slice(1)) {
    if (el.kind !== "any" && el.kind !== "char") return undefined;
  }

  const out = rule.output;
  if (out.length < 3) return undefined;
  const o0 = out[0];
  const o1 = out[1];
  if (o0 === undefined || o0.kind !== "char") return undefined;
  if (o1 === undefined || o1.kind !== "char") return undefined;
  if (
    !REPH_PREFIX_PAIRS.some(([ra, vir]) => ra === o0.value && vir === o1.value)
  ) {
    return undefined;
  }

  const shape: RephShape = {
    consonantRef: first.storeRef,
    trigger: triggerEl.value,
    raChar: o0.value,
    viramaChar: o1.value,
  };

  const reemit = out.slice(2);

  // Whole-context spelling: one bare `context` re-emits the entire
  // pre-trigger context (hindi_modular:181,184).
  if (
    reemit.length === 1 &&
    reemit[0] !== undefined &&
    reemit[0].kind === "context" &&
    reemit[0].offset === 0
  ) {
    return shape;
  }

  // Element-wise spelling: one re-emission per pre-trigger element, in
  // order (sil_devanagari_phonetic:116-118).
  if (reemit.length !== pre.length) return undefined;
  for (let i = 0; i < pre.length; i++) {
    const src = pre[i];
    const dst = reemit[i];
    if (src === undefined || dst === undefined) return undefined;
    const position = i + 1; // 1-based element position in the stripped context
    if (dst.kind === "context" && dst.offset === position) continue;
    if (src.kind === "any") {
      if (
        dst.kind === "index" &&
        dst.storeRef === src.storeRef &&
        dst.offset === position
      ) {
        continue;
      }
      return undefined;
    }
    if (src.kind !== "char") return undefined;
    // src is a literal char: re-emitted as the same literal char.
    if (dst.kind === "char" && dst.value === src.value) continue;
    return undefined;
  }
  return shape;
}

// The cluster's canonical rule for slot extraction: the one with the
// shortest pre-trigger context (the base rule, when present).
function canonicalRephRule(rules: IRRule[]): IRRule | undefined {
  let best: IRRule | undefined;
  let bestLen = Infinity;
  for (const r of rules) {
    if (rephShape(r) === undefined) continue;
    const len = stripPlusSeparator(r).length;
    if (len < bestLen) {
      best = r;
      bestLen = len;
    }
  }
  return best;
}

function findS09Clusters(ir: KeyboardIR): S09ClusterMatch[] {
  const byKey = new Map<string, S09ClusterMatch>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;

      const shape = rephShape(rule);
      if (shape === undefined) continue;

      // Every any() store the context references must resolve — an
      // unresolved ref is no evidence, never a pass.
      const refs = stripPlusSeparator(rule)
        .filter((el) => el.kind === "any")
        .map((el) => (el.kind === "any" ? el.storeRef : ""));
      const stores = refs.map((name) => ir.stores.find((s) => s.name === name));
      if (stores.some((s) => s === undefined)) continue;
      const consonantStore = stores[0];
      if (consonantStore === undefined) continue;

      const key = `${group.nodeId}|${shape.consonantRef}|${shape.trigger}`;
      const existing = byKey.get(key);
      if (existing !== undefined) {
        existing.rules.push(rule);
      } else {
        byKey.set(key, {
          group,
          rules: [rule],
          consonantStore,
          trigger: shape.trigger,
        });
      }
    }
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Slot-value population from YAML lifts_to.slot_mapping
// ---------------------------------------------------------------------------

interface ClusterContext {
  clusterRules: IRRule[];
  stores: Map<string, IRStore>;
  triggerRule?: IRRule | undefined;
  escapeRule?: IRRule | undefined;
  fanOutRule?: IRRule | undefined;
  deadkeyId?: number | undefined;
  sequenceRules?: IRRule[] | undefined;
  cycleRules?: IRRule[] | undefined;
  rephRules?: IRRule[] | undefined;
}

function populateSlots(
  mapping: SlotMapping,
  ctx: ClusterContext,
  ir: KeyboardIR,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [slotId, entry] of Object.entries(mapping)) {
    if (entry.source === null) {
      // source=null means skip — user fills in survey
      continue;
    }

    const { source, transform } = entry;

    if (transform === "rules_to_keystroke_char_map") {
      result[slotId] = applyRulesToKeystrokeCharMap(ctx.clusterRules);
      continue;
    }

    // Resolve the source path
    if (source.startsWith("stores[")) {
      // e.g. "stores[S_bases].items"
      const storeNameMatch = /stores\[([^\]]+)\]/.exec(source);
      if (storeNameMatch === null) continue;
      const storeName = storeNameMatch[1];
      if (storeName === undefined) continue;
      const store = ctx.stores.get(storeName) ?? ir.stores.find((s) => s.name === storeName);
      if (store === undefined) continue;
      if (transform === "store_items_to_char_string") {
        result[slotId] = storeItemsToCharString(store);
      }
      continue;
    }

    if (source.startsWith("rules[trigger]")) {
      const rule = ctx.triggerRule;
      if (rule === undefined) continue;

      if (source.includes("context_pattern[0].name")) {
        const ctx0 = rule.context[0];
        if (ctx0 === undefined) continue;
        if (ctx0.kind === "vkey") {
          const mods = formatVKeyModifiers(ctx0.modifiers);
          result[slotId] = `${mods}${ctx0.name}`;
        } else if (ctx0.kind === "char") {
          result[slotId] = ctx0.value;
        }
        continue;
      }

      if (source.includes("output_pattern[0].id")) {
        const out0 = rule.output[0];
        if (out0 === undefined || out0.kind !== "deadkey") continue;
        if (transform === "numeric_id_to_label") {
          result[slotId] = applyNumericIdToLabel(out0.id);
        } else {
          result[slotId] = String(out0.id);
        }
        continue;
      }
      continue;
    }

    if (source.startsWith("rules[sequence].trigger_chars")) {
      // S-03 triggerChar slot: the distinct literal trigger characters of the
      // cluster's rules, in first-appearance order (usually exactly one).
      const seqRules = ctx.sequenceRules ?? ctx.clusterRules;
      const seen = new Set<string>();
      for (const r of seqRules) {
        const ch = sequenceTriggerChar(r);
        if (ch !== undefined) seen.add(ch);
      }
      if (seen.size > 0) result[slotId] = [...seen].join("");
      continue;
    }

    if (source.startsWith("rules[cycle].trigger_chars")) {
      // S-07 cycleKey slot: the cluster's cycle key. Every cancel rule in
      // a cluster shares one trigger by construction (it is part of the
      // cluster key), so this yields exactly one char.
      const cycRules = ctx.cycleRules ?? ctx.clusterRules;
      const seen = new Set<string>();
      for (const r of cycRules) {
        const s = cancelShape(r);
        if (s !== undefined) seen.add(s.trigger);
      }
      if (seen.size > 0) result[slotId] = [...seen].join("");
      continue;
    }

    if (source.startsWith("rules[reph].trigger_chars")) {
      // S-09 triggerChar slot: the cluster's reph key. Every rule in a
      // cluster shares one trigger by construction (it is part of the
      // cluster key), so this yields exactly one char.
      const rephRules = ctx.rephRules ?? ctx.clusterRules;
      const seen = new Set<string>();
      for (const r of rephRules) {
        const s = rephShape(r);
        if (s !== undefined) seen.add(s.trigger);
      }
      if (seen.size > 0) result[slotId] = [...seen].join("");
      continue;
    }

    if (
      source.startsWith("rules[reph].ra_char") ||
      source.startsWith("rules[reph].virama_char")
    ) {
      // S-09 raChar / viramaChar slots: the reph prefix pair, read from
      // the cluster's canonical (shortest-context) rule's output.
      const canonical = canonicalRephRule(ctx.rephRules ?? ctx.clusterRules);
      if (canonical === undefined) continue;
      const s = rephShape(canonical);
      if (s === undefined) continue;
      result[slotId] = source.includes("virama_char") ? s.viramaChar : s.raChar;
      continue;
    }

    if (source.startsWith("rules[escape].output_pattern[0].value")) {
      // accentChar slot: lift from escape rule's output_pattern[0].value
      const rule = ctx.escapeRule;
      if (rule === undefined) continue;
      const out0 = rule.output[0];
      if (out0 === undefined || out0.kind !== "char") continue;
      result[slotId] = out0.value;
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API: interpretPredicate
// ---------------------------------------------------------------------------

export function interpretPredicate(rule: RecognizerRuleYaml, ir: KeyboardIR): MatchResult[] {
  const clusterType = rule.predicate.cluster_type;
  const results: MatchResult[] = [];

  if (clusterType === "single-rule-direct") {
    const clusters = findS01Clusters(ir);
    for (const cluster of clusters) {
      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            { clusterRules: cluster.rules, stores: new Map() },
            ir,
          )
        : {};

      results.push({
        patternId: `${rule.lifts_to.patternId}#${cluster.group.name}`,
        ownedNodes: cluster.rules.map((r) => ruleRef(r.nodeId)),
        slotValues,
      });
    }
    return results;
  }

  if (clusterType === "three-rule-deadkey") {
    const families = findS02Families(ir);
    for (const family of families) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Add abstract YAML aliases so populateSlots can resolve "S_bases" / "S_output"
      // from the YAML slot_mapping without knowing the IR-level store names.
      storesByName.set("S_bases", family.baseStore);
      storesByName.set("S_output", family.outStore);

      const triggerRules = family.triggers.map((t) => t.rule);
      const clusterRules = [
        ...family.fanOuts,
        ...(family.escape !== undefined ? [family.escape] : []),
        ...triggerRules,
      ];

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules,
              stores: storesByName,
              triggerRule: family.primaryTrigger?.rule,
              escapeRule: family.escape,
              fanOutRule: family.fanOuts[0],
              deadkeyId: family.deadkeyId,
            },
            ir,
          )
        : {};

      // Code-level slot completions for the shapes the YAML slot_mapping
      // cannot reach: an any-store trigger's key is its store's sole char
      // (populateSlots only reads vkey/char context elements), a postfix
      // family may have no trigger rule at all (its prefix char is the
      // trigger identity), and the triggerStore slot exists only for the
      // any-store form.
      if (slotValues["triggerKey"] === undefined) {
        slotValues["triggerKey"] =
          family.primaryTrigger?.triggerKey ?? family.prefixChar ?? "";
      }
      if (slotValues["deadkeyName"] === undefined) {
        slotValues["deadkeyName"] = formatDkName(family.deadkeyId);
      }
      if (family.primaryTrigger?.triggerStore !== undefined) {
        slotValues["triggerStore"] = family.primaryTrigger.triggerStore;
      }

      // Owned exactly as the hand-written rule owns: fan-outs and stores
      // always; triggers only when this is the deadkey's sole family; the
      // escape only when no other family shares it.
      const ownedNodes = [
        ...(family.triggersOwned
          ? triggerRules.map((r) => ruleRef(r.nodeId))
          : []),
        ...family.fanOuts.map((r) => ruleRef(r.nodeId)),
        ...(family.escape !== undefined && !family.escapeShared
          ? [ruleRef(family.escape.nodeId)]
          : []),
        storeRef(family.baseStore.nodeId),
        storeRef(family.outStore.nodeId),
      ];

      results.push({
        patternId: `${rule.lifts_to.patternId}#${family.idSuffix}`,
        ownedNodes,
        slotValues: {
          ...slotValues,
          ...(family.hasBeep ? { __hasBeep: "1" } : {}),
        },
      });
    }
    return results;
  }

  if (clusterType === "sequence-replace") {
    const clusters = findS03Clusters(ir);
    for (const cluster of clusters) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Abstract YAML aliases, as in the S-02 branch, so the YAML
      // slot_mapping resolves "S_bases" / "S_output" without IR store names.
      storesByName.set("S_bases", cluster.baseStore);
      storesByName.set("S_output", cluster.outStore);

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules: cluster.rules,
              stores: storesByName,
              sequenceRules: cluster.rules,
            },
            ir,
          )
        : {};

      results.push({
        // The id suffix encodes the FULL cluster key (group, base store,
        // output store) — Pattern.id must be unique per pattern, and the
        // base store alone is not: multi-tone keyboards (vietnamese_vni)
        // run several clusters over one base store, and a base-only suffix
        // made recognizePatterns throw "Ownership drift" (#2225). The
        // trigger is slot data, not identity — a cluster may carry several
        // triggers (telex {s,S}) and clusters key on the store pair.
        patternId: `${rule.lifts_to.patternId}#${cluster.group.name}:${cluster.baseStore.name}>${cluster.outStore.name}`,
        ownedNodes: [
          ...cluster.rules.map((r) => ruleRef(r.nodeId)),
          storeRef(cluster.baseStore.nodeId),
          storeRef(cluster.outStore.nodeId),
        ],
        slotValues,
      });
    }
    return results;
  }

  if (clusterType === "diacritic-cycling") {
    const clusters = findS07Clusters(ir);
    for (const cluster of clusters) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Abstract YAML aliases, as in the S-02/S-03 branches, so the YAML
      // slot_mapping resolves "S_marked" / "S_unmarked" without IR names.
      storesByName.set("S_marked", cluster.markedStore);
      storesByName.set("S_unmarked", cluster.unmarkedStore);

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules: [...cluster.cancelRules, ...cluster.applyRules],
              stores: storesByName,
              cycleRules: cluster.cancelRules,
            },
            ir,
          )
        : {};

      results.push({
        // The trigger is part of the cluster key, so it is part of the
        // instance id: one store pair serves several cycle keys (telex
        // 's'/'S' over vowels_sac/vowels), and those are distinct Patterns.
        patternId: `${rule.lifts_to.patternId}#${cluster.markedStore.name}+${cluster.trigger}`,
        ownedNodes: [
          ...cluster.cancelRules.map((r) => ruleRef(r.nodeId)),
          ...cluster.applyRules.map((r) => ruleRef(r.nodeId)),
          storeRef(cluster.markedStore.nodeId),
          storeRef(cluster.unmarkedStore.nodeId),
        ],
        slotValues,
      });
    }
    return results;
  }

  if (clusterType === "retroactive-reph") {
    const clusters = findS09Clusters(ir);
    for (const cluster of clusters) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Abstract YAML alias, as in the S-02/S-03/S-07 branches, so the
      // YAML slot_mapping resolves "S_consonants" without IR store names.
      storesByName.set("S_consonants", cluster.consonantStore);

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules: cluster.rules,
              stores: storesByName,
              rephRules: cluster.rules,
            },
            ir,
          )
        : {};

      // Owned stores: the consonant store plus every store a cluster
      // rule's context references via any() (the scaled variants index
      // into the matra store positionally — it is part of the mechanism).
      const ownedStoreNames = new Set<string>();
      for (const r of cluster.rules) {
        for (const el of stripPlusSeparator(r)) {
          if (el.kind === "any") ownedStoreNames.add(el.storeRef);
        }
      }
      const ownedStores = [...ownedStoreNames]
        .map((name) => ir.stores.find((s) => s.name === name))
        .filter((s): s is IRStore => s !== undefined);

      results.push({
        // The trigger is part of the cluster key, so it is part of the
        // instance id (the S-07 precedent): one store can serve several
        // reph keys, and those are distinct Patterns. Including it from
        // day one also keeps multi-cluster store pairs collision-free.
        patternId: `${rule.lifts_to.patternId}#${cluster.consonantStore.name}+${cluster.trigger}`,
        ownedNodes: [
          ...cluster.rules.map((r) => ruleRef(r.nodeId)),
          ...ownedStores.map((s) => storeRef(s.nodeId)),
        ],
        slotValues,
      });
    }
    return results;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API: interpretLift
// ---------------------------------------------------------------------------

export function interpretLift(rule: RecognizerRuleYaml, match: MatchResult): Pattern {
  const today = new Date().toISOString().slice(0, 10);

  // Read beep flag from reserved slotValues entry; strip it before passing to makePattern.
  const hasBeep = match.slotValues["__hasBeep"] === "1";
  const cleanSlotValues: Record<string, string> = { ...match.slotValues };
  delete cleanSlotValues["__hasBeep"];

  // Check combinedWith_if for flag_for_human_review actions.
  const combinedWithIf = rule.predicate.combinedWith_if ?? [];
  // flag_for_human_review is a no-op for now — Pattern has no suitable field for
  // a machine-generated review flag without a real keyboard id. Tracked as follow-up.
  void (hasBeep || combinedWithIf.some((e) => e.action === "flag_for_human_review"));

  // Derive questions from slot_mapping
  const questions = buildQuestions(rule, cleanSlotValues);

  // Derive kmnFragment from strategyId defaults
  const kmnFragment = buildKmnFragment(rule.strategyId, cleanSlotValues);

  const patternInit = {
    id: match.patternId,
    title: titleForStrategy(rule.strategyId),
    description: rule.description?.trim() ?? "",
    category: "desktop" as const,
    appliesTo: [] as string[],
    strategyId: rule.strategyId as import("@keyboard-studio/contracts").StrategyId,
    origin: "recognized" as const,
    ownedNodes: match.ownedNodes,
    questions,
    kmnFragment,
    tests: [] as import("@keyboard-studio/contracts").TestVector[],
    validatedForFamilies: [] as string[],
    sourceKeyboards: [] as string[],
    reviewedBy: "recognizer",
    reviewDate: today,
  };

  try {
    return makePattern(patternInit);
  } catch (err) {
    throw new Error(
      `interpretLift: makePattern failed for pattern "${match.patternId}": ${String(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers for interpretLift
// ---------------------------------------------------------------------------

function titleForStrategy(strategyId: string): string {
  switch (strategyId) {
    case "S-01": return "Simple swap";
    case "S-02": return "Single-tap deadkey";
    case "S-03": return "Sequence replace";
    case "S-07": return "Diacritic cycling";
    case "S-09": return "Retroactive reph";
    case "S-08": return "Full remap";
    default: return strategyId;
  }
}

function buildQuestions(
  rule: RecognizerRuleYaml,
  slotValues: Record<string, string>,
): import("@keyboard-studio/contracts").PatternQuestion[] {
  const mapping = rule.lifts_to.slot_mapping;
  if (mapping === undefined) return [];

  const questions: import("@keyboard-studio/contracts").PatternQuestion[] = [];

  for (const [slotId, entry] of Object.entries(mapping)) {
    // source=null means user fills in survey — still include the question but without a default
    const defaultValue = slotValues[slotId] ?? "";
    const answerType = inferAnswerType(slotId, entry.transform ?? "none");

    questions.push({
      id: slotId,
      prompt: promptForSlot(slotId),
      answerType,
      ...(defaultValue !== "" ? { default: defaultValue } : {}),
    });
  }

  return questions;
}

function inferAnswerType(
  slotId: string,
  transform: string,
): import("@keyboard-studio/contracts").AnswerType {
  if (transform === "rules_to_keystroke_char_map") return "text";
  if (transform === "store_items_to_char_string") return "char-list";
  if (slotId === "triggerKey") return "key-name";
  if (slotId === "deadkeyName") return "text";
  return "text";
}

function promptForSlot(slotId: string): string {
  switch (slotId) {
    case "keystrokeCharacterMap": return "Keystroke-to-character map (one entry per line: + [MODS KEY] > U+XXXX)";
    case "swapCharDescriptions": return "Human-readable description of each swapped character";
    case "triggerKey": return "Virtual key that triggers the deadkey state";
    case "deadkeyName": return "Internal deadkey name";
    case "baseLetters": return "Base letters the deadkey applies to";
    case "accentedForms": return "Resulting accented forms";
    case "accentChar": return "Bare combining accent character (emitted by escape rule)";
    case "contextChars": return "Characters that trigger a special output when followed by the trigger character";
    case "contextOutputs": return "Output for each context character above, in the same order";
    case "triggerChar": return "Character typed after a base character to trigger the replacement";
    case "contextStoreName": return "Internal name for this rule set";
    case "defaultOutput": return "What the trigger character produces when no special context character came before it";
    case "cycleStoreName": return "Internal name for this tone-cycle rule set";
    case "plainChars": return "Vowels without this tone mark, in order";
    case "markedChars": return "The same vowels with this tone mark applied, in the same order";
    case "cycleKey": return "Character key that applies this tone — pressing it again after a marked vowel cancels the tone and types the key itself";
    case "consonantChars": return "Consonants the reph key can follow, in order — a consonant typed before the reph key is re-emitted after the ra + virama prefix";
    case "consonantStoreName": return "Internal name for this reph rule set";
    case "raChar": return "The ra character of this script (first half of the reph prefix)";
    case "viramaChar": return "The virama (conjunct) sign of this script (second half of the reph prefix)";
    default: return slotId;
  }
}

function buildKmnFragment(strategyId: string, slotValues: Record<string, string>): string {
  switch (strategyId) {
    case "S-01":
      return "{{keystrokeCharacterMap}}";
    case "S-02":
      // Shared with the hand-written rule (s02-families.ts buildS02Fragment):
      // any-store trigger form when triggerStore is set, escape line only
      // when the family has an escape (accentChar slot present).
      return buildS02Fragment(slotValues);
    case "S-03":
      // Schematic, following the S-02 precedent: slot values are store
      // CONTENTS inlined, not store references. The guarded sil_ipa form
      // additionally carries its if(...) guard in the source rules; the
      // template shows the canonical unguarded shape.
      return 'any({{contextChars}}) + "{{triggerChar}}" > index({{contextOutputs}}, 1)';
    case "S-07":
      // Schematic, following the S-02/S-03 precedent: slot values are
      // store CONTENTS inlined, not store references. The cancel rule
      // comes first — it is the cluster's defining member; the apply rule
      // is its pair. The cycle key appears in both the cancel rule's
      // context and its output (the re-emission is the mechanism).
      return (
        'any({{markedChars}}) + "{{cycleKey}}" > index({{plainChars}}, 1) "{{cycleKey}}"\n' +
        'any({{plainChars}}) + "{{cycleKey}}" > index({{markedChars}}, 1)'
      );
    case "S-09":
      // Schematic, following the S-02/S-03 precedent: slot values are
      // store CONTENTS inlined, not store references. The canonical base
      // rule: a consonant followed by the reph key re-emits ra + virama +
      // the consonant. Scaled variants (consonant + matra already typed)
      // follow the same shape, re-emitting the full pre-trigger context
      // in order after the prefix.
      return 'any({{consonantChars}}) + "{{triggerChar}}" > {{raChar}} {{viramaChar}} index({{consonantChars}}, 1)';
    default:
      // Fallback: emit placeholders for every known slot value
      return Object.keys(slotValues)
        .map((k) => `{{${k}}}`)
        .join("\n");
  }
}
