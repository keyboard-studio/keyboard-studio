// Shared keyboard-focusable selector (ARIA APG dialog pattern;
// docs/accessibility.md).
//
// Consolidates the focus-trap / first-focusable queries previously
// hand-copied between the key-grid dialogs (FamilyApplyDialog,
// RenameDialog, RemoveKeyDialog), the anchored popovers
// (ui/useDismissablePopover.ts), and components/SurveyQuestionsPane.tsx.
// One canonical string so the next focusability fix lands everywhere at
// once instead of in whichever copy someone happened to read.
//
// Coverage notes (each clause earns its place):
//   • `:not([disabled])` on button/input/select/textarea — a disabled
//     control is not focusable; the popover's older copy omitted this and
//     could "focus" a control that takes no focus.
//   • `input:not([type="hidden"])` — hidden inputs are never focusable.
//   • `a[href]` (not bare `[href]`) — the focusable carrier of an href in
//     studio markup is an anchor; bare `[href]` also matches non-focusable
//     carriers such as `<link>`.
//   • `iframe` / `[contenteditable]` — both take Tab focus and both appear
//     in studio surfaces (help/embedded previews, editable labels).
//   • `[tabindex]:not([tabindex="-1"])` — explicit opt-ins, minus the
//     roving-tabindex opt-outs.
//   • `:not([aria-hidden="true"])` on every clause — a caller moving focus
//     onto an `aria-hidden` element contradicts the very attribute that
//     removed it from the tree, and the dialogs already carry one such
//     element (the click-outside backdrop). A no-op until a focusable
//     `aria-hidden` descendant appears inside a dialog, popover, or the
//     questions pane; see #1841 for the audit that asked for it.
//
export const FOCUSABLE_SELECTOR =
  'a[href]:not([aria-hidden="true"]), button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"]), select:not([disabled]):not([aria-hidden="true"]), textarea:not([disabled]):not([aria-hidden="true"]), iframe:not([aria-hidden="true"]), [contenteditable]:not([contenteditable="false"]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])';
