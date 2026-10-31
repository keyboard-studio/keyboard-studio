/**
 * applyDesktopModificationsToRawJson — Case B (shipped-touch-layout) replay of
 * the locked desktop work (Phase D carve removals + Phase C letter
 * placements) directly onto a copy of the raw `.keyman-touch-layout` JSON.
 *
 * Implemented as parse -> splice-in-place -> stringify, exactly like
 * {@link applyTouchAssignmentsToRawJson} — never round-tripped through the
 * IR. Carries NO provenance fields — provenance is an IR-only concept (R6);
 * this path's no-clobber guarantee is pipeline ordering (replay runs before
 * `applyTouchAssignmentsToRawJson`, so author Phase E edits are always
 * applied last and can never be clobbered here).
 *
 * Why raw JSON (spec 035 R9, Case B) — basis restated 2026-10-16. An
 * earlier version of this header claimed the IR emitter drops per-key
 * `layer`, `displayUnderlying`, `font`/`fontsize`, and string-vs-int
 * `sp`/`width`/`pad`. That was true when written and is false now: since
 * the full-fidelity codec landed (issue 2083), every modelled field
 * round-trips through `parseTouchLayoutString` / `emitTouchLayout`,
 * encodings included. Case B rests on three other things:
 *   1. R9's verbatim guarantee. Splicing the parsed tree in place keeps
 *      unknown members at any level and every unmodified member's value —
 *      including members no codec models. Preservation is at the parsed
 *      level: output is re-serialised by the canonical two-space
 *      stringify, so formatting (indentation, escapes, a trailing
 *      newline) is normalised even though values are not.
 *   2. The call contract is string-in, string-out. This runs at derivation
 *      time in `buildTouchLayoutJson`'s Case B arm on the base's shipped
 *      JSON string; no `TouchLayoutIR` is passed to it or constructed on
 *      its emission path (the IR `buildTouchLayoutJson` derives is parsed
 *      FROM this splice's output, for other consumers).
 *   3. The parser's modelled-surface limits are the conversion price. An
 *      IR round trip drops or normalises: members outside the closed
 *      platform set (desktop/tablet/phone) — top-level non-platform
 *      members such as `"_comment"` included; unknown members at every
 *      level below the top; a platform with no `layer` array;
 *      non-canonical flick directions; empty `sk`/`multitap` arrays;
 *      empty-string display fields (`hint`/`layer`/`font`/`fontsize`/
 *      `dk`, platform `fontsize`/`defaultHint`) treated as absent;
 *      non-numeric `sp`/`width`/`pad`; string row ids (regenerated as
 *      numbers); and member/platform ordering. The parser and emitter
 *      (`parseTouchLayout` in contracts, `codec/parse-touch.ts`) are the
 *      authority for that list.
 * Converting this applier is therefore a judgement call — accept those
 * losses on a shipped base author's file and supply an IR at the call
 * site, proven by a Case A/B twin-equivalence test — not a
 * codec-fidelity fix.
 *
 * The contract (mirrors {@link applyDesktopModifications}, the Case A/IR
 * sibling). Placements are spliced BEFORE removals — the same chronological
 * order as the desktop decisions being replayed (Phase C precedes Phase D):
 *   - Placements — phone platform layer selected by the placement char's case
 *     (see `touchLayerForChar` in touchLayer.ts: an uppercase char targets
 *     "shift", everything else targets "default"): as the host key's own
 *     production when the host is empty, or as an sk[] longpress alternate
 *     when the host already produces something else. Absent/not-found
 *     baseKey: warn and place via a sensible fallback (appended to the last
 *     row of the target layer) so the char stays reachable. A
 *     "shift"-targeted placement falls back to "default" (with a warning)
 *     when the phone platform has no shift layer.
 *   - Removals — walk EVERY platform/layer/row/key. Drop matching sk[]/
 *     flick{}/multitap[] entries. A key whose primary production (text/
 *     output/U_-id) is carved is never deleted — it becomes the corpus's own
 *     blank (`T_BLANK` + `sp` 10, see `BLANK_KEY_ID` in
 *     touch-mechanism-shared.ts; text/output cleared) so row geometry/widths
 *     stay stable (R9). Matching is canonical (NFC) —
 *     {@link keyMatchesRemovalSet}. Running removals last means a baseKey
 *     that was both placed onto and later (re-)carved is evaluated by its
 *     current post-placement production, not a stale one placements could
 *     no longer find by id.
 *
 * Non-standard top-level keys (e.g. `"_comment"` strings) and platforms
 * missing a `layer` array are silently skipped — this function NEVER throws
 * on parseable-but-odd JSON. It may still throw `SyntaxError` when `rawJson`
 * is not valid JSON; that is the documented caller contract.
 *
 * @see applyDesktopModifications.ts — IR-based sibling (Case A).
 * @see applyTouchAssignmentsToRawJson.ts — Phase E raw-JSON applier (splice-in-place precedent).
 * @see touch-mechanism-shared.ts — shared removal-matching + dedup predicates.
 * @see touch-layout-wire-format.ts — shared raw-JSON wire-format types.
 */

