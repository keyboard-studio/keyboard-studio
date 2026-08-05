/**
 * applyTouchAssignmentsToRawJson — faithful Phase E touch-assignment editor
 * for keyboards that SHIP a `.keyman-touch-layout` file.
 *
 * When the base keyboard already ships a touch layout, author Phase E
 * assignments must be spliced DIRECTLY onto a copy of the raw shipped JSON —
 * never reconstructed through the IR (`emitTouchLayout`), which silently
 * drops per-key `layer`, `displayUnderlying`, per-key `font`/`fontsize`, and
 * string-vs-int `sp`/`width`/`pad`.
 *
 * The contract:
 *   - parse the raw JSON to a plain object (fresh tree — JSON.parse guarantees
 *     this), splice sk[]/flick/multitap into the matching key objects IN PLACE,
 *     stringify.  Unmodified keys/layers/platforms/fields are copied verbatim.
 *   - Apply each mechanism to EVERY present platform that has the host key in
 *     the layer the mechanism names (`slotValues.layer`, default `"default"`).
 *     Warn ONLY when the host key is found in NO platform's target layer — an
 *     unknown layer id lands on that same path, so it warns and skips rather
 *     than throwing or silently falling back to `"default"`.
 *   - For each platform that GAINS at least one new sk[] entry, add
 *     `defaultHint: "dot"` if the platform object has no `defaultHint` field
 *     already.  This keeps newly-added longpress menus discoverable on
 *     Keyman 17+.
 *   - `touch_key_replace` → sets the host key's `id` to the U_-form Unicode
 *     key id and `text` to the character, and deletes any stale `output`
 *     field (mirrors Case A's `applyTouchAssignments` semantics).
 *   - `touch_inherited` → no-op, no warning.
 *   - Unknown patternId → one warning, no mutation.
 *   - Do NOT auto-seed sk[] from deadkey patterns (that is Case A behaviour,
 *     for keyboards that ship no touch layout).
 *   - Positional-fallback-into-blank-placeholder: a modifier layer (e.g.
 *     `rightalt`) commonly carries an un-named slot as a `T_BLANK` sentinel
 *     (or an empty-text spacer — spacer-CLASS `sp`, per the canonical
 *     `isSpacerKeyClass`/`SPACER_SP_VALUES` predicate in
 *     `@keyboard-studio/contracts` touch-coverage.ts, never "any defined
 *     `sp`" — real keys carry `sp:0`/`1`/`2`) rather than the desktop vkey
 *     id, because Keyman only assigns a real id to a layer slot once
 *     something is bound to it. Layer row/key arrays are strictly positional
 *     and same-length across sibling layers, so when `hostKey` misses the
 *     target layer's id-keyed lookup, resolve its (rowIndex, keyIndex) from
 *     that platform's `"default"` layer and re-check the SAME position on
 *     the target layer. If that slot is a blank placeholder, promote it in
 *     place before applying the mechanism, rather than warning and dropping
 *     the assignment: set its `id` to `hostKey`; clear its spacer `sp` only
 *     (`width`/`pad`, if present, are load-bearing for row alignment and
 *     survive untouched); copy `nextlayer` VERBATIM (including its absence)
 *     from the target layer's first existing live key — scanned starting at
 *     the candidate's own row and wrapping around, so a same-neighborhood
 *     key wins over an unrelated control key earlier in row order — falling
 *     back to `"default"` only when the layer has no live key anywhere; and, once
 *     the mechanism has run, borrow the DEFAULT-layer key's base `text` at
 *     the same position if the candidate's base `text` is still empty
 *     (`longpress`/`flick`/`multitap` never set it; only `touch_key_replace`
 *     does). A slot that doesn't exist at that position, or one that already
 *     holds a different real key, is left alone (existing miss/warning
 *     behavior).
 *   - Each assignment's `mechanisms[]` are ALL applied (not just the first) —
 *     one character may carry multiple touch methods simultaneously.
 *
 * Non-standard top-level keys (e.g. `"_comment"` strings) and platforms
 * missing a `layer` array are silently skipped — this function NEVER throws
 * on parseable-but-odd JSON.  It may still throw `SyntaxError` when `rawJson`
 * is not valid JSON; that is the documented caller contract.
 *
 * Output formatting matches `emitTouchLayout` (Case A): `JSON.stringify` with
 * no pretty-print indent, so both Phase-E output paths produce compact JSON.
 *
 * @see applyTouchAssignments.ts — IR-based applier for the generate-from-scratch path.
 * @see scaffoldTouchLayout.ts  — generates a phone layout when no touch layout exists.
 * @see touch-mechanism-shared.ts — shared deduplication predicate.
 * @see touch-layout-wire-format.ts — shared raw-JSON wire-format types (with propagateDesktopLayersToTouch.ts).
 */

