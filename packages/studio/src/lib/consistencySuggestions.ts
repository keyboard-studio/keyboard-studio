// consistencySuggestions: the per-Apply consistency delta and the follow-up
// suggestions it feeds (spec 111 US5, research R10).
//
// After an applied change, the physical keys, touch layout and layer list are
// measured before and after. Only what THIS change added or removed is
// reported, so an inconsistency the keyboard already had never becomes a
// suggestion (it stays in the criteria view as a pre-existing finding).
//
//   - physical: `buildProducedSet(ir)` (what the rules type);
//   - touch: `computeTouchCoverage` over the candidate characters (the same
//     production model criterion 18.6 uses);
//   - layers: the 11.6 layer-id extraction (`collectLayerIds`), supplied by
//     the caller.
//
// Nothing here applies anything. Docs side (R10 limit): nothing computes which
// characters the help mentions, so the docs suggestion is "refresh the
// generated section", never "add this character to the prose".
//
// Pure: no store reads, no timers (decision D3 is untouched).

import {
  buildProducedSet,
  buildTouchKeyRuleIndex,
  computeTouchCoverage,
  type KeyboardIR,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";

/** The measured state of one point in time. */
export interface ConsistencyState {
  physical: ReadonlySet<string>;
  /** Characters with a reachable touch mechanism (among the candidates). */
  touch: ReadonlySet<string>;
  layers: ReadonlySet<string>;
}

/** What the measurement reads. */
export interface ConsistencyInput {
  ir: KeyboardIR;
  /** Null when the keyboard has no touch layout. */
  touchLayout: TouchLayoutIR | null;
  /** 11.6 layer ids (`collectLayerIds`): desktop plus touch layers. */
  layerIds: readonly string[];
}

/** Per-Apply delta, scoped to what the change altered. */
export interface ConsistencyDelta {
  addedPhysical: readonly string[];
  removedPhysical: readonly string[];
  addedTouch: readonly string[];
  removedTouch: readonly string[];
  addedLayers: readonly string[];
  removedLayers: readonly string[];
}

function touchKeyChars(key: TouchKeyIR, out: Set<string>): void {
  const text = key.text?.normalize("NFC");
  if (text !== undefined && [...text].length === 1 && text.trim() !== "") out.add(text);
  for (const sub of key.sk ?? []) touchKeyChars(sub, out);
  for (const sub of key.multitap ?? []) touchKeyChars(sub, out);
  if (key.flick) for (const sub of Object.values(key.flick)) if (sub) touchKeyChars(sub, out);
}

/** Single-codepoint keycap texts anywhere in the layout (incl. sub-keys). */
function touchCandidates(layout: TouchLayoutIR): Set<string> {
  const out = new Set<string>();
  for (const platform of layout.platforms)
    for (const layer of platform.layers)
      for (const row of layer.rows) for (const key of row.keys) touchKeyChars(key, out);
  return out;
}

function nfcSet(chars: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const c of chars) out.add(c.normalize("NFC"));
  return out;
}

/** The candidate characters a before/after pair is measured over (their union). */
export function candidateChars(...inputs: ConsistencyInput[]): Set<string> {
  const out = new Set<string>();
  for (const input of inputs) {
    for (const c of buildProducedSet(input.ir)) out.add(c.normalize("NFC"));
    if (input.touchLayout !== null) for (const c of touchCandidates(input.touchLayout)) out.add(c);
  }
  return out;
}

/** Measure one state over a fixed candidate set. */
export function measureConsistency(
  input: ConsistencyInput,
  candidates: ReadonlySet<string>,
): ConsistencyState {
  const physical = nfcSet(buildProducedSet(input.ir));
  let touch = new Set<string>();
  if (input.touchLayout !== null) {
    const list = [...candidates];
    const { uncovered } = computeTouchCoverage(input.touchLayout, list, {
      ruleIndex: buildTouchKeyRuleIndex(input.ir),
      ir: input.ir,
    });
    const missing = new Set(uncovered.map((c) => c.normalize("NFC")));
    touch = new Set(list.filter((c) => !missing.has(c)));
  }
  return { physical, touch, layers: new Set(input.layerIds) };
}

