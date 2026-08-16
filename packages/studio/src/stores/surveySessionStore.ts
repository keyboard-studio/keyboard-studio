// surveySessionStore — single source of truth for survey wizard traversal state.
//
// Holds the traversal state that moves out of SurveyView: which step is active,
// the walked-history stack for back navigation, and the five value slots set
// across wizard steps. Also holds the characters step's internal substage
// (CharactersSubStage, spec 027 Stage 4) so it survives component remounts.
// Does NOT hold pipeline state (instantiatedForBaseIdRef, oskMode) — those remain
// component-local per spec §4.
//
// Architecture contract:
//   - State lives HERE. SurveyView reads via selectors, writes via actions.
//   - `advance(stepId)` pushes the current activeStepId onto history, then sets
//     the new step. This is the one forward primitive; every forward transition
//     routes through it so history is always the true walked path (D5).
//   - `popHistory()` pops the last entry off history and sets it as activeStepId.
//     No-op when history is empty (back disabled at the first step).
//   - `reset()` clears every slot to initial (start-over).
//   - `hydrate(snapshot)` bulk-sets every value slot from a serialized draft.
//     This store holds no persistence logic of its own; the draft layer
//     (lib/draftAutosave.ts) reads the slots and calls hydrate() to restore them.
//   - Plain setters for the five value slots.
//   - No host-disk writes. No persistence OF ITS OWN — this store never calls
//     localStorage/sessionStorage directly. Spec 034 US3 adds a serialize/
//     restore SEAM (`TraversalSnapshot`, `snapshotTraversal`,
//     `applyTraversalSnapshot` below) that the durable-draft module
//     (../lib/draftPersistence.ts) drives; the localStorage draft layer
//     (../lib/draftAutosave.ts) likewise drives the `SurveySessionSnapshot`/
//     `hydrate()` seam. The actual read/write of storage lives entirely in
//     those modules, not here.
//   - Worker boundary upheld: WASM is not imported here.
//   - All survey/hooks imports are type-only (depcruise / bundle hygiene, D-R2).

import { create } from "zustand";
import type { BaseKeyboard, SurveyPhaseResult } from "@keyboard-studio/contracts";
// Imported directly from TYPE-ONLY LEAF modules (identityLiteResult.ts /
// types.ts), NOT from the survey/index.ts barrel — that barrel re-exports
// PhaseB.tsx at runtime, and PhaseB.tsx now imports this store at runtime too
// (the Phase B character-map pane work), so a type-only import from the barrel
// here would close a runtime dependency cycle (depcruise no-circular). See
// survey/types.ts's Track docstring for the full story.
//
// `identityLiteResult.ts` rather than `IdentityLite.tsx`: SurveyRunner now reads
// `activeStepId` from this store (to know which step's walk it publishes — see
// lib/stepWalk.ts), and IdentityLite.tsx renders SurveyRunner, so importing the
// component module here would close the loop even for a type. That extracted
// leaf has no runtime dependencies at all.
import type { IdentityLiteResult } from "../survey/identityLiteResult.ts";
import type { SurveyContext, Track } from "../survey/types.ts";
import type { ScaffoldSpec } from "../hooks/useKeyboardArtifact.ts";
// Runtime import of the sibling store (one-directional: workingCopyStore.ts
// does NOT import this module, so this does not create a circular dependency
// per depcruise's no-circular rule). Used only inside setTouchSeedSource to
// clear the stale touchDraft when the seed source actually changes (spec 035
// R12) — the getState() escape-hatch idiom already used elsewhere in this
// file (see the trailing comment) for cross-store reads/writes.
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { pushBreadcrumb } from "../crash/breadcrumbs.ts";

// ---------------------------------------------------------------------------
// CharactersSubStage — internal substage for the characters manifest step.
//
// Relocated from StudioShell.tsx (spec 027 Stage 4). Persisted in the store so
// back-from-carve re-enters CharactersStep at PhaseB rather than replaying
// prefill (the substage survives the component remount caused by a history pop).
// ---------------------------------------------------------------------------

export type CharactersSubStage = "prefill" | "B";

// ---------------------------------------------------------------------------
// TouchSeedSource — the author's choice at the touch_seed_source fork
// (spec 035 FR-006 / contracts/seed-source-fork.md): Import & adapt the
// base's shipped touch layout, vs reseed a fresh phone projection from the
// desktop work. Null means no choice has been recorded yet (fork memory, R12).
// ---------------------------------------------------------------------------

export type TouchSeedSource = "import-adapt" | "reseed-from-desktop";

// ---------------------------------------------------------------------------
// DiscoveryMethod — the Phase B character-discovery method the author picked
// at the IntroChooser (build-list "add your whole alphabet" vs manual
// step-by-step). Lifted out of PhaseB.tsx local state (spec character-map
// pane work) so SurveyView can gate the right-pane character map on it — the
// map only ever shows for the build-list path; the manual path and the
// not-yet-chosen state keep the live OSK preview. Null means no method chosen
// yet (still on the IntroChooser).
// ---------------------------------------------------------------------------

export type DiscoveryMethod = "manual" | "build-list";

// ---------------------------------------------------------------------------
// ActiveStepId — the set of manifest step ids the runtime advances through,
// plus terminal states "done" and "unsupported" not present in the manifest.
//
// Copied verbatim from StudioShell.tsx:237 (pre-migration). This module now
// owns the traversal vocabulary (research D-R1).
// ---------------------------------------------------------------------------

export type ActiveStepId =
  | "identity"
  | "choose_base"
  | "track"
  | "project_name"
  | "characters"
  | "carve"
  | "marks"
  | "punctuation"
  | "convenience"
  | "mechanisms"
  | "touch_seed_source"
  | "touch"
  | "help"
  | "done"
  | "unsupported";

