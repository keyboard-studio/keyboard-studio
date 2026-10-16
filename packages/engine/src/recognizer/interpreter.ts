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

// A "trigger" rule: exactly one context element that is vkey or char, output is deadkey.
// Matches isTrigger() in s02-deadkey-single-tap.ts exactly.
function matchesTriggerRole(rule: IRRule): boolean {
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "deadkey") return false;
  // S-02 YAML says count: zero_or_one, but the TS reference implementation
  // requires context.length === 1. We implement what the TS rule does.
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined) return false;
  return ctx.kind === "vkey" || ctx.kind === "char";
}

// A "fan-out" rule: [deadkey, any] context, [index] output with offset matching any position.
function matchesFanOutRole(rule: IRRule): boolean {
  if (rule.context.length !== 2) return false;
  const c0 = rule.context[0];
  const c1 = rule.context[1];
  if (c0 === undefined || c0.kind !== "deadkey") return false;
  if (c1 === undefined || c1.kind !== "any") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== "index") return false;
  // any() is at position 2 (1-indexed) in context; only offset===2 is supported in v1.1
  return out.offset === 2;
}

// An "escape" rule: [deadkey, vkey] context, [char] output, same dk id as a given trigger.
function matchesEscapeRole(rule: IRRule, deadkeyId: number): boolean {
  if (rule.context.length !== 2) return false;
  const c0 = rule.context[0];
  const c1 = rule.context[1];
  if (c0 === undefined || c0.kind !== "deadkey" || c0.id !== deadkeyId) return false;
  if (c1 === undefined || c1.kind !== "vkey") return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  return out !== undefined && out.kind === "char";
}

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

interface S02ClusterMatch {
  triggers: IRRule[];
  fanOut: IRRule;
  escape: IRRule;
  deadkeyId: number;
  baseStore: IRStore;
  outStore: IRStore;
  group: IRGroup;
  hasBeep: boolean;
}

