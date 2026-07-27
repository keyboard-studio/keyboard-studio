// Shared test-render helper for Lingui-ified chrome components.
//
// PR #1248's later commits localized shared chrome (Label, ResizeHandle,
// BaseKeyboardPicker, OskModeToggle, and friends) with Lingui's useLingui()/
// <Trans>, which throw "useLingui hook was used without I18nProvider" unless
// an <I18nProvider> ancestor is present at render time (see
// ../../../docs/i18n-spike.md). In the app this is StudioShell's job, but a
// test that renders a sub-component in isolation (not via <StudioShell>)
// needs its own provider.
//
// Rather than duplicate "i18n.load/activate + wrap in <I18nProvider>" at
// every render() call site (the pattern PreviewShell.test.tsx pioneered
// per-file), this module centralizes it ONCE: `render` here is a drop-in
// replacement for @testing-library/react's `render` that supplies the
// provider via RTL's `wrapper` option. `wrapper` is threaded through
// `rerender()` too (see @testing-library/react's `wrapUiIfNeeded`), so
// call sites that destructure `{ rerender }` keep working unchanged.
//
// Usage: swap the `render` import only —
//   import { screen, fireEvent } from "@testing-library/react";
//   import { render } from "<relative path to this file>";
// Everything else (screen, fireEvent, waitFor, cleanup, act, ...) still
// comes straight from "@testing-library/react".
import type { ReactElement, ReactNode } from "react";
import { render as rtlRender, type RenderOptions, type RenderResult } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as enMessages } from "../locales/en/messages.json?lingui";

i18n.load("en", enMessages);
i18n.activate("en");

function I18nTestWrapper({ children }: { children?: ReactNode }): ReactElement {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

/**
 * Drop-in replacement for `@testing-library/react`'s `render` that wraps the
 * tree in the `en`-activated `<I18nProvider>` every Lingui-ified component
 * needs. Accepts the same options `@testing-library/react`'s `render` does;
 * pass an explicit `wrapper` to override the default if a test needs a
 * different combination of providers.
 */
export function render(ui: ReactElement, options?: RenderOptions): RenderResult {
  return rtlRender(ui, { wrapper: I18nTestWrapper, ...options });
}

export { i18n };