// ---------------------------------------------------------------------------
// sanitizeHistory — defensive repair for a `history` stack that violates the
// "forward-only hard gate" invariant (P0 follow-up).
//
// Why this exists: `history` is normally only ever mutated by advance()/
// popHistory()/backToTouchSeedSource()/backToUnfinishedGallery(), none of
// which can themselves produce an invalid stack. But `applyTraversalSnapshot`
// (../lib/draftPersistence.ts's loadDraft) patches `history` directly from
// whatever was serialized to localStorage by a PRIOR page load — including
// one running an older build. The P0 regression this guards: a build that
// (bug, now fixed — see backToUnfinishedGallery's docstring above) pushed a
// stale "help" entry onto `history` via the forward-push `advance()`
// primitive persisted that stale entry to localStorage; shipping the fix to
// the store does not repair already-persisted state, so a returning
// author's draft still carries the bad entry and Back-from-mechanisms still
// resurfaces "help" indefinitely.
//
// The invariant this enforces is narrower than "every history entry must be
// strictly earlier than activeStepId in spine order" — that broader rule is
// UNSOUND here: `backToUnfinishedGallery`'s desktop-first "jump past the
// immediate predecessor" behaviour (see its docstring) deliberately leaves
// `history` holding entries at/after the CURRENT `activeStepId`'s canonical
// spine position (e.g. routing help -> "mechanisms" while "touch_seed_source"
// — which sits AFTER "mechanisms" on the spine — remains on the stack, so the
// next ordinary Back reaches it). A generic order-comparison sanitizer would
// wrongly strip that legitimate, intentionally-reordered entry.
//
// Instead this targets exactly the actual corruption class: FORWARD_ONLY_GATE
// lists steps that are hard gates with no ordinary "Back" origin of their own
// — a step in this table may ONLY legitimately sit in `history` when
// `activeStepId` equals the one step it is known to advance into. Today the
// only such step is "help" (the Phase F hard gate — see PhaseFGate.tsx's
// module comment: no "come back later" escape, and advance()'s "help" case
// only ever pushes "help" onto history when moving on to "done"). Any other
// appearance of "help" in `history` is provably stale and dropped.
// ---------------------------------------------------------------------------

const FORWARD_ONLY_GATE_NEXT: Partial<Record<ActiveStepId, ActiveStepId>> = {
  help: "done",
};

/**
 * Drop any `history` entry that is a forward-only-gate step (FORWARD_ONLY_GATE_NEXT)
 * whose legitimate successor does not match the current `activeStepId` —
 * i.e. a stale "help" entry left behind while the author is anywhere other
 * than "done". Preserves the relative order of the entries that remain.
 */
function sanitizeHistory(
  activeStepId: ActiveStepId,
  history: readonly ActiveStepId[],
): readonly ActiveStepId[] {
  const sanitized = history.filter((id) => {
    const legitimateNext = FORWARD_ONLY_GATE_NEXT[id];
    return legitimateNext === undefined || legitimateNext === activeStepId;
  });
  // Fast path: identical length means nothing was dropped — return the
  // original reference so callers that compare-by-reference (none currently
  // do, but this keeps the common case allocation-free) aren't penalized.
  return sanitized.length === history.length ? history : sanitized;
}

/**
 * Defensive re-derivation of a Back target from a (possibly corrupted)
 * `history` stack: sanitizes (see sanitizeHistory above) before taking the
 * new top as the landing step. Used by every back-primitive below so the
 * "never land on a stale forward-only-gate step" invariant holds even if
 * `history` was never sanitized on load (belt-and-suspenders alongside
 * applyTraversalSnapshot's sanitize).
 *
 * Returns null when no valid predecessor remains (mirrors the empty-history
 * no-op case).
 */
function popValidHistoryEntry(
  activeStepId: ActiveStepId,
  history: readonly ActiveStepId[],
): { prev: ActiveStepId; rest: readonly ActiveStepId[] } | null {
  const sanitized = sanitizeHistory(activeStepId, history);
  if (sanitized.length === 0) return null;
  // Non-null: length guard above proves this index exists.
  const prev = sanitized[sanitized.length - 1]!;
  return { prev, rest: sanitized.slice(0, -1) };
}

/**
 * Record a visit, preserving first-visit order and returning the SAME array
 * when nothing changed — so a re-visit does not notify every subscriber of the
 * traversal store with an identical value.
 *
 * See `SurveySessionState.visited` for what this slot is and why it never
 * shrinks.
 */
function withVisited(
  visited: readonly ActiveStepId[],
  ...steps: readonly ActiveStepId[]
): readonly ActiveStepId[] {
  const fresh = steps.filter((s, i) => !visited.includes(s) && steps.indexOf(s) === i);
  return fresh.length === 0 ? visited : [...visited, ...fresh];
}

/**
 * The `visited` array for a restored snapshot, tolerating one written before
 * the slot existed (see `hydrate`). Typed against the snapshot rather than the
 * slot because the whole point is that the field may be absent at runtime while
 * the type says otherwise.
 */
