// outputKeyboardId — THE single resolution of "which keyboard id does output use".
//
// Every output surface must name the same keyboard: the emitted
// `<id>-<version>.zip` filename, the projected VFS paths inside it, and the
// download button's accessible name. They did not (spec 058 D4). OutputScreen's
// aria-label derived the id from `pickerMode`/`scaffoldSpec` — per-screen local
// state that always initializes to "open" on that screen — while the filename
// came from `identity.keyboardId` via serializeWorkingCopy. A screen-reader user
// was told "Download keyboard us as zip" for a file that landed as
// `dagbanli-<version>.zip`: WCAG 2.2 AA 2.5.3 (Label in Name) / 4.1.2 (Name,
// Role, Value).
//
// Pointing both call sites at the same expression fixed that instance; routing
// both through this function is what keeps it fixed. A future change to the
// resolution rule — a sanitization pass, a scaffold-spec fallback — lands here
// and reaches every caller instead of silently re-opening the divergence.
//
// This lives in its own module rather than beside its main consumer in
// serializeWorkingCopy.ts for a mechanical reason as well as a tidy one: two
// test files (OutputScreen.test.tsx, ManagedPRSubmitPanel.test.tsx) `vi.mock`
// that module wholesale to keep the engine and zip services out of a component
// render, so a helper exported from there reads as `undefined` in exactly the
// tests that cover the aria-label this fixes. A pure module with no store,
// engine, or service imports is mocked by nobody and needs no mock.

import type { IdentityPatch } from "../stores/workingCopyStore.ts";

/**
 * Resolve the keyboard id that output should name.
 *
 * The author's chosen id wins once they have set one; before that, output is
 * still keyed under the base's id (which is what makes the pre-naming
 * `output.identity.warn` banner true — see OutputScreen).
 *
 * Do not inline `identity?.keyboardId ?? baseKeyboard.id` at a new call site;
 * call this, and extend it here if the rule needs to grow.
 *
 * @param identity     The working copy's identity overlay — `null` until the
 *                     author names the keyboard, and `keyboardId` is optional
 *                     within it even then (Track 2 imports never set one).
 * @param baseKeyboard The base, whose `.id` is the fallback. `null` before
 *                     instantiation (cold arrival at `#output`), which yields
 *                     `""` — there is no id to announce and no artifact to name.
 * @returns The id, or `""` when neither source can supply one.
 */
export function resolveOutputKeyboardId(
  identity: Pick<IdentityPatch, "keyboardId"> | null | undefined,
  baseKeyboard: { id: string } | null | undefined,
): string {
  return identity?.keyboardId ?? baseKeyboard?.id ?? "";
}
