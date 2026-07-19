/**
 * `.keyman-touch-layout` accessors for the touch construction facets (spec 041
 * US2, T023; data-model Entity 6, research R1).
 *
 * The four touch construction facets (touch-combo-mechanism, touch-number-row,
 * touch-symbol-layer, touch-modifier-layers) read evidence the desktop
 * `KeyboardIR` cannot carry — the KMN recognizer is blind to touch (design brief
 * §2). That evidence lives in the keyboard's `.keyman-touch-layout` JSON sibling,
 * which the corpus scanner already collects into `kb.sources` (it is a declared
 * `&LAYOUTFILE` header store — see scan.ts `collectSources`).
 *
 * Parsing is delegated to the CANONICAL `parseTouchLayoutString` in
 * `@keyboard-studio/contracts` — the single source of truth already shared by the
 * engine codec and keyboard-lint (do not hand-roll a fourth reader). This module
 * adds only the tool-local pieces: a lenient wrapper that turns the canonical
 * parser's throw-on-bad-input into the `null` the facet build expects, and the
 * structural accessors the four classifiers reduce a `TouchLayoutIR` to.
 *
 * Absent file ⇒ `readTouchLayout` returns null; each classifier then emits a
 * determinate `notApplicable` (FR-022, R3) — never a forced value. A
 * present-but-unparseable file is treated the same as absent (returns null): a
 * measurement starter cannot honestly classify touch construction it cannot read.
 *
 * Modality is touch-only: nothing here reads the IR. The accessors are pure
 * functions of the parsed model, so classification is deterministic (FR-006).
 */

import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";

import type { ScannedKeyboard, ScannedSource } from "./scan.js";
import type { Categorization, CauseTag, ConfidenceClass } from "./types.js";

/** The mechanisms a touch key can use to expose a character (FR-021). */
export type TouchComboMechanism = "key" | "layer" | "longpress" | "flick" | "multitap";

/** Preference order for the single "reference" platform (touch = mobile-first). */
const PLATFORM_PREFERENCE = ["phone", "tablet", "desktop"] as const;

// ---------------------------------------------------------------------------
// Reader / parser (delegates to the canonical contracts parser)
// ---------------------------------------------------------------------------

/** The `.keyman-touch-layout` sibling among the scanned sources, or null. */
export function findTouchLayoutSource(kb: ScannedKeyboard): ScannedSource | null {
  return kb.sources.find((s) => /\.keyman-touch-layout$/i.test(s.path)) ?? null;
}

/**
 * Lenient parse: the canonical `parseTouchLayoutString` throws on invalid JSON /
 * non-object input, but the facet build wants a determinate null (→ the caller
 * emits `notApplicable`). Strip a leading BOM first — the canonical parser calls
 * `JSON.parse`, which rejects one. Returns null when no known platform is present.
 */
export function parseTouchLayout(text: string): TouchLayoutIR | null {
  let ir: TouchLayoutIR;
  try {
    ir = parseTouchLayoutString(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
  return ir.platforms.length > 0 ? ir : null;
}

/** Read + parse the keyboard's touch layout, or null when there is none. */
export function readTouchLayout(kb: ScannedKeyboard): TouchLayoutIR | null {
  const src = findTouchLayoutSource(kb);
  if (src === null) return null;
  return parseTouchLayout(src.bytes.toString("utf8"));
}

// ---------------------------------------------------------------------------
// Structural accessors (pure over the parsed IR — the classifiers reduce these)
// ---------------------------------------------------------------------------

/** The key's display/emitted text (label preferred, then the emitted output). */
function keyText(key: TouchKeyIR): string {
  return key.text ?? key.output ?? "";
}

/** Does this key output a real character (not empty, not a `*Command*` label)? */
function isOutputKey(text: string): boolean {
  return text.length > 0 && !/^\*.+\*$/.test(text);
}

/** The distinct composition mechanisms one key offers. */
function keyMechanisms(key: TouchKeyIR): TouchComboMechanism[] {
  const m: TouchComboMechanism[] = [];
  if (key.sk && key.sk.length > 0) m.push("longpress");
  if (key.flick && Object.keys(key.flick).length > 0) m.push("flick");
  if (key.multitap && key.multitap.length > 0) m.push("multitap");
  if (key.nextlayer !== undefined) m.push("layer");
  // A plain output key with none of the above exposes its character directly.
  if (m.length === 0 && isOutputKey(keyText(key))) m.push("key");
  return m;
}

/** Every top-level key across all platforms/layers, in the parser's fixed order. */
function* iterKeys(model: TouchLayoutIR): Generator<TouchKeyIR> {
  for (const platform of model.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) yield key;
      }
    }
  }
}

/**
 * Occurrence count per mechanism across all keys (a key contributes once per
 * mechanism it offers). Zero-count mechanisms are omitted.
 */
