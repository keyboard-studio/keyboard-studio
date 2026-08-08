/**
 * applyDesktopModificationsToRawJson — Case B (shipped-touch-layout) replay of
 * the locked desktop work (Phase D carve removals + Phase C letter
 * placements) directly onto a copy of the raw `.keyman-touch-layout` JSON.
 *
 * Implemented as parse -> splice-in-place -> stringify, exactly like
 * {@link applyTouchAssignmentsToRawJson} — NEVER round-tripped through the IR
 * (`emitTouchLayout` drops per-key `layer`, `displayUnderlying`,
 * `font`/`fontsize`, and string-vs-int `sp`/`width`/`pad`). Every unmodified
 * field is preserved verbatim. Carries NO provenance fields — provenance is
 * an IR-only concept (R6); this path's no-clobber guarantee is pipeline
 * ordering (replay runs before `applyTouchAssignmentsToRawJson`, so author
 * Phase E edits are always applied last and can never be clobbered here).
 *
 * The contract (mirrors {@link applyDesktopModifications}, the Case A/IR
 * sibling). Placements are spliced BEFORE removals — the same chronological
 * order as the desktop decisions being replayed (Phase C precedes Phase D):
 *   - Placements — phone platform layer selected by the placement char's case
 *     (see `touchLayerForChar` in touchLayer.ts: an uppercase char targets
 *     "shift", everything else targets "default"): as the host key's own
 *     production when the host is empty, or as an sk[] longpress alternate
 *     when the host already produces something else. Absent/not-found
 *     hostKey: warn and place via a sensible fallback (appended to the last
 *     row of the target layer) so the char stays reachable. A
 *     "shift"-targeted placement falls back to "default" (with a warning)
 *     when the phone platform has no shift layer.
 *   - Removals — walk EVERY platform/layer/row/key. Drop matching sk[]/
 *     flick{}/multitap[] entries. A key whose primary production (text/
 *     output/U_-id) is carved is never deleted — it becomes the corpus's own
 *     blank (`T_BLANK` + `sp` 10, see `BLANK_KEY_ID` in
 *     touch-mechanism-shared.ts; text/output cleared) so row geometry/widths
 *     stay stable (R9). Matching is canonical (NFC) —
 *     {@link keyMatchesRemovalSet}. Running removals last means a hostKey
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

import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import {
  BLANK_KEY_ID,
  BLANK_KEY_SP,
  buildRemovalSet,
  isTouchKeyPrimaryProduction,
  isTouchSubKeyDuplicate,
  keyMatchesRemovalSet,
} from "./touch-mechanism-shared.js";
import type { RawKey, RawLayer, RawPlatform, RawRow } from "./touch-layout-wire-format.js";
import type { DesktopModifications } from "./applyDesktopModifications.js";
import { DEFAULT_TOUCH_LAYER, touchLayerForChar } from "./touchLayer.js";

/** The top-level raw .keyman-touch-layout JSON object. */
type RawTouchLayout = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ApplyDesktopModificationsToRawJsonResult {
  /** Updated .keyman-touch-layout JSON string, ready to inject into VFS. */
  json: string;
  /** Diagnostic messages — e.g. a placement whose hostKey wasn't found. */
  warnings: string[];
}

/**
 * Replay `mods` (carve removals + letter placements) directly onto a copy of
 * the raw shipped `.keyman-touch-layout` JSON string, preserving every
 * unmodified field verbatim.
 *
 * @param rawJson Raw `.keyman-touch-layout` JSON string from the base VFS.
 * @param mods    Desktop modifications to replay (see {@link DesktopModifications}).
 */
export function applyDesktopModificationsToRawJson(
  rawJson: string,
  mods: DesktopModifications,
): ApplyDesktopModificationsToRawJsonResult {
  const warnings: string[] = [];

  // Parse a fresh object — we mutate this tree directly.
  const layout = JSON.parse(rawJson) as RawTouchLayout;

  // Placements run BEFORE removals — same chronological order as the desktop
  // decisions they replay (Phase C precedes Phase D). This matters: if a
  // hostKey is both a Phase C placement target and later has its
  // (now-superseded) character carved, the removal pass must see the key's
  // CURRENT (placed) production, not evaluate a stale pre-placement one that
  // placements — indexed by the seed's original key id — could no longer find.
  applyPlacementsToRawLayout(layout, mods.placements, warnings);
  const removalSet = buildRemovalSet(mods.removals);
  removeAcrossRawLayout(layout, removalSet);

  return { json: JSON.stringify(layout), warnings };
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

function applyPlacementsToRawLayout(
  layout: RawTouchLayout,
  placements: readonly { char: string; hostKey: string }[],
  warnings: string[],
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

  for (const rawPlacement of placements) {
    const { hostKey } = rawPlacement;
    // Normalize once so `text` and `id` (charToUnicodeKeyId NFC-normalizes
    // internally) always agree, even for an NFD-form placement char — and so
    // touchLayerForChar sees a single precomposed code point for its case test.
    const char = rawPlacement.char.normalize("NFC");
    const { state, layerId } = resolveTargetLayer(char);

    if (!hostKey) {
      warnings.push(
        `[desktop-modifications-raw] placement for "${char}" has no hostKey — placed via fallback`,
      );
      placeFallback(state, char);
      continue;
    }

    const key = state.keyMap.get(hostKey);
    if (!key) {
      warnings.push(
        `[desktop-modifications-raw] host key "${hostKey}" not found in phone "${layerId}" layer — "${char}" placed via fallback`,
      );
      placeFallback(state, char);
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

    const hostIsEmpty = key.text === undefined && key.output === undefined;
    if (hostIsEmpty) {
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
