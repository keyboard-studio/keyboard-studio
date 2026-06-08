// Custom DOM events for lint chip interactions.
// Consumers listen on `document` with addEventListener("navigateToLocation", ...)
// and addEventListener("applyLintFix", ...).

import type { SourceLocation, LintCode } from "@keyboard-studio/contracts";

export type NavigateToLocationDetail = { location: SourceLocation };
export type ApplyLintFixDetail = { code: LintCode; hint: string | undefined };

/**
 * Dispatch a `navigateToLocation` event on `document`.
 * The editor pane listens for this to scroll + focus the relevant line/column.
 */
export function dispatchNavigateTo(location: SourceLocation): void {
  const detail: NavigateToLocationDetail = { location };
  document.dispatchEvent(
    new CustomEvent<NavigateToLocationDetail>("navigateToLocation", {
      detail,
      bubbles: true,
    }),
  );
}
