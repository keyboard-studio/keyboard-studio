/**
 * layerFamilies — decomposition of a `.keyman-touch-layout` layer id into its
 * `{ plane, tokens }` shape, and grouping of a keyboard's layer ids into
 * families (spec 063 FR-063/FR-067; contract:
 * specs/063-touch-key-editor/contracts/layer-families.md).
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
 *
 * ## T107 — the parallelism check itself (FR-064, contract §4/§5)
 *
 * {@link findFamilyParallelismBreaks} is the mechanical check the contract's
 * §1 "Purpose" section motivates: an author cannot verify by eye that every
 * sibling of an 8-layer family stayed in step with an edit made on one of
 * them. See that function's own doc for the identity-correlation choice and
 * the severity split (contract §5).
 *
 * ## T110 — the FR-068 property split (contract §4)
 *
 * Frame and layer-switch keys are exempt from parallelism on the properties
 * that must vary (`sp`, `nextlayer`, `id`, keycap `text`) while position and
 * width stay checked. That split lives in {@link snapshotLayerPositions}'s
 * correlation choice, not in a filter over findings — see
 * {@link frameCorrelationKey}.
 *
 * ## T109 — plane classification and severity scoping (FR-066)
 *
 * {@link classifyPlane} names which planes are recognized as INDEPENDENT
 * layouts rather than variants of one, and {@link severityForPlane} is the one
 * place the loud/soft split is decided. Cross-plane comparison is
 * structurally impossible (a family never spans more than one plane), so
 * FR-066's "must not be nagged" is a property of the grouping, not a filter.
 */

import { isFrameKeyClass, type TouchKeyIR, type TouchLayoutIR } from "@keyboard-studio/contracts";

import type { UnsequencedKeyEditOperation } from "./keyEditOps.js";
import {
  MODIFIER_EXCLUSIONS,
  TOUCH_LAYER_PRECEDENCE_ORDER,
  type ModifierToken,
} from "./modifierCombos.js";
import { touchKeyAddress } from "./touchKeyAddress.js";

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
const ALPHABETIC_PLANE_KEY = "\u0000alphabetic";

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

// ---------------------------------------------------------------------------
// Family parallelism check (FR-064, contract §4/§5 — T107)
// ---------------------------------------------------------------------------

/**
 * A `.keyman-touch-layout` layer as it appears inside {@link TouchLayoutIR}
 * (one platform's `layers[]` entry). Derived via indexed access rather than
 * hand-copied, so this type can never drift from the canonical shape.
 */
type TouchLayoutLayer = TouchLayoutIR["platforms"][number]["layers"][number];

/** Severity this check assigns — mirrors `TouchKeyFindingSeverity` in
 * touchKeyDiagnostics.ts (`"warning" | "hint"`) structurally, but is its own
 * type. See {@link FamilyParallelismFinding}'s doc for why this module does
 * not import that module's types. */
export type FamilyParallelismSeverity = "warning" | "hint";

// ---------------------------------------------------------------------------
// T109 — plane classification and severity scoping (FR-066, contract §5).
// ---------------------------------------------------------------------------

/**
 * How much muscle-memory weight a plane's family carries, which is what
 * FR-066/contract §5 keys severity off.
 *
 * - `"alphabetic"` — the base plane (`plane === undefined`). The invariant the
 *   author's blank-key method exists to protect (R3a/R3c); breaks here are
 *   loud.
 * - `"distinct"` — a RECOGNIZED independent layout: symbol, emoji, numeric, or
 *   an alt-script plane. FR-066 names exactly these four as "independent
 *   layouts, never variants of one".
 * - `"unrecognized"` — a parsed plane name this module does not recognize.
 *   Treated at the same soft severity as `"distinct"`, never at the alphabetic
 *   plane's loud one: FR-066 says a non-alphabetic family "MAY be checked but
 *   MUST default to a softer severity", and an unrecognized plane is precisely
 *   the case where the check is least sure it understands the layout.
 *
 * Note what this classification is NOT for: suppressing cross-plane
 * comparison. That is structurally impossible — {@link groupLayerFamilies}
 * never puts two planes in one family — so FR-066's "MUST NOT be subject to
 * cross-plane parallelism complaints" is already guaranteed by the grouping
 * and needs no filter here.
 */
