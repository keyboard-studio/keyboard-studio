// Pattern-apply engine: resolves MechanismAssignment[] to substituted .kmn text.
// Spec references: §5 (slot substitution), §7.7 (assignment-map), §10 (Layer A).
//
// KMN INJECTION STRATEGY — MERGE-BY-GROUP-NAME
//
//   A kmnFragment may contain:
//     (a) store(...) declarations — MUST precede `begin` in KMN, and MUST NOT
//         be system stores (&-prefixed); those stay in the header as-is.
//     (b) group(<name>) blocks with rules — merged BY NAME into any existing
//         group of the same name in the base .kmn.
//     (c) bare rule lines with NO group header — treated as belonging to
//         group(main) by convention. A trigger rule like
//         `+ [K_QUOTE] > deadkey(...)` is always a main-group rule; this
//         assumption is documented and callers may not rely on a different
//         convention without a schema-level group-tag field (deferred to #5b).
//
//   Injection algorithm:
//     1. Parse base .kmn into: header region (up to and including `begin`
//        plus any pre-group stores) + ordered list of GroupBlock objects.
//     2. Parse each fragment (after substitution) into: pre-group store lines
//        + list of GroupBlock objects (bare rules → synthetic group(main) block).
//     3. For each fragment GroupBlock:
//          - If the base contains a group with the same name: splice the
//            fragment's body lines INTO that group's body, just before any
//            trailing `match`/`nomatch` directives (which must stay LAST).
//            Dedup `match > use(...)` lines — keep only the last unique target.
//          - Otherwise: append the whole group block at EOF.
//     4. Hoist new user-store lines (non-&-prefixed) before `begin`; skip
//        system stores (&-prefixed) — they belong in the header region only.
//     5. Idempotency: a trimmed line already present in the base is not
//        re-inserted. The guard applies at the RULE level AFTER group headers
//        have been placed — a group header is never suppressed by the
//        idempotency check.
//
// DIVISION OF LABOUR:
//   applyAssignments   — raw injection; accepts a flat MechanismRef[].
//   resolveRenderableMechanisms — applies §7.7 precedence so default-scope
//     mechanisms are NOT emitted when an individual assignment overrides them.
//   applyAssignmentsToVfs — VFS adapter; reads, applies, writes back.

import type {
  MechanismAssignment,
  MechanismRef,
  Modality,
} from "@keyboard-studio/contracts";
import { effectiveMechanisms } from "@keyboard-studio/contracts";
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
// Internal types
// ---------------------------------------------------------------------------

/** A parsed group block from a .kmn file. */
interface GroupBlock {
  /** Group name as it appears in `group(<name>)`. */
  name: string;
  /** The raw `group(<name>) ...` header line (original, not trimmed). */
  headerLine: string;
  /** Lines inside the group body (NOT including the header line). */
  bodyLines: string[];
}

/** Parsed representation of a .kmn file for merge purposes. */
interface ParsedKmn {
  /** Lines from top of file up to and including the `begin` line (and any
   *  pre-group user stores immediately after). */
  headerLines: string[];
  /** Ordered list of group blocks after the header region. */
  groups: GroupBlock[];
}

/** Parsed fragment ready to be merged. */
interface ParsedFragment {
  /** User store lines extracted from the fragment (excludes &-prefixed system stores). */
  storeLines: string[];
  /** System store lines (&-prefixed) from the fragment — documented as skipped. */
  systemStoreLines: string[];
  /** Group blocks in the fragment. Bare rules are placed in a synthetic group(main). */
  groups: GroupBlock[];
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
  const sortedSlots = Object.keys(slots)
    .sort()
    .map((k) => `${k}=${slots[k] ?? ""}`)
    .join(";");
  return `${ref.patternId}::${sortedSlots}`;
}

/**
 * Return true if `trimmed` already appears in the `existingLines` set.
 * Blank lines and comment-only lines are always allowed to be re-inserted
 * (they are cosmetic separators, not functional duplicates).
 */
function isDuplicateLine(trimmed: string, existingLines: Set<string>): boolean {
  if (trimmed === "") return false;
  if (trimmed.startsWith("c ") || trimmed === "c") return false;
  if (trimmed.startsWith("//")) return false;
  return existingLines.has(trimmed);
}