function normalizeVisited(snapshot: SurveySessionData): readonly ActiveStepId[] {
  const stored: unknown = snapshot.visited;
  if (Array.isArray(stored) && stored.length > 0) return [...(stored as ActiveStepId[])];
  return withVisited([], ...snapshot.history, snapshot.activeStepId);
}

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface SurveySessionState {
  // --- traversal slots ---

  /** Current manifest step id, incl. terminals "done" / "unsupported". */
  activeStepId: ActiveStepId;

  /**
   * Every step the author has ever stood on, in first-visit order — the walk's
   * HIGH-WATER MARK, as distinct from `history`'s "how do I get back from
   * here" stack.
   *
   * WHY THIS EXISTS (defect, 2026-08-05: "I jumped back and now I can't jump
   * forward again"). `history` is a back-stack: every backward primitive
   * TRUNCATES it, `jumpToStep` most aggressively of all — landing on "identity"
   * from "touch" leaves it empty. Reachability was asking `history` "has the
   * author been here", so the moment they jumped back, every stage they had
   * already finished became indistinguishable from one they had never seen, and
   * `resolveLocation` refused it as `beyond-gate`. The row still SHOWED those
   * stages (their completed dots come from the decision record, which a jump
   * does not touch — FR-063), so the author was looking at their own finished
   * work and being told it was ahead of them. The only way forward was to
   * re-walk every step by hand.
   *
   * MONOTONIC. Nothing removes an entry; only `reset()` clears the slot. That
   * is precisely what makes it safe to gate on: a step is in here only because
   * the author genuinely reached it, so honouring a jump to one can never skip
   * a lock — the lock already fired on the way in. A step they have never
   * reached is still absent, still `beyond-gate`, still refused.
   *
   * Deduplicated: a revisited step keeps its FIRST position, so the array reads
   * as the author's route through the manifest and `indexOf` is a stable
   * "how far had I got when I first saw this".
   */
  visited: readonly ActiveStepId[];

  /**
   * Walked-step stack — the back-nav source of truth (D5).
   * Push on advance, pop on popHistory. Never contains intra-step sub-stages
   * (charactersSub stays component-local).
   */
  history: readonly ActiveStepId[];

  /**
   * Direction of the last traversal move: "advance" (forward) or "pop"
   * (back-navigation). Lets a computed-gate step (spec 071 "marks": S0 skips
   * the whole series when the alphabet has no marks) stay TRANSPARENT in both
   * directions — on a forward entry the skip advances onward, on a back-pop
   * entry it keeps popping backward instead of bouncing the user forward.
   */
  lastNavigation: "advance" | "pop";

  /**
   * spec 071 R10 (recorded consequence, not acted on): the designer picked the
   * base-plus-mark output form while adapting a base whose own content uses
   * ready-made forms — the base's existing content needs a follow-on
   * conversion. This flag only RECORDS that the need exists; building the
   * conversion is out of scope for spec 071.
   *
   * Unrelated to the `markedForLaterDesktop` / `markedForLaterTouch` fields
   * below despite the shared "mark" vocabulary — those are the
   * mechanism-gallery-progression "mark a character for later review" state,
   * a per-character author choice, not a Unicode normalization-form
   * migration flag.
   */
  marksMigrationNeeded: boolean;

  /** Identity-lite output from the identity step. Null until the step completes. */
  identityResult: IdentityLiteResult | null;

  /**
   * Raw phase result of the completed identity-lite flow (the answers that
   * produced identityResult). Persisted so a history pop back onto the identity
   * step resumes the flow at its last question with answers restored, rather
   * than replaying from question 1. Null until the identity step completes.
   */
  identityPhaseResult: SurveyPhaseResult | null;

  /**
   * Derived from identityResult via contextFromIdentity. Stored (not re-derived)
   * to match today's useState semantics. Empty object until identity completes.
   */
  surveyContext: SurveyContext;

  /** "copy" | "adapt" chosen at the track step. Null until that step completes. */
  selectedTrack: Track | null;

  /**
   * Track-1 project metadata set at the project_name step.
   * Null for Track 2 (adapt uses the base's existing id/name).
   */
  scaffoldSpec: ScaffoldSpec | null;

  /**
   * Local base selection that drives the compile pipeline immediately on pick.
   * Separate from workingCopyStore.baseKeyboard — set as soon as BaseResolution
   * resolves, before the compile cycle completes. Null until first base selection.
   */
  localBase: BaseKeyboard | null;

  /**
   * Preview-before-commit gate for the "Choose a starting keyboard" step.
   * `localBase` now drives a LIVE PREVIEW as soon as the author clicks a
   * search result or suggestion card, without instantiating the working
   * copy or advancing the wizard (so several bases can be tried). This flag
   * is set true only when the author clicks the explicit "Choose this
   * keyboard" commit button; StudioShell's single-instantiation effect
   * gates the real `doCommit` call on it. False means "previewing, not yet
   * committed". Cleared to false by reset() and by every subsequent preview
   * click (a new preview always re-arms the gate). Persisting `true` in a
   * restored draft is intentional — a draft that already passed choose_base
   * must re-instantiate on restore exactly as it does today.
   */
  baseConfirmed: boolean;

  /**
   * Internal substage for the characters manifest step (spec 027 Stage 4).
   * Persisted here (not in CharactersStep component state) so back-from-carve
   * re-enters at PhaseB after the component remounts. Initial value "prefill".
   * Cleared to "prefill" by reset().
   */
  charactersSubStage: CharactersSubStage;

  /**
   * The author's choice at the touch_seed_source fork (spec 035 FR-006).
   * Null means no choice recorded yet — advance() routes into the chooser
   * step whenever this is null (fork memory, R12). Cleared back to null on a
   * genuine base re-instantiation (see reducer.ts CHOOSE_BASE_STEP_ID case,
   * which injects setTouchSeedSource as a ReducerDep so workingCopyStore does
   * not need to import this store — avoids a circular dependency since
   * setTouchSeedSource itself reaches into workingCopyStore to clear touchDraft).
   */
  touchSeedSource: TouchSeedSource | null;

  /**
   * The author's choice at the Phase B IntroChooser (spec character-map pane
   * work). Null while the chooser hasn't been answered yet. Cleared to null
   * by reset(). NOT cleared by charactersSubStage transitions — going back
   * from PhaseB's build-list view to its own IntroChooser re-shows the
   * chooser without losing the manifest-level "characters" substage.
   */
  discoveryMethod: DiscoveryMethod | null;

  // --- actions ---

  /**
   * Forward transition primitive. Pushes the current activeStepId onto history,
   * then sets activeStepId to stepId. Every forward transition routes through
   * this so history is always the true walked path.
   */
  advance: (stepId: ActiveStepId) => void;

  /** Record the spec 071 R10 migration-need consequence (see marksMigrationNeeded). */
  setMarksMigrationNeeded: (needed: boolean) => void;

  /**
   * Generic back. Pops the last entry off history and sets it as activeStepId.
   * No-op when history is empty (guards the identity/first step).
   */
  popHistory: () => void;

  /**
   * Land directly on a step the author has ALREADY walked (spec 057 FR-045).
   *
   * The many-step counterpart of `popHistory`: instead of consuming one entry
   * it consumes every entry after the target, so `history` still describes the
   * true walked path from the landing point. `lastNavigation` is `"pop"`,
   * which is what keeps the browser-history bridge from pushing an entry for a
   * move the browser did not make.
   *
   * DELIBERATELY BACKWARD-ONLY. A target that is neither the current step nor
   * present in `history` is a no-op, so this action can never skip a lock or a
   * gate the walk enforces — forward jumps are refused upstream by
   * `resolveLocation`'s `beyond-gate`, and this is the second line of that
   * same rule rather than a place it could be bypassed.
   *
   * FR-063: this truncates `history`, not progress. The footer's completed
   * dots come from the decision record, so jumping back leaves every dot
   * ahead of the landing point exactly where it was.
   */
  jumpToStep: (target: ActiveStepId) => void;

  /**
   * Special-case back-navigation for the touch step's "Back from the very
   * first character" affordance (spec 035 R12 re-entry path). The generic
   * `popHistory` follows the walked-history stack, which lands on
   * "mechanisms" whenever the seed-source fork was SKIPPED this pass (a
   * recorded, non-stale `touchSeedSource` routes advance() straight from
   * "mechanisms" to "touch" — R12 fork memory) — that would make the choice
   * unreachable after the first pass (violates US2-AS4). This action always
   * resurfaces the "touch_seed_source" chooser instead:
   *
   *   - If "touch_seed_source" is already the top of history (the fork was
   *     NOT skipped this pass — normal forward path pushed it), this behaves
   *     exactly like popHistory: consumes that entry so the chooser's own
   *     Back still reaches "mechanisms" next.
   *   - Otherwise (fork was skipped — history still ends in "mechanisms" from
   *     the direct mechanisms -> touch hop), this sets activeStepId WITHOUT
   *     touching history, so "mechanisms" stays on top for the chooser's own
   *     Back to land on.
   *
   * Either way, the chooser's own onBack (generic popHistory) always reaches
   * "mechanisms" next — this action never disturbs that invariant.
   */
  backToTouchSeedSource: () => void;

  /**
   * "Go finish the unfinished gallery" action — shared by PhaseFGate.tsx's
   * hard-gate ConfirmDialog ("Go back and finish", offered when
   * `inventoryCoverageGate` is still blocked on "help") and OutputScreen.tsx's
   * coverage-blocked banner ("Go finish them now", reachable from #output
   * directly, bypassing "help" entirely). Both need to route the author to
   * whichever gallery still has gaps — desktop ("mechanisms") first if it is
   * incomplete, else "touch" — and BOTH are conceptually a BACK action, not a
   * forward one, even though the target may not be the immediate predecessor
   * in `history` (desktop-first priority can route past "touch" straight to
   * "mechanisms" — see each caller's blockedOnDesktop-first ordering).
   *
   * Regression this guards (P0): the previous PhaseFGate implementation
   * called the forward-push `advance()` primitive to perform this "route
   * back to the relevant gallery" jump. `advance()` PUSHES the current
   * activeStepId (typically "help") onto history before switching —
   * appropriate for a genuine forward step, but wrong here, since this
   * action is conceptually a Back. That extra push left a stale "help" entry
   * sitting on top of the walked stack; the NEXT ordinary Back traversal
   * from the target gallery (a plain `popHistory()`, or
   * `backToTouchSeedSource()`'s own history-consuming branch) would then pop
   * that stale entry and silently land the author back on the blocked
   * "help" step — "Back" appearing to route to Phase F instead of the
   * previous step, indefinitely, since the gate stays blocked.
   *
   * The fix: behave exactly like `popHistory` (pop the one entry that was
   * pushed to reach the current screen) but set `activeStepId` to the
   * caller-supplied `target` rather than trusting whatever was popped. This
   * keeps `history` exactly as balanced as it was before, so it never
   * resurfaces later. No-op-safe when history is empty (mirrors
   * `popHistory`'s empty-history guard) — still honors the caller's target.
   */
  backToUnfinishedGallery: (target: "mechanisms" | "touch") => void;

  /**
   * "Change the base keyboard" action (spec 058) — OutputScreen's escape hatch
   * once a working copy exists. Routes the author back to the `choose_base`
   * step instead of re-basing in place from the ship-it screen.
   *
   * Why this action rather than a plain `advance("choose_base")`: like the two
   * back-primitives above this is conceptually a BACK, and a forward push
   * would leave every step between `choose_base` and wherever the author was
   * sitting on the stack — a later ordinary Back would then walk forward
   * through the survey it just left. `choose_base` is also not the immediate
   * predecessor, so `popHistory` cannot express it: this rewinds to the prefix
   * of `history` that was walked BEFORE `choose_base` (typically just
   * "identity"), so Back from the picker lands where it did the first time
   * through and nothing at-or-after the picker survives. Sanitizes first, for
   * the same persisted-stale-"help" reason as the primitives above.
   *
   * Also clears `baseConfirmed`. That flag arms StudioShell's
   * single-instantiation effect (see StudioShell.tsx — the effect commits as
   * soon as a compile settles for the confirmed base). Landing on the picker
   * with it still true would let the very next pipeline settle instantiate
   * WITHOUT the author clicking "Choose this keyboard" — re-basing, and
   * discarding edits, on the strength of a stale confirmation from the base
   * they are trying to move away from. BaseResolutionAdapter's onPreview also
   * clears it, but that only fires if the author previews first, which is not
   * guaranteed to happen before the effect runs.
   *
   * Falls back to an empty `history` when `choose_base` is absent from the
   * stack (a hydrated draft that never walked it): empty is Back-safe
   * (popHistory guards it) and can never resurface a stale forward entry.
   */
  backToChooseBase: () => void;

  /** Reset every slot to initial (start-over). Includes clearing history. */
  reset: () => void;

  /**
   * Bulk-restore every value slot from a serialized draft (lib/draftAutosave.ts).
   * Used to resume an in-progress survey after a page reload. Does not touch the
   * action functions; only the data slots enumerated in SurveySessionSnapshot.
   */
  hydrate: (snapshot: SurveySessionSnapshot) => void;

  /** Plain setter — identity-lite output. */
  setIdentityResult: (r: IdentityLiteResult | null) => void;

  /** Plain setter — raw identity-lite phase result (history-pop resume). */
  setIdentityPhaseResult: (r: SurveyPhaseResult | null) => void;

  /** Plain setter — survey context derived from identity. */
  setSurveyContext: (c: SurveyContext) => void;

  /** Plain setter — chosen track. */
  setSelectedTrack: (t: Track | null) => void;

  /** Plain setter — Track-1 scaffold spec. */
  setScaffoldSpec: (s: ScaffoldSpec | null) => void;

  /** Plain setter — local base driving the compile pipeline. */
  setLocalBase: (b: BaseKeyboard | null) => void;

  /** Plain setter — the choose_base preview-before-commit gate. */
  setBaseConfirmed: (v: boolean) => void;

  /** Plain setter — characters step internal substage (spec 027 Stage 4). */
  setCharactersSubStage: (s: CharactersSubStage) => void;

  /**
   * Setter — the touch_seed_source fork choice (spec 035 R12).
   * Setting a value DIFFERENT from the current one clears the working-copy
   * `touchDraft` (its `charTouch` entries reference host keys of the other
   * seed and would half-apply — see workingCopyStore.touchDraft docstring).
   * A no-op re-set of the same value does not clear the draft.
   */
  setTouchSeedSource: (s: TouchSeedSource | null) => void;

  /** Plain setter — the Phase B IntroChooser discovery-method choice. */
  setDiscoveryMethod: (m: DiscoveryMethod | null) => void;

  /**
   * Characters the author has explicitly "marked for later review" in the
   * desktop/physical Mechanism Gallery (spec: mechanism-gallery-progression).
   * AUTHORING METADATA ONLY — this is never read by the codec/scaffolder/
   * output paths and never reaches the working copy's KeyboardIR or the
   * emitted `.kmn`; it exists purely so the gallery's Done affordance and the
   * NavBar "still to account for" indicator can distinguish "consciously
   * deferred" from "never looked at". Lives HERE (not workingCopyStore, not a
   * new module-scoped Set) because:
   *   (a) it is per-authoring-session traversal state, not keyboard content —
   *       the same category as activeStepId/history/touchSeedSource above,
   *       never the working copy's own data;
   *   (b) this store already has a serialize/restore seam
   *       (snapshotTraversal/applyTraversalSnapshot, driven by
   *       ../lib/draftPersistence.ts on its EXISTING autosave timer) — adding
   *       a field here rides that timer rather than inventing a new one (D3
   *       does not apply: this produces no diagnostics, see draftPersistence's
   *       AUTOSAVE_DEBOUNCE_MS docstring);
   *   (c) a plain JSON-safe `readonly string[]` (not a Set — this store's
   *       fields must all be plain-JSON per TraversalSnapshot's own docstring)
   *       so it round-trips through `JSON.stringify`/`JSON.parse` exactly like
   *       every other slot here.
   * Kept SEPARATE from `markedForLaterTouch` below (not one combined set):
   * a character can be implemented on one surface and only deferred on the
   * other (e.g. a desktop deadkey exists but the touch longpress placement is
   * still undecided) — collapsing the two would falsely "unmark" one surface
   * whenever the other surface's mark changed.
   */
  markedForLaterDesktop: readonly string[];

  /** Touch-gallery counterpart of {@link markedForLaterDesktop}. Same rules. */
  markedForLaterTouch: readonly string[];

  /**
   * Toggle `char` in `markedForLaterDesktop` (add if absent, remove if
   * present). Pure UI state — never touches the working copy.
   */
  toggleMarkedForLaterDesktop: (char: string) => void;

  /** Touch-gallery counterpart of {@link toggleMarkedForLaterDesktop}. */
  toggleMarkedForLaterTouch: (char: string) => void;
}

