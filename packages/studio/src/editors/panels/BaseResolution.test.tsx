// DOM tests for the BaseResolution layout: the search bar sits at the TOP of
// the step (above the suggestion cards), searches the suggested bases by
// default, and can be widened to the full catalog via the scope toggle or the
// picker's zero-match "Search all keyboards" action.
//
// (The suggestBases() ranking itself is covered white-box in
// components/BaseResolution.test.tsx.)
//
// Preview-before-commit contract (this change): BaseResolution is now a
// CONTROLLED component. There is no `onResolved` — a suggestion-card / search
// pick fires `onPreview(base)` and does NOT advance the wizard; the single
// "Choose this keyboard" button fires `onConfirm()`. Because the previewed
// base is a prop (`previewedBase`), most tests below render via a small
// stateful wrapper that stores the previewed base from `onPreview` and feeds
// it back in — mirroring how other controlled-component tests in this repo
// (e.g. BaseKeyboardPicker.test.tsx) drive a controlled `value`/`onChange` pair.

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { useState } from "react";
import { screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { sampleBaseKeyboards } from "@keyboard-studio/contracts/fixtures";

// jsdom does not implement scrollIntoView — stub it out globally.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Service mock — both BaseResolution and the embedded BaseKeyboardPicker load
// bases via getBaseBrowserService().listAll().
vi.mock("../../lib/services.ts", () => ({
  getBaseBrowserService: () => ({ listAll: () => Promise.resolve(sampleBaseKeyboards) }),
  // spec 076 FR-008: defaults every base to "unknown" (no badge) unless a
  // test overrides it — see the "documentation badge" describe block below.
  getBaseDocProfile: vi.fn().mockResolvedValue({
    level: "unknown",
    members: [],
    welcomeConvention: "absent",
    hasUsableDescription: false,
    welcomeImages: [],
  }),
  USE_REAL: false,
}));

import { BaseResolution, type BaseResolutionProps } from "./BaseResolution.tsx";
import {
  _resetCorpusCacheForTesting,
  _setCorpusCacheForTesting,
} from "../../components/BaseKeyboardPicker.tsx";
import { getBaseDocProfile } from "../../lib/services.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

const getBaseDocProfileMock = getBaseDocProfile as unknown as ReturnType<typeof vi.fn>;

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
  useWorkingCopyStore.setState({ baseDocProfile: null });
});

// ha-Latn target: sil_euro_latin is a language-match, basic_kbdus the fallback;
// sil_devanagari_phonetic (script Deva, no "ha") is NOT suggested.
const TARGET = { script: "Latn", bcp47: "ha-Latn" } as const;

type ControlledOverrides = Partial<
  Omit<BaseResolutionProps, "target" | "onPreview" | "previewedBase">
> & {
  onPreview?: (base: BaseKeyboard | null) => void;
};

/**
 * Stateful wrapper reproducing the real caller's controlled-prop wiring
 * (BaseResolutionAdapter): `previewedBase` is owned by the wrapper, updated by
 * `onPreview`, and fed back in. `onConfirm` and `previewStatus` default to
 * spy/"ready" but are overridable per test (e.g. to assert the disabled states).
 */
function ControlledBaseResolution({
  onConfirm = vi.fn(),
  onPreview: onPreviewSpy,
  previewStatus = "ready",
  onBack,
}: ControlledOverrides) {
  const [previewedBase, setPreviewedBase] = useState<BaseKeyboard | null>(null);
  return (
    <BaseResolution
      target={TARGET}
      previewedBase={previewedBase}
      onPreview={(base) => {
        setPreviewedBase(base);
        onPreviewSpy?.(base);
      }}
      onConfirm={onConfirm}
      previewStatus={previewedBase === null ? "idle" : previewStatus}
      {...(onBack ? { onBack } : {})}
    />
  );
}

function renderControlled(overrides: ControlledOverrides = {}) {
  const onPreview = overrides.onPreview ?? vi.fn();
  const onConfirm = overrides.onConfirm ?? vi.fn();
  render(<ControlledBaseResolution {...overrides} onPreview={onPreview} onConfirm={onConfirm} />);
  return { onPreview, onConfirm };
}