export type PlaneClass = "alphabetic" | "distinct" | "unrecognized";

/**
 * The plane names FR-066 enumerates as independent layouts. `symbol` and
 * `numeric` are the attested `.keyman-touch-layout` roots; `emoji` is the
 * third name FR-066 lists. An alt-script plane is not a fixed word — it is
 * whatever the keyboard's author called it — so it cannot be enumerated and
 * lands in `"unrecognized"`, which carries the same soft severity. The set is
 * therefore a recognition aid for wording, never a gate on whether a family is
 * checked at all.
 */
const RECOGNIZED_DISTINCT_PLANES: ReadonlySet<string> = new Set(["symbol", "emoji", "numeric"]);

/**
 * Classify a family's plane (a {@link LayerFamily}'s own `plane` field —
 * `undefined` for the base alphabetic plane). See {@link PlaneClass}.
 */
export function classifyPlane(plane: string | undefined): PlaneClass {
  if (plane === undefined) return "alphabetic";
  return RECOGNIZED_DISTINCT_PLANES.has(plane) ? "distinct" : "unrecognized";
}

/**
 * The ONE place contract §5's loud/soft split is decided: the alphabetic
 * family is `"warning"`, every other plane is the softer `"hint"`. Exported so
 * a caller composing its own copy for a finding cannot pick a different rule
 * than the check itself applied.
 */
export function severityForPlane(plane: string | undefined): FamilyParallelismSeverity {
  return classifyPlane(plane) === "alphabetic" ? "warning" : "hint";
}

/**
 * Which of the four FR-064 break kinds this finding reports. `"added"` and
 * `"removed"` are both instances of the same underlying observation — the
 * key id is present on some family members and absent on others — split by
 * whether the family's baseline layer (`family.layerIds[0]`, see
 * {@link findFamilyParallelismBreaks}'s doc) is one of the layers that HAS
 * it (`"removed"` from the rest) or one of the layers that LACKS it
 * (`"added"` on the rest). `"moved"`/`"resized"` are only evaluated once a
 * key id is present on every family member, so a key can never be reported
 * under more than one kind.
 */
export type FamilyParallelismBreakKind = "added" | "removed" | "moved" | "resized";

/**
 * No single mutation resolves a broken family on its own — T108's
 * `FamilyApplyDialog` is the actual resolution surface (FR-065), and this
 * check's job stops at naming the break. Mirrors the shape of
 * touchKeyDiagnostics.ts's own `ReviewKeyFix` (a real, concrete action per
 * FR-041 that is not a data mutation) without importing it — see
 * {@link FamilyParallelismFinding}'s doc.
 */
export interface ReviewFamilyMemberFix {
  readonly kind: "reviewFamilyMember";
  readonly address: string;
}

/**
 * One family-parallelism finding. Deliberately the same four-field shape as
 * `TouchKeyFinding` in touchKeyDiagnostics.ts (`code`/`severity`/`address`/
 * `fields`/`fixes`, `fields` carrying structured data only — FR-044/FR-051,
 * never composed English prose) but a SEPARATE, restated type rather than an
 * import of that one.
 *
 * Restating instead of importing is deliberate, not an oversight: this
 * module (`layerFamilies.ts`) is the lower-level primitive — decomposition
 * and grouping — that `touchKeyDiagnostics.ts` and future Phase 8/9 checks
 * are expected to build on (T110's property split is slated to land in
 * THIS file per tasks.md, but T113's later consolidation of all eight
 * finding-emitting modules onto one shared shape is exactly the kind of
 * change that could need `touchKeyDiagnostics.ts` to import FROM here).
 * Importing `touchKeyDiagnostics.ts`'s `TouchKeyFinding` type now — even as
 * a type-only import, erased at build time — would commit this lower-level
 * module to depending on a higher-level one before that direction is
 * settled. A four-field structural duplicate costs one small interface;
 * an accidental cycle once T110/T113 land costs a rewrite.
 */
