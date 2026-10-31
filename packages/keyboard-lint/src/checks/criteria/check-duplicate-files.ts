// Check 1.9 — KM_LINT_DUPLICATE_SOURCE_FILES (spec 084 Batch 2).
//
// "No duplicate copies of the same source file inside the keyboard
// folder." Pinned definition (triage, 2026-10-13): two VFS entries are
// duplicates of one source file iff they share a basename
// (case-insensitive — keyboard packages ship to case-insensitive
// tooling) AND their contents are byte-identical. Same basename with
// different content is two different files that happen to share a name
// (e.g. per-language help images edited separately) and is NOT flagged;
// identical content under different names is not a duplicate "copy of
// the same source file" either. Not precertifiable: adapt tracks carry
// base files through, so the folder is actually looked at.

import type { VirtualFS } from "@keyboard-studio/contracts";
import {
  baseNameLower,
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

const textEncoder = new TextEncoder();

/** FNV-1a 32-bit over the entry's bytes (strings are UTF-8 encoded). */
function contentHash(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? textEncoder.encode(content) : content;
  let hash = 0x811c9dc5;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${bytes.length}:${(hash >>> 0).toString(16)}`;
}

/** 1.9 — same basename at 2+ paths with identical content → one finding per group. */
export function checkDuplicateSourceFiles(fs: VirtualFS): CheckResult {
  let total = 0;
  const groups = new Map<string, string[]>();
  for (const entry of fs.entries()) {
    total += 1;
    const key = `${baseNameLower(entry.path)}|${contentHash(entry.content)}`;
    const list = groups.get(key);
    if (list) list.push(entry.path);
    else groups.set(key, [entry.path]);
  }
  const duplicateGroups: string[][] = [];
  for (const paths of groups.values()) {
    if (paths.length < 2) continue;
    duplicateGroups.push([...paths].sort());
  }
  if (duplicateGroups.length === 0)
    return checkPassed("KM_LINT_DUPLICATE_SOURCE_FILES", [
      `Scanned ${total} file(s): no duplicate copies of the same source file.`,
    ]);
  return checkFailed(
    "KM_LINT_DUPLICATE_SOURCE_FILES",
    duplicateGroups.map((sorted) =>
      criteriaFinding({
        code: "KM_LINT_DUPLICATE_SOURCE_FILES",
        file: sorted[0]!,
        message: `Duplicate copies of the same source file in the keyboard folder: ${sorted.join(", ")}.`,
        hint: "Keep one copy of the file and reference it from the single location.",
      }),
    ),
  );
}
