// ui/SelectMenu test helpers — native <select> popups don't open in the VS
// Code webview, so KeyPickerField's key picker and the various layer/host-key
// dropdowns across MechanismGallery/TouchGallery are a DOM-rendered
// button+listbox (ui/SelectMenu.tsx), not a native <select>. Shared by every
// spec that drives one of those pickers so a further SelectMenu migration
// doesn't hand-copy a third near-identical set of helpers.
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { expect } from "vitest";

/** Opens a SelectMenu trigger and clicks the option with the given value —
 * the button+listbox equivalent of `fireEvent.change(select, { target: { value } })`.
 * Awaits the listbox actually opening before looking for the option: under a
 * deep/complex render tree the click's state update can land a tick after
 * fireEvent.click returns, so a synchronous check right after can flake. */
export async function changeSelectMenu(trigger: HTMLElement, value: string): Promise<void> {
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));
  const option = trigger.parentElement?.querySelector(`li[data-value="${value}"]`);
  if (option === null || option === undefined) {
    throw new Error(`SelectMenu option not found for value "${value}"`);
  }
  fireEvent.click(option);
}

/** Reads a SelectMenu trigger's current value — the button+listbox equivalent
 * of reading `.value` on a native `<select>`. */
export function selectMenuValue(trigger: HTMLElement): string {
  return trigger.getAttribute("data-value") ?? "";
}

/** Opens a SelectMenu, collects every option's underlying value, and closes it
 * again — the button+listbox equivalent of `Array.from(select.options).map(o => o.value)`. */
export async function selectMenuOptionValues(trigger: HTMLElement): Promise<string[]> {
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger.getAttribute("aria-expanded")).toBe("true"));
  const values = Array.from(
    trigger.parentElement?.querySelectorAll("li[data-value]") ?? [],
  ).map((el) => el.getAttribute("data-value") ?? "");
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  return values;
}
