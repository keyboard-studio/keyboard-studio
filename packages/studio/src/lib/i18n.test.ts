// Region-specific locale resolution (spec 046 T032). SUPPORTED_LOCALES is
// language-only today (en, fr) — these tests exercise the exact-tag -> base-
// language -> default chain via resolveInitialLocale(), the same public
// surface LocaleSwitcher.test.tsx already covers for the saved-choice path.
//
// NOTE: like LocaleSwitcher.test.tsx, this touches localStorage — on local
// Node >= 22 that needs NODE_OPTIONS="--localstorage-file=..." (see
// docs/i18n-spike.md); CI (Node 22, no flag) is unaffected.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveInitialLocale } from "./i18n.ts";

function setBrowserLanguage(tag: string): void {
  Object.defineProperty(navigator, "language", {
    value: tag,
    configurable: true,
  });
}

describe("resolveInitialLocale — region-specific fallback chain", () => {
  const originalLanguage = navigator.language;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    setBrowserLanguage(originalLanguage);
  });

  it("matches an exact supported tag", () => {
    setBrowserLanguage("fr");
    expect(resolveInitialLocale()).toBe("fr");
  });

  it("falls through a region-qualified tag to its base language (fr-CA -> fr)", () => {
    setBrowserLanguage("fr-CA");
    expect(resolveInitialLocale()).toBe("fr");
  });

  it("falls through to the default locale when neither the tag nor its base language is supported (pt-BR -> pt -> en)", () => {
    setBrowserLanguage("pt-BR");
    expect(resolveInitialLocale()).toBe("en");
  });

  it("is case-insensitive", () => {
    setBrowserLanguage("FR-CA");
    expect(resolveInitialLocale()).toBe("fr");
  });

  it("a saved choice still wins over browser detection", () => {
    setBrowserLanguage("pt-BR");
    localStorage.setItem("ks.locale", "fr");
    expect(resolveInitialLocale()).toBe("fr");
  });
});

// The `localeReady` failure-swallowing contract (spec 046 T039). A returning
// non-English visitor whose catalog fetch fails (chunk 404 after a deploy, a
// transient network error) must NOT get a boot-blocking rejection: English is
// already active, so `localeReady` resolves regardless. main.tsx awaits it
// before the first render, so a rejection here would hang the whole app.
describe("localeReady — swallows a failed catalog fetch", () => {
  const originalLanguage = navigator.language;

  afterEach(() => {
    localStorage.clear();
    setBrowserLanguage(originalLanguage);
    vi.resetModules();
    vi.doUnmock("../locales/fr/messages.json?lingui");
  });

  it("resolves (never rejects) when the target locale's catalog import fails", async () => {
    // Pick a non-default locale so the bootstrap actually attempts the async
    // catalog load (the English-only path is a bare Promise.resolve()).
    localStorage.setItem("ks.locale", "fr");
    vi.doMock("../locales/fr/messages.json?lingui", () => {
      throw new Error("simulated chunk load failure");
    });

    // Re-import the module fresh so its top-level `localeReady` is constructed
    // under the mock. `.resolves` (not just not-rejecting) is the contract.
    vi.resetModules();
    const mod = await import("./i18n.ts");
    await expect(mod.localeReady).resolves.toBeUndefined();
  });
});