// ---------------------------------------------------------------------------
// Data-field type (T017, spec 034 US3) — the non-action slots of
// SurveySessionState, compiler-enforced via Omit exactly like
// WorkingCopySnapshot/WorkingCopyData in persistWorkingCopy.ts /
// workingCopyStore.ts. A new non-action field added to SurveySessionState
// fails to compile here (both in `INITIAL_STATE`'s `satisfies` below and in
// `snapshotTraversal`'s return-typed object literal) until it is accounted
// for — no silent omission from the durable draft.
//
// DEVIATION 1 (spec 034 US3 task brief): the data-model.md TraversalSnapshot
// field list predates spec 035, which added `touchSeedSource` to this store.
// It is included here — a reload mid-touch that lost the seed-source fork
// choice would silently re-ask a question the author already answered, or
// worse, mis-resolve the R11/R12 default. `TraversalSnapshot` is exactly this
// data-field type; see `snapshotTraversal`/`applyTraversalSnapshot` below.
// ---------------------------------------------------------------------------

type SurveySessionData = Omit<
  SurveySessionState,
  | "advance" | "popHistory" | "jumpToStep" | "backToTouchSeedSource"
  | "backToUnfinishedGallery" | "backToChooseBase" | "reset" | "hydrate"
  | "setIdentityResult" | "setIdentityPhaseResult" | "setSurveyContext"
  | "setSelectedTrack" | "setScaffoldSpec" | "setLocalBase" | "setCharactersSubStage"
  | "setTouchSeedSource" | "setBaseConfirmed" | "setDiscoveryMethod"
  | "setMarksMigrationNeeded" | "toggleMarkedForLaterDesktop" | "toggleMarkedForLaterTouch"
