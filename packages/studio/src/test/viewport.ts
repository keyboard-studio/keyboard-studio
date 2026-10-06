// Shared test helper for stubbing the viewport size in jsdom.
//
// useViewport reads `window.innerWidth/innerHeight` and listens for `resize`,
// so a test that changes the size must do both: write the property and fire
// the event (inside act, so subscribed components re-render). Writing the
// property alone only works when it lands before render, by accident of the
// hook's useState initializer.

import { act } from "@testing-library/react";

/** Set the viewport width (and optionally height), then fire `resize`. */
export function setViewport(width: number, height?: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  if (height !== undefined) {
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  }
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}
