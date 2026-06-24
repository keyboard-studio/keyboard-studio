// PreviewShell — kept as a re-export shim.
//
// The combined preview+output shell has been split into:
//   PreviewScreen — "try it": OSK preview + diagnostics (no download, no GitHub)
//   OutputScreen  — "ship it": Download .zip + GitHubSignUpPanel (no OSK)
//
// This module now re-exports PreviewScreen under the old name so that any
// remaining external call sites continue to compile without change.
// StudioShell routes preview → PreviewScreen and output → OutputScreen directly.

export { PreviewScreen as PreviewShell } from "./PreviewScreen.tsx";
