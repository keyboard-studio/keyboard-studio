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

/**
 * Dispatch an `applyLintFix` event on `document`.
 * Reserved for future machine-actionable fix flows; currently unused in v1
 * (hints are plain-language only).
 *
 * @internal Reserved for v1.1 machine-actionable fix flow.
 */
export function dispatchApplyFix(code: LintCode, hint: string | undefined): void {
  const detail: ApplyLintFixDetail = { code, hint };
  document.dispatchEvent(
    new CustomEvent<ApplyLintFixDetail>("applyLintFix", {
      detail,
      bubbles: true,
    }),
  );
}