export interface FamilyParallelismFinding {
  readonly code: "TOUCH_KEY_FAMILY_PARALLELISM_BREAK";
  readonly severity: FamilyParallelismSeverity;
  /** The key (on its baseline-relative anchor layer — see the function doc) this finding anchors to, in `touchKeyAddress` form. */
  readonly address: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly fixes: readonly ReviewFamilyMemberFix[];
}

/** A main key's grid position + width within one layer. Sub-keys (`sk`/`multitap`/`flick`) have no row/column slot of their own and are out of scope — same restriction `touchKeyDiagnostics.ts`'s `walkMainTouchKeys` applies. */
interface KeyGridPosition {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly width: number | undefined;
  /**
   * The key's REAL id on this layer. Distinct from the correlation key it is
   * stored under, which for a frame/layer-switch key is a positional ordinal
   * rather than an id (T110 — see {@link frameCorrelationKey}). Findings must
   * anchor on this, never on the correlation key, or a frame-key finding would
   * carry a synthetic address that resolves to nothing.
   */
  readonly keyId: string;
}

// ---------------------------------------------------------------------------
// T110 — the FR-068 property split (contract §4). Implemented exactly where
// findFamilyParallelismBreaks's doc said it would go: a pre-pass at the INPUT
// BOUNDARY that re-identifies frame/layer-switch keys before the comparison
// runs. Not one line of the comparison below changed, because it only ever
// read `rowIndex`/`columnIndex`/`width` — the two properties FR-068 keeps
// checking — and never `sp`/`nextlayer`/`id`/`text`, the four it exempts.
// ---------------------------------------------------------------------------

/**
 * True when `key` is a frame or layer-switch key, and so subject to FR-068's
 * property exemption. Keyed on the key BEING one — carrying a `nextlayer`, or
 * classed as a frame key by `sp` — never on a row index: "the bottom row" is a
 * convention some keyboards follow, not a rule this check can rely on
 * (contract §4's closing paragraph).
 *
 * `sp` is included alongside `nextlayer` because the frame classes cover
 * control keys that switch no layer at all — `K_BKSP`/`K_ENTER` are ordinarily
 * authored `sp:1` with no `nextlayer` — and contract §4 scopes the exemption to
 * "has a `nextlayer`, or is otherwise identified as a control key". The `sp`
 * half reads contracts' canonical `isFrameKeyClass` rather than restating the
 * `{1, 2}` literal, so this module and the studio's family-apply trigger cannot
 * disagree about which classes are "frame".
 */
function isFrameOrLayerSwitchKey(key: TouchKeyIR): boolean {
  if (key.nextlayer !== undefined && key.nextlayer.length > 0) return true;
  return isFrameKeyClass(key.sp);
}

/**
 * The correlation key for the `ordinal`-th frame key of a layer, in document
 * order. The NUL prefix is what makes the frame-key and ordinary-key
 * namespaces provably disjoint: a real `.keyman-touch-layout` key id can never
 * contain a NUL, so no ordinary key's id can ever collide with one of these.
 *
 * Ordinal-in-document-order is the correlator because FR-068 licenses a frame
 * key's `id` itself to differ across the family — Cameroon carries `T_LOWER`
 * on `symbol` and `T_UPPER` on `symbol-caps` at the same position, doing the
 * equivalent job (contract §4's third row). With the id unusable as identity,
 * the only thing left that is stable across siblings is *which* frame key it
 * is, counting along the layer. That pairs the two Cameroon keys up correctly
 * and — unlike keying on the position itself — keeps a genuine move or resize
 * visible as a position/width divergence rather than dissolving it into a
 * "removed here, added there" pair.
 */
function frameCorrelationKey(ordinal: number): string {
  return `\u0000frame#${String(ordinal)}`;
}

