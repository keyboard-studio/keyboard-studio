// capsHandlingFromDecisions -- a leaf module (types and the pure caps rules only) so the
// Open caps commit can read the answered value without importing the projection input,
// which would close an import cycle through the marks value module.

import type { CapsHandlingValue, DecisionSet } from "../decisions/decisionTypes.ts";
import { alphabetOf, isCasedAlphabet } from "../survey/caps/capsLogic.ts";

/**
 * Step 2.8's input from the decision set: the recorded caps-handling value,
 * or undefined when it was not asked. A caseless alphabet is never asked, so
 * a value left over from an earlier alphabet is ignored rather than writing a
 * store nothing needs. `askedOnly` (Open) also ignores a value the author did
 * not answer.
 */
export function capsHandlingFromDecisions(
  decisions: DecisionSet,
  opts: { askedOnly?: boolean } = {},
): CapsHandlingValue | undefined {
  const value = decisions["caps-handling"]?.value as CapsHandlingValue | undefined;
  if (value === undefined) return undefined;
  // On Open (spec 111) a seeded default or an extracted value is not a change
  // the author made, so it never edits the opened keyboard's caps handling.
  if (opts.askedOnly === true && decisions["caps-handling"]?.provenance !== "asked") return undefined;
  return isCasedAlphabet(alphabetOf(decisions["character-inventory"]?.value)) ? value : undefined;
}
