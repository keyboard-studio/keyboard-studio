// LdmlCompilePanel (spec 108 Story 5 scenarios 1-4, FR-072, FR-073).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";

const { build } = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("../../lib/buildOutputBundle.ts", () => ({ buildLdmlKmpForDownload: build }));

import { LdmlCompilePanel } from "./LdmlCompilePanel.tsx";

const row = { id: "5.15" } as never;
const versions = { compiler: "19.0.240-alpha", kmxPlus: 0x1100 };
const clean = { compile: { expected: [], unexpected: [], warnings: [], versions }, kmp: { bytes: new Uint8Array([80, 75]), filename: "k_ldml.kmp", warnings: [] } };

const click = async (id: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(id));
  });
};

let downloads: string[] = [];
let originalClick: typeof HTMLAnchorElement.prototype.click;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  build.mockReset();
  downloads = [];
  originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  };
  URL.createObjectURL = (() => "blob:fake") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = originalClick;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  cleanup();
});

describe("LdmlCompilePanel", () => {
  it("loads the compiler only on the click, never on render", async () => {
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    expect(build).not.toHaveBeenCalled();
    build.mockResolvedValue(clean);
    await click("ldml-compile-check");
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith("46");
  });

  it("disables compile with the TR35-only reason for a profile Keyman does not accept", () => {
    render(<LdmlCompilePanel profileId="49" keymanCompilable={false} enabled />);
    const button = screen.getByTestId("ldml-compile-check") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("ldml-compile-disabled-reason").textContent).toMatch(/TR35-only \(awaiting Keyman\)/);
    expect(button.getAttribute("aria-label")).toMatch(/TR35-only \(awaiting Keyman\)/);
    expect(screen.queryByTestId("ldml-kmp-download")).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });

  it("is disabled while the shared gate is closed", () => {
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled={false} />);
    expect((screen.getByTestId("ldml-compile-check") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the package button, the desktop-only note and both versions after a clean compile", async () => {
    build.mockResolvedValue(clean);
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    await click("ldml-compile-check");
    expect(screen.getByTestId("ldml-compile-clean")).toBeTruthy();
    expect(screen.getByTestId("ldml-kmp-desktop-note").textContent).toMatch(/desktop only/i);
    const versionsText = screen.getByTestId("ldml-compile-versions").textContent ?? "";
    expect(versionsText).toContain("19.0.240-alpha");
    expect(versionsText).toContain("17.0");
    await click("ldml-kmp-download");
    expect(downloads).toEqual(["k_ldml.kmp"]);
  });

  it("renders expected errors as known limitations, with no package button", async () => {
    build.mockResolvedValue({
      compile: {
        expected: [{ message: { code: "ERROR_Gap", severity: "error", text: "gap text" }, row }],
        unexpected: [],
        warnings: [],
        versions,
      },
    });
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    await click("ldml-compile-check");
    expect(screen.getByTestId("ldml-compile-known").textContent).toMatch(/ERROR_Gap: gap text/);
    expect(screen.queryByTestId("ldml-compile-defects")).toBeNull();
    expect(screen.queryByTestId("ldml-kmp-download")).toBeNull();
    expect(screen.getByTestId("ldml-compile-no-package")).toBeTruthy();
  });

  it("renders unexpected errors as exporter defects with the compiler text, with no package button", async () => {
    build.mockResolvedValue({
      compile: {
        expected: [],
        unexpected: [{ code: "ERROR_Surprise", severity: "error", text: "bad thing", line: 4 }],
        warnings: [],
        versions,
      },
    });
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    await click("ldml-compile-check");
    expect(screen.getByTestId("ldml-compile-defects").textContent).toMatch(/ERROR_Surprise: bad thing/);
    expect(screen.queryByTestId("ldml-compile-known")).toBeNull();
    expect(screen.queryByTestId("ldml-kmp-download")).toBeNull();
  });

  it("shows a message when the compiler cannot load and leaves the panel usable", async () => {
    build.mockRejectedValue(new Error("chunk failed."));
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    await click("ldml-compile-check");
    expect(screen.getByTestId("ldml-compile-failed").textContent).toMatch(/chunk failed\. The source download still works/);
    expect((screen.getByTestId("ldml-compile-check") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the result region is a live region filled by the click", () => {
    render(<LdmlCompilePanel profileId="46" keymanCompilable enabled />);
    expect(screen.getByTestId("ldml-compile-result").getAttribute("aria-live")).toBe("polite");
  });

  it("creates no timer (D3)", () => {
    const src = readFileSync(join(process.cwd(), "src", "components", "output", "LdmlCompilePanel.tsx"), "utf8");
    expect(src).not.toMatch(/setTimeout|setInterval|useEffect/);
  });
});