function onlyIn<T>(a: ReadonlySet<T>, notIn: ReadonlySet<T>): T[] {
  return [...a].filter((x) => !notIn.has(x));
}

/** Compare two measured states. */
export function diffConsistency(before: ConsistencyState, after: ConsistencyState): ConsistencyDelta {
  return {
    addedPhysical: onlyIn(after.physical, before.physical),
    removedPhysical: onlyIn(before.physical, after.physical),
    addedTouch: onlyIn(after.touch, before.touch),
    removedTouch: onlyIn(before.touch, after.touch),
    addedLayers: onlyIn(after.layers, before.layers),
    removedLayers: onlyIn(before.layers, after.layers),
  };
}

/** Before and after in one call, measured over the same candidates. */
export function computeConsistencyDelta(
  before: ConsistencyInput,
  after: ConsistencyInput,
): { delta: ConsistencyDelta; after: ConsistencyState } {
  const candidates = candidateChars(before, after);
  const afterState = measureConsistency(after, candidates);
  return {
    delta: diffConsistency(measureConsistency(before, candidates), afterState),
    after: afterState,
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type SuggestedFixKind = "upgrade" | "consistency" | "docs" | "generate-missing";
export type SuggestedFixStatus = "pending" | "accepted" | "declined";
export type ConsistencyTarget = "physical" | "touch" | "docs";

/** One file's before and after text, shown before accepting (FR-028). */
export interface SuggestedFixPreview {
  file: string;
  before: string;
  after: string;
}

/**
 * A proposed change (data-model "Suggested fix"). Transient: recomputed, with
 * only the accepted and declined dispositions recorded (spec 053 record).
 */
export interface SuggestedFix {
  /** Stable per (kind, target, subject). */
  id: string;
  kind: SuggestedFixKind;
  findingKey: string | null;
  preview: readonly SuggestedFixPreview[];
  status: SuggestedFixStatus;
  /** Short wording for the author. */
  title: string;
  /** Where, what, and which character or layer. */
  action?: {
    target: ConsistencyTarget | "mechanisms";
    change: "add" | "remove" | "refresh";
    subject: string;
  };
}

export function uplus(ch: string): string {
  return `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

function fix(
  target: ConsistencyTarget,
  change: "add" | "remove" | "refresh",
  subject: string,
  title: string,
): SuggestedFix {
  return {
    id: `consistency:${change}:${target}:${subject}`,
    kind: "consistency",
    findingKey: null,
    preview: [],
    status: "pending",
    title,
    action: { target, change, subject },
  };
}

/**
 * Turn a delta into follow-ups. `after` says what the other parts still hold,
 * so an add is offered only where the character is missing and a removal only
 * where it is still present.
 */
export function suggestionsFromDelta(
  delta: ConsistencyDelta,
  after: ConsistencyState,
): SuggestedFix[] {
  const out: SuggestedFix[] = [];
  let docsChars = false;

  for (const ch of delta.addedTouch) {
    if (!after.physical.has(ch))
      out.push(fix("physical", "add", ch, `Add ${uplus(ch)} ${ch} to the physical keys`));
    docsChars = true;
  }
  for (const ch of delta.addedPhysical) {
    if (!after.touch.has(ch))
      out.push(fix("touch", "add", ch, `Add ${uplus(ch)} ${ch} to the touch layout`));
    docsChars = true;
  }
  for (const ch of delta.removedTouch) {
    if (after.physical.has(ch))
      out.push(fix("physical", "remove", ch, `Remove ${uplus(ch)} ${ch} from the physical keys`));
    docsChars = true;
  }
  for (const ch of delta.removedPhysical) {
    if (after.touch.has(ch))
      out.push(fix("touch", "remove", ch, `Remove ${uplus(ch)} ${ch} from the touch layout`));
    docsChars = true;
  }

  if (docsChars)
    out.push(fix("docs", "refresh", "characters", "Refresh the generated character section of the help"));
  if (delta.addedLayers.length > 0 || delta.removedLayers.length > 0)
    out.push(fix("docs", "refresh", "layers", "Update the help page layer list (data-states)"));

  return out;
}
