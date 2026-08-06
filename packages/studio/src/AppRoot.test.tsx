// AppRoot regression tests — the app-root <I18nProvider> contract.
//
// The bug these guard: StudioShell used to render the provider AND call
// useLingui() in the same component. A component never sees its own provider,
// so the context was null on first paint. Dev builds surfaced Lingui's
// invariant; the production build (invariant stripped) blanked the page with
// "Cannot destructure property '_' of ... as it is null".
import { describe, expect, it, vi } from "vitest";
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

  // -------------------------------------------------------------------------
  // Crash boundary (spec 060, FR-001, FR-135)
  // -------------------------------------------------------------------------

  it("catches a child render throw instead of blanking the page", () => {
    // BEHAVIOUR CHANGE, recorded deliberately (FR-135). Before spec 060 the
    // studio had no ErrorBoundary at all, so any render throw unmounted the
    // whole tree and left a white page. That is no longer true, and this test
    // exists so the change reads as intended rather than as a regression
    // someone later "fixes" by removing the boundary.
    function Exploding(): never {
      throw new Error("render exploded");
    }

    // React logs the caught error to console.error; silence it so a passing
    // test does not look like a failing one.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(
        <AppRoot>
          <Exploding />
        </AppRoot>,
      );
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps one boundary, not one per mounted tree (FR-001)", () => {
    // AppRoot wraps all three trees main.tsx renders (StudioShell, LintDemo,
    // OAuthCallbackScreen), so exactly one boundary covers them all.
    const { container } = render(
      <AppRoot>
        <p>ordinary content</p>
      </AppRoot>,
    );
    expect(container.querySelectorAll("[role='alert']")).toHaveLength(0);
    expect(container.textContent).toContain("ordinary content");
  });
});
