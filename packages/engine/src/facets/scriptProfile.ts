// Output script profile: which scripts a keyboard's produced characters are
// written in, and how dominant the leading one is.
//
// Same attribution as the offline facet-index `script` classifier
// (utilities/facet-index/script-classifier.ts), minus its desktop base-layout
// fold: pass 1 tallies exclusive-Script characters (concrete Script, no
// Script_Extensions) and fixes the attested set; pass 2 splits each shared
// character's weight across the attested scripts in its extension set, and
// drops it when none is attested. Common/Inherited/Unknown never count.
// "Confident" uses the classifier's bar: the dominant script holds >= 80%.
//
// Browser-safe: pure over KeyboardIR + the generated UCD lookup.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";

import { scriptOf, scriptExtensionsOf } from "./generated/scriptLookup.js";

const NEUTRAL_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

/** The facet-index classifier's `confident` dominant share. */
export const CONFIDENT_SCRIPT_SHARE = 0.8;

export interface OutputScriptProfile {
  /** Script -> share of the scripted output (shares sum to ~1). */
  distribution: Readonly<Record<string, number>>;
  /** The script with the largest share; undefined when nothing is scripted. */
  dominant?: string;
  /** The dominant script's share, 0 when nothing is scripted. */
  dominantShare: number;
  /** Produced characters that counted as script evidence. */
  evidenceSize: number;
}

export function outputScriptProfile(ir: KeyboardIR): OutputScriptProfile {
  const histogram = new Map<string, number>();
  const shared: number[] = [];
  let evidenceSize = 0;

  for (const ch of buildProducedSet(ir)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (scriptExtensionsOf(cp) !== undefined) {
      shared.push(cp);
      continue;
    }
    const script = scriptOf(cp);
    if (NEUTRAL_SCRIPTS.has(script)) continue;
    histogram.set(script, (histogram.get(script) ?? 0) + 1);
    evidenceSize += 1;
  }
  const attested = new Set(histogram.keys());
  for (const cp of shared) {
    const matched = scriptExtensionsOf(cp)!.filter((s) => attested.has(s));
    if (matched.length === 0) continue;
    for (const s of matched) {
      histogram.set(s, (histogram.get(s) ?? 0) + 1 / matched.length);
    }
    evidenceSize += 1;
  }

  const total = [...histogram.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return { distribution: {}, dominantShare: 0, evidenceSize: 0 };
  const distribution: Record<string, number> = {};
  let dominant = "";
  let best = -1;
  for (const [script, count] of [...histogram].sort(([a], [b]) => a.localeCompare(b))) {
    distribution[script] = count / total;
    if (count > best) {
      dominant = script;
      best = count;
    }
  }
  return { distribution, dominant, dominantShare: best / total, evidenceSize };
}
