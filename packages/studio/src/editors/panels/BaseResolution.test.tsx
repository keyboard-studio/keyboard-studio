// DOM tests for the BaseResolution layout: the search bar sits at the TOP of
// the step (above the suggestion cards), searches the suggested bases by
// default, and can be widened to the full catalog via the scope toggle or the
// picker's zero-match "Search all keyboards" action.
//
// (The suggestBases() ranking itself is covered white-box in
// components/BaseResolution.test.tsx.)

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

import { sampleBaseKeyboards } from "@keyboard-studio/contracts/fixtures";

// jsdom does not implement scrollIntoView — stub it out globally.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Service mock — both BaseResolution and the embedded BaseKeyboardPicker load
// bases via getBaseBrowserService().listAll().
vi.mock("../../lib/services.ts", () => ({
  getBaseBrowserService: () => ({ listAll: () => Promise.resolve(sampleBaseKeyboards) }),
  USE_REAL: false,
}));

import { BaseResolution } from "./BaseResolution.tsx";
import {
  _resetCorpusCacheForTesting,
  _setCorpusCacheForTesting,
} from "../../components/BaseKeyboardPicker.tsx";

beforeEach(() => {
  // Seed the picker's corpus cache so loadCorpus() never performs its dynamic
  // import (worker-fragile when co-scheduled — see the #829 note in
  // BaseKeyboardPicker.test.tsx). Badges are irrelevant to these tests.
  _setCorpusCacheForTesting(new Map());
});

afterEach(() => {
  cleanup();
  _resetCorpusCacheForTesting();
  vi.clearAllMocks();
});

// ha-Latn target: sil_euro_latin is a language-match, basic_kbdus the fallback;
// sil_devanagari_phonetic (script Deva, no "ha") is NOT suggested.
const TARGET = { script: "Latn", bcp47: "ha-Latn" } as const;

function renderStep() {
  const onResolved = vi.fn();
  render(<BaseResolution target={TARGET} onResolved={onResolved} />);
  return { onResolved };
}

async function waitForCombobox() {
  return waitFor(() => screen.getByRole("combobox"));
}

describe("BaseResolution — search bar at the top", () => {
  it("renders the search combobox BEFORE the suggestion cards in document order", async () => {
    renderStep();
    const input = await waitForCombobox();
    const firstCard = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    // input precedes firstCard in the DOM
    expect(
      input.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("defaults the search scope to Suggested (aria-pressed)", async () => {
    renderStep();
    await waitForCombobox();
    expect(screen.getByTestId("search-scope-suggested").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("search-scope-all").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("BaseResolution — suggested scope vs all keyboards", () => {
  it("a non-suggested keyboard is not searchable until the scope is widened", async () => {
    renderStep();
    const input = await waitForCombobox();

    // sil_devanagari_phonetic is in the catalog but not suggested for ha-Latn
    fireEvent.change(input, { target: { value: "devanagari" } });
    const searchAllBtn = await waitFor(() =>
      screen.getByRole("button", { name: /search all keyboards/i }),
    );

    // Widen via the zero-match action — scope toggle flips and the option appears
    fireEvent.click(searchAllBtn);
    await waitFor(() => {
      expect(screen.getByTestId("search-scope-all").getAttribute("aria-pressed")).toBe("true");
      const options = screen.getAllByRole("option");
      expect(options.some((o) => o.textContent?.includes("SIL Devanagari"))).toBe(true);
    });
  });

  it("the All keyboards toggle widens the scope directly", async () => {
    renderStep();
    const input = await waitForCombobox();

    fireEvent.click(screen.getByTestId("search-scope-all"));
    expect(screen.getByTestId("search-scope-all").getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(input, { target: { value: "devanagari" } });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.some((o) => o.textContent?.includes("SIL Devanagari"))).toBe(true);
    });
  });

  it("committing a search pick and confirming resolves the base", async () => {
    const { onResolved } = renderStep();
    const input = await waitForCombobox();

    fireEvent.change(input, { target: { value: "euro" } });
    await waitFor(() => screen.getAllByRole("option"));
    const euroOption = screen
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("SIL Euro Latin"));
    expect(euroOption).toBeDefined();
    fireEvent.click(euroOption!);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    expect(onResolved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sil_euro_latin" }),
    );
  });
});
