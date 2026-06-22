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
 *   - Apply each assignment to EVERY present platform that has the host key in
 *     its `default` layer.  Warn ONLY when the host key is found in NO
 *     platform's default layer.
 *   - For each platform that GAINS at least one new sk[] entry, add
 *     `defaultHint: "dot"` if the platform object has no `defaultHint` field
 *     already.  This keeps newly-added longpress menus discoverable on
 *     Keyman 17+.
 *   - `touch_inherited` → no-op, no warning.
 *   - Unknown patternId → one warning, no mutation.
 *   - Do NOT auto-seed sk[] from deadkey patterns (that is Case A behaviour,
 *     for keyboards that ship no touch layout).
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
 */

import type { TouchAssignment } from "@keyboard-studio/contracts";
import { charToUnicodeKeyId } from "../codec/touch-ids.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";

// ---------------------------------------------------------------------------
// Wire-format types (raw JSON shape — NOT the IR types)
// ---------------------------------------------------------------------------

/** A single key object as it appears in the raw .keyman-touch-layout JSON. */
interface RawKey {
  id: string;
  text?: string;
  sk?: Array<{ id: string; text?: string; output?: string; [k: string]: unknown }>;
  flick?: Record<string, { id: string; text?: string; output?: string; [k: string]: unknown }>;
  multitap?: Array<{ id: string; text?: string; output?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** A row object inside a layer. */
interface RawRow {
  id: number | string;
  key: RawKey[];
  [k: string]: unknown;
}

/** A layer object inside a platform. */
interface RawLayer {
  id: string;
  row: RawRow[];
  [k: string]: unknown;
}

/** A platform entry in the raw JSON (e.g. "tablet", "phone", "desktop"). */
interface RawPlatform {
  layer: RawLayer[];
  defaultHint?: string;
  [k: string]: unknown;
}

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

  // Pre-build a lookup: platformName → { keyId → RawKey } for the default layer.
  // We only look in the "default" layer per the spec.
  // Guard: skip non-platform entries (e.g. top-level "_comment" strings) and
  // platforms whose `layer` field is absent or not an array.
  const platformDefaultKeyMaps = new Map<string, Map<string, RawKey>>();
  for (const pName of platformNames) {
    const platform = layout[pName];
    if (!platform || typeof platform !== "object") continue;
    const p = platform as RawPlatform;
    if (!Array.isArray(p.layer)) continue;
    const defaultLayer = p.layer.find((l) => l.id === "default");
    if (!defaultLayer) continue;
    if (!Array.isArray(defaultLayer.row)) continue;
    const keyMap = new Map<string, RawKey>();
    for (const row of defaultLayer.row) {
      if (!Array.isArray(row.key)) continue;
      for (const key of row.key) {
        if (key.id) keyMap.set(key.id, key);
      }
    }
    platformDefaultKeyMaps.set(pName, keyMap);
  }

  // Track which platforms gained at least one new sk[] entry (for defaultHint).
  const platformsGainingSk = new Set<string>();

  for (const assignment of assignments) {
    const ref = assignment.mechanisms[0];
    if (!ref) continue;

    const { patternId, slotValues } = ref;

    // touch_inherited: intentional no-op, no warning.
    if (patternId === "touch_inherited") continue;

    if (
      patternId === "longpress_alternates" ||
      patternId === "flick_gestures" ||
      patternId === "multitap"
    ) {
      const hostKey = slotValues?.["hostKey"] ?? "";
      const char = slotValues?.["char"] ?? "";

      // Find which platforms have this host key in their default layer.
      const matchedPlatforms: string[] = [];
      for (const [pName, keyMap] of platformDefaultKeyMaps) {
        if (keyMap.has(hostKey)) matchedPlatforms.push(pName);
      }

      // Warn only when the key is found in NO platform.
      if (matchedPlatforms.length === 0) {
        warnings.push(
          `[touch-apply-raw] host key "${hostKey}" not found in any platform's default layer — assignment for "${char}" skipped`,
        );
        continue;
      }

      // Apply to each matched platform.
      for (const pName of matchedPlatforms) {
        const keyMap = platformDefaultKeyMaps.get(pName)!;
        const key = keyMap.get(hostKey)!;

        if (patternId === "longpress_alternates") {
          applyLongpress(key, char, pName, platformsGainingSk);
        } else if (patternId === "flick_gestures") {
          const direction = slotValues?.["direction"] ?? "";
          applyFlick(key, direction, char);
        } else {
          // multitap
          applyMultitap(key, char);
        }
      }
      continue;
    }

    // Unknown patternId — one warning per assignment.
    warnings.push(
      `[touch-apply-raw] unknown patternId "${patternId}" — assignment skipped`,
    );
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
