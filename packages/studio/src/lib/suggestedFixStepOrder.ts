// suggestedFixStepOrder — issue #2528: a suggested fix must not render on a
// survey step that comes BEFORE the step that owns the follow-up work
// (same principle as the adopted warnings-placement model, #2145).
//
// The shell panel (AfterApplySuggestions) mounts once above ALL route
// content, so without this filter a docs fix raised by an authoring edit
// ("Refresh the generated character section of the help") rendered on the
// Touch Gallery — a step the Documentation / Help steps come AFTER.
//
// Target -> owning step (by manifest order):
//   physical / mechanisms -> mechanisms (the physical-key gallery owns them)
//   touch                 -> touch
//   docs                  -> help (the help page owns the generated help
//                            section; the regen fix targets source/help/*.php)
//
// A fix shows only when its owning-step index <= the active-step index.
// Fixes with no action target, or an unknown target, FAIL OPEN — they show,
// never hide a new kind silently. An active step outside the manifest
// ("done", "unsupported") likewise fails open: everything is past by then.
//
// The step order arrives as a parameter, supplied by the caller (StudioShell
// already imports the manifest): this module must stay a leaf — importing
// steps/manifest.ts here creates a depcruise cycle (manifest ->
// registerEditorSteps -> UpgradesStep -> SuggestedFixes -> here).

import type { SuggestedFix } from "./consistencySuggestions.ts";

/** The survey step that owns a fix's follow-up work, or null to fail open. */
export function suggestedFixOwningStepId(fix: SuggestedFix): string | null {
  switch (fix.action?.target) {
    case "physical":
    case "mechanisms":
      return "mechanisms";
    case "touch":
      return "touch";
    case "docs":
      return "help";
    default:
      return null;
  }
}

/**
 * Whether a fix may render while `activeStepId` is the active survey step.
 * `stepOrder` is the manifest's step-id order, supplied by the caller.
 * `activeStepId` is a manifest step id; anything else fails open.
 */
export function isSuggestedFixVisibleAtStep(
  fix: SuggestedFix,
  activeStepId: string,
  stepOrder: readonly string[],
): boolean {
  const owningStepId = suggestedFixOwningStepId(fix);
  if (owningStepId === null) return true;
  const owningIndex = stepOrder.indexOf(owningStepId);
  const activeIndex = stepOrder.indexOf(activeStepId);
  if (owningIndex === -1 || activeIndex === -1) return true;
  return owningIndex <= activeIndex;
}
