/**
 * layerFamilies — decomposition of a `.keyman-touch-layout` layer id into its
 * `{ plane, tokens }` shape, and grouping of a keyboard's layer ids into
 * families (spec 058 FR-063/FR-067; contract:
 * specs/058-touch-key-editor/contracts/layer-families.md).
 *
 * `comboToTouchLayerId` (modifierCombos.ts) is FORWARD-ONLY: it maps a
 * canonicalized `ModifierToken[]` to a layer id string, and has no inverse.
 * This module is the new machinery the contract calls for: a decomposition
 * function that recovers `{ plane, tokens }` from a layer id STRING, or fails
 * to freeform (contract §3 / FR-067).
 *
 * CANONICAL, NOT ROUND-TRIP. `comboToTouchLayerId` is not injective — both
 * `ALT` and `LALT` render as the fragment `"alt"` (see TOUCH_ID_FRAGMENT's
 * doc in modifierCombos.ts), so there is no true inverse of that function.
 * When this module's decomposition encounters the ambiguous `"alt"` fragment
 * it resolves to the generic `ALT` token (never `LALT`) — a CANONICAL choice,
 * not a recovery of whichever token originally produced the id. The
 * unambiguous `"leftalt"`/`"rightalt"`/`"leftctrl"`/`"rightctrl"` fragments
 * decompose to their own distinct chiral tokens (`LALT`/`RALT`/`LCTRL`/`RCTRL`)
 * since those spellings are not ambiguous, and per the KMW-vendored
 * `Layouts.getLayerId` in simulator/vendor/keyman/engine/keyboard/keyboards/
 * defaultLayouts.ts, `"leftalt"` is a real fragment that runtime layer ids can
 * carry even though this codebase's own {@link comboToTouchLayerId} never
 * emits it (it folds LALT to the shared "alt" fragment) — the decomposition
 * grammar is intentionally more permissive than the strict inverse of that
 * one function, since it is parsing id STRINGS, not just the ids this
 * codebase itself would generate.
 *
 * Ordering is lifted from {@link TOUCH_LAYER_PRECEDENCE_ORDER} (FR-063) —
 * NOT re-derived — since that is already the single source of truth for how
 * a combo's tokens are ordered into an id string; a second copy of that
 * ordering convention going stale is the exact bug TOUCH_LAYER_PRECEDENCE_ORDER
 * itself documents having fixed once already.
 */

import {
  MODIFIER_EXCLUSIONS,
  TOUCH_LAYER_PRECEDENCE_ORDER,
  type ModifierToken,
} from "./modifierCombos.js";

// ---------------------------------------------------------------------------
// Fragment vocabulary (reverse direction — see module doc for why this is
// NOT simply the inverse of TOUCH_ID_FRAGMENT).
// ---------------------------------------------------------------------------

/**
 * Every recognized per-token id fragment, mapped back to its canonical
 * {@link ModifierToken}. One entry per `ModifierToken` value — unlike the
 * forward `TOUCH_ID_FRAGMENT` map (which is lossy: ALT and LALT both produce
 * "alt"), this reverse map keeps "alt" and "leftalt" distinct so a
 * `leftalt`-bearing id decomposes to `LALT` rather than silently losing
 * chirality; an id actually emitted by {@link comboToTouchLayerId} can never
 * contain a bare "leftalt" fragment (it always folds to "alt"), but this
 * grammar parses id STRINGS in general, including the KMW runtime's own
 * `"leftalt"`/`"leftctrl-leftalt"` layer ids (defaultLayouts.ts) that this
 * codebase's own combo emitter doesn't produce.
 */
const FRAGMENT_TO_TOKEN: Readonly<Record<string, ModifierToken>> = {
  shift: "SHIFT",
  caps: "CAPS",
  ncaps: "NCAPS",
  ctrl: "CTRL",
  rightctrl: "RCTRL",
  leftctrl: "LCTRL",
  alt: "ALT",
  rightalt: "RALT",
  leftalt: "LALT",
};

/**
 * Bare (zero-modifier-combo) layer ids the grammar recognizes as a known
 * plane root, per contract §2/§3: `default` is comboToTouchLayerId's own
 * empty-combo sentinel for the base alphabetic plane (worked example row 1);
 * `symbol` is the Cameroon corpus's attested non-alphabetic plane root (see
 * modifierCombos.ts's TOUCH_ID_FRAGMENT doc and the real
 * sil_cameroon_qwerty.keyman-touch-layout fixture, whose 8 layer ids are
 * `default`/`shift`/`symbol`/`rightalt`/`rightalt-shift`/`caps`/
 * `rightalt-caps`/`symbol-caps` — worked example row 6).
 *
 * A bare word NOT in this table (e.g. gff_amharic's `punctuation` or
 * fv_southern_carrier's `vowels`) is indistinguishable, by string shape
 * alone, from a legitimate plane root — the grammar has no closed
 * enumeration of "real" plane names to check an arbitrary word against. This
 * is deliberately conservative: only these two attested roots are recognized
 * with an empty combo, so an unattested bare word falls to freeform (§3)
 * rather than risk fabricating a plane out of noise.
 */
const PLANE_ONLY_SENTINELS: ReadonlySet<string> = new Set(["default", "symbol"]);