import type { TouchKeyIR } from "@keyboard-studio/contracts";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import {
  BLANK_KEY_ID,
  BLANK_KEY_SP,
  buildRemovalSet,
  findSlotOccupant,
  isTouchKeyPrimaryProduction,
  isTouchSubKeyDuplicate,
  keyMatchesRemovalSet,
  resolvedTextProductions,
  touchKeyIdFamily,
  type PlacementResolverContext,
} from "./touch-mechanism-shared.js";
import type { RawKey, RawLayer, RawPlatform, RawRow } from "./touch-layout-wire-format.js";
import type { DesktopModifications } from "./applyDesktopModifications.js";
import { DEFAULT_TOUCH_LAYER, touchLayerForChar } from "./touchLayer.js";
import { TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";

/** The top-level raw .keyman-touch-layout JSON object. */
type RawTouchLayout = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ApplyDesktopModificationsToRawJsonResult {
  /** Updated .keyman-touch-layout JSON string, ready to inject into VFS. */
  json: string;
  /** Diagnostic messages — e.g. a placement whose baseKey wasn't found. */
  warnings: string[];
}

/**
 * Replay `mods` (carve removals + letter placements) directly onto a copy of
 * the raw shipped `.keyman-touch-layout` JSON string, preserving every
 * unmodified member's value verbatim (see module doc for the exact basis).
 *
 * @param rawJson Raw `.keyman-touch-layout` JSON string from the base VFS.
 * @param mods    Desktop modifications to replay (see {@link DesktopModifications}).
 * @param resolverCtx Spec 104 FR-021 (T017) production-resolver inputs —
 *                    when supplied, placement host lookup is
 *                    resolver-addressed exactly as in the IR twin
 *                    ({@link applyDesktopModifications}); when absent, the
 *                    legacy exact-id behaviour is unchanged.
 */
export function applyDesktopModificationsToRawJson(
  rawJson: string,
  mods: DesktopModifications,
  resolverCtx?: PlacementResolverContext,
): ApplyDesktopModificationsToRawJsonResult {
  const warnings: string[] = [];

  // Parse a fresh object — we mutate this tree directly.
  const layout = JSON.parse(rawJson) as RawTouchLayout;

  // Placements run BEFORE removals — same chronological order as the desktop
  // decisions they replay (Phase C precedes Phase D). This matters: if a
  // baseKey is both a Phase C placement target and later has its
  // (now-superseded) character carved, the removal pass must see the key's
  // CURRENT (placed) production, not evaluate a stale pre-placement one that
  // placements — indexed by the seed's original key id — could no longer find.
  applyPlacementsToRawLayout(layout, mods.placements, warnings, resolverCtx);
  const removalSet = buildRemovalSet(mods.removals);
  removeAcrossRawLayout(layout, removalSet);

  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), warnings };
}

// ---------------------------------------------------------------------------
// Pass 1 — removals (every platform / layer / row / key)
// ---------------------------------------------------------------------------

function removeAcrossRawLayout(layout: RawTouchLayout, removalSet: ReadonlySet<string>): void {
  for (const pName of Object.keys(layout)) {
    const platform = layout[pName];
    if (!platform || typeof platform !== "object") continue;
    const p = platform as RawPlatform;
    if (!Array.isArray(p.layer)) continue;

    for (const layer of p.layer) {
      if (!Array.isArray(layer.row)) continue;
      for (const row of layer.row) {
        if (!Array.isArray(row.key)) continue;
        for (const key of row.key) {
          stripRemovedFromRawKey(key, removalSet);
        }
      }
    }
  }
}

