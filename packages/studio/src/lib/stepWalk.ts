// stepWalk — the WITHIN-STEP position vocabulary.
//
// This module closes the gap progressDots.ts's header calls "THE 'CURRENT
// QUESTION' ARCHITECTURE GAP": spec 057 shipped a footer row whose finest
// granularity inside a not-yet-completed step was the STAGE, because no shared
// state exposed "which question / which character is this step showing right
// now". The consequence the author hit: leaving a stage half-finished (a tab
// switch unmounts the step component) lost the position, and a stage with a
// dozen internal stops collapsed to a single dot with no way back into the
// middle of it.
//
// WHY THIS IS NOT A SECOND NOTION OF POSITION (FR-006/FR-062). The rule those
// FRs state is that there is ONE location model and nothing re-derives position
// from the rendered tree. A within-step cursor published into the store IS that
// model, extended one level finer:
//
//   route ──► step (surveySessionStore.activeStepId) ──► position (here)
//
// The component that owns a walk is the only writer of its own positions, and
// it READS the cursor rather than keeping a private copy — so the store is
// authoritative in both directions, exactly as `activeStepId` already is for
// the step level. Nothing derives a position by inspecting the DOM.
//
// TWO SHAPES OF WALK, ONE VOCABULARY:
//   - a survey flow's questions (SurveyRunner's answer stack), and
//   - a gallery's character walk (MechanismGallery / TouchGallery's
//     `usePositionalCharNav` list).
// Both are "an ordered list of stops, some done, one current", which is all
// the footer needs, so both publish this one shape rather than the footer
// learning two.
//
// PURE BY DESIGN: types, token codec and label formatting only — no store and no
// React. `decisions/`
// may not import `stores/` (the `decisions-layer` depcruise rule), so
// progressDots.ts consumes these types from here and receives the DATA through
// its input — the same seam it already uses for `ctx.traversal`.

import { codepointLabel } from "../survey/codepointLabel.ts";

/** One stop inside a step: a question in a flow, or a character in a gallery walk. */
export interface StepWalkPosition {
  /**
   * Stable, hash-safe id for this stop. A flow question uses its registry id
   * verbatim (already `[a-z0-9_]+`); a character uses
   * {@link charToPositionToken} because a literal character is outside the
   * `Location` grammar's segment class (see lib/location.ts's `SEGMENT`).
   */
  readonly id: string;
  /**
   * Localized label for the dot's accessible name and hover text.
   *
   * OMITTED for a flow question, deliberately: its label already has exactly
   * one resolver (`decisions/lookupQuestionLabel.ts`, `audit_label` -> `prompt`
   * through the Tier-B content catalog), and a publisher that resolved its own
   * would be a second implementation of that precedence — the fork class
   * `pnpm lint` exists to catch. The consumer falls back to that resolver, then
   * to the raw id. A character walk DOES supply one, because a character has no
   * question registry entry for any resolver to look up.
   */
  readonly label?: string;
  /**
   * Whether this stop is settled: a question with a committed answer, or a
   * character with a mechanism assigned. Drives `completed` vs `upcoming`
   * dot rendering WITHIN a step, where the decision record cannot help —
   * answers are only recorded at step completion (spec 053's capture
   * boundary, deliberately unchanged here).
   */
  readonly done: boolean;
}

/** A step's ordered stops. Published by the ONE component that owns the walk. */
export type StepWalkPositions = readonly StepWalkPosition[];

/**
 * Every published walk, keyed by manifest step id. Read-only for consumers;
 * `stores/stepWalkStore.ts` is the only writer.
 */
export type StepWalkMap = Readonly<Record<string, StepWalkPositions>>;

/**
 * Where the author is inside each step, keyed by manifest step id. Separate
 * from {@link StepWalkMap} on purpose: a jump writes a cursor for a step whose
 * component is not mounted yet (so it has published nothing), and the component
 * then reads that cursor as its arrival position. One slot for "what stops
 * exist", one for "which stop", each with a single writer at any moment.
 */
export type StepCursorMap = Readonly<Record<string, string>>;