// ---------------------------------------------------------------------------
// Decomposition
// ---------------------------------------------------------------------------

/** A layer id the grammar successfully decomposed. */
export interface ParsedLayerId {
  readonly kind: "parsed";
  readonly layerId: string;
  /** `undefined` means the base alphabetic plane (contract §2). */
  readonly plane: string | undefined;
  /**
   * Canonical, deduplicated modifier tokens ordered per
   * {@link TOUCH_LAYER_PRECEDENCE_ORDER} — see module doc for why this is a
   * canonical choice, not a round-trip of the original combo.
   */
  readonly tokens: readonly ModifierToken[];
}

/**
 * A layer id the grammar could not parse — its own freeform plane, never a
 * family member (FR-067, contract §3).
 */
export interface FreeformLayerId {
  readonly kind: "freeform";
  readonly layerId: string;
}

export type LayerIdDecomposition = ParsedLayerId | FreeformLayerId;

/**
 * Decompose a `.keyman-touch-layout` layer id into `{ plane, tokens }`, or
 * report it as freeform (FR-067) when the grammar can't parse it.
 *
 * Algorithm: strip the longest trailing run of hyphen-separated segments
 * that (a) each match a known fragment (see {@link FRAGMENT_TO_TOKEN}), (b)
 * appear in strictly ascending {@link TOUCH_LAYER_PRECEDENCE_ORDER} order
 * scanning left-to-right (i.e. strictly descending precedence index scanning
 * right-to-left, matching how {@link comboToTouchLayerId} always emits an
 * ALREADY-sorted id), and (c) never carry two tokens from the same
 * mutually-exclusive family ({@link MODIFIER_EXCLUSIONS}). Whatever segments
 * remain to the left become the plane name (joined back with `-`); if
 * nothing remains, the plane is the base alphabetic plane (`undefined`).
 *
 * If NO trailing fragment run is found at all, the id is checked against the
 * {@link PLANE_ONLY_SENTINELS} bare-word table (`default`/`symbol`); failing
 * that, it falls to freeform.
 */
export function decomposeLayerId(layerId: string): LayerIdDecomposition {
  if (PLANE_ONLY_SENTINELS.has(layerId)) {
    return {
      kind: "parsed",
      layerId,
      plane: layerId === "default" ? undefined : layerId,
      tokens: [],
    };
  }

  const segments = layerId.split("-").filter((segment) => segment.length > 0);
  if (segments.length === 0) return { kind: "freeform", layerId };

  const tokens: ModifierToken[] = [];
  let consumedFromIndex = segments.length;
  let lastPrecedenceIndex = Number.POSITIVE_INFINITY;

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    const token = segment !== undefined ? FRAGMENT_TO_TOKEN[segment] : undefined;
    if (token === undefined) break;

    const precedenceIndex = TOUCH_LAYER_PRECEDENCE_ORDER.indexOf(token);
    if (precedenceIndex >= lastPrecedenceIndex) break;

    const conflicts = MODIFIER_EXCLUSIONS[token];
    if (tokens.some((existing) => conflicts.includes(existing))) break;

    tokens.unshift(token);
    lastPrecedenceIndex = precedenceIndex;
    consumedFromIndex = i;
  }

  if (tokens.length === 0) return { kind: "freeform", layerId };

  const planeSegments = segments.slice(0, consumedFromIndex);
  const plane = planeSegments.length > 0 ? planeSegments.join("-") : undefined;
  return { kind: "parsed", layerId, plane, tokens };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** A family: every layer id sharing the same plane (contract §2). */
export interface LayerFamily {
  /** `undefined` for the base alphabetic plane. */
  readonly plane: string | undefined;
  readonly layerIds: readonly string[];
}

export interface LayerFamilyGrouping {
  readonly families: readonly LayerFamily[];
  /**
   * Layer ids whose decomposition failed — each is its own freeform plane
   * and is NEVER included in {@link families} (FR-067, contract §3): a
   * freeform id can never be a family member, even a family of one.
   */
  readonly freeformLayerIds: readonly string[];
}

/** Sentinel plane key for the alphabetic plane in the internal grouping map — never observable outside this function (mapped back to `undefined` on the way out). */
const ALPHABETIC_PLANE_KEY = " alphabetic";

/**
 * Group a keyboard's layer ids into families — the set of ids sharing a
 * plane (contract §2) — via {@link decomposeLayerId}. Freeform ids are
 * reported separately and never appear in a family (FR-067).
 */
export function groupLayerFamilies(layerIds: readonly string[]): LayerFamilyGrouping {
  const byPlane = new Map<string, string[]>();
  const freeformLayerIds: string[] = [];

  for (const layerId of layerIds) {
    const decomposition = decomposeLayerId(layerId);
    if (decomposition.kind === "freeform") {
      freeformLayerIds.push(layerId);
      continue;
    }
    const key = decomposition.plane ?? ALPHABETIC_PLANE_KEY;
    const bucket = byPlane.get(key);
    if (bucket) bucket.push(layerId);
    else byPlane.set(key, [layerId]);
  }

  const families: LayerFamily[] = [...byPlane.entries()].map(([key, ids]) => ({
    plane: key === ALPHABETIC_PLANE_KEY ? undefined : key,
    layerIds: ids,
  }));

  return { families, freeformLayerIds };
}