import type { TouchAssignment } from "@keyboard-studio/contracts";
import { isSpacerKeyClass } from "@keyboard-studio/contracts";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";
import type { RawKey, RawPlatform, RawRow } from "./touch-layout-wire-format.js";
import { DEFAULT_TOUCH_LAYER, resolveTouchLayerId } from "./touchLayer.js";

/** The top-level raw .keyman-touch-layout JSON object. */
type RawTouchLayout = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ApplyTouchAssignmentsToRawJsonResult {
  /** Updated .keyman-touch-layout JSON string, ready to inject into VFS. */
  json: string;
  /** Diagnostic messages for unmatched host keys or unhandled assignments. */
  warnings: string[];
}

/**
 * Apply a list of Phase E {@link TouchAssignment}s directly onto a copy of the
 * raw shipped `.keyman-touch-layout` JSON string, preserving every unmodified
 * field verbatim.
 *
 * Only sk[], flick{}, and multitap[] arrays are spliced; every other field is
 * passed through from the parsed JSON object unchanged.  Returns a new JSON
 * string (JSON.parse + in-place mutation + JSON.stringify); the input string is
 * never modified.
 *
 * @param rawJson     Raw `.keyman-touch-layout` JSON string from the base VFS.
 * @param assignments Phase E touch assignments (non-inherited only).
 */
