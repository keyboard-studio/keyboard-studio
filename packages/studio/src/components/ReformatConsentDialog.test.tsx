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

  const summary = {
    path: "source/kb.keyman-touch-layout",
    creating: false,
    unreadable: false,
    layersAdded: ["shift", "numeric", "symbols"],
    layersRemoved: [],
    keysBefore: 40,
    keysAfter: 52,
    orphanedRules: 3,
    orphanedDrafts: 1,
    alsoWrites: [],
  };

  it("asks about the touch layout, not a reformat, when a replacement is set: no file list, the orphaned rules and drafts, a listed set of layers", () => {
    render(<ReformatConsentDialog open files={["source/kb.keyman-touch-layout"]} touchReplacement={summary} onConsent={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Replace the touch layout?" })).toBeTruthy();
    expect(screen.queryByTestId("reformat-consent-files")).toBeNull();
    expect(screen.getByTestId("touch-replace-keys").textContent).toMatch(/40 now, 52 after/);
    expect(screen.getByTestId("touch-replace-layers-added").textContent).toMatch(/shift, numeric, and symbols/);
    expect(screen.getByTestId("touch-replace-orphaned-rules").textContent).toMatch(/3 rules refer to touch keys the new layout does not have; they will no longer apply/);
    expect(screen.getByTestId("touch-replace-orphaned-drafts").textContent).toMatch(/1 touch placement in progress/);
  });

  it("an unreadable file is stated, not shown as 0 keys; nothing orphaned shows no line", () => {
    render(
      <ReformatConsentDialog
        open
        files={[]}
        touchReplacement={{ ...summary, unreadable: true, keysBefore: 0, orphanedRules: 0, orphanedDrafts: 0, alsoWrites: ["source/kb.kmn"] }}
        onConsent={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByTestId("touch-replace-keys").textContent).toMatch(/cannot be read/);
    expect(screen.getByTestId("touch-replace-keys").textContent).not.toMatch(/0 now/);
    expect(screen.queryByTestId("touch-replace-orphaned-rules")).toBeNull();
    expect(screen.getByTestId("touch-replace-also").textContent).toContain("source/kb.kmn");
  });
});