/**
 * Index one layer's main keys by correlation key -> grid position.
 *
 * Ordinary keys are keyed by their own id: an ordinary key keeps one id across
 * its whole family, with only its `output`/`text` varying by layer. Frame and
 * layer-switch keys are keyed by {@link frameCorrelationKey} instead, which is
 * the whole of T110's property split — see that helper's doc.
 *
 * A key id repeated within one layer (schema-legal but rare — see
 * `touchKeyAddress.ts`'s own "not stably addressable" note) resolves to its
 * FIRST occurrence; this check inherits that limitation rather than inventing a
 * disambiguation scheme of its own. Frame keys are immune to it by
 * construction, since their ordinals are unique by counting.
 */
function snapshotLayerPositions(layer: TouchLayoutLayer): ReadonlyMap<string, KeyGridPosition> {
  const positions = new Map<string, KeyGridPosition>();
  let frameOrdinal = 0;
  layer.rows.forEach((row, rowIndex) => {
    row.keys.forEach((key: TouchKeyIR, columnIndex) => {
      const correlationKey = isFrameOrLayerSwitchKey(key)
        ? frameCorrelationKey(frameOrdinal++)
        : key.id;
      if (positions.has(correlationKey)) return;
      positions.set(correlationKey, {
        rowIndex,
        columnIndex,
        width: key.width,
        keyId: key.id,
      });
    });
  });
  return positions;
}

/** True for a correlation key minted by {@link frameCorrelationKey} — i.e. this finding is about a frame/layer-switch key, whose per-layer ids may legitimately differ. */
function isFrameCorrelationKey(correlationKey: string): boolean {
  return correlationKey.startsWith("\u0000frame#");
}

/**
 * Detect a broken positional parallelism within one family (FR-064): a main
 * key added, removed, moved, or resized on one member without the same
 * change on the rest.
 *
 * ## Identity correlation — by key id for ordinary keys, by ordinal for frame
 * keys (T110 / FR-068)
 *
 * To know that "the key at row 2, column 5 on `shift`" and "the key at row
 * 2, column 5 on `default`" are the SAME key (so their positions can be
 * compared at all, and so a genuine move can be told apart from a key that
 * simply doesn't exist elsewhere), this function correlates ordinary keys by
 * `key.id` across the family's members, not by grid slot. That is right for
 * the common case — an ordinary key keeps one id across its whole family,
 * only its `output`/`text` varying by layer — but it is exactly wrong for a
 * frame/layer-switch key whose id MAY legitimately differ across the family
 * by design (contract §4/FR-068: Cameroon's `T_LOWER` on `symbol` vs
 * `T_UPPER` on `symbol-caps`, doing the equivalent job at the same position).
 *
 * T110 closes that at the INPUT BOUNDARY, exactly where this doc previously
 * said it would: {@link snapshotLayerPositions} indexes a frame/layer-switch
 * key under a positional ordinal ({@link frameCorrelationKey}) instead of its
 * id, so the four properties FR-068 exempts — `sp`, `nextlayer`, `id`, keycap
 * `text` — are not merely filtered out of the report but never enter the
 * comparison at all, while position and width are still compared exactly as
 * before. The comparison itself was not changed to achieve this; it only ever
 * read `rowIndex`/`columnIndex`/`width`.
 *
 * ## Severity (contract §5)
 *
 * The alphabetic plane (`family.plane === undefined`) gets `"warning"`
 * ("loud" per contract §5); any other plane gets the softer `"hint"`. This
 * is the two-tier split contract §5 already states outright — not T109's
 * job. T109's own scope is the finer-grained CLASSIFICATION of which named
 * planes count as "distinct" (symbol/emoji/numeric/alt-script) for possible
 * further filtering; this function does not attempt that classification and
 * checks every family {@link groupLayerFamilies} hands it (cross-plane
 * comparison is already structurally impossible — a family never spans more
 * than one plane).
 *
 * ## The baseline layer
 *
 * `family.layerIds[0]` (in {@link groupLayerFamilies}'s own insertion order,
 * i.e. the platform's original layer order — typically a plane's own root
 * layer, e.g. `default` or `symbol`) is the reference every other member is
 * compared against. This is a positional convention for producing a stable,
 * deterministic `"added"` vs `"removed"` label and a stable anchor address —
 * not a claim that the baseline is semantically "correct" and the rest
 * "wrong". Mirrors the "arbitrary but stable" anchor choice
 * `findMixedSuppressRemove` (touchKeyDiagnostics.ts) already makes for its
 * own finding.
 *
 * One finding per divergent key id, never one per sibling layer pair — see
 * the task briefing's "complain loudly... not one per sibling layer".
 *
 * @param platformId - The `.keyman-touch-layout` platform (`phone`/`tablet`/`desktop`) these layers belong to, for address-building only.
 * @param family - One family from {@link groupLayerFamilies} (a single plane's layer ids).
 * @param layersById - The platform's layers, keyed by layer id, so a caller sharing one platform across several families does not need to rebuild this per call.
 */
