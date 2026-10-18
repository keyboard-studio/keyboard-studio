// communityContext — issue #331: consume the Phase B placement-habit
// answers (pb_existing_keyboards / pb_co_installed_keyboards) OUTSIDE the
// question modules, as the community context for placement proposals.
//
// Until now those two answers were dead text: recorded in the survey
// answer store, read by nothing. This module is the reader. It derives a
// small, honest context object from the author's own words:
//
//   - the verbatim answers (trimmed), for display framing, and
//   - a layout family, ONLY when the author's text names one.
//
// Vocabulary (issue #331 re-scope, 2026-07-21): the match vocabulary is
// sourced from the session-facet catalog, not invented here. These two
// questions feed the `community.muscle-memory` facet
// (content/facets/community/muscle-memory.yaml — its "confirmed"
// derivation is `question:pb_co_installed_keyboards`, and both questions
// are its listed prefills), whose physical value is "layout families the
// community types (qwerty/azerty/national)". The family tokens below are
// the same ones the `layout_family` question offers and
// lib/layoutFamily.ts resolves (the env/base-layout-affinity facet's
// "asked" derivation): qwerty / azerty / qwertz / non-roman.
//
// Derivation is deliberately conservative: a family is reported ONLY
// when the author's own text names it ("French AZERTY keyboard" →
// azerty). Nothing is inferred from language or country names — a
// guessed family would put words in the author's mouth on a chip that
// claims to speak for their community, and a wrong guess would silently
// misframe every provenance line the gallery shows.

import type { StepAnswers } from "../steps/answerTypes.ts";

/** The characters step — the step whose answers include the pb_* pair. */
export const CHARACTERS_STEP_ID = "characters";

/** Question ids of the two placement-habit intake questions (Phase B). */
export const PB_EXISTING_KEYBOARDS = "pb_existing_keyboards";
export const PB_CO_INSTALLED_KEYBOARDS = "pb_co_installed_keyboards";

/**
 * Layout families the facet vocabulary names and free text can state
 * explicitly. (`non-roman` is in the vocabulary but is not a word an
 * author types into these free-text answers, so no detector produces
 * it — absence of a family is a first-class outcome, not a gap.)
 */
export type CommunityLayoutFamily = "qwerty" | "azerty" | "qwertz";

/**
 * The community context derived from the placement-habit answers.
 * Stored nowhere — derived at proposal time from the live answers, so
 * editing an answer reframes the very next proposal (two-channel rule:
 * the author's current words win, nothing is cached against them).
 */
export interface CommunityContext {
  /** The session facet this context instantiates (catalog id). */
  facetId: "community.muscle-memory";
  /** The author's Q1 answer, verbatim (trimmed); absent when unanswered/blank. */
  existingKeyboards?: string;
  /** The author's Q2 answer, verbatim (trimmed); absent when unanswered/blank. */
  coInstalledKeyboards?: string;
  /** Layout family named explicitly in either answer; absent when unnamed. */
  layoutFamily?: CommunityLayoutFamily;
}

const FAMILY_PATTERNS: readonly { family: CommunityLayoutFamily; pattern: RegExp }[] = [
  { family: "azerty", pattern: /\bazerty\b/i },
  { family: "qwertz", pattern: /\bqwertz\b/i },
  { family: "qwerty", pattern: /\bqwerty\b/i },
];

/**
 * The first layout family explicitly named in `text`, scanning in text
 * order across the pattern set — the author's primary signal (their
 * existing keyboard) is the caller-ordered first argument's job; this
 * helper only answers "which family does THIS text name, if any".
 */
function familyNamedIn(text: string): CommunityLayoutFamily | undefined {
  let best: { family: CommunityLayoutFamily; index: number } | undefined;
  for (const { family, pattern } of FAMILY_PATTERNS) {
    const m = pattern.exec(text);
    if (m !== null && (best === undefined || m.index < best.index)) {
      best = { family, index: m.index };
    }
  }
  return best?.family;
}

function nonBlank(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Derive the community context from the two placement-habit answers.
 * Returns null when both answers are missing or blank — no context is
 * NOT an error and must never be papered over with a default: proposal
 * provenance simply falls back to the plain corpus citation.
 *
 * The existing-keyboards answer is the primary signal (it describes
 * what the community types on today); the co-installed answer can still
 * name the family when Q1 does not.
 */
export function deriveCommunityContext(
  existingKeyboards: string | undefined,
  coInstalledKeyboards: string | undefined,
): CommunityContext | null {
  const existing = nonBlank(existingKeyboards);
  const coInstalled = nonBlank(coInstalledKeyboards);
  if (existing === undefined && coInstalled === undefined) return null;

  const layoutFamily =
    (existing !== undefined ? familyNamedIn(existing) : undefined) ??
    (coInstalled !== undefined ? familyNamedIn(coInstalled) : undefined);

  return {
    facetId: "community.muscle-memory",
    ...(existing !== undefined ? { existingKeyboards: existing } : {}),
    ...(coInstalled !== undefined ? { coInstalledKeyboards: coInstalled } : {}),
    ...(layoutFamily !== undefined ? { layoutFamily } : {}),
  };
}

/** One saved answer's value as free text, when it is textual at all. */
function answerText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * Read the community context out of a step's saved answers (the
 * surveyAnswerStore shape). This is the "at proposal time" read the
 * issue asks for: callers pass the characters step's CURRENT answers,
 * so the context always reflects the author's latest words.
 */
export function communityContextFromAnswers(
  stepAnswers: StepAnswers | undefined,
): CommunityContext | null {
  if (stepAnswers === undefined) return null;
  const existing = answerText(stepAnswers.answers[PB_EXISTING_KEYBOARDS]?.value);
  const coInstalled = answerText(stepAnswers.answers[PB_CO_INSTALLED_KEYBOARDS]?.value);
  return deriveCommunityContext(existing, coInstalled);
}