export function applyTouchAssignmentsToRawJson(
  rawJson: string,
  assignments: readonly TouchAssignment[],
): ApplyTouchAssignmentsToRawJsonResult {
  const warnings: string[] = [];

  // Parse a fresh object — we mutate this tree directly.
  const layout = JSON.parse(rawJson) as RawTouchLayout;
  const platformNames = Object.keys(layout);

  // Pre-build a lookup: platformName → layerId → { keyId → RawKey }, across
  // every layer present. A mechanism selects its layer with `slotValues.layer`
  // (absent === "default"), so the map has to be keyed by layer id too.
  // Guard: skip non-platform entries (e.g. top-level "_comment" strings) and
  // platforms whose `layer` field is absent or not an array.
  const platformLayerKeyMaps = new Map<string, Map<string, Map<string, RawKey>>>();
  // Parallel index of each platform's layer row arrays (by layer id), kept for
  // the positional fallback below — same layer/row-array traversal as the
  // keyMap build above, so it costs nothing extra to collect alongside it.
  const platformLayerRows = new Map<string, Map<string, RawRow[]>>();
  for (const pName of platformNames) {
    const platform = layout[pName];
    if (!platform || typeof platform !== "object") continue;
    const p = platform as RawPlatform;
    if (!Array.isArray(p.layer)) continue;
    const layerMaps = new Map<string, Map<string, RawKey>>();
    const layerRows = new Map<string, RawRow[]>();
    for (const layer of p.layer) {
      if (!layer?.id) continue;
      if (!Array.isArray(layer.row)) continue;
      const keyMap = new Map<string, RawKey>();
      for (const row of layer.row) {
        if (!Array.isArray(row.key)) continue;
        for (const key of row.key) {
          if (key.id) keyMap.set(key.id, key);
        }
      }
      layerMaps.set(layer.id, keyMap);
      layerRows.set(layer.id, layer.row);
    }
    if (layerMaps.size > 0) platformLayerKeyMaps.set(pName, layerMaps);
    if (layerRows.size > 0) platformLayerRows.set(pName, layerRows);
  }

  // Track which platforms gained at least one new sk[] entry (for defaultHint).
  const platformsGainingSk = new Set<string>();

  // Track keys promoted from a blank placeholder (positional fallback below),
  // by object identity, so the post-mechanism base-text borrow (FIX 3) only
  // ever applies to a key that was genuinely blank before this run — never to
  // a real key that happened to be matched by id.
  const promotedKeys = new Set<RawKey>();

  for (const assignment of assignments) {
    for (const ref of assignment.mechanisms) {
      const { patternId, slotValues } = ref;

      // touch_inherited: intentional no-op, no warning.
      if (patternId === "touch_inherited") continue;

      if (
        patternId === "longpress_alternates" ||
        patternId === "flick_gestures" ||
        patternId === "multitap" ||
        patternId === "touch_key_replace"
      ) {
        const hostKey = slotValues?.["hostKey"] ?? "";
        const char = slotValues?.["char"] ?? "";
        const layerId = resolveTouchLayerId(slotValues);

        // Find which platforms have this host key in the TARGET layer. A
        // platform that lacks the layer entirely simply does not match — an
        // unknown layer therefore matches nothing and takes the warn+skip path
        // below rather than falling back to "default".
        const matchedPlatforms: string[] = [];
        for (const [pName, layerMaps] of platformLayerKeyMaps) {
          const targetMap = layerMaps.get(layerId);
          if (targetMap?.has(hostKey)) {
            matchedPlatforms.push(pName);
            continue;
          }

          // Positional fallback: an id-based miss on a KNOWN target layer
          // (targetMap exists — the layer id itself is real) may still be
          // resolvable by position. Resolve hostKey's (rowIndex, keyIndex) in
          // this platform's "default" layer, then check the SAME position on
          // the target layer for a blank placeholder to promote in place.
          if (targetMap) {
            const rowsMap = platformLayerRows.get(pName);
            const defaultRows = rowsMap?.get(DEFAULT_TOUCH_LAYER);
            const targetRows = rowsMap?.get(layerId);
            const position = defaultRows ? findKeyPosition(defaultRows, hostKey) : undefined;
            const candidate =
              position && targetRows ? getKeyAtPosition(targetRows, position) : undefined;
            if (candidate && isBlankPlaceholder(candidate)) {
              candidate.id = hostKey;
              // Clear the spacer style only — width/pad (when the blank slot
              // carries them) are load-bearing for row alignment and must
              // survive promotion untouched.
              delete candidate["sp"];
              assignPromotedNextLayer(candidate, targetRows!, position!.rowIndex);
              targetMap.set(hostKey, candidate);
              matchedPlatforms.push(pName);
              promotedKeys.add(candidate);
            }
          }
        }

        // Warn only when the key is found in NO platform's target layer.
        if (matchedPlatforms.length === 0) {
          warnings.push(
            `[touch-apply-raw] host key "${hostKey}" not found in any platform's "${layerId}" layer — assignment for "${char}" skipped`,
          );
          continue;
        }

        // Apply to each matched platform.
        for (const pName of matchedPlatforms) {
          const key = platformLayerKeyMaps.get(pName)!.get(layerId)!.get(hostKey)!;

          if (patternId === "longpress_alternates") {
            applyLongpress(key, char, pName, platformsGainingSk);
          } else if (patternId === "flick_gestures") {
            const direction = slotValues?.["direction"] ?? "";
            applyFlick(key, direction, char);
          } else if (patternId === "multitap") {
            applyMultitap(key, char);
          } else {
            // touch_key_replace
            applyKeyReplace(key, char);
          }

          // A key promoted from a blank placeholder has no base `text` of its
          // own; `touch_key_replace` sets one, but longpress/flick/multitap
          // don't, so borrow the DEFAULT-layer key's text at the same host
          // key if it's still empty (else the promoted key renders invisible).
          if (promotedKeys.has(key)) {
            borrowBaseTextIfEmpty(key, hostKey, platformLayerKeyMaps.get(pName)!);
          }
        }
        continue;
      }

      // Unknown patternId — one warning per mechanism.
      warnings.push(
        `[touch-apply-raw] unknown patternId "${patternId}" — mechanism skipped`,
      );
    }
  }

  // Add defaultHint:"dot" to each platform that gained new sk[] entries and
  // does not already have a defaultHint set.
  for (const pName of platformsGainingSk) {
    const platform = layout[pName];
    if (platform && typeof platform === "object") {
      const p = platform as RawPlatform;
      if (p.defaultHint === undefined) {
        p.defaultHint = "dot";
      }
    }
  }

  // Compact JSON: matches emitTouchLayout (Case A) — no pretty-print indent.
  return { json: JSON.stringify(layout), warnings };
}

