/**
 * Touch modifier-layers classifier (spec 041 US2, T027) — touch-layout evidence.
 *
 * `valueType: enum`, values ∈ {none, maps-desktop-modifiers, mixed}: whether the
 * keyboard's `.keyman-touch-layout` reproduces desktop modifier combinations
 * (ALT / RALT / CTRL) as their own touch layers. Read from the layer ids directly
 * (FR-021), independent of the desktop `.kmn`. A keyboard with no touch layout is
 * `notApplicable` (FR-022).
 *
 * A reproduced modifier layer exists because touch has no physical modifier keys,
 * so each such layer is treated as an exception SITE past the primary layer set —
 * its `location` is prefixed `"overflow"`, which is exactly the signal the shared
 * `layer-capacity` cause predicate keys off (cause-predicates.ts), so the sites
 * are tagged `capacity-forced` (AS-3). `consistency` is the share of standard
 * (non-modifier) layers; the reported `value` is `maps-desktop-modifiers` when any
 * modifier layer is present, else `none`.
 *
 * `mixed` (a layout that reproduces SOME desktop modifiers but demonstrably omits
 * others) needs the desktop modifier set from the IR to decide "omits others"; it
 * stays a valid-but-unreached member in this touch-only starter, deferred rather
 * than guessed — matching the mnemonic-vs-positional gate's honest single read.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

import { notApplicableMeasurement, CONFIDENT_CONSISTENCY } from "./measurement.js";
import { tagExceptionSet } from "./cause-predicates.js";
import { readTouchLayout, layerIds, modifierLayerIds, touchCategorization } from "./touch-layout.js";
import type { CauseTag, Categorization, ClassifierContext, ExceptionSite, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const NO_TOUCH = "no .keyman-touch-layout; touch-modifier-layers not applicable";

function deriveTouchModifierLayers(kb: ScannedKeyboard): Categorization {
  const model = readTouchLayout(kb);
  if (model === null) return notApplicableMeasurement(NO_TOUCH);

  const all = layerIds(model);
  const modifiers = modifierLayerIds(model);
  const total = all.length;

  if (modifiers.length === 0) {
    return touchCategorization({
      value: "none",
      evidenceSize: total,
      consistency: 1,
      notes: "no ALT/CTRL-family touch layers",
    });
  }

  // Each reproduced modifier layer is an exception site past the primary layer
  // set — the `overflow` locator is what the `layer-capacity` predicate fits.
  const exceptions: ExceptionSite[] = modifiers.map((id) => ({
    location: `overflow:layer:${id}`,
    observedValue: "maps-desktop-modifiers",
    causeTag: "gap-omission", // placeholder; tagExceptionSet computes the real tag
  }));
  const ctx: ClassifierContext = { scriptFamily: null, casing: "caseless", analyzedCoverage: 1 };
  const tag: CauseTag = tagExceptionSet(exceptions, ctx) ?? "gap-omission";

  // total >= modifiers.length > 0 here (the modifiers-empty case returned above).
  const consistency = (total - modifiers.length) / total;
  return touchCategorization({
    value: "maps-desktop-modifiers",
    evidenceSize: total,
    consistency,
    causeTagCounts: { [tag]: modifiers.length },
    confidenceClass: consistency >= CONFIDENT_CONSISTENCY ? "confident" : "mixed",
    notes: `reproduced modifier layers: ${modifiers.join(", ")}`,
  });
}

export function classifyTouchModifierLayers(
  ir: KeyboardIR,
  def: FacetDefinition,
  kb: ScannedKeyboard,
): Categorization | null {
  void ir;
  void def;
  return deriveTouchModifierLayers(kb);
}

export function touchModifierLayersFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void def;
  return deriveTouchModifierLayers(kb);
}