>;

/**
 * Serializable snapshot of the traversal state — "where am I in the walk"
 * (data-model.md TraversalSnapshot, spec 034 US3). All fields are plain
 * JSON-safe values already (no Set/binary, unlike WorkingCopySnapshot), so no
 * encoding is needed beyond `JSON.stringify`/`JSON.parse`.
 *
 * Consumed by ../lib/draftPersistence.ts as the `traversal` envelope field.
 */
export type TraversalSnapshot = SurveySessionData;

/**
 * Alias kept for the localStorage draft layer (lib/draftAutosave.ts), which
 * serializes these slots and restores them via `hydrate()` on resume — the
 * same data-field shape as `TraversalSnapshot`.
 */
export type SurveySessionSnapshot = SurveySessionData;

// ---------------------------------------------------------------------------
// Initial state (extracted so reset() and the initializer share one source)
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  activeStepId: "identity" as ActiveStepId,
  history: [] as readonly ActiveStepId[],
  // The author is standing on "identity" from the first render, so it is
  // already visited — seeding it empty would make the entry step the one place
  // a jump could be refused for lack of a visit that has plainly happened.
  visited: ["identity"] as readonly ActiveStepId[],
  lastNavigation: "advance" as const,
  marksMigrationNeeded: false,
  identityResult: null,
  identityPhaseResult: null,
  surveyContext: {} as SurveyContext,
  selectedTrack: null,
  scaffoldSpec: null,
  localBase: null,
  baseConfirmed: false,
  charactersSubStage: "prefill" as CharactersSubStage,
  touchSeedSource: null as TouchSeedSource | null,
  discoveryMethod: null as DiscoveryMethod | null,
  markedForLaterDesktop: [] as readonly string[],
  markedForLaterTouch: [] as readonly string[],
} as const satisfies SurveySessionData;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSurveySessionStore = create<SurveySessionState>((set) => ({
  ...INITIAL_STATE,

  advance: (stepId) =>
    set((s) => {
      // Crash breadcrumb (spec 060 FR-045). Step completions are the coarsest
      // useful "where was the author" signal, and distinct from the decision
      // log: this records navigation, that records authoring decisions.
      pushBreadcrumb("step", stepId);
      return {
        history: [...s.history, s.activeStepId],
        activeStepId: stepId,
        // Both ends: the step being left is provably visited, and on the very
        // first advance out of a hydrated-but-unseeded draft it may be the only
        // evidence of that.
        visited: withVisited(s.visited, s.activeStepId, stepId),
        lastNavigation: "advance" as const,
      };
    }),

  popHistory: () =>
    set((s) => {
      // Defensive: re-derive the landing step from a SANITIZED view of
      // `history` (see popValidHistoryEntry above) rather than trusting the
      // raw top entry — self-heals a corrupted/persisted-stale stack instead
      // of ever landing on a step at-or-ahead-of the current one.
      const popped = popValidHistoryEntry(s.activeStepId, s.history);
      if (popped === null) return s;
      return {
        activeStepId: popped.prev,
        history: popped.rest,
        lastNavigation: "pop" as const,
      };
    }),

  jumpToStep: (target) =>
    set((s) => {
      if (s.activeStepId === target) return s;
      // Sanitize first, for the same reason every other back primitive does:
      // `history` may have been patched straight from a draft written by an
      // older build (see applyTraversalSnapshot).
      const sanitized = sanitizeHistory(s.activeStepId, s.history);
      // The LAST occurrence, so a revisited step lands on the most recent
      // visit rather than an older one further down the stack.
      const index = sanitized.lastIndexOf(target);
      if (index !== -1) {
        return {
          activeStepId: target,
          history: sanitized.slice(0, index),
          visited: withVisited(s.visited, s.activeStepId, target),
          lastNavigation: "pop" as const,
        };
      }

      // Not on the back-stack — but the author may still have BEEN there and
      // jumped behind it, which is exactly the case `history` alone cannot
      // distinguish from "never reached" (see `visited`'s docstring: this is
      // the defect where a back-jump stranded the author with no way forward).
      //
      // The bound is `visited`, never the manifest: a step the author has not
      // reached stays a no-op here, so this is still the second line of
      // `resolveLocation`'s gate rather than a hole in it.
      const visitedIndex = s.visited.indexOf(target);
      if (visitedIndex === -1) return s;

      // Rebuild the back-stack from the route the author actually took, up to
      // the target. `visited` is first-visit order and deduplicated, so this
      // is the walked path — and it keeps Back working after a forward jump
      // instead of stranding them a second time with an empty stack.
      const rebuilt = s.visited.slice(0, visitedIndex);
      return {
        activeStepId: target,
        history: sanitizeHistory(target, rebuilt),
        visited: withVisited(s.visited, s.activeStepId),
        // A forward jump is still not a browser-history push: the hash change
        // it rides on is the router's, exactly as the backward case is.
        lastNavigation: "pop" as const,
      };
    }),

  backToTouchSeedSource: () =>
    set((s) => {
      const sanitized = sanitizeHistory(s.activeStepId, s.history);
      const top = sanitized[sanitized.length - 1];
      if (top === "touch_seed_source") {
        return {
          activeStepId: "touch_seed_source",
          history: sanitized.slice(0, -1),
          lastNavigation: "pop" as const,
        };
      }
      // Fork was skipped this pass — jump without consuming history so
      // "mechanisms" (or whatever is actually on top) stays there for the
      // chooser's own Back. Commit the sanitized stack (a no-op unless it was
      // corrupted) rather than the raw one, so a later Back doesn't re-trip
      // over the same invalid entries.
      return {
        activeStepId: "touch_seed_source",
        history: sanitized,
        lastNavigation: "pop" as const,
      };
    }),

  // See the interface docstring above for the P0 regression this fixes:
  // behaves like popHistory (consumes the one entry "help" pushed — always
  // "touch") but sets activeStepId to the caller's target rather than
  // whatever was actually on top, so a gate that needs to route past "touch"
  // to "mechanisms" doesn't leave a stale entry for a later Back to resurface.
  backToUnfinishedGallery: (target) =>
    set((s) => {
      // Sanitize first (defensive, matches popHistory/backToTouchSeedSource) —
      // this action is called with activeStepId === "help", so any entry at
      // or after "help" in a corrupted stack is dropped before the top is
      // consumed, never carried forward.
      const sanitized = sanitizeHistory(s.activeStepId, s.history);
      if (sanitized.length === 0) {
        return { activeStepId: target, history: sanitized, lastNavigation: "pop" as const };
      }
      return {
        activeStepId: target,
        history: sanitized.slice(0, -1),
        lastNavigation: "pop" as const,
      };
    }),

  // See the interface docstring above for why this is a Back (not an advance),
  // why it truncates rather than pops, and why it must clear baseConfirmed.
  backToChooseBase: () =>
    set((s) => {
      const sanitized = sanitizeHistory(s.activeStepId, s.history);
      const pickerIndex = sanitized.indexOf("choose_base");
      return {
        activeStepId: "choose_base" as ActiveStepId,
        history: pickerIndex === -1 ? ([] as readonly ActiveStepId[]) : sanitized.slice(0, pickerIndex),
        lastNavigation: "pop" as const,
        baseConfirmed: false,
      };
    }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      // Re-initialize arrays so mutations do not bleed across resets.
      history: [] as readonly ActiveStepId[],
      visited: ["identity"] as readonly ActiveStepId[],
    }),

  hydrate: (snapshot) =>
    set({
      ...snapshot,
      // Copy the arrays so a mutation of the restored draft can't bleed back
      // into the caller's snapshot object. `?? []` tolerates a pre-this-change
      // persisted draft that predates these two fields (same additive
      // tolerance as phaseBDraft/selectedFont elsewhere in the durable-draft
      // layer) — a genuinely missing field resumes with "nothing marked",
      // never a runtime crash on a stale localStorage record.
      history: [...snapshot.history],
      // A draft written before `visited` existed has none — back-fill it from
      // the walked path that draft DOES carry, so a returning author is not
      // stranded by exactly the defect this slot fixes. `history` is the
      // back-stack from wherever they stopped, which under-reports any stage
      // they had jumped behind; that is the best this draft can know, and it
      // grows correctly from the next `advance` on.
      visited: normalizeVisited(snapshot),
      markedForLaterDesktop: [...(snapshot.markedForLaterDesktop ?? [])],
      markedForLaterTouch: [...(snapshot.markedForLaterTouch ?? [])],
    }),

  setMarksMigrationNeeded: (needed) => set({ marksMigrationNeeded: needed }),

  setIdentityResult: (r) => set({ identityResult: r }),
  setIdentityPhaseResult: (r) => set({ identityPhaseResult: r }),
  setSurveyContext: (c) => set({ surveyContext: c }),
  setSelectedTrack: (t) => set({ selectedTrack: t }),
  setScaffoldSpec: (s) => set({ scaffoldSpec: s }),
  setLocalBase: (b) => set({ localBase: b }),
  setBaseConfirmed: (v) => set({ baseConfirmed: v }),
  setCharactersSubStage: (s) => set({ charactersSubStage: s }),

  setTouchSeedSource: (s) =>
    set((state) => {
      // A genuine change of seed source invalidates any in-progress touch
      // draft — its charTouch entries reference host keys of the OTHER seed
      // and would half-apply with warnings (R12). A no-op re-set (same value,
      // including null -> null) leaves the draft untouched.
      if (s !== state.touchSeedSource) {
        useWorkingCopyStore.getState().setTouchDraft(null);
      }
      return { touchSeedSource: s };
    }),

  setDiscoveryMethod: (m) => set({ discoveryMethod: m }),

  toggleMarkedForLaterDesktop: (char) =>
    set((s) => ({
      markedForLaterDesktop: s.markedForLaterDesktop.includes(char)
        ? s.markedForLaterDesktop.filter((c) => c !== char)
        : [...s.markedForLaterDesktop, char],
    })),

  toggleMarkedForLaterTouch: (char) =>
    set((s) => ({
      markedForLaterTouch: s.markedForLaterTouch.includes(char)
        ? s.markedForLaterTouch.filter((c) => c !== char)
        : [...s.markedForLaterTouch, char],
    })),
}));

