// LocaleSwitcher tests (spec 045 P1).
//
// NOTE: these exercise localStorage. On local Node >= 22 the native localStorage
// shadows jsdom's and is unavailable without --localstorage-file, so this file
// fails at setup locally unless you run e.g.
//   NODE_OPTIONS="--localstorage-file=.ls-tmp.db" pnpm exec vitest run <file>
// CI (Node 22, no flag) is unaffected — see docs/i18n-spike.md.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LocaleSwitcher } from "./LocaleSwitcher.tsx";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { loadSavedLocale, resolveInitialLocale } from "../lib/i18n.ts";

function renderSwitcher() {
  return render(
    <I18nProvider i18n={i18n}>
      <LocaleSwitcher />
    </I18nProvider>,
  );
}

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.load("en", enMessages);
    i18n.activate("en");
  });

  afterEach(() => {
    cleanup();
    // Reset shared state so nothing leaks into other suites (matters under the
    // local --localstorage-file workaround, where the store is process-wide).
    localStorage.clear();
    i18n.activate("en");
  });

  it("shows the active locale and lists every supported locale", () => {
    renderSwitcher();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("en");
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Français" })).toBeTruthy();
  });

  it("persists the choice and activates the locale on selection", async () => {
    renderSwitcher();
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "fr" } });

    // Persisted synchronously…
    expect(loadSavedLocale()).toBe("fr");
    // …and the (async) catalog load flips the active locale.
    await waitFor(() => expect(i18n.locale).toBe("fr"));
  });

  it("renders the field label translated once French is active", async () => {
    renderSwitcher();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    await waitFor(() => expect(i18n.locale).toBe("fr"));
    // "Language" -> "Langue" from the fr catalog.
    expect(screen.getByText("Langue")).toBeTruthy();
  });

  it("resolveInitialLocale prefers the saved choice", () => {
    localStorage.setItem("ks.locale", "fr");
    expect(resolveInitialLocale()).toBe("fr");
  });
});
