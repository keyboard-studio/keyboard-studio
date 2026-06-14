// Pattern-apply engine: resolves MechanismAssignment[] to substituted .kmn text.
// Spec references: §5 (slot substitution), §7.7 (assignment-map), §10 (Layer A).
//
// KMN INJECTION STRATEGY (flagged for km-keyman validation):
//
//   A kmnFragment may contain:
//     (a) store(...) declarations, and
//     (b) one or more group(...) blocks with rules.
//
//   KMN requires all store() declarations to appear BEFORE the `begin` line and
//   any group() block. To honour this, applyAssignments splits each fragment on
//   the presence of store() lines vs. group() lines, then:
//
//     1. Hoist store lines: extracted store() declarations are inserted into the
//        .kmn BEFORE the first `begin` line (or before the first `group` line if
//        no `begin` is present). If neither anchor is found the stores are
//        prepended to the top.
//
//     2. Append group/rule lines: the non-store portion of the fragment (including
//        group() headers and rules) is appended verbatim at the END of the .kmn,
//        after all existing content.
//
//   Idempotency guard: a verbatim line that already appears in the .kmn is NOT
//   re-inserted. The check is line-level (trimmed equality), which prevents exact
//   duplicate store declarations and exact duplicate rule lines from accumulating
//   across multiple applyAssignments calls on the same source.
//
//   NOTE for km-keyman: this strategy produces syntactically valid KMN when the
//   base .kmn already contains `begin Unicode > use(main)` and `group(main) using
//   keys`. It does NOT merge rules INTO an existing group — it appends additional
//   group blocks. This is valid KMN: a keyboard file may have multiple named
//   groups. The main-group `match > use(deadkeys)` idiom used by S-02 requires
//   exactly this multi-group layout. The strategy is conservative and safe but
//   MAY produce unexpected ordering if the base .kmn already has a `match` clause
//   that routes differently — km-keyman should validate.

import type { MechanismAssignment, MechanismRef } from "@keyboard-studio/contracts";
import type { Pattern } from "@keyboard-studio/contracts";
import { substituteSlots } from "./substitute.js";

/**
 * Result returned by {@link applyAssignments}.
 */
