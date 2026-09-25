// The Convenience letters gate against REAL data, pinned from both sides.
//
// ConvenienceCharsStep.test.tsx covers the gate's logic with hand-built
// letter sets and a stubbed CLDR lookup. That cannot catch a regression that
// makes the silent skip permanent — a gate condition that never opens for any
// real input — because every input there is chosen to open it. Nothing else
// renders the step either: the journey corpus replays it as a no-op and the
// Playwright helper only clicks Continue if the screen happened to show.
//
// So this suite runs the real pieces end to end: the real basic_kbdus source
// parsed through the codec, the real useCarveNeededSet hook, and the real
// offline exemplar lookup (no services mock).
//
//   - Opens: Samoan has no exemplar data, so the needed set is the confirmed
//     alphabet alone and basic_kbdus leaves nine surplus letter pairs. The
//     question must render them, and the letters the author keeps must reach
//     the carve gallery's needed set (kept letters are not proposed for
//     removal; an un-ticked one still is).
//   - Stays shut: English's exemplars cover every basic-Latin letter, so the
//     step must complete without painting a screen and record why.
//
// Which languages open the gate at all is narrower than it looks: the needed
// set includes the exemplar AUXILIARY tier, which for most CLDR/SLDR locales
// lists the whole basic-Latin alphabet as loanword letters. A language with
// exemplar data therefore rarely has a surplus basic-Latin letter on this
// base, which is why the positive case uses a language with none.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createVirtualFS, type KeyboardIR, type SurveyPhaseResult } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { classifyRemovalCapabilities, parseKmn } from "@keyboard-studio/engine";
import { render } from "../../src/test/renderWithI18n.tsx";
import { ConvenienceCharsStep } from "../../src/survey/convenience/ConvenienceCharsStep.tsx";
import { CarveGalleryV2 } from "../../src/editors/carve/CarveGalleryV2.tsx";
import { useWorkingCopyStore } from "../../src/stores/workingCopyStore.ts";
import { useSurveyAnswerStore } from "../../src/stores/surveyAnswerStore.ts";
import { useSurveySessionStore } from "../../src/stores/surveySessionStore.ts";

const KMN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "fixtures", "walkBases", "release", "basic", "basic_kbdus", "source", "basic_kbdus.kmn",
);

/** The real basic_kbdus source, parsed through the codec. */
function basicKbdusIR(): KeyboardIR {
  return parseKmn(readFileSync(KMN_PATH, "utf8"), "basic_kbdus").ir;
}

/** Instantiate basic_kbdus the way choose_base does, for the given language and alphabet. */
function seed(bcp47: string, bases: string[]): void {
  const ir = basicKbdusIR();
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, {
    vfs: createVirtualFS(),
    ir,
    removalCapabilities: classifyRemovalCapabilities(ir),
  });
  useWorkingCopyStore.getState().setIdentity({ bcp47 });
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: { bases, marks: [], attestedStacks: [], declaredRoles: {} },
  });
}

/** Samoan's letters, plus the ʻokina. */
const SAMOAN_BASES = [..."aeioufglmnpstvhkr", "ʻ"];
/** basic_kbdus letters Samoan does not use. */
const SAMOAN_SURPLUS = [..."bcdjqwxyz"];

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  useSurveySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("Convenience letters gate, real data: opens for a surplus-letter orthography", () => {
  it("renders every surplus letter pair basic_kbdus leaves over Samoan's alphabet", async () => {
    seed("sm", SAMOAN_BASES);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await screen.findByTestId("convenience-chars");
    expect(onComplete).not.toHaveBeenCalled();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(SAMOAN_SURPLUS.length);
    for (const ch of SAMOAN_SURPLUS) {
      expect(screen.getByLabelText(`Keep ${ch} ${ch.toUpperCase()}`)).not.toBeNull();
    }
  });

  it("carries the kept letters into carve's needed set, and only those", async () => {
    seed("sm", SAMOAN_BASES);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);
    await screen.findByTestId("convenience-chars");

    // Keep everything except q/Q.
    fireEvent.click(screen.getByLabelText("Keep q Q"));
    fireEvent.click(screen.getByTestId("convenience-continue"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    const kept = SAMOAN_SURPLUS.filter((ch) => ch !== "q").flatMap((ch) => [ch, ch.toUpperCase()]);
    expect([...(result.retainedConvenienceChars ?? [])].sort()).toEqual([...kept].sort());

    act(() => {
      useWorkingCopyStore.getState().recordPhase(result);
    });
    expect([...(useWorkingCopyStore.getState().session.retainedConvenienceChars ?? [])].sort())
      .toEqual([...kept].sort());

    cleanup();
    render(<CarveGalleryV2 onComplete={vi.fn()} />);
    const suggested = await screen.findByTestId("carve-v2-suggested-group");
    const proposed = within(suggested)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "");

    // The un-ticked letter is still proposed for removal...
    expect(proposed.some((label) => label.startsWith("q —"))).toBe(true);
    // ...and no kept letter is.
    for (const ch of kept) {
      expect(proposed.some((label) => label.startsWith(`${ch} —`))).toBe(false);
    }
  });
});

describe("Convenience letters gate, real data: stays shut when there is no surplus", () => {
  it("completes without rendering for English on basic_kbdus, recording no-surplus", async () => {
    seed("en", [..."abcdefghijklmnopqrstuvwxyz"]);
    const onComplete = vi.fn();
    render(<ConvenienceCharsStep onComplete={onComplete} />);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("convenience-chars")).toBeNull();
    const result = onComplete.mock.calls[0]?.[0] as SurveyPhaseResult;
    expect(result.retainedConvenienceChars).toBeUndefined();
    expect(useSurveyAnswerStore.getState().steps["convenience"]?.status).toMatchObject({
      kind: "not-asked",
      reason: { code: "convenience-no-surplus" },
    });
  });
});
