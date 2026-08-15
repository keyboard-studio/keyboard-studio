// unimplementedInventory — single source of truth for "which inventory
// characters still lack an implementation in this modality", shared by
// MechanismGallery (desktop/physical), TouchGallery (touch), and StepHost's
// Phase F hard-gate context build. Does NOT recompute coverage — it is a thin
// composition over the two canonical selectors that already answer this
// question (spec §7.7 / §10 criterion 18.6):
//   - physical: `uncoveredTargets` (@keyboard-studio/contracts/assignmentMap)
//     over the MechanismAssignment map.
//   - touch: `computeTouchCoverage` (@keyboard-studio/contracts/touch-coverage)
//     over the actual rendered TouchLayoutIR — this is why a `touch_inherited`
//     placeholder mechanism is never miscounted: computeTouchCoverage walks
//     the real derived layout (where an inherited char is already present),
//     it does not consult MechanismRef.patternId at all.
//
// Do not fork this definition — a gallery or step that needs "is character X
// implemented" imports one of the two functions below rather than re-deriving
// coverage locally.

import type {
  MechanismAssignment,
  SurveyPhaseResult,
  TouchKeyRuleIndex,
} from "@keyboard-studio/contracts";
import { uncoveredTargets } from "@keyboard-studio/contracts";
import { parseTouchLayout, touchCoverage } from "@keyboard-studio/engine";

/**
 * Desktop/physical Phase C assignments, pulled out of the working copy's
 * `phaseResults` array — the identical `.find(phase === "C") ?? [] .filter
 * (modality === "physical")` expression that StudioShell, StepHost,
 * PhaseFGate, usePreviewArtifact, and MechanismGallery all need to build
 * `InventoryCoverageInputs.desktopAssignments`.
 *
 * Only for the plain "physical assignments" shape used by the coverage gate.
 * Callers that need an ADDITIONAL filter beyond modality (e.g.
 * deriveDesktopModifications and TouchGallery's `scope === "individual"`
 * placement derivation) do not use this helper — re-derive locally rather
 * than force a mismatched filter through here.
 */
export function selectDesktopAssignments(
  phaseResults: readonly SurveyPhaseResult[],
): MechanismAssignment[] {
  return (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
    (a) => a.modality === "physical",
  );
}

/**
 * Desktop/physical: characters in `lettersToAdd` (the base-diffed inventory —
 * see useInventoryDiff; NOT the raw confirmedInventory, since a character the
 * base keyboard already produces needs no assignment) that resolve to zero
 * mechanisms in the physical modality.
 *
 * `sessionProducedSet` (optional, shaped-bug fix — diacritic-implementability):
 * `lettersToAdd` itself stays STATIC (base-only — see useInventoryDiff.ts's
 * module doc for why the WALK'S denominator must not react to session
 * assignments), so a character that becomes typeable this session ONLY via
 * composability (e.g. a precomposed "ӝ" once a different character's deadkey
 * produces the combining-mark byproduct) would otherwise still be reported
 * uncovered here even though the keyboard being built can already type it.
 * When supplied (`useInventoryDiff`'s session-aware `producedSet`), a
 * `lettersToAdd` entry present in it is excluded from the GATE'S result —
 * this is a completion-GATE relaxation only; it never changes
 * `lettersToAdd`'s own membership or the interactive walk.
 */
export function unimplementedDesktopChars(
  assignments: readonly MechanismAssignment[],
  lettersToAdd: readonly string[],
  sessionProducedSet?: ReadonlySet<string>,
): string[] {
  const uncovered = uncoveredTargets(assignments, lettersToAdd, "physical");
  if (sessionProducedSet === undefined) return uncovered;
  return uncovered.filter((c) => !sessionProducedSet.has(c.normalize("NFC")));
}