// Ensure the store's getState() escape hatch is available for imperative reads
// inside memoised callbacks (e.g. onInstantiate reads selectedTrack this way).
// No extra export needed — zustand attaches getState() to the hook directly.

// ---------------------------------------------------------------------------
// TraversalSnapshot serialize/restore (T017, spec 034 US3)
//
// Mirrors the snapshotWorkingCopyData/applyWorkingCopySnapshot idiom in
// ../lib/persistWorkingCopy.ts. The return type on `snapshotTraversal` is the
// enforcement point: a new non-action field added to SurveySessionState (and
// therefore SurveySessionData/TraversalSnapshot via the Omit above) makes the
// object literal below fail to compile until it is listed here.
// ---------------------------------------------------------------------------

/** Build a serializable snapshot of the CURRENT traversal state. */
export function snapshotTraversal(): TraversalSnapshot {
  const s = useSurveySessionStore.getState();
  return {
    activeStepId: s.activeStepId,
    history: s.history,
    // Part of the durable draft, not just live state: a reload that lost the
    // high-water mark would strand a returning author exactly where the
    // pre-`visited` build stranded everyone — see the slot's docstring.
    visited: s.visited,
    lastNavigation: s.lastNavigation,
    marksMigrationNeeded: s.marksMigrationNeeded,
    identityResult: s.identityResult,
    identityPhaseResult: s.identityPhaseResult,
    surveyContext: s.surveyContext,
    selectedTrack: s.selectedTrack,
    scaffoldSpec: s.scaffoldSpec,
    localBase: s.localBase,
    baseConfirmed: s.baseConfirmed,
    charactersSubStage: s.charactersSubStage,
    touchSeedSource: s.touchSeedSource,
    discoveryMethod: s.discoveryMethod,
    markedForLaterDesktop: s.markedForLaterDesktop,
    markedForLaterTouch: s.markedForLaterTouch,
  };
}