/** Returns true if a trimmed line is a match/nomatch tail directive. */
function isTailDirective(trimmed: string): boolean {
  return /^(match|nomatch)\s*>/i.test(trimmed);
}

/**
 * ES2022-compatible findLastIndex: returns the index of the last element
 * satisfying the predicate, or -1. (Array.prototype.findLastIndex is ES2023.)
 */
function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i] as T)) return i;
  }
  return -1;
}

/**
 * Extract the store name from a `store(name) ...` line.
 * Returns null if the line is not a store declaration.
 */
function storeNameOf(trimmedLine: string): string | null {
  const m = /^store\s*\(\s*([^)]+?)\s*\)/i.exec(trimmedLine);
  return m ? (m[1] ?? null) : null;
}

/**
 * Parse a KMN source string into its header region + group blocks.
 *
 * The header region includes everything up to (and including) the `begin`
 * line, plus any user-store lines that appear after `begin` but before the
 * first `group(` line. In practice the scaffolder emits all stores before
 * `begin`, but some hand-authored keyboards place comments between begin and
 * the first group — we preserve those as header lines too.
 */
function parseKmn(source: string): ParsedKmn {
  const lines = source.split("\n");
  const headerLines: string[] = [];
  const groups: GroupBlock[] = [];

  let seenBegin = false;
  let currentGroup: GroupBlock | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect `begin` line (parity with tokenize.ts: `begin\s` or just `begin` at EOL).
    // Uses `\s` not `\b` to match the convention established in tokenize.ts (line 91).
    if (!seenBegin && /^\s*begin\s/i.test(trimmed)) {
      seenBegin = true;
      headerLines.push(line);
      continue;
    }

    // Detect group header.
    const groupMatch = /^\s*group\s*\(\s*(\S+?)\s*\)\s*(.*)/i.exec(trimmed);
    if (groupMatch) {
      // Save the previous group before starting a new one.
      if (currentGroup !== null) {
        groups.push(currentGroup);
      }
      currentGroup = {
        name: groupMatch[1] ?? "",
        headerLine: line,
        bodyLines: [],
      };
      continue;
    }

    if (currentGroup !== null) {
      currentGroup.bodyLines.push(line);
    } else {
      headerLines.push(line);
    }
  }

  if (currentGroup !== null) {
    groups.push(currentGroup);
  }

  return { headerLines, groups };
}

/**
 * Parse a substituted fragment into store lines + group blocks.
 *
 * Rules:
 *   - Lines matching `/^store\s*\(\s*(?!&)/i` are user stores → hoisted.
 *   - Lines matching `/^store\s*\(\s*&/i` are system stores → skipped/documented.
 *   - Lines matching `/^\s*group\s*\(/i` start a new group block.
 *   - Any other non-group lines before the first group header are bare rules
 *     and are treated as belonging to group(main) per the documented convention.
 */