// ---------------------------------------------------------------------------
// Helpers — positional fallback (layer-id-agnostic; no keyboard/layer name
// is ever hardcoded — every layer id comes from the JSON being processed)
// ---------------------------------------------------------------------------

/**
 * Find `keyId`'s (rowIndex, keyIndex) position by scanning `rows` in order.
 * Used to resolve a host key's position in a platform's "default" layer so
 * the SAME position can be re-checked on a different (e.g. modifier) layer,
 * whatever that layer happens to be named.
 */
function findKeyPosition(
  rows: readonly RawRow[],
  keyId: string,
): { rowIndex: number; keyIndex: number } | undefined {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || !Array.isArray(row.key)) continue;
    for (let keyIndex = 0; keyIndex < row.key.length; keyIndex++) {
      if (row.key[keyIndex]?.id === keyId) return { rowIndex, keyIndex };
    }
  }
  return undefined;
}

/** Read the key object at a given (rowIndex, keyIndex), or undefined if the
 *  target layer's rows don't extend that far (different shape than default). */
function getKeyAtPosition(
  rows: readonly RawRow[],
  position: { rowIndex: number; keyIndex: number },
): RawKey | undefined {
  return rows[position.rowIndex]?.key?.[position.keyIndex];
}

/** Empty/whitespace-only (or absent) text — shared by the blank predicate
 *  below and the post-mechanism base-text borrow. */
function isEmptyText(text: unknown): boolean {
  return typeof text !== "string" || text.trim() === "";
}

/**
 * A slot is an "assignable blank" — safe to promote into a live key — when it
 * carries no real identity of its own: either the well-known `T_BLANK`
 * sentinel, OR (more generally, covering layouts that use a different blank
 * id or no id-based sentinel at all) an empty/whitespace `text` combined with
 * a spacer-CLASS `sp` value (the canonical `isSpacerKeyClass` predicate from
 * `@keyboard-studio/contracts` — `sp:8`/`sp:10`, never "any defined `sp`":
 * real keys carry `sp:0` (normal), `sp:1` (special), or `sp:2` (shift), e.g.
 * the spacebar ships as `{"id":"K_SPACE","text":" ","sp":0}`, and must never
 * be promoted). A slot with real text, or one with neither signal, is left
 * alone — it is a genuine key, not a placeholder, and must never be
 * clobbered.
 */
export function isBlankPlaceholder(key: RawKey): boolean {
  if (key.id === "T_BLANK") return true;
  const sp = typeof key["sp"] === "number" ? (key["sp"] as number) : undefined;
  return isEmptyText(key.text) && isSpacerKeyClass(sp);
}

