// Tests for PrivacyScreen (spec 095): the notice carries the required
// substance — the three-part structure, the identity collection stated
// plainly, the private-route signposting, and the complaint route.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PrivacyScreen, PrivacyLink } from "./PrivacyScreen.tsx";
import { navigateTo } from "../lib/navigate.ts";

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));
const mockedNavigateTo = vi.mocked(navigateTo);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrivacyScreen", () => {
  it("renders the device / servers / public structure with the update date", () => {
    render(<PrivacyScreen />);
    expect(screen.getByText("On your device")).toBeTruthy();
    expect(screen.getByText("On our servers")).toBeTruthy();
    expect(screen.getByText(/Public — only when you act/)).toBeTruthy();
    expect(screen.getByText(/Last updated 2026-10-14/)).toBeTruthy();
  });

  it("states the identity collection plainly (Gmail address, GitHub id)", () => {
    render(<PrivacyScreen />);
    expect(screen.getByText(/your email address \(your Gmail address\)/)).toBeTruthy();
    expect(screen.getByText(/GitHub user\s+id and username/)).toBeTruthy();
  });

  it("states the submission permanence and the affirmative negatives", () => {
    render(<PrivacyScreen />);
    expect(screen.getByText(/permanent public history/)).toBeTruthy();
    expect(screen.getByText(/We set no cookies\./)).toBeTruthy();
    expect(screen.getByText(/We run no analytics or tracking today\./)).toBeTruthy();
  });

  it("signposts the private GitHub route with a working external link", () => {
    render(<PrivacyScreen />);
    const link = screen.getByRole("link", { name: /open the private reporting route/i });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/keyboard-studio/keyboard-studio/security/advisories/new",
    );
    expect(screen.getByText(/Information Commissioner/)).toBeTruthy();
  });
});

describe("PrivacyLink", () => {
  it("navigates to #privacy, running the before-hook first (welcome gate)", () => {
    const before = vi.fn();
    render(<PrivacyLink onBeforeNavigate={before} />);
    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(before).toHaveBeenCalledTimes(1);
    expect(mockedNavigateTo).toHaveBeenCalledWith("privacy");
  });
});