async function waitForCombobox() {
  return waitFor(() => screen.getByRole("combobox"));
}

describe("BaseResolution — search bar at the top", () => {
  it("renders the search combobox BEFORE the suggestion cards in document order", async () => {
    renderControlled();
    const input = await waitForCombobox();
    const firstCard = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    // input precedes firstCard in the DOM
    expect(
      input.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("defaults the search scope to Suggested (aria-pressed)", async () => {
    renderControlled();
    await waitForCombobox();
    expect(screen.getByTestId("search-scope-suggested").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("search-scope-all").getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the Back button at the top, BEFORE the search combobox", async () => {
    const onBack = vi.fn();
    renderControlled({ onBack });
    const input = await waitForCombobox();
    const back = screen.getByTestId("base-back");
    expect(
      back.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders no Back button when onBack is not provided", async () => {
    renderControlled();
    await waitForCombobox();
    expect(screen.queryByTestId("base-back")).toBeNull();
  });
});

describe("BaseResolution — suggested scope vs all keyboards", () => {
  it("a non-suggested keyboard is not searchable until the scope is widened", async () => {
    renderControlled();
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
    renderControlled();
    const input = await waitForCombobox();

    fireEvent.click(screen.getByTestId("search-scope-all"));
    expect(screen.getByTestId("search-scope-all").getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(input, { target: { value: "devanagari" } });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.some((o) => o.textContent?.includes("SIL Devanagari"))).toBe(true);
    });
  });

  it("committing a search pick previews it, then confirming fires onConfirm (not the pick itself)", async () => {
    const { onPreview, onConfirm } = renderControlled();
    const input = await waitForCombobox();

    fireEvent.change(input, { target: { value: "euro" } });
    await waitFor(() => screen.getAllByRole("option"));
    const euroOption = screen
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("SIL Euro Latin"));
    expect(euroOption).toBeDefined();
    fireEvent.click(euroOption!);

    // The pick previews — onConfirm has NOT fired yet.
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sil_euro_latin" }),
    );
    expect(onConfirm).not.toHaveBeenCalled();

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("BaseResolution — preview-before-commit (suggestion cards)", () => {
  it("clicking a suggestion card previews it (highlights + enables the button) without advancing", async () => {
    const { onPreview, onConfirm } = renderControlled();
    await waitForCombobox();

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sil_euro_latin" }),
    );
    // Preview alone never fires onConfirm / advances the wizard.
    expect(onConfirm).not.toHaveBeenCalled();

    await waitFor(() => {
      expect((screen.getByTestId("base-confirm") as HTMLButtonElement).disabled).toBe(false);
    });
    // Selected card gets the highlight styling (accent border).
    await waitFor(() => {
      expect(screen.getByTestId("base-card-sil_euro_latin").style.border).toContain(
        "var(--app-accent)",
      );
    });
  });

  it("the confirm button is disabled when nothing has been previewed", async () => {
    renderControlled();
    await waitForCombobox();
    expect((screen.getByTestId("base-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking the confirm button after a preview fires onConfirm exactly once", async () => {
    const { onConfirm } = renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("previewStatus='error' disables the confirm button even with a base previewed", async () => {
    const { onConfirm } = renderControlled({ previewStatus: "error" });
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(true));

    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Follow-up fix on PR #1174: the confirm button is now gated on
  // previewStatus === "ready" — DISABLED for idle, loading, AND error, so an
  // author can only commit a base they have actually been able to
  // preview/test. This closes the confirm-while-loading -> subsequent-
  // compile-error race at the source: there is no path from "clicked
  // confirm" to "advanced onto a base whose compile then fails".
  it("previewStatus='loading' shows the preparing affordance and keeps the button DISABLED", async () => {
    const { onConfirm } = renderControlled({ previewStatus: "loading" });
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    // Disabled while loading — this is the guard that makes the
    // mid-compile-commit race structurally unreachable via the UI.
    await waitFor(() => expect(confirm.disabled).toBe(true));
    expect(confirm.textContent).toContain("Preparing preview");

    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("previewStatus='ready' enables the confirm button and clicking it fires onConfirm", async () => {
    const { onConfirm } = renderControlled({ previewStatus: "ready" });
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    expect(confirm.textContent).toBe("Choose this keyboard");

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("previewStatus='idle' (no preview yet) keeps the button disabled", async () => {
    const { onConfirm } = renderControlled({ previewStatus: "idle" });
    await waitForCombobox();

    // No card clicked — previewedBase stays null, previewStatus stays "idle".
    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// spec 076 FR-008 — documentation-completeness badge (T034 wiring, T035 render)
// ---------------------------------------------------------------------------

const FULL_PROFILE = {
  level: "full" as const,
  members: ["welcome-htm" as const],
  welcomeConvention: "folder" as const,
  hasUsableDescription: true,
  welcomeImages: [],
};

const UNKNOWN_PROFILE = {
  level: "unknown" as const,
  members: [],
  welcomeConvention: "absent" as const,
  hasUsableDescription: false,
  welcomeImages: [],
};

describe("BaseResolution — documentation badge (spec 076 FR-008)", () => {
  it("does not request a doc profile until a base is previewed", async () => {
    renderControlled();
    await waitForCombobox();
    expect(getBaseDocProfileMock).not.toHaveBeenCalled();
  });

  it("requests, then renders, the badge for a base classified 'full' once previewed", async () => {
    getBaseDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    expect(getBaseDocProfileMock).toHaveBeenCalledWith("sil_euro_latin");
    await waitFor(() => {
      expect(within(card).getByText("Full documentation")).toBeTruthy();
    });
  });

  it("renders no badge for a base whose profile resolves to 'unknown'", async () => {
    getBaseDocProfileMock.mockResolvedValueOnce(UNKNOWN_PROFILE);
    renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    await waitFor(() => expect(getBaseDocProfileMock).toHaveBeenCalledWith("sil_euro_latin"));
    // Give the (resolved) promise a tick, then assert no doc-level text ever appears.
    await Promise.resolve();
    expect(within(card).queryByText(/documentation/i)).toBeNull();
  });

  it("re-focusing the same card does not refetch (cached per base id)", async () => {
    getBaseDocProfileMock.mockResolvedValue(FULL_PROFILE);
    renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);
    await waitFor(() => expect(getBaseDocProfileMock).toHaveBeenCalledTimes(1));

    const otherCard = await waitFor(() => screen.getByTestId("base-card-basic_kbdus"));
    fireEvent.click(otherCard);
    fireEvent.click(card);

    // Only the FIRST focus of sil_euro_latin fetched; basic_kbdus fetched once too.
    await waitFor(() => expect(getBaseDocProfileMock).toHaveBeenCalledTimes(2));
  });

  it("commits the previewed base's profile to the working copy at SELECTION (confirm)", async () => {
    getBaseDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    const { onConfirm } = renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);
    await waitFor(() => expect(getBaseDocProfileMock).toHaveBeenCalledWith("sil_euro_latin"));
    // Let the profile land in the hook's cache before confirming.
    await waitFor(() => {
      expect(within(card).getByText("Full documentation")).toBeTruthy();
    });

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useWorkingCopyStore.getState().baseDocProfile).toEqual(FULL_PROFILE);
  });

  it("writes null (never an 'unknown' profile object) when confirming before the fetch resolves", async () => {
    // Never resolves within the test — confirm fires before any profile lands.
    getBaseDocProfileMock.mockReturnValueOnce(new Promise(() => {}));
    renderControlled();
    await waitForCombobox();

    const card = await waitFor(() => screen.getByTestId("base-card-sil_euro_latin"));
    fireEvent.click(card);

    const confirm = screen.getByTestId("base-confirm") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    expect(useWorkingCopyStore.getState().baseDocProfile).toBeNull();
  });
});