// ---------------------------------------------------------------------------
// Character ↔ position-token codec
//
// `lib/location.ts`'s `SEGMENT` is `/^[a-z0-9_]+$/` — deliberately narrow so a
// hash segment never needs URL-encoding. A character walk's stops are
// characters ("á", "Ə́"), which that class excludes, so a gallery stop is
// addressed by its code points instead. Lower-case hex, underscore-joined,
// `u`-prefixed: "á" -> "u00e1", "Ə́" (U+018F U+0301) -> "u018f_0301".
//
// Round-trip total in both directions for every non-empty string, which is what
// lets a footer dot's location be formatted into the hash and parsed back out
// without a second escaping scheme.
// ---------------------------------------------------------------------------

/** The token shape {@link charToPositionToken} emits, for cheap recognition. */
const POSITION_TOKEN = /^u[0-9a-f]{4,6}(?:_[0-9a-f]{4,6})*$/;

/** Address a character walk stop as a hash-safe segment. */
export function charToPositionToken(char: string): string {
  const parts: string[] = [];
  for (const cp of char) {
    // codePointAt(0) on a code point from a string iterator is always defined.
    parts.push(cp.codePointAt(0)!.toString(16).toLowerCase().padStart(4, "0"));
  }
  return `u${parts.join("_")}`;
}

/**
 * Decode a token produced by {@link charToPositionToken}, or `null` when
 * `token` is not one (e.g. a flow question id, which shares the same slot).
 * Never throws — an unrecognised or out-of-range token is `null`, not an
 * exception, because tokens arrive from the address bar.
 */
export function positionTokenToChar(token: string): string | null {
  if (!POSITION_TOKEN.test(token)) return null;
  let out = "";
  for (const hex of token.slice(1).split("_")) {
    const cp = Number.parseInt(hex, 16);
    if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return null;
    out += String.fromCodePoint(cp);
  }
  return out === "" ? null : out;
}

/**
 * The character in `list` that `cursor` addresses, or `null` when the cursor is
 * absent, is not a character token, or names a character this walk no longer
 * holds. Comparison is by NFC identity, matching
 * `usePositionalCharNav.ts`'s `indexOfChar` — a walk list that re-normalizes
 * (collateInventory's NFC-dedup) must not turn a valid cursor into a miss.
 */
export function cursorCharIn(
  cursor: string | undefined,
  list: readonly string[],
): string | null {
  if (cursor === undefined) return null;
  const char = positionTokenToChar(cursor);
  if (char === null) return null;
  const nfc = char.normalize("NFC");
  return list.find((c) => c.normalize("NFC") === nfc) ?? null;
}

/**
 * A character walk stop's dot label: the character itself plus every code point
 * in it, e.g. `á (U+00E1)`, `Ə́ (U+018F U+0301)`.
 *
 * The code-point half comes from `codepointLabel().title` — the existing "every
 * code point, space-separated" formatter (spec 047 FR-014) — rather than a
 * second `U+` formatter here. Naming the code points is not decoration: a bare
 * "á" is ambiguous between its precomposed and decomposed forms, which are
 * DIFFERENT walk stops with different mechanisms, and a screen-reader user gets
 * nothing at all from the glyph on its own (docs/accessibility.md house rule:
 * codepoint-derived accessible names for glyphs).
 */
export function charWalkLabel(char: string): string {
  return `${char} (${codepointLabel(char).title})`;
}

// ---------------------------------------------------------------------------
// Derivations shared by the resolver and the footer
// ---------------------------------------------------------------------------

/**
 * Just the ids of every published walk, which is all `resolveLocation` needs to
 * answer "is this position addressable in this build" for a step whose stops
 * are NOT flow questions (a gallery character). Kept here rather than in the
 * resolver so the resolver stays a pure function of its context.
 */
export function stepPositionIds(walks: StepWalkMap): Readonly<Record<string, readonly string[]>> {
  const out: Record<string, readonly string[]> = {};
  for (const [stepId, positions] of Object.entries(walks)) {
    out[stepId] = positions.map((p) => p.id);
  }
  return out;
}
