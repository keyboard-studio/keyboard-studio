import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ReformatConsentDialog } from "./ReformatConsentDialog.tsx";

afterEach(cleanup);

describe("ReformatConsentDialog", () => {
  it("names each file in a named modal dialog", () => {
    render(
      <ReformatConsentDialog open files={["source/kb.kmn", "source/other.kmn"]} onConsent={() => undefined} onCancel={() => undefined} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Reformat files?" });
    expect(dialog).toBeTruthy();
    expect(screen.getByText("source/kb.kmn")).toBeTruthy();
    expect(screen.getByText("source/other.kmn")).toBeTruthy();
  });

  it("agrees and keeps through real buttons", () => {
    const onConsent = vi.fn();
    const onCancel = vi.fn();
    render(<ReformatConsentDialog open files={["source/kb.kmn"]} onConsent={onConsent} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("reformat-consent-agree"));
    expect(onConsent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("reformat-consent-keep"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(<ReformatConsentDialog open={false} files={["source/kb.kmn"]} onConsent={() => undefined} onCancel={() => undefined} />);
    expect(screen.queryByTestId("reformat-consent-dialog")).toBeNull();
  });
});
