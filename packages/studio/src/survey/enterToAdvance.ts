// Shared Enter-to-advance keyboard handler for the survey wizard (issue #536).
//
// Three steps previously hand-rolled the same "Enter submits this step" guard —
// SurveyRunner's container handler, Prefill's confirmation-screen handler, and
// ProjectNameStep's input handler — each with a slightly different shape. This
// centralises the guard logic so the shared-conventions goal of #536 holds for
// keyboard behaviour too, not just styling.
//
// The base rule: a plain Enter (not an auto-repeat) advances, unless the event
// originates on an element whose tag is in `skipTags` (Back/Next buttons, which
// fire their own onClick on Enter natively — advancing here too would double-
// fire). Two behaviours are opt-in because only SurveyRunner needs them:
//   - `multiline`: a plain Enter in a <textarea> advances (newline suppressed),
//     Shift+Enter inserts a newline instead.
//   - `deferIfDefaultPrevented`: an inner handler that already called
//     preventDefault (e.g. the StyledCombobox selecting a highlighted row) wins;
//     this handler stands down instead of double-handling.

import type { KeyboardEvent } from "react";

export interface EnterToAdvanceOptions {
  /**
   * Called when Enter should advance/submit the step. The caller owns any
   * "can we advance?" gating (required-field checks, validity) inside this
   * callback — the helper always invokes it on a qualifying Enter.
   */
  advance: () => void;
  /**
   * Uppercase tag names whose own Enter handling should be left alone. Defaults
   * to `["BUTTON"]` so Back/Next buttons don't double-advance.
   */
  skipTags?: string[];
  /**
   * When true, a plain Enter in a `<textarea>` advances (native newline
   * suppressed) and Shift+Enter inserts a newline. Opt-in — only the
   * SurveyRunner container hosts multiline fields.
   */
  multiline?: boolean;
  /**
   * When true, defer to an inner handler that already called `preventDefault()`
   * (e.g. StyledCombobox committing a highlighted row) instead of advancing.
   * Opt-in — only the container-level SurveyRunner handler competes with an
   * inner combobox on the bubble path.
   */
  deferIfDefaultPrevented?: boolean;
}

/**
 * Handle an Enter key event as a step-advance, per the shared #536 convention.
 * No-op for any key other than a non-repeating Enter, for events on a skipped
 * tag, and (in multiline mode) for Shift+Enter in a textarea.
 */
export function handleEnterToAdvance(
  e: KeyboardEvent<HTMLElement>,
  opts: EnterToAdvanceOptions,
): void {
  if (e.key !== "Enter" || e.repeat) return;

  const tag = (e.target as HTMLElement).tagName;
  const skipTags = opts.skipTags ?? ["BUTTON"];
  if (skipTags.includes(tag)) return;

  if (opts.multiline === true && tag === "TEXTAREA") {
    if (e.shiftKey) return; // native newline insertion
    e.preventDefault();
    opts.advance();
    return;
  }

  // An inner handler (StyledCombobox) already acted on this Enter.
  if (opts.deferIfDefaultPrevented === true && e.defaultPrevented) return;

  e.preventDefault();
  opts.advance();
}
