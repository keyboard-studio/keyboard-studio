// touchBuilderModel — the typed domain model for the TIKE touch-builder
// port (the "By key" tab's replacement). Pure functions only: geometry,
// id minting, template-merge op building, subkey addressing. No React, no
// store, no I/O — the pane (`TouchBuilderPane.tsx`) is the only consumer,
// and the unit tests assert gesture → op → replayed-layout parity through
// the real engine appliers.
//
// Behavior basis: `developer/src/tike/xml/layoutbuilder/src/*.ts` in
// keymanapp/keyman (read for BEHAVIOR only, never transliterated). The
// write channel is exclusively the 8 `KeyEditOperation` kinds, built here
// as `PendingKeyEditOperation` (no `seq`) and committed by the pane through
// `commitKeyEditOp`.

import {
  createKeyOccurrenceCounter,
  parseTouchKeyAddress,
  parseTouchLayoutString,
  touchKeyAddress,
  type TouchKeyAddressParts,
  type TouchLayoutIR,
  type TouchKeyIR,
} from "@keyboard-studio/contracts";
import { resolveKeyAddress } from "@keyboard-studio/engine";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";

/**
 * Which sub-entry of a key a subkey op targets — the same shape the
 * engine's `SubKeyRef` names (`TouchKeyAddressParts["sub"]`), restated here
 * because the engine barrel does not re-export that alias. Structurally
 * identical, so it assigns wherever `SubKeyRef` is expected.
 */
export type BuilderSubKeyRef = NonNullable<TouchKeyAddressParts["sub"]>;

// ---------------------------------------------------------------------------
// Geometry — TIKE's 100-units-per-row model
// ---------------------------------------------------------------------------

/** TIKE `builderConstants.keyMargin`: the gap between keys, in units. */
export const BUILDER_KEY_MARGIN = 15;
/** TIKE row height, in units. */
export const BUILDER_ROW_HEIGHT = 100;
/** TIKE default key width, in units. */
export const BUILDER_DEFAULT_KEY_WIDTH = 100;
/** TIKE resize clamp, in units (`makeKeyResizable`: 10–500). */
export const BUILDER_MIN_KEY_WIDTH = 10;
export const BUILDER_MAX_KEY_WIDTH = 500;

