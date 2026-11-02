// classifyForLdml: the one classifier (spec 108, FR-008, FR-012; task T028).
//
// It composes the header, call-graph, keystroke and rule-element classifiers, adds the
// row 2.26 items, builds every item's keys, sorts by siteKey, counts, and deep-freezes.
// Statuses, codes and severities come from the resolved profile only (FR-061).

import type { IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import { compareCodePoints } from "../lower/keyIds.js";
import { MAIN_BLOCK_VKEYS } from "../lower/positions.js";
import type { TargetProfile } from "../profiles/types.js";
import type { LdmlClassification, LdmlClassifyInput, LdmlStatus } from "../types.js";
import { buildCallGraph, type CallGraph } from "./callGraph.js";
import { classifyHeader, isAnsiOnly, isMnemonicLayout, type HeaderOptions } from "./header.js";
import { ItemSink, deepFreeze } from "./items.js";
import {
  analyseModifiers,
  chooseForm,
  charTarget,
  layerModifiers,
  splitRule,
  storeKeyTargets,
  type ResolveContext,
} from "./keystrokes.js";
import { parseBracketKey, routeFragmentReason } from "./rawText.js";
import { analyseRule, dkKey, findStore, type RulePlan } from "./ruleElements.js";

export type ClassifyOptions = HeaderOptions;

/** Everything the lowering needs beyond the frozen classification. */
export interface ClassifyDetail {
  classification: LdmlClassification;
  plans: RulePlan[];
  graph: CallGraph;
  form: import("../lower/positions.js").LdmlForm;
  rc: ResolveContext;
}

const BASE_LAYER_WORDS = {
  base: [],
  shift: ["SHIFT"],
  altgr: ["RALT"],
  shiftAltgr: ["RALT", "SHIFT"],
} as const;

function collectDeadkeysOutput(ir: KeyboardIR): Set<string> {
  const out = new Set<string>();
  for (const g of ir.groups) {
    for (const r of g.rules) {
      for (const el of r.output) if (el.kind === "deadkey" || el.kind === "namedDeadkey") out.add(dkKey(el));
    }
  }
  return out;
}

function sidedUsedElsewhere(ir: KeyboardIR): boolean {
  for (const g of ir.groups) {
    for (const r of g.rules) {
      const ks = splitRule(r, g.usingKeys).keystroke;
      if (ks?.kind !== "vkey") continue;
      const m = ks.mods;
      if (!m.mixedSides && m.components.some((c) => /^(ctrl|alt)[LR]$/.test(c))) return true;
    }
  }
  return false;
}

function collectVKeys(ir: KeyboardIR, rc: ResolveContext): string[] {
  const out: string[] = [];
  for (const g of ir.groups) {
    for (const r of g.rules) {
      const ks = splitRule(r, g.usingKeys).keystroke;
      if (ks === null) continue;
      if (ks.kind === "vkey" || ks.kind === "rawKey") out.push(ks.vkey);
      else if (ks.kind === "char") {
        const t = charTarget(ks.char, rc);
        if (t) out.push(t.vkey);
      } else if (ks.kind === "any") {
        for (const t of storeKeyTargets(findStore(ir, ks.storeRef), rc)) if (t) out.push(t.vkey);
      }
    }
  }
  return out;
}

function groupNodeKey(g: IRGroup): string {
  return `group:${g.name}#group`;
}

export function classifyDetailed(
  input: LdmlClassifyInput,
  profile: TargetProfile,
  options: ClassifyOptions = {},
): ClassifyDetail {
  const { ir, baseLayout } = input;
  const sink = new ItemSink(profile);
  const rc: ResolveContext = { mnemonic: isMnemonicLayout(ir), baseLayout };
  const graph = buildCallGraph(ir);
  const ansiOnly = isAnsiOnly(ir);
  const touchPresent = (input.touchLayout?.platforms.length ?? 0) > 0;
  const form = chooseForm(collectVKeys(ir, rc), baseLayout);
  const plans: RulePlan[] = [];

  classifyHeader(ir, sink, options);

  if (!ansiOnly) {
    const env = {
      ir,
      sink,
      rc,
      form,
      graph,
      baseLayout,
      deadkeysOutput: collectDeadkeysOutput(ir),
      sidedElsewhere: sidedUsedElsewhere(ir),
    };

    // Groups and their rules.
    for (const g of ir.groups) {
      const facts = graph.facts.get(g);
      if (facts === undefined) continue;
      const gk = { nodeKey: groupNodeKey(g), line: g.sourceLine, owner: `group ${g.name}`, params: { group: g.name } };
      if (facts.role === "newContext") sink.add("1.3", gk);
      else if (facts.role === "postKeystroke") sink.add("1.4", gk);
      else if (facts.role === "unreachable") sink.add("1.11", gk);
      else if (g === graph.entry) sink.add("1.1", gk);
      else if (facts.reach === "every") sink.add("1.5", gk);
      else if (g.usingKeys && facts.calledFromKeystrokeGroup) sink.add("1.7", { ...gk, status: "A" });
      else sink.add("1.6", { ...gk, status: "A" });
      g.rules.forEach((rule, i) => plans.push(analyseRule(env, facts, rule, i)));
    }

    // Stores.
    for (const s of ir.stores) {
      if (s.isSystem) continue;
      const nodeKey = `store:${s.name}`;
      const bad = s.items.some((it) => it.kind === "raw" && parseBracketKey(it.text) === null);
      const o = { nodeKey, line: s.sourceLine, params: { store: s.name } };
      if (bad) sink.add("3.26", { ...o, status: "N" });
      else sink.add("3.6", o);
    }

    // Fragments: exactly one item each (FR-013).
    ir.raw.forEach((frag, i) => {
      const route = routeFragmentReason(frag.reason);
      const group = frag.groupNodeId === undefined ? undefined : ir.groups.find((g) => g.nodeId === frag.groupNodeId);
      sink.add(route.rowId, {
        nodeKey: `fragment#${i}`,
        line: frag.sourceLine,
        owner: group === undefined ? null : `group ${group.name}`,
        isRule: frag.groupNodeId !== undefined,
        params: { reason: route.reason },
      });
    });

    // Row 3.22: rules in one group whose contexts are equal under NFD but written differently.
    flagNormalisationPairs(plans, sink);

    // Row 2.26: positions no rule covers where the base keyboard has a dead key.
    addBaseDeadkeys(plans, input, sink);
  }

  if (touchPresent) sink.add("5.15", { nodeKey: "header:touch", side: "touch" });

  const items = sink.all().sort((a, b) => compareCodePoints(a.siteKey, b.siteKey));
  const counts: Record<LdmlStatus, number> = { M: 0, A: 0, N: 0, K: 0 };
  for (const it of items) counts[it.status] += 1;
  const classification: LdmlClassification = deepFreeze({
    profileId: profile.id,
    items,
    counts,
    baseLayout: { id: baseLayout.id, label: baseLayout.label, source: baseLayout.source },
    ansiOnly,
    touchPresent,
  });
  return { classification, plans, graph, form, rc };
}

/** The classifier entry point (pure, synchronous). */
export function classifyForLdml(
  input: LdmlClassifyInput,
  profile: TargetProfile,
  options: ClassifyOptions = {},
): LdmlClassification {
  return classifyDetailed(input, profile, options).classification;
}

function flagNormalisationPairs(plans: readonly RulePlan[], sink: ItemSink): void {
  const seen = new Map<string, RulePlan[]>();
  for (const p of plans) {
    if (!p.lower || p.keystroke === null) continue;
    if (!p.pre.every((e) => e.kind === "char")) continue;
    const ctx = p.pre.map((e) => (e.kind === "char" ? e.value : "")).join("");
    const key = `${p.group.name}|${JSON.stringify(p.targets.map((t) => [t.target.vkey, t.target.mods.components, t.target.mods.caps]))}|${ctx.normalize("NFD")}`;
    const list = seen.get(key) ?? [];
    list.push(p);
    seen.set(key, list);
  }
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    const ctxs = new Set(list.map((p) => p.pre.map((e) => (e.kind === "char" ? e.value : "")).join("")));
    const outs = new Set(list.map((p) => JSON.stringify(p.rule.output)));
    if (ctxs.size < 2 || outs.size < 2) continue;
    for (const p of list) {
      sink.add("3.22", { nodeKey: p.nodeKey, line: p.rule.sourceLine, owner: `group ${p.group.name}`, isRule: true });
    }
  }
}

