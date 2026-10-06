// see spec.md section 10 — validator service (Layer A + Layer B)
// see spec.md section 9 — 14 compiler checks (9 TS-portable + 5 WASM-only)

import type { KeyboardIR } from "./keyboard-ir.js";
import type { LintFinding } from "./lintFinding";
import { scanDeadkeyRefs, namedDeadkeyRawStoreNames } from "./ir/deadkeys.js";

/**
 * Cross-fragment project state {@link ValidatorService.validateFragment}
 * can use to detect collisions a fragment cannot see in isolation.
 *
 * Spec §10 Layer A checks #2 (duplicate groups) and #3 (duplicate stores)
 * are project-scoped; a fragment that declares `store(graveK)` validates
 * in isolation but conflicts at merge time if the project already has a
 * store of the same name. Pass the project's current declared names here
 * so the fragment validator can flag the collision BEFORE merge.
 *
 * All sets use case-insensitive comparison (the §10 checks are case-
 * insensitive per the upstream `validation.cpp` rules). Implementations
 * should normalize before adding to the sets.
 *
 * @see spec.md §10 Layer A checks #2, #3, #5, #6
 */
export interface FragmentValidationContext {
  /** Store names already declared in the project (case-insensitive). */
  existingStores: ReadonlySet<string>;
  /** Group names already declared in the project (case-insensitive). */
  existingGroups: ReadonlySet<string>;
  /** Deadkey names already declared. Empty set is fine for new projects. */
  existingDeadkeys: ReadonlySet<string>;
}

/**
 * Service contract for the Layer A (validity) and Layer B (style) validator.
 * Packaged as `@keymanapp/kmn-validator`.
 *
 * Layer A runs 9 TS-portable checks per-keystroke and 5 WASM-oracle checks
 * per-compile, all within a single 300 ms debounce cycle (Decision 3, §14).
 * Layer B style rules (AST-based canonical-form checks) share the compile pass.
 *
 * Implementations MUST route the 9 TS-portable checks (identifier validation,
 * duplicate group/store names, deprecated store IDs, deadkey resolution,
 * if()-store resolution, codepoint validation, context statement ordering,
 * index(store,N) offset validity) without invoking the WASM binary. The 5
 * WASM-only checks (CAPS/NCAPS consistency, unreachable rules, platform()
 * parsing, context(N) offset, named code constants) are deferred to the compile
 * microtask. A TS-check error suppresses the WASM call.
 *
 * @see spec.md §10
 * @see spec.md §9
 */
export interface ValidatorService {
  /**
   * Validate a complete KMN source string.
   *
   * Runs all 9 TS-portable Layer A checks immediately, then (if no fatal
   * TS error) schedules the WASM oracle for the 5 deferred checks and the
   * Layer B style pass. WASM diagnostics always supersede conflicting TS
   * diagnostics for the same location.
   *
   * Returns the union of all findings, deduplicated by (code, location).
   *
   * @param kmnSource - Complete `.kmn` source text.
   * @returns Sorted findings: errors first, then warnings, then hints.
   * @see spec.md §10 Layer A / Layer B
   */
  validate(kmnSource: string): Promise<LintFinding[]>;

  /**
   * Validate a KMN fragment after slot substitution.
   *
   * Called immediately after `{{slotId}}` placeholders are filled with user
   * answers, before the fragment is merged into the project `.kmn`. Runs the
   * same Layer A TS-portable checks as `validate()` but scoped to the
   * fragment; WASM oracle runs only when no TS-fatal finding is present.
   *
   * A validation failure here surfaces to the user as a slot-fill error, not
   * a compiler error (Decision 1, §14).
   *
   * @param kmnFragment - KMN rule fragment with all `{{slotId}}` replaced.
   * @param slots - The substitution map (slotId -> resolved value) for
   *   diagnostic context messages; not re-applied here, just carried forward.
   * @param projectContext - Optional cross-fragment project state. When
   *   provided, Layer A checks #2 (duplicate groups) and #3 (duplicate
   *   stores) consult the project's existing names and flag fragment
   *   declarations that would collide at merge time. When omitted, the
   *   fragment is validated in isolation — fine for the first fragment in
   *   a project, but downstream merges may surface late.
   * @returns Findings scoped to the fragment; locations are fragment-relative.
   * @see spec.md §6 placeholder substitution semantics
   * @see spec.md §10
   * @see FragmentValidationContext
   */
  validateFragment(
    kmnFragment: string,
    slots: Record<string, string>,
    projectContext?: FragmentValidationContext
  ): Promise<LintFinding[]>;
}

// ---------------------------------------------------------------------------
// Deadkey lifecycle validation (spec 083, Phase 1; issue #1849)
// ---------------------------------------------------------------------------

/**
 * The studio's own fan-out store naming convention (see the
 * `deadkey-single-tap` pattern: `store(dk_{{deadkeyName}}_bases)`): a store
 * shaped `dk_<hex>_<bases|output>` is a deadkey fan-out store. The hex group
 * is the numeric deadkey id it belongs to.
 */
const DEADKEY_STORE_RE = /^dk_([0-9A-Fa-f]+)_(bases|output)$/;