/**
 * Result of {@link computeTouchState} — the touch-modality state
 * `inventoryCoverageGate` (and `unimplementedTouchChars`, which is a thin
 * projection of this) need to distinguish the three cases spec §7.7 / §10
 * criterion 18.6 care about for touch: absent, valid, corrupted. See
 * `computeTouchState`'s docstring for what each case means.
 */
interface TouchState {
  readonly uncovered: string[];
  /**
   * True only for the CORRUPTED case (a non-empty `touchLayoutJson` that
   * fails to parse, or that `touchCoverage` cannot walk) — never true for
   * "absent" (null/empty) or "valid".
   */
  readonly corrupted: boolean;
}

/**
 * Touch coverage state for the FULL confirmed `inventory` (touch coverage is
 * evaluated against the actual rendered layout, which may already reach a
 * character via inheritance from the seed layout), distinguishing the three
 * cases the coverage gate must tell apart:
 *
 * 1. **Absent** — `touchLayoutJson` is `null` or `""`: touch has not been
 *    authored this session. `uncovered: []`, `corrupted: false` — "nothing to
 *    gate on", never a false-positive full-covered signal.
 * 2. **Valid** — the JSON parses and `touchCoverage` walks it normally.
 *    `uncovered` is the real uncovered set, `corrupted: false`.
 * 3. **Corrupted** — a non-empty `touchLayoutJson` that fails to parse, or
 *    that `touchCoverage` cannot process. FAILS CLOSED: `uncovered` is the
 *    entire `inventory` (every touch character is treated as unimplemented,
 *    so the gate blocks) and `corrupted: true`, so callers can surface a
 *    distinct "couldn't be read" message rather than the generic
 *    uncovered-count copy. A corrupted persisted layout must never silently
 *    satisfy the hard gate this feature exists to enforce.
 */
function computeTouchState(
  touchLayoutJson: string | null,
  inventory: readonly string[],
  ruleIndex?: TouchKeyRuleIndex,
  desktopProducedSet?: ReadonlySet<string>,
): TouchState {
  if (touchLayoutJson === null || touchLayoutJson === "") {
    return { uncovered: [], corrupted: false };
  }
  try {
    const layout = parseTouchLayout(touchLayoutJson);
    return {
      // Spec 058 FR-005/FR-007: with the rule index, a `T_*` key whose output
      // lives in a `.kmn` rule is credited, so the gate stops blocking on
      // characters the keyboard genuinely types. Absent the index, behaviour is
      // unchanged — including still failing closed on a corrupted layout below,
      // which the index does not and must not soften. `desktopProducedSet`
      // (session-aware, main's shaped-bug fix) is additionally folded in as the
      // composability seed so a touch character made typeable only by this
      // session's desktop deadkey assignment is not misreported as blocking.
      uncovered: [
        ...touchCoverage(
          layout,
          inventory,
          ruleIndex !== undefined ? { ruleIndex } : {},
          desktopProducedSet,
        ).uncovered,
      ],
      corrupted: false,
    };
  } catch {
    return { uncovered: [...inventory], corrupted: true };
  }
}

/**
 * Touch: characters in `inventory` with no reachable touch mechanism — the
 * `uncovered` half of {@link computeTouchState}. See that function's
 * docstring for the absent/valid/corrupted case breakdown; a corrupted
 * layout returns the FULL inventory here (fail closed), not `[]`. Callers
 * that also need to distinguish "genuinely fully covered" from "corrupted,
 * so treated as fully uncovered" should use `inventoryCoverageGate`'s
 * `touchLayoutCorrupted` flag rather than inferring it from this return
 * value alone.
 */
export function unimplementedTouchChars(
  touchLayoutJson: string | null,
  inventory: readonly string[],
  ruleIndex?: TouchKeyRuleIndex,
): string[] {
  return computeTouchState(touchLayoutJson, inventory, ruleIndex).uncovered;
}

