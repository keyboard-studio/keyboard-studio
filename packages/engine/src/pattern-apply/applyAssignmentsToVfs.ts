// VFS adapter for pattern-apply — reads source/<keyboardId>.kmn, applies
// assignments, writes the result back. All authoring remains in-memory (§11).
//
// See spec.md §11 (Virtual FS), §12 (output artifacts).

import type { MechanismAssignment } from "@keyboard-studio/contracts";
import type { Pattern, VirtualFS } from "@keyboard-studio/contracts";
import { applyAssignments } from "./applyAssignments.js";
import type { ApplyAssignmentsResult } from "./applyAssignments.js";

/**
 * Read `source/<keyboardId>.kmn` from `vfs`, run {@link applyAssignments}
 * with the supplied assignments and pattern resolver, then write the updated
 * content back to the same path.
 *
 * Returns the {@link ApplyAssignmentsResult} so the caller can surface
 * warnings to the UI. The VFS is mutated in-place; the studio does NOT write
 * to disk during authoring (spec §11).
 *
 * @param vfs         The in-memory virtual filesystem for the keyboard project.
 * @param keyboardId  The keyboard identifier (used to derive the .kmn path,
 *                    e.g. `"tyv"` → `"source/tyv.kmn"`).
 * @param assignments Physical assignment map (touch entries are silently ignored).
 * @param getPattern  Resolver: returns the Pattern for a given id, or `undefined`.
 * @returns `{ kmn, warnings }` — the updated .kmn text and any diagnostic messages.
 *          A warning is added if the .kmn file does not exist in the VFS (the
 *          empty string is used as the base and injection proceeds normally so
 *          callers get a usable file even for brand-new keyboards).
 */
export function applyAssignmentsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  assignments: ReadonlyArray<MechanismAssignment>,
  getPattern: (id: string) => Pattern | undefined
): ApplyAssignmentsResult {
  const kmnPath = `source/${keyboardId}.kmn`;

  // Read current .kmn content from VFS.
  const entry = vfs.get(kmnPath);
  let kmnSource: string;
  const warnings: string[] = [];

  if (entry === undefined) {
    warnings.push(
      `[pattern-apply] "${kmnPath}" not found in VFS — starting from empty source`
    );
    kmnSource = "";
  } else if (entry.isBinary) {
    warnings.push(
      `[pattern-apply] "${kmnPath}" is marked binary — cannot apply text patches`
    );
    return { kmn: "", warnings };
  } else {
    kmnSource =
      typeof entry.content === "string"
        ? entry.content
        : new TextDecoder().decode(entry.content);
  }

  // Apply assignments.
  const result = applyAssignments(assignments, getPattern, kmnSource);

  // Collect all warnings (VFS-level first, then apply-level).
  const allWarnings = [...warnings, ...result.warnings];

  // Write updated content back to VFS.
  vfs.set(kmnPath, result.kmn, false);

  return { kmn: result.kmn, warnings: allWarnings };
}