function findS02Clusters(ir: KeyboardIR): S02ClusterMatch[] {
  // Index triggers by deadkey id (from usingKeys=true groups, any name).
  const triggersByDkId = new Map<number, IRRule[]>();
  for (const group of ir.groups) {
    if (!groupPassesConstraints(group, true)) continue;
    for (const rule of group.rules) {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;
      if (!matchesTriggerRole(rule)) continue;
      const out = rule.output[0];
      if (out === undefined || out.kind !== "deadkey") continue;
      const existing = triggersByDkId.get(out.id) ?? [];
      existing.push(rule);
      triggersByDkId.set(out.id, existing);
    }
  }

  // Index fan-out rules by deadkey id across ALL groups (no name filter).
  // Also track which group each fan-out lives in, so we can find escape in
  // the same group and check the usingKeys constraint.
  const fanOutByDkId = new Map<number, { rule: IRRule; group: IRGroup }>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // FR-021: behaviour-owned rules are never pattern candidates.
      if (rule.ownedByPattern !== undefined || isBehaviourOwned(rule)) continue;
      if (!matchesFanOutRole(rule)) continue;
      const c0 = rule.context[0];
      if (c0 === undefined || c0.kind !== "deadkey") continue;
      if (!fanOutByDkId.has(c0.id)) {
        fanOutByDkId.set(c0.id, { rule, group });
      }
    }
  }

  const clusters: S02ClusterMatch[] = [];

  for (const [dkId, triggers] of triggersByDkId.entries()) {
    const fanOutEntry = fanOutByDkId.get(dkId);
    if (fanOutEntry === undefined) continue;
    const { rule: fanOut, group: deadkeyGroup } = fanOutEntry;

    // Fan-out group must not be a usingKeys=true group (triggers are usingKeys=true;
    // the deadkey group that holds fan-out/escape is typically usingKeys=false).
    // Reject any dkId where triggers and fan-out share the same group instance.
    const triggerGroupOwnsAll = triggers.every((t) =>
      deadkeyGroup.rules.includes(t),
    );
    if (triggerGroupOwnsAll) continue;

    const c1 = fanOut.context[1];
    const outEl = fanOut.output[0];
    if (
      c1 === undefined ||
      c1.kind !== "any" ||
      outEl === undefined ||
      outEl.kind !== "index"
    ) continue;

    const baseStore = ir.stores.find((s) => s.name === c1.storeRef);
    const outStore = ir.stores.find((s) => s.name === outEl.storeRef);
    if (baseStore === undefined || outStore === undefined) continue;

    // Parallel-store length invariant
    if (baseStore.items.length !== outStore.items.length) continue;

    // Store items must be char-only (disqualify if any non-char item)
    const baseAllChar = baseStore.items.every((item) => item.kind === "char");
    const outAllChar = outStore.items.every((item) => item.kind === "char");
    if (!baseAllChar || !outAllChar) continue;

    // Find escape rule in the SAME group as fan-out (no name filter).
    const escape = deadkeyGroup.rules.find(
      (r) => r.ownedByPattern === undefined && matchesEscapeRole(r, dkId),
    );
    if (escape === undefined) continue;

    // Check for beep in any rule in the deadkey group with this dk id.
    const hasBeep = deadkeyGroup.rules.some((r) => {
      const c0 = r.context[0];
      if (c0 === undefined || c0.kind !== "deadkey" || c0.id !== dkId) return false;
      return r.output.some((el) => el.kind === "beep");
    });

    clusters.push({
      triggers,
      fanOut,
      escape,
      deadkeyId: dkId,
      baseStore,
      outStore,
      group: deadkeyGroup,
      hasBeep,
    });
  }

  return clusters;
}

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
    const clusters = findS02Clusters(ir);
    for (const cluster of clusters) {
      const storesByName = new Map<string, IRStore>([
        ...ir.stores.map((s): [string, IRStore] => [s.name, s]),
      ]);
      // Add abstract YAML aliases so populateSlots can resolve "S_bases" / "S_output"
      // from the YAML slot_mapping without knowing the IR-level store names.
      storesByName.set("S_bases", cluster.baseStore);
      storesByName.set("S_output", cluster.outStore);

      const canonicalTrigger =
        cluster.triggers.find((r) => {
          const ctx = r.context[0];
          return ctx?.kind === "vkey" && ctx.modifiers.length === 0;
        }) ?? cluster.triggers[0];

      const slotValues = rule.lifts_to.slot_mapping !== undefined
        ? populateSlots(
            rule.lifts_to.slot_mapping,
            {
              clusterRules: [cluster.fanOut, cluster.escape, ...cluster.triggers],
              stores: storesByName,
              triggerRule: canonicalTrigger,
              escapeRule: cluster.escape,
              fanOutRule: cluster.fanOut,
              deadkeyId: cluster.deadkeyId,
            },
            ir,
          )
        : {};

      const ownedNodes = [
        ...cluster.triggers.map((r) => ruleRef(r.nodeId)),
        ruleRef(cluster.fanOut.nodeId),
        ruleRef(cluster.escape.nodeId),
        storeRef(cluster.baseStore.nodeId),
        storeRef(cluster.outStore.nodeId),
      ];

      const patternIdBase = `${rule.lifts_to.patternId}#${formatDkName(cluster.deadkeyId)}`;

      results.push({
        patternId: patternIdBase,
        ownedNodes,
        slotValues: {
          ...slotValues,
          ...(cluster.hasBeep ? { __hasBeep: "1" } : {}),
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
        patternId: `${rule.lifts_to.patternId}#${cluster.baseStore.name}`,
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
    default: return slotId;
  }
}

function buildKmnFragment(strategyId: string, slotValues: Record<string, string>): string {
  switch (strategyId) {
    case "S-01":
      return "{{keystrokeCharacterMap}}";
    case "S-02":
      // Use slot names that match the YAML slot_mapping keys
      return (
        "+ [{{triggerKey}}] > dk({{deadkeyName}})\n" +
        "dk({{deadkeyName}}) + any({{baseLetters}}) > index({{accentedForms}}, 2)\n" +
        "dk({{deadkeyName}}) + [{{triggerKey}}] > {{accentChar}}"
      );
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
    default:
      // Fallback: emit placeholders for every known slot value
      return Object.keys(slotValues)
        .map((k) => `{{${k}}}`)
        .join("\n");
  }
}