/**
 * Inputs to `inventoryCoverageGate` — the store-derived values every call
 * site (StepHost's Phase F context build, PhaseFGate, and the Output
 * download/commit gate) already reads to answer "is every inventory
 * character implemented".
 */
export interface InventoryCoverageInputs {
  readonly desktopAssignments: readonly MechanismAssignment[];
  readonly lettersToAdd: readonly string[];
  readonly touchLayoutJson: string | null;
  readonly confirmedInventory: readonly string[];
  /**
   * From `buildTouchKeyRuleIndex(ir)` (spec 063 FR-007). Optional and additive:
   * absent, the gate behaves exactly as it did before this feature, including
   * failing closed on a corrupted layout. Present, a `T_*` key whose output lives
   * in a `.kmn` rule is credited, so the gate stops blocking on characters the
   * keyboard genuinely types.
   */
  readonly touchRuleIndex?: TouchKeyRuleIndex;
  /**
   * Session-aware desktop produced-glyph set (see `useInventoryDiff`'s
   * `producedSet` / `buildSessionProducedSet`) — folded into BOTH halves of
   * the gate (shaped-bug fix, diacritic-implementability): the desktop check
   * (via `unimplementedDesktopChars`) so a `lettersToAdd` entry composable
   * only via a DIFFERENT character's session assignment doesn't keep nagging
   * once it's genuinely typeable, and the touch composability check (via
   * `computeTouchState`) so a touch character composable only because its
   * combining-mark component was assigned a desktop deadkey THIS session is
   * not misreported as blocking the touch gate either. GATE-ONLY: this never
   * feeds `lettersToAdd`'s own membership or either gallery's interactive
   * walk — see useInventoryDiff.ts's module doc for why those must stay
   * static. Optional so existing callers that have not yet threaded it keep
   * the prior (base-keyboard-only) behavior rather than a type error.
   */
  readonly desktopProducedSet?: ReadonlySet<string>;
}

/**
 * Result of `inventoryCoverageGate` — the uncovered-character lists plus the
 * derived booleans every gate/warning site needs (per-modality blocked flags
 * and the combined `blocked`).
 */
export interface InventoryCoverageGate {
  readonly unimplementedDesktop: string[];
  readonly unimplementedTouch: string[];
  /** Desktop is always in scope — every session engages the physical modality. */
  readonly blockedOnDesktop: boolean;
  /** Touch is only in scope once a touch layout has been authored this session. */
  readonly blockedOnTouch: boolean;
  /**
   * True when the persisted `touchLayoutJson` is non-empty but fails to
   * parse or fails `touchCoverage`'s walk — the FAIL-CLOSED corrupted case
   * (see `computeTouchState`). When true, `unimplementedTouch` is the FULL
   * touch inventory (not a genuinely-computed uncovered set) and
   * `blockedOnTouch`/`blocked` are always true — callers should show a
   * distinct "your touch layout couldn't be read" message rather than the
   * generic uncovered-count copy.
   */
  readonly touchLayoutCorrupted: boolean;
  /** True while ANY modality actually engaged this session still has gaps. */
  readonly blocked: boolean;
}

/**
 * Single source of truth for "is every inventory character implemented,
 * desktop-always / touch-only-if-authored" (spec §7.7 / §10 criterion 18.6).
 *
 * Do not re-derive this boolean pair inline — StepHost's Phase F hard-gate
 * context build, PhaseFGate's display, and OutputScreen's download/commit
 * gate (via usePreviewArtifact) all call this one function so the three
 * never drift from each other.
 */
/**
 * Default cap on how many uncovered characters `formatUncoveredCharsList`
 * lists inline before folding the remainder into a "+N more" suffix. Long
 * inventories (30+ characters is common for e.g. an abugida) would otherwise
 * blow up the Phase F / Output blocked banners into an unreadable wall of
 * glyphs.
 */
export const DEFAULT_UNCOVERED_LIST_LIMIT = 12;

