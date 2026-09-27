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
//
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';