// ---------------------------------------------------------------------------
// performManifestBack / expectedBackTarget (F7 — browser Back integration)
//
// The ONE manifest-level back dispatch, shared by StepHost's in-app Back
// button AND the browser-history popstate bridge
// (hooks/useSurveyBrowserHistorySync.ts) — so the two triggers never
// diverge into separate back logic. Mirrors what StepHost.handleBack did
// inline before this fix: the "touch" step always resurfaces the
// touch_seed_source chooser (spec 035 R12); every other step follows the
// generic walked-history pop.
// ---------------------------------------------------------------------------

/**
 * Perform the manifest-level Back action for `stepId`. No-ops exactly when
 * `expectedBackTarget(stepId, history)` would return null (nothing to pop).
 */
export function performManifestBack(stepId: ActiveStepId): void {
  const { backToTouchSeedSource, popHistory } = useSurveySessionStore.getState();
  if (stepId === "touch") {
    backToTouchSeedSource();
    return;
  }
  popHistory();
}

/**
 * Pure prediction (no mutation) of where `performManifestBack(stepId)` would
 * land, given `history`. Returns null when there is no genuine back target
 * (mirrors popHistory's own empty-history no-op) — used by:
 *   - StepHost to gate the Back affordance itself (only render/pass `onBack`
 *     when this is non-null — F7 defect 2).
 *   - the browser-history bridge to sanity-check an incoming popstate's
 *     `ksStep` before trusting it (never mutate the store off an unverified
 *     guess — F7 defect 1).
 *
 * "touch" always has a target (the touch_seed_source chooser — see
 * backToTouchSeedSource's own docstring: it always lands somewhere, it never
 * no-ops), so this returns non-null unconditionally for that step.
 */