function parseFragment(fragmentText: string): ParsedFragment {
  const lines = fragmentText.split("\n");
  const storeLines: string[] = [];
  const systemStoreLines: string[] = [];
  const groups: GroupBlock[] = [];

  // Accumulate bare rules (no group header) before the first group block.
  let bareRules: string[] = [];
  let currentGroup: GroupBlock | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // User store line (non-&-prefixed).
    if (/^store\s*\(\s*(?!&)/i.test(trimmed)) {
      storeLines.push(line);
      continue;
    }

    // System store line (&-prefixed) — skip from hoisting.
    if (/^store\s*\(\s*&/i.test(trimmed)) {
      systemStoreLines.push(line);
      continue;
    }

    // Group header.
    const groupMatch = /^\s*group\s*\(\s*(\S+?)\s*\)\s*(.*)/i.exec(trimmed);
    if (groupMatch) {
      if (currentGroup !== null) {
        groups.push(currentGroup);
      }
      currentGroup = {
        name: groupMatch[1] ?? "",
        headerLine: line,
        bodyLines: [],
      };
      continue;
    }

    if (currentGroup !== null) {
      currentGroup.bodyLines.push(line);
    } else {
      // Bare rule (no enclosing group header yet) — accumulate for main group.
      bareRules.push(line);
    }
  }

  if (currentGroup !== null) {
    groups.push(currentGroup);
  }

  // If there are bare rules, synthesize a group(main) block for them.
  // This handles fragments that contain only rule lines without a group header.
  if (bareRules.length > 0) {
    // Check whether there's already a group(main) in the fragment groups;
    // if so, prepend the bare rules into it; otherwise create a new one.
    const mainIdx = groups.findIndex((g) => g.name === "main");
    if (mainIdx !== -1) {
      groups[mainIdx]!.bodyLines.unshift(...bareRules);
    } else {
      groups.unshift({
        name: "main",
        headerLine: "group(main) using keys",
        bodyLines: bareRules,
      });
    }
  }

  return { storeLines, systemStoreLines, groups };
}

/**
 * Merge a fragment GroupBlock into an existing base GroupBlock.
 *
 * Rules:
 *   1. Fragment body lines are inserted BEFORE any trailing tail directives
 *      (`match > use(...)` / `nomatch > use(...)`) in the base group.
 *   2. New `match > use(X)` lines from the fragment replace any existing
 *      `match > use(...)` lines in the tail (last-wins, deduped by target).
 *      The merged tail stays at the end of the group.
 *   3. Idempotency: a body line that already exists (trimmed) in existingLines
 *      is not re-inserted.
 */
function mergeGroupBlock(
  base: GroupBlock,
  fragment: GroupBlock,
  existingLines: Set<string>
): GroupBlock {
  // Split base body into: pre-tail lines + tail lines.
  const tailStart = findLastIndex(base.bodyLines, (l: string) =>
    isTailDirective(l.trim())
  );

  const preTail: string[] =
    tailStart === -1 ? [...base.bodyLines] : base.bodyLines.slice(0, tailStart);
  const baseTail: string[] =
    tailStart === -1 ? [] : base.bodyLines.slice(tailStart);

  // Collect new body lines from the fragment (excluding tail directives).
  const newBodyLines: string[] = [];
  const newTailLines: string[] = [];

  for (const line of fragment.bodyLines) {
    if (isTailDirective(line.trim())) {
      newTailLines.push(line);
    } else if (!isDuplicateLine(line.trim(), existingLines)) {
      newBodyLines.push(line);
    }
  }

  // Merge tail: start with base tail, then override with fragment tail lines.
  // Last fragment `match > use(X)` wins; base `match > use(Y)` is dropped if
  // the fragment provides a replacement.
  const mergedTail = [...baseTail];
  for (const newTail of newTailLines) {
    const newTrimmed = newTail.trim();
    // Detect whether this is a match or nomatch directive.
    const matchKind = /^\s*(match|nomatch)\s*>/i.exec(newTrimmed)?.[1]?.toLowerCase();
    if (matchKind !== undefined) {
      // Remove any existing directive of the same kind (dedup, last-wins).
      const dupIdx = findLastIndex(mergedTail, (l: string) => {
        const re = new RegExp(`^\\s*${matchKind}\\s*>`, "i");
        return re.test(l.trim());
      });
      if (dupIdx !== -1) {
        mergedTail.splice(dupIdx, 1);
      }
    }
    if (!isDuplicateLine(newTrimmed, existingLines)) {
      mergedTail.push(newTail);
    }
  }

  return {
    name: base.name,
    headerLine: base.headerLine, // keep original header (e.g. `using keys`)
    bodyLines: [...newBodyLines, ...preTail, ...mergedTail],
  };
}

/**
 * Serialize a ParsedKmn back to a single string.
 */
function serializeKmn(parsed: ParsedKmn): string {
  const parts: string[] = [...parsed.headerLines];
  for (const group of parsed.groups) {
    parts.push(group.headerLine);
    parts.push(...group.bodyLines);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the **renderable** mechanisms for a full inventory of targets,
 * applying §7.7 precedence (individual > character-class > keyboard-default)
 * via {@link effectiveMechanisms} from \@keyboard-studio/contracts.
 *
 * Division of labour:
 *   - `resolveRenderableMechanisms` owns precedence: it ensures a
 *     default-scope mechanism is NOT emitted when an individual-scope
 *     assignment overrides it for the same target.
 *   - `applyAssignments` owns injection: it receives the deduplicated
 *     winning MechanismRef[] and splices them into the .kmn source text.
 *
 * @param assignments  Merged assignment list (from {@link mergeAssignments}).
 * @param inventory    All characters / targets to cover (NFC graphemes).
 * @param classesOf    Returns the class ids a target belongs to (precedence order).
 * @param modality     Which modality to resolve for (default `"physical"`).
 * @returns Deduplicated list of winning MechanismRefs across all inventory targets.
 */
export function resolveRenderableMechanisms(
  assignments: ReadonlyArray<MechanismAssignment>,
  inventory: ReadonlyArray<string>,
  classesOf: (char: string) => ReadonlyArray<string>,
  modality: Modality = "physical"
): MechanismRef[] {
  const seen = new Map<string, MechanismRef>();
  for (const target of inventory) {
    const refs = effectiveMechanisms(
      assignments,
      target,
      modality,
      classesOf(target)
    );
    for (const ref of refs) {
      const key = mechanismKey(ref);
      if (!seen.has(key)) {
        seen.set(key, ref);
      }
    }
  }
  return [...seen.values()];
}

/**
 * Resolve a set of physical {@link MechanismAssignment}s to substituted .kmn
 * fragments and inject them into `kmnSource` using merge-by-group-name.
 *
 * Processing order:
 *   1. Collect all {@link MechanismRef}s across all assignments (physical modality
 *      only; touch assignments are handled by the touch-layout layer).
 *   2. Deduplicate refs by (patternId, slotValues).
 *   3. For each unique ref: look up the Pattern via `getPattern`; substitute
 *      `{{slotId}}` placeholders; validate required slots.
 *   4. Parse the base .kmn and each fragment; merge group blocks by name;
 *      hoist new user stores before `begin`. System stores (&-prefixed) in
 *      fragments are skipped and a warning is emitted.
 *
 * @param assignments - Physical assignment map. Touch-modality entries are ignored.
 * @param getPattern  - Resolver: returns the Pattern for a given id, or `undefined`.
 * @param kmnSource   - Current .kmn source text (scaffolder output or empty string).
 * @returns `{ kmn, warnings }`.
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

  // Merge multiple modifier_as_layer_switch refs into one so that all
  // RAlt assignments share a single store(altgrKeys)/store(altgrOutput) pair.
  // Having multiple refs with the same patternId but different slots would
  // produce duplicate store declarations → KMN compile error.
  const RALT_PATTERN = "modifier_as_layer_switch";
  const raltRefs = [...seen.values()].filter((r) => r.patternId === RALT_PATTERN);
  if (raltRefs.length > 1) {
    for (const r of raltRefs) seen.delete(mechanismKey(r));
    const merged: MechanismRef = {
      ...raltRefs[0]!,
      slotValues: {
        altgrKeyList: raltRefs
          .map((r) => r.slotValues?.["altgrKeyList"] ?? "")
          .filter(Boolean)
          .join(" "),
        altgrOutputList: raltRefs
          .map((r) => r.slotValues?.["altgrOutputList"] ?? "")
          .join(""),
      },
    };
    seen.set(mechanismKey(merged), merged);
  }

  // Merge multiple deadkey_single_tap refs that share the same triggerKey so
  // they produce a single combined store(bases)/store(output) pair. Without this
  // the second ref's stores overwrite the first's via the replace-by-name logic,
  // silently dropping the first character's compose rule.
  const DEADKEY_PATTERN = "deadkey_single_tap";
  const deadkeyRefs = [...seen.values()].filter((r) => r.patternId === DEADKEY_PATTERN);
  if (deadkeyRefs.length > 1) {
    // Group by triggerKey; only groups with >1 ref need merging.
    const byTrigger = new Map<string, typeof deadkeyRefs>();
    for (const r of deadkeyRefs) {
      const k = r.slotValues?.["triggerKey"] ?? "";
      if (!byTrigger.has(k)) byTrigger.set(k, []);
      byTrigger.get(k)!.push(r);
    }
    for (const [, group] of byTrigger) {
      if (group.length <= 1) continue;
      for (const r of group) seen.delete(mechanismKey(r));
      const first = group[0]!;
      const merged: MechanismRef = {
        ...first,
        slotValues: {
          triggerKey:    first.slotValues?.["triggerKey"] ?? "",
          deadkeyName:   first.slotValues?.["deadkeyName"] ?? "",
          baseLetters:   group.map((r) => r.slotValues?.["baseLetters"] ?? "").join(""),
          accentedForms: group.map((r) => r.slotValues?.["accentedForms"] ?? "").join(""),
          // Double-tap emits the first ref's accentChar (consistent with single-char case).
          accentChar: first.slotValues?.["accentChar"] ?? "",
        },
      };
      seen.set(mechanismKey(merged), merged);
    }
  }

  if (seen.size === 0) {
    return { kmn: kmnSource, warnings };
  }

  // Step 2: resolve each unique ref to a substituted fragment.
  const allFragments: ParsedFragment[] = [];

  for (const ref of seen.values()) {
    const pattern = getPattern(ref.patternId);
    if (pattern === undefined) {
      warnings.push(
        `[pattern-apply] unknown patternId "${ref.patternId}" — fragment skipped`
      );
      continue;
    }

    // Handle patterns with an empty or whitespace-only kmnFragment gracefully:
    // nothing to inject, no error.
    if (!pattern.kmnFragment || pattern.kmnFragment.trim() === "") {
      continue;
    }

    const slotValues = ref.slotValues ?? {};
    const { text, unresolved } = substituteSlots(pattern.kmnFragment, slotValues);

    // Validate required slots: a question with required === undefined defaults to true.
    const missingRequired: string[] = [];
    for (const question of pattern.questions) {
      const isRequired = question.required !== false;
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

    const parsed = parseFragment(text);

    // Warn about (and skip) system stores in fragments.
    if (parsed.systemStoreLines.length > 0) {
      warnings.push(
        `[pattern-apply] pattern "${ref.patternId}" contains system store(s) (& prefix): ` +
          parsed.systemStoreLines.map((l) => l.trim()).join(", ") +
          " — system stores are not hoisted; they must live in the .kmn header"
      );
    }

    allFragments.push(parsed);
  }

  if (allFragments.length === 0) {
    return { kmn: kmnSource, warnings };
  }

  // Step 3: parse base .kmn, build existing-line set for idempotency.
  const baseParsed = parseKmn(kmnSource);
  const existingTrimmed = new Set<string>(
    kmnSource.split("\n").map((l) => l.trim())
  );

  // Step 4: hoist new user stores before `begin`.
  for (const frag of allFragments) {
    for (const storeLine of frag.storeLines) {
      const trimmed = storeLine.trim();
      const storeName = storeNameOf(trimmed);
      if (storeName !== null) {
        // If a store with this same name already exists in the header,
        // replace it in-place rather than adding a duplicate.
        const existingIdx = baseParsed.headerLines.findIndex(
          (l) => storeNameOf(l.trim()) === storeName,
        );
        if (existingIdx !== -1) {
          const oldTrimmed = baseParsed.headerLines[existingIdx]!.trim();
          existingTrimmed.delete(oldTrimmed);
          baseParsed.headerLines[existingIdx] = storeLine;
          existingTrimmed.add(trimmed);
          continue;
        }
      }
      if (!isDuplicateLine(trimmed, existingTrimmed)) {
        const beginIdx = baseParsed.headerLines.findIndex((l) =>
          /^\s*begin\s/i.test(l.trim()),
        );
        const insertAt =
          beginIdx === -1 ? baseParsed.headerLines.length : beginIdx;
        baseParsed.headerLines.splice(insertAt, 0, storeLine);
        existingTrimmed.add(trimmed);
      }
    }
  }

  // Step 5: merge group blocks from all fragments into the base.
  for (const frag of allFragments) {
    for (const fragGroup of frag.groups) {
      const baseGroupIdx = baseParsed.groups.findIndex(
        (g) => g.name === fragGroup.name
      );
      if (baseGroupIdx !== -1) {
        // Merge into existing group.
        baseParsed.groups[baseGroupIdx] = mergeGroupBlock(
          baseParsed.groups[baseGroupIdx]!,
          fragGroup,
          existingTrimmed
        );
        // Update existingTrimmed with the newly merged lines.
        for (const line of fragGroup.bodyLines) {
          existingTrimmed.add(line.trim());
        }
      } else {
        // Append the new group block at EOF.
        // Skip the group block if all its body lines are already present
        // (idempotency for whole-group re-injection). The group header itself
        // is NEVER suppressed by the idempotency check; only body lines are.
        baseParsed.groups.push(fragGroup);
        existingTrimmed.add(fragGroup.headerLine.trim());
        for (const line of fragGroup.bodyLines) {
          existingTrimmed.add(line.trim());
        }
      }
    }
  }

  return { kmn: serializeKmn(baseParsed), warnings };
}