function hex4(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/**
 * Lifecycle regression guards for spec 083 (User Story 6): after any
 * deadkey define/rename/delete/retarget mutation, the IR must satisfy —
 *
 * (a) **No dangling `dk(id)` references.** Every numeric deadkey id
 *     referenced in a rule context or a store item must be produced by some
 *     rule's output (i.e. have a trigger rule). A reference with no producer
 *     can never resolve at runtime.
 * (b) **No silent duplicate numeric deadkey ids.** More than one rule
 *     minting the same id is a warning, not an error: several triggers
 *     arming one deadkey state is legal KMN (every trigger works). The
 *     warning flags the intent ambiguity — triggers meant to be *different*
 *     deadkeys silently share a state — and the inventory offers an
 *     author-initiated re-mint repair. The studio's own mutations never
 *     produce this (allocate/rename guard ids), so it fires only on
 *     imported or hand-edited keyboards.
 * (c) **No orphaned `dk_*` stores.** A `dk_<hex>_bases` / `dk_<hex>_output`
 *     store whose id no rule references is dead weight left behind by a
 *     half-deleted deadkey — unless an opaque named-deadkey rule claims it
 *     (all-hex name slugs are ambiguous by name alone, so such stores are
 *     treated as live).
 *
 * Pure and read-only: scans the IR, never mutates it (spec §5a).
 * Named/opaque `dk(name)` deadkeys (pre-076 FR-004) carry no numeric id and
 * are out of scope for these numeric checks.
 *
 * Returns one {@link LintFinding} per violation (Layer A, severity error).
 * An empty array means the IR is clean.
 *
 * @see specs/083-deadkey-lifecycle/spec.md (User Story 6)
 * @see specs/083-deadkey-lifecycle/plan.md (Phase 1)
 */
export function validateDeadkeyLifecycle(ir: KeyboardIR): LintFinding[] {
  const findings: LintFinding[] = [];
  const refs = scanDeadkeyRefs(ir);

  const defined = new Set<number>();
  const outputCounts = new Map<number, number>();
  for (const ref of refs) {
    if (ref.position !== "rule-output") continue;
    defined.add(ref.id);
    outputCounts.set(ref.id, (outputCounts.get(ref.id) ?? 0) + 1);
  }

  // (a) Dangling references: referenced (context or store item) but never
  // produced by any rule output.
  const dangling = new Set<number>();
  for (const ref of refs) {
    if (ref.position !== "rule-output" && !defined.has(ref.id)) {
      dangling.add(ref.id);
    }
  }
  for (const id of [...dangling].sort((a, b) => a - b)) {
    const hex = hex4(id);
    findings.push({
      code: "KM_ERROR_DANGLING_DEADKEY_REFERENCE",
      severity: "error",
      layer: "A",
      message:
        `dk(${hex}) is referenced but never produced: no rule outputs ` +
        `dk(${hex}), so the reference can never resolve at runtime.`,
      hint: `Add a trigger rule '+ [KEY] > dk(${hex})' for this id, or remove the dangling reference.`,
    });
  }

  // (b) Duplicate ids: more than one rule minting the same numeric id.
  // Warning, not error: several triggers arming one deadkey state (e.g.
  // plain + SHIFT variants) is legal KMN — every trigger arms the same
  // state and the keyboard compiles and types correctly. The ambiguity is
  // only in intent: if the triggers were meant to be *different* deadkeys,
  // they silently share a state. The inventory surfaces this as an
  // author-initiated repair prompt, never a silent rewrite.
  for (const [id, count] of [...outputCounts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count < 2) continue;
    const hex = hex4(id);
    findings.push({
      code: "KM_WARN_DUPLICATE_DEADKEY_ID",
      severity: "warning",
      layer: "A",
      message:
        `dk(${hex}) is produced by ${count} rules; every trigger arms the same ` +
        `deadkey state, and the inventory lists this as one deadkey. This is ` +
        `legal KMN — but if these were meant to be different deadkeys, they ` +
        `share a state.`,
      hint: `If every trigger should arm the same deadkey, no action is needed. ` +
        `If they were meant to be different deadkeys, re-assign a fresh id to ` +
        `one (spec 083 rename) and give it its own fan-out stores.`,
    });
  }

  // (c) Orphaned fan-out stores: dk_<hex>_{bases,output} with no rule
  // referencing dk(<hex>) in any position. Stores claimed by opaque
  // named-deadkey rules count as live: their referrers never reach the
  // typed rule list, so the numeric-only scan cannot see them (a store
  // shaped dk_<allhex>_* is ambiguous by name alone).
  const referencedByRules = new Set<number>();
  for (const ref of refs) {
    if (ref.position !== "store-item") referencedByRules.add(ref.id);
  }
  const namedLiveStores = namedDeadkeyRawStoreNames(ir);
  for (const store of ir.stores) {
    const m = DEADKEY_STORE_RE.exec(store.name);
    if (!m) continue;
    if (namedLiveStores.has(store.name)) continue;
    const id = parseInt(m[1] ?? "", 16);
    if (referencedByRules.has(id)) continue;
    const hex = hex4(id);
    findings.push({
      code: "KM_ERROR_ORPHANED_DEADKEY_STORE",
      severity: "error",
      layer: "A",
      message:
        `Store '${store.name}' looks like a deadkey fan-out store, but no ` +
        `rule references dk(${hex}); it is orphaned dead weight.`,
      hint: `Delete '${store.name}' (spec 083 delete removes the whole entity), or reattach it to a live deadkey.`,
    });
  }

  return findings;
}