export function expectedBackTarget(
  stepId: ActiveStepId,
  history: readonly ActiveStepId[],
): ActiveStepId | null {
  if (stepId === "touch") return "touch_seed_source";
  const popped = popValidHistoryEntry(stepId, history);
  return popped?.prev ?? null;
}

/**
 * Patch a `TraversalSnapshot` directly into the survey-session store.
 * `TraversalSnapshot` is exactly the non-action slice of `SurveySessionState`,
 * so this is a direct `setState` — no field-by-field mapping needed, EXCEPT
 * `history`: sanitized via `sanitizeHistory` first (P0 follow-up) so a stack
 * persisted by an older, buggy build (or corrupted by any other means) can
 * never resurrect a stale forward entry (e.g. "help") once restored here.
 * Shipping a fix to the back-primitives above does not, on its own, repair a
 * draft a returning author already has sitting in localStorage — this is the
 * repair step for that case. See the STEP_ORDER/sanitizeHistory doc comment.
 */
export function applyTraversalSnapshot(snapshot: TraversalSnapshot): void {
  useSurveySessionStore.setState({
    ...snapshot,
    history: sanitizeHistory(snapshot.activeStepId, snapshot.history),
    // Same back-fill as `hydrate` — this is the OTHER restore seam, and a
    // draft written before the slot existed reaches the store through either.
    visited: normalizeVisited(snapshot),
  });
}
