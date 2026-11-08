// bodyParity — the 11.9 welcome/help body-parity question's shared logic
// (issue #2530).
//
// One pure helper, two call sites: the live extraction wiring
// (`buildLiveExtractContext`, seeding) and `phaseFOptions.buildContext`
// (the `body_parity_live` routing token and the snippet tokens). The
// question module itself stays engine-free and store-free — it reads the
// computed values off `ExtractContext` / `SurveyContext`.
//
// Liveness mirrors the 11.9 check's comparison (`normalizeDocBody` over
// the START texts), not the hook-bound live finding: during the help step
// the preview parity is determined by the start texts plus `bodySync`
// (generated answers splice identically into both pages; the HTML editor
// is a later, separate step), and a recorded answer keeps the question
// reachable after the finding clears. Drift between this helper and the
// check is pinned by `bodyParity.test.ts`, which runs both over the same
// inputs.

import { normalizeDocBody } from "@keymanapp/keyboard-lint";
import type { DocFixProposals } from "@keyboard-studio/contracts";
import type { InstantiationMode } from "../stores/workingCopyStore.ts";

/** A short window around the first place two normalized bodies diverge — the summary-form diff the author decides from. */
export interface BodyDifference {
  welcome: string;
  help: string;
}

export function firstBodyDifference(welcomeBody: string, helpBody: string): BodyDifference {
  let i = 0;
  const limit = Math.min(welcomeBody.length, helpBody.length);
  while (i < limit && welcomeBody[i] === helpBody[i]) i += 1;
  const from = Math.max(0, i - 40);
  return {
    welcome: welcomeBody.slice(from, i + 80),
    help: helpBody.slice(from, i + 80),
  };
}

/**
 * Render a normalized-body window as plain text for an author: tags are
 * markup, not content, and the question never shows raw HTML (ruling 3).
 */
export function bodyWindowToPlainText(window: string): string {
  return window
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The new question's answer values. */
export type BodyParityAnswer = "welcome" | "help" | "keep-different";

/**
 * Map a persisted `docFixProposals.bodySync` value onto the new answer
 * vocabulary (`"declined"` becomes `"keep-different"`). Undefined when
 * nothing was recorded yet.
 */
export function legacyBodyParityAnswer(
  proposals: DocFixProposals | null | undefined,
): BodyParityAnswer | undefined {
  const bodySync = proposals?.bodySync;
  if (bodySync === "welcome" || bodySync === "help") return bodySync;
  if (bodySync === "declined") return "keep-different";
  return undefined;
}

/**
 * Map a new-question answer back onto the `docFixProposals.bodySync`
 * vocabulary the apply path reads.
 */
export function bodyParityAnswerToBodySync(
  answer: string | undefined,
): DocFixProposals["bodySync"] | undefined {
  if (answer === "welcome" || answer === "help") return answer;
  if (answer === "keep-different") return "declined";
  return undefined;
}

export interface BodyParityInputs {
  /** The working copy's track — the question exists on the adapt track only. */
  instantiationMode: InstantiationMode;
  startWelcomeHtmText: string | null;
  startHelpPhpText: string | null;
  /** The working copy's recorded proposals (legacy answers included). */
  docFixProposals: DocFixProposals | null;
  /** The recorded `help-body-parity` decision value, when one exists. */
  bodyParityDecision?: string | undefined;
}

/**
 * True when the 11.9 body-parity question belongs in the Phase F flow:
 * the inherited pages differ, or a body-parity answer is already recorded
 * (so an answered choice stays revisitable with Back / Change answer
 * after the finding clears). False on the copy track (the start slices
 * are session state another run can refill — the track, never the slices
 * being null, is the guard, the useDocsPreview precedent) and when the
 * inherited pages already match.
 */
export function isBodyParityLive(inputs: BodyParityInputs): boolean {
  if (inputs.instantiationMode !== "adapt-existing") return false;
  if (legacyBodyParityAnswer(inputs.docFixProposals) !== undefined) return true;
  const decision = inputs.bodyParityDecision;
  if (decision === "welcome" || decision === "help" || decision === "keep-different") return true;
  const { startWelcomeHtmText, startHelpPhpText } = inputs;
  if (startWelcomeHtmText === null || startHelpPhpText === null) return false;
  return normalizeDocBody(startWelcomeHtmText) !== normalizeDocBody(startHelpPhpText);
}

/**
 * The first-difference preview as plain-text snippets, for the question's
 * `{{body_parity_welcome}}` / `{{body_parity_help}}` context tokens.
 * Empty strings when the pages do not differ (the tokens then resolve to
 * "" rather than literal braces, the pf_history_entry precedent).
 */
export function bodyParitySnippets(inputs: BodyParityInputs): BodyDifference {
  const { startWelcomeHtmText, startHelpPhpText } = inputs;
  if (inputs.instantiationMode !== "adapt-existing") return { welcome: "", help: "" };
  if (startWelcomeHtmText === null || startHelpPhpText === null) {
    return { welcome: "", help: "" };
  }
  const welcomeBody = normalizeDocBody(startWelcomeHtmText);
  const helpBody = normalizeDocBody(startHelpPhpText);
  // No difference, no preview: firstBodyDifference would otherwise
  // window the whole matching text and present it as a divergence —
  // reachable when the question is live only because an answer is
  // already recorded (isBodyParityLive), after the finding cleared.
  if (welcomeBody === helpBody) return { welcome: "", help: "" };
  const difference = firstBodyDifference(welcomeBody, helpBody);
  return {
    welcome: bodyWindowToPlainText(difference.welcome),
    help: bodyWindowToPlainText(difference.help),
  };
}
