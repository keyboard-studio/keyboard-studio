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
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";
import type { RawKey, RawPlatform } from "./touch-layout-wire-format.js";

/** The top-level raw .keyman-touch-layout JSON object. */
type RawTouchLayout = Record<string, unknown>;

/** The layer a mechanism targets when it does not name one. Absent `layer`
 *  must stay byte-identical to the pre-`layer` behaviour. */
const DEFAULT_TOUCH_LAYER = "default";

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
  for (const pName of platformNames) {
    const platform = layout[pName];
    if (!platform || typeof platform !== "object") continue;
    const p = platform as RawPlatform;
    if (!Array.isArray(p.layer)) continue;
    const layerMaps = new Map<string, Map<string, RawKey>>();
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
    }
    if (layerMaps.size > 0) platformLayerKeyMaps.set(pName, layerMaps);
  }

  // Track which platforms gained at least one new sk[] entry (for defaultHint).
  const platformsGainingSk = new Set<string>();

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
        const layerId = slotValues?.["layer"] ?? DEFAULT_TOUCH_LAYER;

        // Find which platforms have this host key in the TARGET layer. A
        // platform that lacks the layer entirely simply does not match — an
        // unknown layer therefore matches nothing and takes the warn+skip path
        // below rather than falling back to "default".
        const matchedPlatforms: string[] = [];
        for (const [pName, layerMaps] of platformLayerKeyMaps) {
          if (layerMaps.get(layerId)?.has(hostKey)) matchedPlatforms.push(pName);
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