/** Mutate `key` in place, dropping carved gesture entries / primary production. */
function stripRemovedFromRawKey(key: RawKey, removalSet: ReadonlySet<string>): void {
  if (Array.isArray(key.sk)) {
    key.sk = key.sk.filter((s) => !keyMatchesRemovalSet(s, removalSet));
  }
  if (Array.isArray(key.multitap)) {
    key.multitap = key.multitap.filter((m) => !keyMatchesRemovalSet(m, removalSet));
  }
  if (key.flick && typeof key.flick === "object") {
    for (const direction of Object.keys(key.flick)) {
      const sub = key.flick[direction];
      if (sub && keyMatchesRemovalSet(sub, removalSet)) {
        delete key.flick[direction];
      }
    }
  }

  if (keyMatchesRemovalSet(key, removalSet)) {
    // Never delete the key object — row geometry/widths stay stable (R9).
    // The emptied-key spelling is shared with the IR twin (BLANK_KEY_ID /
    // BLANK_KEY_SP in touch-mechanism-shared.ts), which carries the full
    // rationale and the corpus measurement behind it. `sp` is written as a
    // NUMBER, matching how every other raw writer in this package sets it
    // (`applyKeyEditsToRawJson.ts`'s writeFieldsToRawKey / newRawKeyFromSpec);
    // the wire-format reader coerces either spelling.
    key.id = BLANK_KEY_ID;
    delete key.text;
    delete key.output;
    key.sp = BLANK_KEY_SP;
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — placements (phone platform, layer selected by touchLayerForChar)
// ---------------------------------------------------------------------------

/** Mutable per-layer working state, created lazily the first time a
 *  placement targets that layer. */
interface LayerWorkState {
  layer: RawLayer;
  keyMap: Map<string, RawKey>;
}

/** Minimal TouchKeyIR view of a raw key, for production-resolver reads only. */
function rawKeyToResolverKey(key: RawKey): TouchKeyIR {
  const rawSp = key["sp"];
  const sp =
    typeof rawSp === "number"
      ? rawSp
      : typeof rawSp === "string" && rawSp.trim() !== "" && !Number.isNaN(Number(rawSp))
        ? Number(rawSp)
        : undefined;
  return {
    nodeId: "",
    id: key.id,
    ...(key.text !== undefined ? { text: key.text } : {}),
    ...(key.output !== undefined ? { output: key.output } : {}),
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    ...(typeof key["layer"] === "string" ? { layer: key["layer"] } : {}),
    ...(sp !== undefined ? { sp } : {}),
  };
}

function applyPlacementsToRawLayout(
  layout: RawTouchLayout,
  placements: readonly { char: string; baseKey: string }[],
  warnings: string[],
  resolverCtx?: PlacementResolverContext,
): void {
  if (placements.length === 0) return;

  const phone = layout["phone"];
  if (!phone || typeof phone !== "object" || !Array.isArray((phone as RawPlatform).layer)) {
    warnings.push(
      "[desktop-modifications-raw] no phone platform found in layout — all placements skipped",
    );
    return;
  }
  const phonePlatform = phone as RawPlatform;

  const layerStates = new Map<string, LayerWorkState>();

  function resolveLayerState(layerId: string): LayerWorkState | undefined {
    const existing = layerStates.get(layerId);
    if (existing) return existing;

    const layer = phonePlatform.layer.find((l) => l.id === layerId);
    if (!layer || !Array.isArray(layer.row)) return undefined;

    const keyMap = new Map<string, RawKey>();
    for (const row of layer.row) {
      if (!Array.isArray(row.key)) continue;
      for (const key of row.key) {
        if (key.id) keyMap.set(key.id, key);
      }
    }

    const state: LayerWorkState = { layer, keyMap };
    layerStates.set(layerId, state);
    return state;
  }

  // The default layer must exist up front — a "shift"-targeted placement
  // falls back to it (see resolveTargetLayer below), and a layout with no
  // default layer at all skips every placement, same as before this change.
  if (!resolveLayerState(DEFAULT_TOUCH_LAYER)) {
    warnings.push(
      "[desktop-modifications-raw] phone platform has no default layer — all placements skipped",
    );
    return;
  }

  /**
   * Resolve the layer a placement's char targets (via touchLayerForChar).
   * Falls back to the default layer — with a warning — when the case rule
   * picks a layer (e.g. "shift") the phone platform doesn't have, so the
   * char stays reachable rather than silently dropped.
   */
  function resolveTargetLayer(char: string): { state: LayerWorkState; layerId: string } {
    const desiredLayerId = touchLayerForChar(char);
    const desiredState = resolveLayerState(desiredLayerId);
    if (desiredState) return { state: desiredState, layerId: desiredLayerId };

    warnings.push(
      `[desktop-modifications-raw] phone platform has no "${desiredLayerId}" layer — "${char}" placed on the default layer instead`,
    );
    // Guaranteed present — checked above.
    return { state: resolveLayerState(DEFAULT_TOUCH_LAYER)!, layerId: DEFAULT_TOUCH_LAYER };
  }

  // Sensible fallback position: append a new letter key onto the last row of
  // the target layer (or a fresh row if the layer is empty) so the character
  // stays reachable even with no obvious host position.
  function placeFallback(state: LayerWorkState, char: string): void {
    const fallbackKey: RawKey = { id: charToUnicodeKeyId(char), text: char };
    const rows: RawRow[] = state.layer.row;
    if (rows.length === 0) {
      rows.push({ id: 1, key: [fallbackKey] });
    } else {
      const lastRow = rows[rows.length - 1]!;
      if (!Array.isArray(lastRow.key)) lastRow.key = [];
      lastRow.key.push(fallbackKey);
    }
    state.keyMap.set(fallbackKey.id, fallbackKey);
  }

  /** Land `char` on `host` as a longpress alternate, in place (raw twin of
   *  the IR applier's T_/U_ landing — the host's id is never rewritten). */
  function landAsLongpress(host: RawKey, char: string): void {
    if (!Array.isArray(host.sk)) host.sk = [];
    if (host.sk.some((s) => isTouchSubKeyDuplicate(s, char))) return;
    host.sk.push({ id: charToUnicodeKeyId(char), text: char });
  }

  /**
   * The slot's resolver-resolved occupant (spec 104 FR-021), scanning the
   * layer's CURRENT keys row-major — the raw twin of the IR applier's
   * findOccupantPosition. Returns the occupant's raw key object (a live
   * reference into the tree) or undefined.
   */
  function findOccupant(state: LayerWorkState, baseKey: string, layerId: string): RawKey | undefined {
    if (!resolverCtx) return undefined;
    const rawKeys: RawKey[] = [];
    for (const row of state.layer.row) {
      if (!Array.isArray(row.key)) continue;
      for (const key of row.key) rawKeys.push(key);
    }
    const converted = rawKeys.map(rawKeyToResolverKey);
    const occupant = findSlotOccupant(resolverCtx, converted, baseKey, layerId);
    if (!occupant) return undefined;
    const idx = converted.indexOf(occupant);
    return idx === -1 ? undefined : rawKeys[idx];
  }

  for (const rawPlacement of placements) {
    const { baseKey } = rawPlacement;
    // Normalize once so `text` and `id` (charToUnicodeKeyId NFC-normalizes
    // internally) always agree, even for an NFD-form placement char — and so
    // touchLayerForChar sees a single precomposed code point for its case test.
    const char = rawPlacement.char.normalize("NFC");
    const { state, layerId } = resolveTargetLayer(char);

    if (!baseKey) {
      warnings.push(
        `[desktop-modifications-raw] placement for "${char}" has no hostKey — placed via fallback`,
      );
      placeFallback(state, char);
      continue;
    }

    const key = state.keyMap.get(baseKey);
    if (!key) {
      // Spec 104 FR-021 (T017): an exact-id miss is not yet a miss — the
      // slot may be occupied by a T_/U_ key. Resolve the occupant through
      // the production resolver and land on IT rather than appending a
      // duplicate key to the last row (the IR twin's rule, same order).
      const occupant = findOccupant(state, baseKey, layerId);
      if (occupant) {
        if (
          resolverCtx &&
          resolvedTextProductions(resolverCtx, rawKeyToResolverKey(occupant), layerId).includes(
            char,
          )
        ) {
          continue;
        }
        landAsLongpress(occupant, char);
        continue;
      }

      warnings.push(
        `[desktop-modifications-raw] host key "${baseKey}" not found in phone "${layerId}" layer — "${char}" placed via fallback`,
      );
      placeFallback(state, char);
      continue;
    }

    // Spec 104 FR-021 (T017): for a T_/U_ host, "already produces this
    // char" is a resolver question, not a keycap-text one (the IR twin's
    // rule) — a ruled T_ host whose keycap is "◌̀" already produces
    // U+0300 and must not be handed a duplicate longpress of it.
    const keyFamily = touchKeyIdFamily(key.id);
    if (
      resolverCtx &&
      (keyFamily === "T_" || keyFamily === "U_") &&
      resolvedTextProductions(resolverCtx, rawKeyToResolverKey(key), layerId).includes(char)
    ) {
      continue;
    }

    // The host's own primary production is already this char (common on a
    // shift-layer seed) — nothing to place; never hand a key itself as its own
    // longpress alternate. Same guard, same position as the IR applier: raw
    // JSON carries no provenance so there is no hand-set branch to order
    // against here, but keeping the two loops in the same sequence is what
    // stops them drifting. A key with no production fails this predicate, so
    // the empty-host branch below still owns that case.
    if (isTouchKeyPrimaryProduction(key, char)) continue;

    // A T_/U_ host's id is never rewritten by a placement (FR-021): the
    // placement lands as a longpress alternate instead of the empty-host
    // id rewrite below.
    if (keyFamily === "T_" || keyFamily === "U_") {
      landAsLongpress(key, char);
      continue;
    }

    const baseIsEmpty = key.text === undefined && key.output === undefined;
    if (baseIsEmpty) {
      key.id = charToUnicodeKeyId(char);
      key.text = char;
      delete key.output;
      continue;
    }

    // Host already produces another char — add as a longpress alternate.
    if (!Array.isArray(key.sk)) key.sk = [];
    if (key.sk.some((s) => isTouchSubKeyDuplicate(s, char))) continue;
    key.sk.push({ id: charToUnicodeKeyId(char), text: char });
  }
}
