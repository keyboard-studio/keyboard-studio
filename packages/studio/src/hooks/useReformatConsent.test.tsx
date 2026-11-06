// Open mode (spec 111 FR-009): a delivery that needs the author's agreement to
// reformat files shows the dialog, halts, and proceeds only on agreement.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ReformatConsentDialog } from "../components/ReformatConsentDialog.tsx";
import { ReformatConsentRequiredError } from "../lib/reformatConsentError.ts";
import { useReformatConsent } from "./useReformatConsent.ts";

vi.mock("../lib/serializeWorkingCopy.ts", () => ({
  projectWorkingCopyForOutput: vi.fn(),
  zipProjectedVfs: vi.fn(),
}));

afterEach(cleanup);

function Harness({ deliver }: { deliver: (consented: boolean) => Promise<string> }) {
  const consent = useReformatConsent();
  return (
    <>
      <button type="button" data-testid="go" onClick={() => void consent.guard(deliver)}>
        go
      </button>
      <ReformatConsentDialog {...consent.dialog} />
    </>
  );
}

function needsConsent(): (consented: boolean) => Promise<string> {
  return vi.fn(async (consented: boolean) => {
    if (!consented) throw new ReformatConsentRequiredError(["source/kb.kmn"]);
    return "delivered";
  });
}

describe("useReformatConsent", () => {
  it("shows the dialog naming the file and does not deliver without consent", async () => {
    const deliver = needsConsent();
    render(<Harness deliver={deliver} />);
    fireEvent.click(screen.getByTestId("go"));
    await screen.findByTestId("reformat-consent-dialog");
    expect(screen.getByText("source/kb.kmn")).toBeTruthy();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenLastCalledWith(false);
  });

  it("cancels the delivery when the author keeps the files", async () => {
    const deliver = needsConsent();
    render(<Harness deliver={deliver} />);
    fireEvent.click(screen.getByTestId("go"));
    fireEvent.click(await screen.findByTestId("reformat-consent-keep"));
    await waitFor(() => expect(screen.queryByTestId("reformat-consent-dialog")).toBeNull());
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("re-runs with consent when the author agrees", async () => {
    const deliver = needsConsent();
    render(<Harness deliver={deliver} />);
    fireEvent.click(screen.getByTestId("go"));
    fireEvent.click(await screen.findByTestId("reformat-consent-agree"));
    await waitFor(() => expect(deliver).toHaveBeenCalledTimes(2));
    expect(deliver).toHaveBeenLastCalledWith(true);
  });

  it("rethrows errors that are not consent requests", async () => {
    let caught: unknown;
    function Probe() {
      const consent = useReformatConsent();
      return (
        <button
          type="button"
          data-testid="go"
          onClick={() =>
            consent
              .guard(async () => {
                throw new Error("boom");
              })
              .catch((e: unknown) => {
                caught = e;
              })
          }
        >
          go
        </button>
      );
    }
    render(<Probe />);
    fireEvent.click(screen.getByTestId("go"));
    await waitFor(() => expect((caught as Error | undefined)?.message).toBe("boom"));
  });
});
