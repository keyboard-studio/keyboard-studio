// Shared test helper for locating "the currently-displayed character" in the
// two assignment-loop galleries (MechanismGallery, TouchGallery).
//
// Before the character-heading card was removed, both galleries rendered a
// dedicated glyph card whose `aria-label` was `${toUPlusNotation(char)}
// ${char}` (e.g. "U+00E1 á") — tests located "which char is current" via
// `screen.getByLabelText(/^U\+00E1 á$/)`. That card is gone: the CURRENT
// character is now the SELECTED chip inside CharScrollStrip
// (`packages/studio/src/editors/assignLoop/parts/CharScrollStrip.tsx`),
// identified by `aria-pressed="true"` and an `aria-label` of
// `Go to ${toUPlusNotation(char)} ${char}` (see that file's header comment).
//
// These helpers centralize the new lookup so it isn't re-derived at each of
// the ~45 call sites across MechanismGallery.test.tsx and
// TouchGallery.test.tsx — see CharScrollStrip.tsx's own file header for the
// testid/aria-label scheme these rely on.
import { screen, within } from "@testing-library/react";
import { expect } from "vitest";
import { toUPlusNotation } from "@keyboard-studio/contracts";

/**
 * Returns the CharScrollStrip chip that is currently selected — the one
 * button inside the `char-scroll-strip` container with `aria-pressed="true"`.
 *
 * Scoped to the strip (rather than a bare `screen.getByRole`) because other
 * controls in both galleries (method-chooser buttons, the "Added"/"Remove"
 * chip row) also carry `aria-pressed` or embed a `U+XXXX` substring in their
 * own `aria-label` — an unscoped query would be ambiguous or match the wrong
 * element. Throws (via RTL's `getByRole`) if the strip isn't rendered or
 * doesn't have exactly one pressed chip.
 */
export function getCurrentCharChip(): HTMLElement {
  const strip = screen.getByTestId("char-scroll-strip");
  return within(strip).getByRole("button", { pressed: true });
}

/**
 * Asserts that `char` is the gallery's current character: the CharScrollStrip
 * has exactly one selected chip, and its accessible name is exactly
 * `Go to <U+XXXX> <char>` — the replacement for the removed heading card's
 * `<U+XXXX> <char>` label (see this module's file header).
 */
export function expectCurrentChar(char: string): void {
  const chip = getCurrentCharChip();
  expect(chip.getAttribute("aria-label")).toBe(`Go to ${toUPlusNotation(char)} ${char}`);
}