/**
 * Renders an uncovered-character array as a display string, truncating with
 * a "+N more" suffix past `limit` — the single formatting rule PhaseFGate and
 * OutputScreen both use so a long inventory degrades the same way in both
 * places rather than each call site inventing its own cutoff.
 */
export function formatUncoveredCharsList(
  chars: readonly string[],
  limit: number = DEFAULT_UNCOVERED_LIST_LIMIT,
): string {
  if (chars.length <= limit) return chars.join(", ");
  const shown = chars.slice(0, limit).join(", ");
  const remaining = chars.length - limit;
  return `${shown}, +${remaining} more`;
}

export function inventoryCoverageGate(inputs: InventoryCoverageInputs): InventoryCoverageGate {
  const unimplementedDesktop = unimplementedDesktopChars(
    inputs.desktopAssignments,
    inputs.lettersToAdd,
    inputs.desktopProducedSet,
  );
  const touchState = computeTouchState(
    inputs.touchLayoutJson,
    inputs.confirmedInventory,
    inputs.touchRuleIndex,
    inputs.desktopProducedSet,
  );
  const blockedOnDesktop = unimplementedDesktop.length > 0;
  // Corrupted always blocks (fail closed) once a layout was actually
  // authored (touchLayoutJson !== null) — computeTouchState only ever sets
  // `corrupted: true` for a non-empty string, so this can't misfire on the
  // "absent" case.
  const blockedOnTouch =
    inputs.touchLayoutJson !== null && (touchState.corrupted || touchState.uncovered.length > 0);
  return {
    unimplementedDesktop,
    unimplementedTouch: touchState.uncovered,
    touchLayoutCorrupted: touchState.corrupted,
    blockedOnDesktop,
    blockedOnTouch,
    blocked: blockedOnDesktop || blockedOnTouch,
  };
}

/**
 * Display-ready pieces of the "still blocked, go finish these" banner —
 * PhaseFGate and OutputScreen both render the same uncovered-char-list join
 * (with "(desktop)"/"(touch)" suffixes) and the same
 * `blockedOnDesktop`-ternary target-gallery selection off an
 * {@link InventoryCoverageGate}; this is the single place that composes them
 * so the two banners can't drift. Labels are passed in (rather than looked up
 * here) because they are `t({...})`-resolved lingui strings — this module has
 * no i18n dependency of its own.
 *
 * When `gate.touchLayoutCorrupted` is true, `unimplementedTouch` is the FULL
 * touch inventory (fail-closed, not a genuinely-computed uncovered set), so
 * it is deliberately omitted from `uncoveredCharsList` here — callers render
 * a distinct "your touch layout couldn't be read" message instead of the
 * generic count/list for that case (see PhaseFGate.tsx / OutputScreen.tsx).
 * `targetGalleryLabel` always resolves to the touch gallery when corrupted,
 * regardless of `blockedOnDesktop` — re-deriving the touch layout there is
 * the only fix for corruption.
 */
export function formatCoverageBannerParts(
  gate: InventoryCoverageGate,
  labels: { readonly desktopLabel: string; readonly touchLabel: string },
): { readonly uncoveredCharsList: string; readonly targetGalleryLabel: string } {
  const { unimplementedDesktop, unimplementedTouch, blockedOnDesktop, blockedOnTouch, touchLayoutCorrupted } =
    gate;
  const uncoveredCharsList = [
    ...(blockedOnDesktop ? [`${formatUncoveredCharsList(unimplementedDesktop)} (desktop)`] : []),
    ...(blockedOnTouch && !touchLayoutCorrupted
      ? [`${formatUncoveredCharsList(unimplementedTouch)} (touch)`]
      : []),
  ].join("; ");
  const targetGalleryLabel = touchLayoutCorrupted
    ? labels.touchLabel
    : blockedOnDesktop
      ? labels.desktopLabel
      : labels.touchLabel;
  return { uncoveredCharsList, targetGalleryLabel };
}
