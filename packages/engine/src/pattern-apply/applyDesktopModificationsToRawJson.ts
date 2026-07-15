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
 *   - Placements — phone platform's "default" layer only: as the host key's
 *     own production when the host is empty, or as an sk[] longpress
 *     alternate when the host already produces something else. Absent/
 *     not-found hostKey: warn and place via a sensible fallback (appended to
 *     the last row) so the char stays reachable.
 *   - Removals — walk EVERY platform/layer/row/key. Drop matching sk[]/
 *     flick{}/multitap[] entries. A key whose primary production (text/
 *     output/U_-id) is carved is never deleted — it becomes an inert
 *     `T_removed_<n>` placeholder (id changed, text/output cleared) so row
 *     geometry/widths stay stable (R9). Matching is canonical (NFC) —
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
  buildRemovalSet,
  isTouchSubKeyDuplicate,
  keyMatchesRemovalSet,
} from "./touch-mechanism-shared.js";
import type { RawKey, RawPlatform, RawRow } from "./touch-layout-wire-format.js";
import type { DesktopModifications } from "./applyDesktopModifications.js";

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
  // Deterministic per-document counter for T_removed_<n> placeholder ids —
  // increments only when a key's primary production is actually carved.
  let placeholderCounter = 0;
  const mintPlaceholderId = () => `T_removed_${placeholderCounter++}`;

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
          stripRemovedFromRawKey(key, removalSet, mintPlaceholderId);
        }
      }
    }
  }
}

/** Mutate `key` in place, dropping carved gesture entries / primary production. */
function stripRemovedFromRawKey(
  key: RawKey,
  removalSet: ReadonlySet<string>,
  mintPlaceholderId: () => string,
): void {
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
    key.id = mintPlaceholderId();
    delete key.text;
    delete key.output;
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — placements (phone platform's "default" layer only)
// ---------------------------------------------------------------------------

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
  const defaultLayer = phonePlatform.layer.find((l) => l.id === "default");
  if (!defaultLayer || !Array.isArray(defaultLayer.row)) {
    warnings.push(
      "[desktop-modifications-raw] phone platform has no default layer — all placements skipped",
    );
    return;
  }

  const keyMap = new Map<string, RawKey>();
  for (const row of defaultLayer.row) {
    if (!Array.isArray(row.key)) continue;
    for (const key of row.key) {
      if (key.id) keyMap.set(key.id, key);
    }
  }

  // Sensible fallback position: append a new letter key onto the last row
  // (or a fresh row if the layer is empty) so the character stays reachable
  // even with no obvious host position.
  function placeFallback(char: string): void {
    const fallbackKey: RawKey = { id: charToUnicodeKeyId(char), text: char };
    const rows: RawRow[] = defaultLayer!.row;
    if (rows.length === 0) {
      rows.push({ id: 1, key: [fallbackKey] });
    } else {
      const lastRow = rows[rows.length - 1]!;
      if (!Array.isArray(lastRow.key)) lastRow.key = [];
      lastRow.key.push(fallbackKey);
    }
    keyMap.set(fallbackKey.id, fallbackKey);
  }

  for (const rawPlacement of placements) {
    const { hostKey } = rawPlacement;
    // Normalize once so `text` and `id` (charToUnicodeKeyId NFC-normalizes
    // internally) always agree, even for an NFD-form placement char.
    const char = rawPlacement.char.normalize("NFC");
    if (!hostKey) {
      warnings.push(
        `[desktop-modifications-raw] placement for "${char}" has no hostKey — placed via fallback`,
      );
      placeFallback(char);
      continue;
    }

    const key = keyMap.get(hostKey);
    if (!key) {
      warnings.push(
        `[desktop-modifications-raw] host key "${hostKey}" not found in phone default layer — "${char}" placed via fallback`,
      );
      placeFallback(char);
      continue;
    }

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
