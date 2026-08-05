/**
 * Touch (longpress) placement mining — placement-priors v2.
 *
 * Mines LONGPRESS ONLY (a key's `sk[]` sub-entries) per character from one
 * corpus keyboard's `.keyman-touch-layout`. Multitap and flick are
 * deliberately out of scope for v2 (longpress is the dominant, most-
 * consistently-authored corpus mechanism for a secondary character on a
 * touch key).
 *
 * This is a SEPARATE vocabulary from the physical-key `PlacementCandidate` /
 * `PlacementMechanism` extraction in `index.ts` / `deadkey.ts` — see
 * `TouchPlacementEntry` in `@keyboard-studio/contracts`. Never merge the two.
 *
 * `layerClass` buckets the HOST key's own OUTER (top-level `.keyman-touch-
 * layout` layer) id — `"default"` / `"shift"` / anything else folds to
 * `"other"`. Deliberately NOT derived from an `sk[]` sub-entry's own
 * `layerAnnotation` (the raw `"layer"` wire field, e.g. `"rightalt"` in
 * release/g/ghana/source/ghana.keyman-touch-layout): that annotation is
 * inconsistently applied across the corpus and sometimes names a layer that
 * does not exist top-level, so it is not a reliable bucketing signal — see
 * `TouchKeyIR.layerAnnotation`'s doc comment.
 *
 * @see spec.md §7.6 (corpus-derived placement priors, placement-priors v2)
 */

import type { TouchLayoutIR, TouchKeyIR, TouchPlacementEntry } from "@keyboard-studio/contracts";
import { decodeUnicodeKeyId, isSpacerKeyClass, toUPlusNotation } from "@keyboard-studio/contracts";
import { isSingleCodepoint, isStandardKey } from "./filters.js";

export type TouchLayerClass = "default" | "shift" | "other";

/** One raw (unaggregated) longpress-host observation from a single keyboard. */
export interface TouchHostObservation {
  /** Target codepoint in "U+XXXX" notation. */
  codepoint: string;
  /** Virtual key name of the MAIN key the longpress hangs off of. */
  vkey: string;
  layerClass: TouchLayerClass;
}

function layerClassFor(layerId: string): TouchLayerClass {
  if (layerId === "default") return "default";
  if (layerId === "shift") return "shift";
  return "other";
}

/**
 * The character an `sk[]` sub-entry produces: `text`, then `output`, then a
 * decoded `U_<HEX>` id — same precedence as `touch-coverage.ts`'s
 * `collectKeyChars`, NFC-normalized. `undefined` when the sub-entry has no
 * char-producing field (e.g. a bare layer-switch key).
 */
function producedChar(key: TouchKeyIR): string | undefined {
  const raw = key.text ?? key.output ?? decodeUnicodeKeyId(key.id);
  if (raw === undefined || raw.length === 0 || raw.startsWith("*")) return undefined;
  return raw.normalize("NFC");
}

/**
 * Mine every longpress (`sk[]`) host in `layout`, one observation per
 * (codepoint, host vkey, layerClass) instance found. The caller is
 * responsible for per-keyboard dedup / cross-corpus aggregation (see
 * `aggregateTouchHosts`) — this function does not vote, it only observes.
 */
export function mineLongpressHosts(layout: TouchLayoutIR): TouchHostObservation[] {
  const out: TouchHostObservation[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const layerClass = layerClassFor(layer.id);
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (isSpacerKeyClass(key.sp)) continue;
          if (!isStandardKey(key.id)) continue;
          for (const sub of key.sk ?? []) {
            const ch = producedChar(sub);
            if (ch === undefined) continue;
            // Single-codepoint only — same constraint as the
            // physical-mechanism extraction.
            if (!isSingleCodepoint(ch)) continue;
            out.push({ codepoint: toUPlusNotation(ch), vkey: key.id, layerClass });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Cross-keyboard aggregation: one vote per (codepoint, vkey, layerClass)
 * PER KEYBOARD (a keyboard with the same host repeated across platforms —
 * e.g. phone + tablet — still contributes only one vote), mirroring the
 * "independent keyboards" voting semantics of the physical-mechanism corpus
 * priors (spec §7.6).
 */
export function aggregateTouchHosts(
  perKeyboardObservations: TouchHostObservation[][],
): Map<string, Map<string, { vkey: string; layerClass: TouchLayerClass; priorCount: number }>> {
  const byCodepoint = new Map<
    string,
    Map<string, { vkey: string; layerClass: TouchLayerClass; priorCount: number }>
  >();

  for (const observations of perKeyboardObservations) {
    // One vote per (codepoint, vkey, layerClass) per keyboard.
    const seenThisKeyboard = new Set<string>();
    for (const obs of observations) {
      const slotKey = `${obs.codepoint}|${obs.vkey}|${obs.layerClass}`;
      if (seenThisKeyboard.has(slotKey)) continue;
      seenThisKeyboard.add(slotKey);

      let slotMap = byCodepoint.get(obs.codepoint);
      if (slotMap === undefined) {
        slotMap = new Map();
        byCodepoint.set(obs.codepoint, slotMap);
      }
      const existing = slotMap.get(slotKey);
      if (existing !== undefined) {
        existing.priorCount += 1;
      } else {
        slotMap.set(slotKey, { vkey: obs.vkey, layerClass: obs.layerClass, priorCount: 1 });
      }
    }
  }

  return byCodepoint;
}

/**
 * Convert `aggregateTouchHosts`'s result into the `TouchPlacementEntry[]`
 * shape carried on `PlacementPriorsJSON.touch` — hosts sorted by descending
 * `priorCount` (best-first, matching `PlacementEntry.candidates`'
 * best-first convention), entries sorted by codepoint for determinism.
 */
export function touchHostsToEntries(
  byCodepoint: Map<string, Map<string, { vkey: string; layerClass: TouchLayerClass; priorCount: number }>>,
): TouchPlacementEntry[] {
  const entries: TouchPlacementEntry[] = [];
  for (const [codepoint, slotMap] of byCodepoint) {
    const hosts = [...slotMap.values()].sort((a, b) => b.priorCount - a.priorCount);
    entries.push({ codepoint, hosts });
  }
  entries.sort((a, b) => a.codepoint.localeCompare(b.codepoint));
  return entries;
}
