// adapt-staging — output-only helpers for the Track 2 "adapt existing keyboard" path.
//
// These helpers are ONLY called at serialization time (serializeWorkingCopy) and
// must NOT be called from the live OSK preview path (useWorkingCopyTransform /
// projectWorkingCopyVfs). Version bump and HISTORY.md prepend are output-only concerns.
//
// Exports:
//   bumpKeyboardVersion(version) — increment the last dot-separated segment by 1.
//   stageAdaptHistory(vfs, ..., dateIso) — prepend an adapt entry to HISTORY.md.

import type { VirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// bumpKeyboardVersion
// ---------------------------------------------------------------------------

/**
 * Increment the last dot-separated segment of a keyboard release version string.
 *
 * Rules:
 *   - Trim the input and strip any trailing dots first (e.g. "1.0." → "1.0").
 *   - If the result is empty, treat as "1.0" and return "1.1".
 *   - Split on `.`, parse the LAST segment as a non-negative integer.
 *   - If the last segment is a valid integer, increment by 1 and rejoin.
 *   - If the last segment is NOT a valid integer (NaN / non-numeric), append ".1"
 *     to the trimmed input string.
 *   - Leading-zero segments such as "1.09" are accepted: parseInt("09", 10) === 9,
 *     and since only NaN triggers the non-integer fallback, "1.09" → "1.10".
 *     The result does not preserve the leading zero.
 *
 * Examples:
 *   "1.0"             → "1.1"
 *   "1.0.2"           → "1.0.3"
 *   "2.0"             → "2.1"
 *   "not-a-version"   → "not-a-version.1"
 *   "1.0."            → "1.1"   (trailing dot stripped before processing)
 *   ""                → "1.1"   (empty/whitespace treated as "1.0")
 *   "1.09"            → "1.10"  (leading zero: parseInt strips it, 9+1=10)
 *
 * @param version - The keyboard release version string to bump.
 * @returns The bumped version string.
 */
export function bumpKeyboardVersion(version: string): string {
  // Guard: empty / whitespace input → treat as "1.0".
  const trimmed = version.trim().replace(/\.+$/, "");
  if (trimmed === "") {
    return "1.1";
  }
  const parts = trimmed.split(".");
  const last = parts[parts.length - 1];
  const n = parseInt(last ?? "", 10);
  // Check that the segment is a pure (possibly leading-zero) decimal integer.
  // The regex /^\d+$/ accepts "0", "09", "42" but not "0a", "1.2", or "".
  // This is looser than String(n) === last (which rejects "09"), which is correct:
  // "1.09" should increment to "1.10", not append ".1".
  if (isNaN(n) || !/^\d+$/.test(last ?? "")) {
    // Last segment is not a pure decimal integer — append ".1" to the trimmed input.
    return `${trimmed}.1`;
  }
  parts[parts.length - 1] = String(n + 1);
  return parts.join(".");
}

// ---------------------------------------------------------------------------
// stageAdaptHistory
// ---------------------------------------------------------------------------

/**
 * Prepend a "Adapted from …" entry to the VFS HISTORY.md for a Track 2 adapt.
 *
 * Format (ATX heading style, matches Track-1 generateStubs convention):
 *
 *   ## <bumpedVersion> (<dateIso>)
 *   * Adapted from <originalId> v<originalVersion> via keyboard-studio.
 *
 * The new entry is prepended so it appears at the top (newest-first).
 * Any existing HISTORY.md content is preserved below the new entry.
 * If HISTORY.md does not exist, it is created with just the new entry.
 *
 * Track-1 HISTORY.md entries are generated in generateStubs() in
 * packages/engine/src/scaffolder/index.ts. Both use the same ATX heading
 * style — if the format changes here, update the scaffolder too, and vice versa.
 *
 * @param vfs - The VirtualFS to write into (mutated in-place).
 * @param keyboardId - The new (or preserved) keyboard id for the adapt output (unused in text; retained for future use).
 * @param originalId - The keyboard id being adapted from.
 * @param originalVersion - The original keyboard's release version.
 * @param bumpedVersion - The bumped version string for the new release.
 * @param dateIso - ISO 8601 date string (YYYY-MM-DD). Pass as argument for deterministic testability.
 */
export function stageAdaptHistory(
  vfs: VirtualFS,
  _keyboardId: string,
  originalId: string,
  originalVersion: string,
  bumpedVersion: string,
  dateIso: string,
): void {
  const newEntry =
    `## ${bumpedVersion} (${dateIso})\n` +
    `* Adapted from ${originalId} v${originalVersion} via keyboard-studio.\n`;

  const existing = vfs.get("HISTORY.md");
  if (existing === undefined || typeof existing.content !== "string") {
    // No HISTORY.md — create one with just the new entry.
    vfs.set("HISTORY.md", newEntry, false);
  } else {
    // Prepend the new entry, preserving the original content below.
    const originalContent = existing.content;
    // Separate with a single blank line between the new entry and the old content.
    const combined =
      originalContent.length > 0
        ? `${newEntry}\n${originalContent}`
        : newEntry;
    vfs.set("HISTORY.md", combined, false);
  }
}