export function findFamilyParallelismBreaks(
  platformId: string,
  family: LayerFamily,
  layersById: ReadonlyMap<string, TouchLayoutLayer>,
): readonly FamilyParallelismFinding[] {
  const memberLayerIds = family.layerIds.filter((layerId) => layersById.has(layerId));
  // A family of fewer than two resolvable members has no sibling to be
  // non-parallel WITH.
  if (memberLayerIds.length < 2) return [];

  // T109: the split is stated once, in `severityForPlane` — never re-derived
  // from `family.plane` here.
  const severity = severityForPlane(family.plane);

  const snapshotsByLayerId = new Map<string, ReadonlyMap<string, KeyGridPosition>>();
  for (const layerId of memberLayerIds) {
    const layer = layersById.get(layerId);
    if (layer === undefined) continue; // excluded by the `.filter` above; narrows the type only.
    snapshotsByLayerId.set(layerId, snapshotLayerPositions(layer));
  }

  const allCorrelationKeys = new Set<string>();
  for (const snapshot of snapshotsByLayerId.values()) {
    for (const correlationKey of snapshot.keys()) allCorrelationKeys.add(correlationKey);
  }

  const findings: FamilyParallelismFinding[] = [];
  for (const correlationKey of allCorrelationKeys) {
    const finding = checkOneKeyParallelism(
      platformId,
      family.plane,
      memberLayerIds,
      snapshotsByLayerId,
      correlationKey,
      severity,
    );
    if (finding !== undefined) findings.push(finding);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Which EDITS a family can be non-parallel about — the forward-looking twin of
// findFamilyParallelismBreaks above.
// ---------------------------------------------------------------------------

/**
 * True when applying `op` to one member of a layer family can leave that family
 * out of step with its siblings — i.e. when FR-065's "apply it across the
 * family?" question is worth asking at all.
 *
 * ## Why this exists, and why it is derived from FR-068 rather than invented
 *
 * {@link findFamilyParallelismBreaks} answers the question BACKWARDS: given two
 * layouts, which keys are already out of step. A studio offering the fan-out at
 * the moment of an edit needs it FORWARDS: given the edit about to land, is
 * "out of step" even a possible outcome. Both must answer from the same premise
 * or the author gets asked about edits the check would never have flagged — and
 * the premise is FR-068's property split, already stated once above: the check
 * compares **presence, position and width**, and exempts **`sp`, `nextlayer`,
 * `id` and keycap `text`**, because those four legitimately differ across a
 * family. That is the whole rule, read forwards:
 *
 * - `remove` / `suppress` change PRESENCE (suppress removes a key's
 *   interactivity and neutralizes its id, so what is left is present but no
 *   longer a key the family can be in step about). Always relevant.
 * - `set` carrying `width` or `pad` changes GEOMETRY. Relevant.
 * - `set` carrying `sp` is relevant **only when it crosses the frame boundary**
 *   (`isFrameKeyClass`): moving between the ordinary classes — character,
 *   deadkey-styled, blank, spacer — is per-layer presentation the exempt list
 *   covers, whereas crossing into or out of `{1, 2}` changes which correlation
 *   namespace the key is compared under at all ({@link frameCorrelationKey}),
 *   which is a family-structural change.
 * - `set` carrying only `text`/`hint`/`id`/`layer`/`nextlayer`, and `rename`,
 *   are the exempt properties outright. NOT relevant — and this is the case
 *   that matters most in practice: `default` carries `a` where `shift` carries
 *   `A`, so fanning out a keycap or an id is very often the WRONG edit, and
 *   asking about it teaches authors to dismiss the dialog unread.
 * - `add`, `move`, `setSubKey`, `removeSubKey` return `false` here. `add` and
 *   `move` genuinely do affect parallelism, but neither is fannable — see
 *   `FamilyApplyDialog`'s `isFamilyApplicableOp` (an `add` needs a per-layer id
 *   proposal; a `move` has no shared referent across siblings, which
 *   `MoveKeyOp`'s own doc and both appliers already refuse). A caller must
 *   still gate on that predicate too; this one says only whether the QUESTION
 *   is worth asking.
 *
 * `beforeSp` is the `sp` the key carries BEFORE `op` is applied (the caller
 * resolves it — `undefined` for an absent `sp`, which the wire treats as
 * character/0 and so is correctly not a frame class). It is needed because
 * "crossed the frame boundary" is a claim about a transition, not about the new
 * value: a caller that passes the POST-edit `sp` would report every
 * frame-to-frame `1 -> 2` alternation — the one `sp` change contract §4's first
 * row calls correct design.
 */
export function keyEditAffectsFamilyParallelism(
  op: UnsequencedKeyEditOperation,
  beforeSp: number | undefined,
): boolean {
  switch (op.kind) {
    case "remove":
    case "suppress":
      return true;
    case "set": {
      if (op.fields.width !== undefined || op.fields.pad !== undefined) return true;
      if (op.fields.sp === undefined) return false;
      return isFrameKeyClass(op.fields.sp) !== isFrameKeyClass(beforeSp);
    }
    case "add":
    case "move":
    case "rename":
    case "setSubKey":
    case "removeSubKey":
      return false;
    default: {
      const exhaustive: never = op;
      return Boolean(exhaustive);
    }
  }
}

/**
 * One correlated key's parallelism across the family's members — see
 * {@link findFamilyParallelismBreaks}'s doc for the membership/moved/resized
 * precedence and the baseline convention.
 *
 * `correlationKey` is what the key is INDEXED under (an ordinary key's own id,
 * or a frame key's positional ordinal — see {@link snapshotLayerPositions}),
 * which for a frame key is synthetic and must never escape this function.
 * Every address and every reported id comes from the resolved
 * {@link KeyGridPosition}'s real `keyId` instead.
 */
function checkOneKeyParallelism(
  platformId: string,
  plane: string | undefined,
  memberLayerIds: readonly string[],
  snapshotsByLayerId: ReadonlyMap<string, ReadonlyMap<string, KeyGridPosition>>,
  correlationKey: string,
  severity: FamilyParallelismSeverity,
): FamilyParallelismFinding | undefined {
  const presentOnLayerIds: string[] = [];
  const missingFromLayerIds: string[] = [];
  const positionsByLayerId: Record<string, { rowIndex: number; columnIndex: number }> = {};
  const widthsByLayerId: Record<string, number | undefined> = {};
  /**
   * The real key id per layer. For an ordinary key every entry equals
   * `correlationKey`; for a frame key they may legitimately differ (FR-068's
   * third row — Cameroon's `T_LOWER`/`T_UPPER`), which is exactly why the
   * finding reports the whole map rather than one id standing in for all.
   */
  const keyIdsByLayerId: Record<string, string> = {};

  for (const layerId of memberLayerIds) {
    const position = snapshotsByLayerId.get(layerId)?.get(correlationKey);
    if (position === undefined) {
      missingFromLayerIds.push(layerId);
      continue;
    }
    presentOnLayerIds.push(layerId);
    positionsByLayerId[layerId] = { rowIndex: position.rowIndex, columnIndex: position.columnIndex };
    widthsByLayerId[layerId] = position.width;
    keyIdsByLayerId[layerId] = position.keyId;
  }

  const baselineLayerId = memberLayerIds[0];
  if (baselineLayerId === undefined) return undefined; // unreachable: caller already required >= 2 members.

  const frameKey = isFrameCorrelationKey(correlationKey);

  /**
   * The finding's `fields`, shared by all three break kinds. `keyId` is the
   * real id on the anchor layer (never the synthetic correlation key);
   * `frameKey` tells the studio's copy layer that the per-layer ids in
   * `keyIdsByLayerId` are allowed to differ, so it can word a frame-key
   * finding as "this frame key" rather than naming one id as though it were
   * the identity of all of them.
   */
  const commonFields = (anchorLayerId: string): Readonly<Record<string, unknown>> => ({
    plane,
    // T109: the classification travels WITH the finding so the studio's copy
    // layer can say "these symbol layers" vs "the main letter layers" without
    // re-deriving which planes count as independent layouts.
    planeClass: classifyPlane(plane),
    keyId: keyIdsByLayerId[anchorLayerId] ?? correlationKey,
    keyIdsByLayerId,
    frameKey,
    familyLayerIds: memberLayerIds,
  });

  if (missingFromLayerIds.length > 0) {
    // Baseline HAS it -> the layers missing it "removed" it; baseline LACKS
    // it -> the layers that have it "added" it. See the function doc.
    const kind: FamilyParallelismBreakKind = missingFromLayerIds.includes(baselineLayerId)
      ? "added"
      : "removed";
    const anchorLayerId = presentOnLayerIds[0] ?? baselineLayerId;
    const anchorKeyId = keyIdsByLayerId[anchorLayerId];
    if (anchorKeyId === undefined) return undefined; // unreachable: an anchor layer always has the key.
    const address = touchKeyAddress(platformId, anchorLayerId, anchorKeyId);
    return {
      code: "TOUCH_KEY_FAMILY_PARALLELISM_BREAK",
      severity,
      address,
      fields: {
        ...commonFields(anchorLayerId),
        kind,
        presentOnLayerIds,
        missingFromLayerIds,
      },
      fixes: [{ kind: "reviewFamilyMember", address }],
    };
  }

  const baselineKeyId = keyIdsByLayerId[baselineLayerId];
  if (baselineKeyId === undefined) return undefined; // unreachable: present on every member here.
  const baselineAddress = touchKeyAddress(platformId, baselineLayerId, baselineKeyId);

  // Present on every member: position parallelism, then width. These are the
  // ONLY two properties compared, which is what makes FR-068's exemption of
  // `sp`/`nextlayer`/`id`/keycap `text` structural rather than a filter —
  // there is no code path here that could report them.
  const referencePosition = positionsByLayerId[baselineLayerId]!;
  const positionDiverges = memberLayerIds.some((layerId) => {
    const p = positionsByLayerId[layerId]!;
    return p.rowIndex !== referencePosition.rowIndex || p.columnIndex !== referencePosition.columnIndex;
  });
  if (positionDiverges) {
    return {
      code: "TOUCH_KEY_FAMILY_PARALLELISM_BREAK",
      severity,
      address: baselineAddress,
      fields: { ...commonFields(baselineLayerId), kind: "moved", positionsByLayerId },
      fixes: [{ kind: "reviewFamilyMember", address: baselineAddress }],
    };
  }

  const referenceWidth = widthsByLayerId[baselineLayerId];
  const widthDiverges = memberLayerIds.some((layerId) => widthsByLayerId[layerId] !== referenceWidth);
  if (widthDiverges) {
    return {
      code: "TOUCH_KEY_FAMILY_PARALLELISM_BREAK",
      severity,
      address: baselineAddress,
      fields: { ...commonFields(baselineLayerId), kind: "resized", widthsByLayerId },
      fixes: [{ kind: "reviewFamilyMember", address: baselineAddress }],
    };
  }

  return undefined;
}