/** A device presentation: the pixel box the keyboard is scaled into. */
export interface BuilderPresentation {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/** TIKE `builderConstants.presentations` (device preview scaling). */
export const BUILDER_PRESENTATIONS: readonly BuilderPresentation[] = [
  { id: "tablet-ipad-landscape", name: "iPad (landscape)", x: 829, y: 299 },
  { id: "tablet-ipad-portrait", name: "iPad (portrait)", x: 605, y: 300 },
  { id: "phone-iphone5-landscape", name: "iPhone 5 (landscape)", x: 731, y: 196 },
  { id: "phone-iphone5-portrait", name: "iPhone 5 (portrait)", x: 526, y: 266 },
  { id: "desktop", name: "Desktop", x: 640, y: 300 },
];

/** TIKE `builderConstants.defaultPresentations`, per platform. */
export function defaultBuilderPresentationId(platformId: string): string {
  switch (platformId) {
    case "tablet":
      return "tablet-ipad-landscape";
    case "phone":
      return "phone-iphone5-landscape";
    default:
      return "desktop";
  }
}

export function builderPresentationById(id: string): BuilderPresentation | undefined {
  return BUILDER_PRESENTATIONS.find((p) => p.id === id);
}

/** One rendered row: the keys in row-major order with their unit widths. */
export interface BuilderRowGeometry {
  readonly keys: readonly {
    readonly id: string;
    readonly width: number;
    readonly pad: number;
  }[];
}

/**
 * TIKE `prepareLayer` scaling: the widest row (sum of key widths + pads,
 * plus one trailing `keyMargin`) sets `xscale`; `yscale` comes from the row
 * count × (100 + keyMargin) against the presentation box. Unknown
 * presentation → 0.5/0.5, exactly like TIKE's fallback.
 */
export function computeBuilderScale(
  rows: readonly BuilderRowGeometry[],
  presentation: BuilderPresentation | undefined,
): { readonly xscale: number; readonly yscale: number } {
  let width = 0;
  for (const row of rows) {
    let rowWidth = 0;
    for (const key of row.keys) {
      rowWidth += key.width + key.pad;
    }
    width = Math.max(width, rowWidth);
  }
  width += BUILDER_KEY_MARGIN; // trailing right-hand margin
  const height = rows.length * (BUILDER_ROW_HEIGHT + BUILDER_KEY_MARGIN);
  if (presentation === undefined || width <= 0 || height <= 0) {
    return { xscale: 0.5, yscale: 0.5 };
  }
  return { xscale: presentation.x / width, yscale: presentation.y / height };
}

/** Project a layer's rows to the geometry the scaler needs. */
export function layerRowGeometry(
  layout: TouchLayoutIR,
  platformId: string,
  layerId: string,
): BuilderRowGeometry[] {
  const platform = layout.platforms.find((p) => p.id === platformId);
  const layer = platform?.layers.find((l) => l.id === layerId);
  if (layer === undefined) return [];
  return layer.rows.map((row) => ({
    keys: row.keys.map((key) => ({
      id: key.id,
      width: key.width ?? BUILDER_DEFAULT_KEY_WIDTH,
      pad: key.pad ?? BUILDER_KEY_MARGIN,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Key id minting — TIKE's `T_new_N`
// ---------------------------------------------------------------------------

const NEW_KEY_ID_RE = /^T_new_(\d+)$/i;

function collectKeyIds(layout: TouchLayoutIR): string[] {
  const ids: string[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          ids.push(key.id);
          for (const sub of key.sk ?? []) ids.push(sub.id);
          for (const sub of key.multitap ?? []) ids.push(sub.id);
          for (const dir of FLICK_DIRECTIONS) {
            const sub = key.flick?.[dir];
            if (sub !== undefined) ids.push(sub.id);
          }
        }
      }
    }
  }
  return ids;
}

/**
 * Mint the next `T_new_N` id (TIKE `addKey`: `'T_new_' + builder.uniqId`).
 * TIKE's counter is session-scoped; here it is derived from the layout so a
 * remount cannot re-mint an id the layout already carries. `T_new_*` is
 * ruleless-by-convention (`isRulelessByConvention`), so the FR-045 gate
 * lets it through without a dead-key rejection.
 */
export function mintBuilderKeyId(layout: TouchLayoutIR): string {
  let max = 0;
  for (const id of collectKeyIds(layout)) {
    const m = NEW_KEY_ID_RE.exec(id);
    if (m !== null) {
      const n = parseInt(m[1] ?? "0", 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `T_new_${max + 1}`;
}

// ---------------------------------------------------------------------------
// Addressing — the existing `touchKeyAddress` scheme, occurrence-aware
// ---------------------------------------------------------------------------

/** The stable address of every key in a layer, walked row-major (the same
 *  order `resolveKeyAddress` counts occurrences in). */
export function layerKeyAddresses(
  layout: TouchLayoutIR,
  platformId: string,
  layerId: string,
): string[] {
  const platform = layout.platforms.find((p) => p.id === platformId);
  const layer = platform?.layers.find((l) => l.id === layerId);
  if (layer === undefined) return [];
  const nextOccurrence = createKeyOccurrenceCounter();
  const addresses: string[] = [];
  for (const row of layer.rows) {
    for (const key of row.keys) {
      addresses.push(
        touchKeyAddress(platformId, layerId, key.id, nextOccurrence(key.id)),
      );
    }
  }
  return addresses;
}

/** Resolve a main-key address against the CURRENT layout (never a copy). */
export function resolveBuilderKey(
  layout: TouchLayoutIR,
  address: string,
): { readonly parts: TouchKeyAddressParts; readonly key: TouchKeyIR } | undefined {
  const parts = parseTouchKeyAddress(address);
  if (parts === undefined) return undefined;
  const resolved = resolveKeyAddress(layout, parts);
  if (resolved === undefined) return undefined;
  return { parts, key: resolved.key };
}

// ---------------------------------------------------------------------------
// Subkeys
// ---------------------------------------------------------------------------

export type BuilderSubKeyKind = "sk" | "flick" | "multitap";

/** Flick compass directions, TIKE order. */
export type FlickDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const FLICK_DIRECTIONS: readonly FlickDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

/** Flick compass slot positions in the 3x3 square (row/col, 1-based). */
export const FLICK_GRID: Record<FlickDirection, { row: number; col: number }> = {
  nw: { row: 1, col: 1 },
  n: { row: 1, col: 2 },
  ne: { row: 1, col: 3 },
  w: { row: 2, col: 1 },
  e: { row: 2, col: 3 },
  sw: { row: 3, col: 1 },
  s: { row: 3, col: 2 },
  se: { row: 3, col: 3 },
};

export interface BuilderSubKeyEntry {
  readonly kind: BuilderSubKeyKind;
  /** For flicks, the direction; for sk/multitap, the subkey id. */
  readonly ref: BuilderSubKeyRef;
  readonly key: TouchKeyIR;
}

/** All sub-entries of a key, grouped. Flicks follow TIKE's compass order. */
export function subKeyEntriesOf(key: TouchKeyIR): {
  readonly sk: readonly BuilderSubKeyEntry[];
  readonly flick: readonly BuilderSubKeyEntry[];
  readonly multitap: readonly BuilderSubKeyEntry[];
} {
  const sk = (key.sk ?? []).map((sub) => ({
    kind: "sk" as const,
    ref: { kind: "sk", id: sub.id } as BuilderSubKeyRef,
    key: sub,
  }));
  const flick = FLICK_DIRECTIONS.flatMap((direction) => {
    const sub = key.flick?.[direction];
    if (sub === undefined) return [];
    return [{ kind: "flick" as const, ref: { kind: "flick", id: direction } as BuilderSubKeyRef, key: sub }];
  });
  const multitap = (key.multitap ?? []).map((sub) => ({
    kind: "multitap" as const,
    ref: { kind: "multitap", id: sub.id } as BuilderSubKeyRef,
    key: sub,
  }));
  return { sk, flick, multitap };
}

// ---------------------------------------------------------------------------
// Template apply — TIKE `TTouchLayout.Merge`, decomposed to `set` ops
// ---------------------------------------------------------------------------

/**
 * TIKE's 24 predefined layer names (`TouchLayoutDefinitions.pas`). A key's
 * predefined layer is its own `layer` override, else its row's layer id,
 * with unknown names collapsing to `"default"` (`GetKeyPredefinedLayer`).
 */
export const PREDEFINED_LAYER_IDS: readonly string[] = [
  "default",
  "shift",
  "ctrl",
  "alt",
  "ctrlalt",
  "ctrlshift",
  "altshift",
  "ctrlaltshift",
  "shift-ctrl",
  "shift-alt",
  "ctrl-alt",
  "shift-ctrl-alt",
  "leftctrl",
  "rightctrl",
  "leftalt",
  "leftctrl-leftalt",
  "rightalt",
  "rightctrl-rightalt",
  "leftctrl-shift",
  "rightctrl-shift",
  "leftalt-shift",
  "rightalt-shift",
  "leftctrl-leftalt-shift",
  "rightctrl-rightalt-shift",
];

export function predefinedLayerOf(
  keyLayerOverride: string | undefined,
  rowLayerId: string,
): string {
  const name = keyLayerOverride ?? rowLayerId;
  return (PREDEFINED_LAYER_IDS as readonly string[]).includes(name) ? name : "default";
}

/**
 * Build the op sequence for "Apply template" (TIKE `ApplyTemplate` →
 * `TTouchLayout.Merge`).
 *
 * Merge copies `text` caps by matching **key id + predefined layer**, and
 * template **special keys (`sp=1`) are never overridden** (I3982). In TIKE
 * the template becomes the new document (structure included); the key-level
 * op contract cannot express structural replacement (Q1), so the studio
 * decomposition adopts the template's keycap texts onto the CURRENT
 * layout's matched keys — structure is preserved. Matches whose text is
 * already identical emit no op (a `set` that changes nothing is not a
 * change the overlay should record).
 *
 * Matching is scoped to the same platform id on both sides.
 */
export function buildTemplateApplyOps(
  current: TouchLayoutIR,
  template: TouchLayoutIR,
): PendingKeyEditOperation[] {
  const ops: PendingKeyEditOperation[] = [];
  for (const templatePlatform of template.platforms) {
    const currentPlatform = current.platforms.find((p) => p.id === templatePlatform.id);
    if (currentPlatform === undefined) continue;
    // Index the current platform's keys by (id, predefined layer), walking
    // row-major with the occurrence counter so each op addresses exactly
    // the key the match named.
    const index = new Map<string, { address: string; text: string }[]>();
    for (const layer of currentPlatform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const predefined = predefinedLayerOf(key.layer ?? key.layerAnnotation, layer.id);
          const mapKey = `${key.id}\0${predefined}`;
          const entry = {
            address: touchKeyAddress(currentPlatform.id, layer.id, key.id, nextOccurrence(key.id)),
            text: key.text ?? "",
          };
          const list = index.get(mapKey);
          if (list === undefined) index.set(mapKey, [entry]);
          else list.push(entry);
        }
      }
    }
    for (const templateLayer of templatePlatform.layers) {
      for (const templateRow of templateLayer.rows) {
        for (const templateKey of templateRow.keys) {
          // I3982: template special keys are never overridden.
          if ((templateKey.sp ?? 0) === 1) continue;
          const predefined = predefinedLayerOf(
            templateKey.layer ?? templateKey.layerAnnotation,
            templateLayer.id,
          );
          const candidates = index.get(`${templateKey.id}\0${predefined}`);
          if (candidates === undefined) continue;
          const templateText = templateKey.text ?? "";
          for (const candidate of candidates) {
            if (candidate.text === templateText) continue;
            ops.push({
              address: candidate.address,
              kind: "set",
              fields: { text: templateText },
            });
          }
        }
      }
    }
  }
  return ops;
}

/** Parse a template's JSON text to IR (throws on malformed JSON). */
export function parseBuilderTemplate(jsonText: string): TouchLayoutIR {
  return parseTouchLayoutString(jsonText);
}

// ---------------------------------------------------------------------------
// Charmap drop — stub interface (no compatible drag source in Studio yet)
// ---------------------------------------------------------------------------

/**
 * The drop payload TIKE's builder accepts (`builder.charmapDragDrop`):
 * dropped text plus the modifier keys held. Studio's character surfaces
 * (the assign-loop char strip, the survey character map) expose NO drag
 * payload today, so the pane wires no drop target yet — this type and the
 * op-mapping below are the interface the follow-on will plug into.
 *
 * TODO(touch-builder-port): when a Studio character surface starts a drag
 * with `{ text }` (+ optional modifiers), wire `TouchBuilderPane`'s canvas
 * and toolbar fields as drop targets via `buildCharmapDropOps`.
 */
export interface CharmapDropPayload {
  readonly text: string;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
}

/** Synthesize a `U_XXXX[_YYYY…]` id from dropped text (TIKE behavior). */
export function synthesizeDropKeyId(text: string): string {
  const parts: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    parts.push(cp.toString(16).toUpperCase().padStart(4, "0"));
  }
  return `U_${parts.join("_")}`;
}

/**
 * Map a charmap drop onto ops (TIKE `builder-charmap.ts`): dropped text
 * sets the key's text; Ctrl-drop (or a drop onto a `T_new_*` key) also
 * synthesizes a `U_XXXX` id via a `rename` — id is identity, never a `set`
 * field. Prepend on Shift. Pure and unit-tested; unreachable until the
 * drag source exists (see the TODO above).
 */
export function buildCharmapDropOps(
  layout: TouchLayoutIR,
  address: string,
  payload: CharmapDropPayload,
): PendingKeyEditOperation[] {
  const resolved = resolveBuilderKey(layout, address);
  if (resolved === undefined) return [];
  const ops: PendingKeyEditOperation[] = [];
  const incoming = payload.shift ? payload.text + (resolved.key.text ?? "") : payload.text;
  if (incoming !== (resolved.key.text ?? "")) {
    ops.push({ address, kind: "set", fields: { text: incoming } });
  }
  const wantsId = payload.ctrl === true || /^T_new_/i.test(resolved.key.id);
  if (wantsId && payload.text.length > 0) {
    const newId = synthesizeDropKeyId(payload.text);
    if (newId !== "U_" && newId !== resolved.key.id) {
      ops.push({ address, kind: "rename", toId: newId });
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Field projection — the editable slice of a key, for op authoring
// ---------------------------------------------------------------------------

/**
 * The fields a `set` op may carry, derived from the operation union itself
 * (never a restated copy of `EditableKeyFields`).
 */
export type BuilderSetFields = Extract<
  PendingKeyEditOperation,
  { kind: "set" }
>["fields"];

/** Project a key's editable fields (mirrors the applier's `toEditableFields`). */
export function editableFieldsOf(key: TouchKeyIR): {
  readonly id: string;
  readonly text: string;
  readonly sp: 0 | 1 | 2 | 8 | 9 | 10;
  readonly output?: string;
  readonly nextlayer?: string;
  readonly hint?: string;
  readonly width?: number;
  readonly pad?: number;
  readonly layer?: string;
} {
  return {
    id: key.id,
    text: key.text ?? "",
    sp: (key.sp ?? 0) as 0 | 1 | 2 | 8 | 9 | 10,
    ...(key.output !== undefined ? { output: key.output } : {}),
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    ...(key.hint !== undefined ? { hint: key.hint } : {}),
    ...(key.width !== undefined ? { width: key.width } : {}),
    ...(key.pad !== undefined ? { pad: key.pad } : {}),
    ...((key.layer ?? key.layerAnnotation) !== undefined
      ? { layer: (key.layer ?? key.layerAnnotation) as string }
      : {}),
  };
}
