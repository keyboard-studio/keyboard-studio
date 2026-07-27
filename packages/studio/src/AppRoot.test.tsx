// AppRoot regression tests — the app-root <I18nProvider> contract.
//
// The bug these guard: StudioShell used to render the provider AND call
// useLingui() in the same component. A component never sees its own provider,
// so the context was null on first paint. Dev builds surfaced Lingui's
// invariant; the production build (invariant stripped) blanked the page with
// "Cannot destructure property '_' of ... as it is null".
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { AppRoot } from "./AppRoot.tsx";

/** Stands in for any chrome component main.tsx mounts: consumes both APIs. */
function LinguiProbe() {
  const { t } = useLingui();
  return (
    <p title={t({ id: "test.appRoot.probe.title", message: "probe title" })}>
      <Trans id="test.appRoot.probe.body">probe body</Trans>
    </p>
  );
}

describe("AppRoot", () => {
  it("supplies the Lingui context its children consume", () => {
    render(
      <AppRoot>
        <LinguiProbe />
      </AppRoot>,
    );

    expect(screen.getByTitle("probe title").textContent).toBe("probe body");
  });

  it("is required — a Lingui consumer mounted without it fails", () => {
    // Encodes WHY AppRoot must stay above every createRoot() render in
    // main.tsx: without it, the first paint throws (prod) or trips Lingui's
    // invariant (dev). A component that renders the provider itself is in
    // exactly this position with respect to its own hooks.
    expect(() => render(<LinguiProbe />)).toThrow();
  });
});