export function comboMechanismCounts(model: TouchLayoutIR): Partial<Record<TouchComboMechanism, number>> {
  const counts: Partial<Record<TouchComboMechanism, number>> = {};
  for (const key of iterKeys(model)) {
    for (const mech of keyMechanisms(key)) {
      counts[mech] = (counts[mech] ?? 0) + 1;
    }
  }
  return counts;
}

/** Unique layer ids across all platforms, sorted (determinism). */
export function layerIds(model: TouchLayoutIR): string[] {
  const ids = new Set<string>();
  for (const platform of model.platforms) {
    for (const layer of platform.layers) if (layer.id.length > 0) ids.add(layer.id);
  }
  return [...ids].sort();
}

/** A dedicated symbol layer (id contains "symbol"), the Keyman convention. */
export function hasSymbolLayer(model: TouchLayoutIR): boolean {
  return layerIds(model).some((id) => /symbol/i.test(id));
}

/** Layer ids that reproduce a desktop modifier combination (ALT / CTRL family). */
export function modifierLayerIds(model: TouchLayoutIR): string[] {
  return layerIds(model).filter((id) => /alt|ctrl/i.test(id));
}

/** Classify a row's content by majority of its output keys (tie → digits). */
function rowContentClass(keys: TouchKeyIR[]): "digits" | "letters" | null {
  let digits = 0;
  let letters = 0;
  for (const key of keys) {
    const text = keyText(key);
    if (!isOutputKey(text)) continue;
    if (/^\p{Nd}+$/u.test(text)) digits += 1;
    else if (/^\p{L}+$/u.test(text)) letters += 1;
  }
  if (digits === 0 && letters === 0) return null;
  return digits >= letters ? "digits" : "letters";
}

/** Prefer phone, then tablet, then desktop, then whatever exists first. */
function primaryPlatform(model: TouchLayoutIR): TouchLayoutIR["platforms"][number] | null {
  for (const name of PLATFORM_PREFERENCE) {
    const p = model.platforms.find((pl) => pl.id === name);
    if (p) return p;
  }
  return model.platforms[0] ?? null;
}

/**
 * Number-row value (FR-021): a layer has a number-row SLOT when its top row is
 * digits, or when the layer carries an extra (5th) row. Collect the content of
 * those slots across the primary platform's layers — `digits`, `letters`, both
 * (`mixed`), or none (`absent`). The top row is the first row in document order
 * (rows are emitted top-to-bottom by the canonical parser).
 *
 * Starter heuristic (documented): a normal 3–4-row letter layer has no
 * number-row slot (its top row is the QWERTY letter row, not a number row), so
 * it does not push `letters`; only a genuine extra row or a digit top row counts.
 */
export function classifyNumberRow(model: TouchLayoutIR): "absent" | "digits" | "letters" | "mixed" {
  const platform = primaryPlatform(model);
  if (platform === null) return "absent";

  const found = new Set<"digits" | "letters">();
  for (const layer of platform.layers) {
    if (layer.rows.length === 0) continue;
    const cls = rowContentClass(layer.rows[0]!.keys);
    const hasNumberRowSlot = cls === "digits" || layer.rows.length >= 5;
    if (!hasNumberRowSlot || cls === null) continue;
    found.add(cls);
  }

  if (found.size === 0) return "absent";
  if (found.size > 1) return "mixed";
  return [...found][0]!;
}

// ---------------------------------------------------------------------------
// Shared touch Categorization builder
// ---------------------------------------------------------------------------

/**
 * Assemble a touch-facet `Categorization`. Coverage is always 1 / `fully`: a
 * touch layout is a self-contained JSON read in full, so there is no opaque
 * desktop-rule share to discount (unlike the IR-derived desktop facets, whose
 * `assembleMeasurement` derives coverage from the codec's opaque fragments).
 * Always `content-derived` — the value was read from the keyboard's own artifact.
 */
export function touchCategorization(opts: {
  value: unknown;
  evidenceSize: number;
  distribution?: Record<string, number>;
  consistency?: number;
  causeTagCounts?: Partial<Record<CauseTag, number>>;
  confidenceClass?: ConfidenceClass;
  notes?: string;
}): Categorization {
  return {
    value: opts.value,
    ...(opts.distribution ? { distribution: opts.distribution } : {}),
    confidence: null,
    confidenceClass: opts.confidenceClass ?? "confident",
    provenanceTier: "content-derived",
    evidenceSize: opts.evidenceSize,
    analyzedCoverage: 1,
    analysisOutcome: "fully",
    ...(opts.consistency !== undefined ? { consistency: opts.consistency } : {}),
    ...(opts.causeTagCounts ? { causeTagCounts: opts.causeTagCounts } : {}),
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}