function addBaseDeadkeys(plans: readonly RulePlan[], input: LdmlClassifyInput, sink: ItemSink): void {
  const base = input.baseLayout;
  const covered = (words: readonly string[], vkey: string, caps: boolean): boolean => {
    const comps = analyseModifiers(words).components.join(" ");
    return plans.some(
      (p) =>
        p.lower &&
        p.targets.some(
          (t) =>
            t.target.vkey === vkey &&
            t.target.mods.components.join(" ") === comps &&
            (t.target.mods.caps === "any" || (t.target.mods.caps === "on") === caps),
        ),
    );
  };
  for (const layer of ["base", "shift", "altgr", "shiftAltgr"] as const) {
    const words = BASE_LAYER_WORDS[layer];
    const comps = analyseModifiers(words).components;
    for (const vkey of Object.keys(base.layers[layer]).sort(compareCodePoints)) {
      if (base.layers[layer][vkey] !== "deadkey" || !MAIN_BLOCK_VKEYS.has(vkey)) continue;
      for (const caps of [false, true]) {
        if (covered(words, vkey, caps)) continue;
        const name = layerModifiers(comps, caps);
        sink.add("2.26", {
          nodeKey: `base:${name}/${vkey}`,
          side: "hardware",
          params: { layer: name, vkey, base: base.id },
        });
      }
    }
  }
}