/**
 * Set a promoted key's `nextlayer` by sampling the TARGET layer's first
 * existing live (non-blank) key and copying the field VERBATIM — including
 * its ABSENCE. A transient modifier layer (e.g. `rightalt`) commonly carries
 * `nextlayer:"default"` on its live keys to auto-revert after one tap, while
 * a persistent layer (e.g. `caps`) deliberately omits `nextlayer` on its live
 * keys to stay put — so copying "always default" would be wrong for the
 * latter.
 *
 * The scan starts at the CANDIDATE's own row and proceeds forward, wrapping
 * to the rows before it only if nothing turns up — every row is visited
 * exactly once, so the fallback below only fires when the whole layer has no
 * live key, but a key's own row (and the rows after it) are the most
 * representative neighbors, ahead of an unrelated control row (e.g. a
 * keyboard-wide backspace key) that happens to sit earlier in row order.
 */
function assignPromotedNextLayer(
  candidate: RawKey,
  targetRows: readonly RawRow[],
  fromRowIndex: number,
): void {
  const orderedRows = [...targetRows.slice(fromRowIndex), ...targetRows.slice(0, fromRowIndex)];
  for (const row of orderedRows) {
    if (!Array.isArray(row.key)) continue;
    for (const key of row.key) {
      if (key === candidate || isBlankPlaceholder(key)) continue;
      if (key.nextlayer !== undefined) {
        candidate.nextlayer = key.nextlayer;
      } else {
        delete candidate.nextlayer;
      }
      return;
    }
  }
  // Fallback heuristic: a layer with zero live keys gives no positive
  // evidence either way, so default to the common auto-revert case.
  candidate.nextlayer = "default";
}

/**
 * Borrow the DEFAULT-layer key's base `text` (at the same `hostKey`) for a
 * promoted-from-blank candidate whose base `text` is still empty after its
 * mechanism ran. `touch_key_replace` sets `text` itself; `longpress`/
 * `flick`/`multitap` do not, so without this a longpress-only promotion would
 * keep the blank's empty `text` and render as an invisible button.
 */
function borrowBaseTextIfEmpty(
  key: RawKey,
  hostKey: string,
  layerKeyMaps: Map<string, Map<string, RawKey>>,
): void {
  if (!isEmptyText(key.text)) return;
  const defaultKey = layerKeyMaps.get(DEFAULT_TOUCH_LAYER)?.get(hostKey);
  // `typeof` (not `isEmptyText`) narrows `defaultKey.text` from `string |
  // undefined` to `string` for the assignment below.
  if (defaultKey && typeof defaultKey.text === "string" && defaultKey.text.trim() !== "") {
    key.text = defaultKey.text;
  }
}

// ---------------------------------------------------------------------------
// Helpers — mutate key objects in place
// ---------------------------------------------------------------------------

function applyLongpress(
  key: RawKey,
  char: string,
  platformName: string,
  platformsGainingSk: Set<string>,
): void {
  if (!key.sk) key.sk = [];

  // Dedupe: skip if already present by text/output OR by U_ id (shared predicate).
  if (key.sk.some((s) => isTouchSubKeyDuplicate(s, char))) return;

  key.sk.push({ id: charToUnicodeKeyId(char), text: char });
  platformsGainingSk.add(platformName);
}

function applyFlick(key: RawKey, direction: string, char: string): void {
  if (!key.flick) key.flick = {};
  // last-wins per direction (same as IR path).
  key.flick[direction] = { id: charToUnicodeKeyId(char), text: char };
}

function applyMultitap(key: RawKey, char: string): void {
  if (!key.multitap) key.multitap = [];

  // Dedupe: skip if already present by text/output OR by U_ id (shared predicate).
  if (key.multitap.some((s) => isTouchSubKeyDuplicate(s, char))) return;

  key.multitap.push({ id: charToUnicodeKeyId(char), text: char });
}

function applyKeyReplace(key: RawKey, char: string): void {
  // Case A semantics: the U_-id supersedes any existing `output` field (a
  // stale output would otherwise take precedence over the id-derived
  // codepoint). All other properties — pad/width/sp geometry, nextlayer,
  // existing sk/flick/multitap — are left untouched.
  key.id = charToUnicodeKeyId(char);
  key.text = char;
  delete key.output;
}