export interface ApplyAssignmentsResult {
  /** The updated .kmn source text with all resolvable fragments injected. */
  kmn: string;
  /**
   * Human-readable warnings for skipped fragments (unknown pattern id, missing
   * required slot, etc.). Empty array means everything applied cleanly.
   */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Stable deduplication key for a MechanismRef: patternId + serialized slotValues.
 * Two refs that would produce identical substituted output collapse to one.
 */
function mechanismKey(ref: MechanismRef): string {
  const slots = ref.slotValues ?? {};
  // Sort keys for stable serialization.
  const sortedSlots = Object.keys(slots)
    .sort()
    .map((k) => `${k}=${slots[k] ?? ""}`)
    .join(";");
  return `${ref.patternId}::${sortedSlots}`;
}

/**
 * Return true if `line` (trimmed) already appears in the `existingLines` set.
 * Blank lines and comment-only lines are always allowed to be re-inserted
 * (they are cosmetic separators, not functional duplicates).
 */
function isDuplicateLine(trimmed: string, existingLines: Set<string>): boolean {
  if (trimmed === "") return false;
  if (trimmed.startsWith("c ") || trimmed === "c") return false;
  if (trimmed.startsWith("//")) return false;
  return existingLines.has(trimmed);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a set of physical {@link MechanismAssignment}s to substituted .kmn
 * fragments and inject them into `kmnSource`.
 *
 * Processing order:
 *   1. Collect all {@link MechanismRef}s across all assignments (physical modality
 *      only; touch assignments are handled by the touch-layout layer).
 *   2. Deduplicate refs by (patternId, slotValues) — identical refs from
 *      multiple assignments emit only once.
 *   3. For each unique ref: look up the Pattern via `getPattern`; substitute
 *      {{slotId}} placeholders; validate required slots.
 *   4. Inject surviving fragments into `kmnSource` using the store-hoist /
 *      group-append strategy described in the module-level comment above.
 *
 * @param assignments - Physical assignment map produced by the §7.7 gallery.
 *                      Touch-modality entries are silently ignored.
 * @param getPattern  - Resolver function: returns the Pattern for a given id,
 *                      or `undefined` if not found.
 * @param kmnSource   - Current .kmn source text (may be the scaffolder's output
 *                      or an empty string for a brand-new file).
 * @returns `{ kmn, warnings }` — the updated source and any diagnostic messages.
 */
export function applyAssignments(
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined,
  kmnSource: string
): ApplyAssignmentsResult {
  const warnings: string[] = [];

  // Step 1: collect all physical MechanismRefs and deduplicate.
  const seen = new Map<string, MechanismRef>();
  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;
    for (const ref of assignment.mechanisms) {
      const key = mechanismKey(ref);
      if (!seen.has(key)) {
        seen.set(key, ref);
      }
    }
  }

  if (seen.size === 0) {
    return { kmn: kmnSource, warnings };
  }

  // Step 2: resolve each unique ref to a substituted fragment.
  const storeLines: string[] = [];
  const groupLines: string[] = [];

  for (const ref of seen.values()) {
    const pattern = getPattern(ref.patternId);
    if (pattern === undefined) {
      warnings.push(
        `[pattern-apply] unknown patternId "${ref.patternId}" — fragment skipped`
      );
      continue;
    }

    const slotValues = ref.slotValues ?? {};
    const { text, unresolved } = substituteSlots(pattern.kmnFragment, slotValues);

    // Validate required slots: a question with required === undefined defaults to true.
    const missingRequired: string[] = [];
    for (const question of pattern.questions) {
      const isRequired = question.required !== false; // undefined or true => required
      if (isRequired && unresolved.includes(question.id)) {
        missingRequired.push(question.id);
      }
    }

    if (missingRequired.length > 0) {
      warnings.push(
        `[pattern-apply] pattern "${ref.patternId}" missing required slot(s): ` +
          missingRequired.join(", ") +
          " — fragment skipped"
      );
      continue;
    }

    // Warn about unresolved optional slots but still emit the fragment.
    const optionalUnresolved = unresolved.filter(
      (id) => !missingRequired.includes(id)
    );
    if (optionalUnresolved.length > 0) {
      warnings.push(
        `[pattern-apply] pattern "${ref.patternId}" has unresolved optional slot(s): ` +
          optionalUnresolved.join(", ") +
          " — emitting fragment with placeholder(s) intact"
      );
    }

    // Classify fragment lines into store declarations vs. group/rule lines.
    // A "store line" is any line whose trimmed form starts with `store(` or `store (`.
    const fragmentLines = text.split("\n");
    for (const line of fragmentLines) {
      const trimmed = line.trim();
      if (/^store\s*\(/i.test(trimmed)) {
        storeLines.push(line);
      } else {
        groupLines.push(line);
      }
    }
  }

  if (storeLines.length === 0 && groupLines.length === 0) {
    return { kmn: kmnSource, warnings };
  }

  // Step 3: inject into kmnSource.
  //
  // Build a set of existing trimmed lines for the idempotency guard.
  const existingTrimmed = new Set<string>(
    kmnSource.split("\n").map((l) => l.trim())
  );

  const kmnLines = kmnSource.split("\n");

  // --- Hoist store declarations ---
  // Find the insertion index: just before the first `begin` line, or before
  // the first `group(` line, or at index 0 if neither is found.
  let hoistIndex = kmnLines.findIndex((l) =>
    /^\s*begin\b/i.test(l)
  );
  if (hoistIndex === -1) {
    hoistIndex = kmnLines.findIndex((l) =>
      /^\s*group\s*\(/i.test(l)
    );
  }
  if (hoistIndex === -1) {
    hoistIndex = 0;
  }

  const newStoreLines = storeLines.filter(
    (l) => !isDuplicateLine(l.trim(), existingTrimmed)
  );

  // Insert the new store lines (plus a blank separator) at hoistIndex.
  if (newStoreLines.length > 0) {
    kmnLines.splice(hoistIndex, 0, ...newStoreLines, "");
    // Update existingTrimmed so the group-append pass sees the new stores.
    for (const l of newStoreLines) {
      existingTrimmed.add(l.trim());
    }
  }

  // --- Append group/rule lines ---
  const newGroupLines = groupLines.filter(
    (l) => !isDuplicateLine(l.trim(), existingTrimmed)
  );

  if (newGroupLines.length > 0) {
    // Remove a trailing empty string from kmnLines (common when source ends
    // with a newline) to avoid double blank lines at the join point.
    if (kmnLines[kmnLines.length - 1] === "") {
      kmnLines.pop();
    }
    kmnLines.push("", ...newGroupLines);
  }

  return { kmn: kmnLines.join("\n"), warnings };
}
