// PunctuationStep — the punctuation page (Phase B build-list clone, scoped to
// punctuation) between the marks series and the convenience question.
//
// What matters here: the page collects ONLY punctuation (typed letters are
// declined visibly, never silently absorbed into the shared draft); the list
// is the shared phaseBDraftStore's derived `punctuation` category (so map
// picks and Phase-B leftovers arrive pre-listed); Done emits the picks as
// confirmedInventory on a phase:"C" result (never "B" — see the component's
// module header for the recordPhase shallow-merge hazard); suggestions come
// from the sourced exemplars' punctuation tier and, since spec 075, arrive
// ALREADY CHOSEN as proposed picks — the tick-to-add panel only offers a mark
// the author removed.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render, i18n } from "../../test/renderWithI18n.tsx";
import type { IRGroup, IRRule, RawKmnFragment, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { ASCII_PUNCTUATION_FLOOR } from "@keyboard-studio/engine";
import { PunctuationStep } from "./PunctuationStep.tsx";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "../../stores/phaseBDraftStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

// sourcedExemplars does a real (offline-index) lookup when unmocked;
// charactersInTier is a pure engine re-export, reproduced verbatim so the
// component sees the same tier-filter contract.
const mocks = vi.hoisted(() => ({
  inventory: null as {
    resolvedTag: string;
    source: string;
    confidence: string;
    characters: { char: string; tier: string }[];
    digraphs: string[];
  } | null,
}));
vi.mock("../../lib/services.ts", () => ({
  sourcedExemplars: async () => mocks.inventory,
  charactersInTier: (
    inv: { characters: { char: string; tier: string }[] },
    tier: string,
  ) => inv.characters.filter((c) => c.tier === tier).map((c) => c.char),
}));

function typeAndAdd(text: string): void {
  fireEvent.change(screen.getByLabelText("Punctuation to add"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
}

function lastResult(onComplete: ReturnType<typeof vi.fn>): SurveyPhaseResult {
  const call = onComplete.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as SurveyPhaseResult;
}

beforeEach(() => {
  mocks.inventory = null;
  usePhaseBDraftStore.getState().reset();
  // reset() deliberately leaves the sticky proposal decisions (`rejected`)
  // alone; clear them so a removal in one test cannot suppress a proposal in
  // the next.
  resetPhaseBDraftDecisions();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  cleanup();
  i18n.activate("en");
});

describe("PunctuationStep — type-in and Done", () => {
  it("adds typed punctuation to the list and Done emits it as phase-C confirmedInventory", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("! ?");
    expect(screen.getByText("Your punctuation (2)")).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete)).toEqual({
      phase: "C",
      answers: [],
      confirmedInventory: ["!", "?"],
    });
  });

  it("Done with nothing chosen emits an empty confirmedInventory (a valid answer, not a skip)", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    const done = screen.getByTestId("punctuation-done");
    expect(done.textContent).toContain("Continue without punctuation");
    fireEvent.click(done);
    expect(lastResult(onComplete)).toEqual({ phase: "C", answers: [], confirmedInventory: [] });
  });

  it("declines non-punctuation typed input with a visible note and keeps it OUT of the shared draft", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("a !");
    // The "!" is collected; the "a" is declined out loud — a letter absorbed
    // here would silently resurface in the Phase B alphabet.
    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
  });

  it("clicking a chip removes that pick", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    typeAndAdd("! ?");
    fireEvent.click(screen.getByRole("button", { name: /Remove !/ }));
    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["?"]);
  });
});

describe("PunctuationStep — shared draft continuity", () => {
  it("punctuation already in the shared draft (Phase B leftovers, map picks) arrives pre-listed", () => {
    usePhaseBDraftStore.getState().add("«");
    usePhaseBDraftStore.getState().add("a"); // a letter — not this page's category
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    expect(screen.getByText("Your punctuation (1)")).toBeTruthy();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    // Only the punctuation category is emitted — the letter stays Phase B's.
    expect(lastResult(onComplete).confirmedInventory).toEqual(["«"]);
  });
});

describe("PunctuationStep — sourced suggestions", () => {
  // useSourcedExemplars only looks up when the session carries a BCP47 tag.
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({
      bcp47_tag: "hi",
      language_name: "Hindi",
    });
  });

  it("the exemplar punctuation tier arrives already chosen as PROPOSED picks that keep their attribution (spec 075: defaults are the product)", async () => {
    mocks.inventory = {
      resolvedTag: "hi",
      source: "cldr",
      confidence: "high",
      characters: [
        { char: "।", tier: "punctuation" },
        { char: "क", tier: "main" }, // other tiers never seeded here
      ],
      digraphs: [],
    };
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    // Seeded on settle: a PROPOSED pick (dashed attribution), and the
    // suggestion panel has nothing left to offer.
    expect(await screen.findByTestId("proposed-punctuation-chip")).toBeTruthy();
    expect(screen.getByText("Every suggested punctuation mark is already in your list below.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add । / })).toBeNull();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["।"]);
  });

  it("renders the suggestion chip's accessible name as one full catalog sentence, not an assembled fragment", async () => {
    mocks.inventory = {
      resolvedTag: "hi",
      source: "cldr",
      confidence: "high",
      characters: [{ char: "।", tier: "punctuation" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    // The tier is seeded, so the panel only offers a mark once it is removed.
    fireEvent.click(await screen.findByRole("button", { name: /Remove । / }));
    expect(await screen.findByRole("button", { name: "Add । (U+0964)" })).toBeTruthy();
  });

  // km-triage finding on #1596: the English-only assertion above proves the
  // id/macro wiring produces the right English text, but not that a
  // translator can actually REORDER "Add X (Y)" — the real fr catalog is
  // still an untranslated stub with nothing to test against. This loads a
  // test-only locale whose message deliberately reverses the placeholder
  // order, so a real regression (an assembled fragment ignoring the
  // catalog's word order) would fail this even if the English text matched.
  it("a translator's word-order choice actually reaches the rendered name — not locked to English order", async () => {
    i18n.load("zz", {
      "survey.punctuation.suggestionChip.addAriaLabel": "({cp}) {char} dda",
    });
    i18n.activate("zz");

    mocks.inventory = {
      resolvedTag: "hi",
      source: "cldr",
      confidence: "high",
      characters: [{ char: "।", tier: "punctuation" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /Remove । / }));
    expect(await screen.findByRole("button", { name: "(U+0964) । dda" })).toBeTruthy();
  });

  it("says so when the source has no punctuation tier for the language", async () => {
    mocks.inventory = {
      resolvedTag: "hi",
      source: "cldr",
      confidence: "high",
      characters: [{ char: "क", tier: "main" }],
      digraphs: [],
    };
    render(<PunctuationStep onComplete={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No suggested punctuation/)).toBeTruthy();
    });
  });
});

describe("PunctuationStep — navigation", () => {
  it("renders a Back button only when onBack is supplied", () => {
    const { unmount } = render(<PunctuationStep onComplete={vi.fn()} />);
    expect(screen.queryByTestId("punctuation-back")).toBeNull();
    unmount();

    const onBack = vi.fn();
    render(<PunctuationStep onComplete={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("punctuation-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a second Done click never completes twice", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("punctuation-done"));
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// spec 075 US1 — CLDR punctuation arrives already chosen
// ---------------------------------------------------------------------------

/** A Hindi-flavoured tier: DEVANAGARI DANDA, DOUBLE DANDA, plus two ASCII marks. */
const HI_TIER = ["\u0964", "\u0965", "!", "?"];

function hindiInventory(tier: readonly string[] = HI_TIER) {
  return {
    resolvedTag: "hi",
    source: "cldr",
    confidence: "approved",
    characters: [
      { char: "\u0915", tier: "main" },
      ...tier.map((char) => ({ char, tier: "punctuation" })),
    ],
    digraphs: [],
  };
}

describe("PunctuationStep — FR-024: the result stays a phase-C slice", () => {
  it("reports phase C, and recording it after the alphabet leaves the phase-B inventory intact", () => {
    const wc = useWorkingCopyStore.getState();
    wc.recordPhase({ phase: "B", answers: [], confirmedInventory: ["a", "b"] });

    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);
    typeAndAdd("!");
    fireEvent.click(screen.getByTestId("punctuation-done"));
    const result = lastResult(onComplete);
    expect(result.phase).toBe("C");
    expect(result.confirmedInventory).toEqual(["!"]);

    useWorkingCopyStore.getState().recordPhase(result);
    const results = useWorkingCopyStore.getState().phaseResults;
    expect(results.find((p) => p.phase === "B")?.confirmedInventory).toEqual(["a", "b"]);
    expect(results.find((p) => p.phase === "C")?.confirmedInventory).toEqual(["!"]);
    // The merged session unions the two slices.
    expect(useWorkingCopyStore.getState().session.confirmedInventory).toEqual(["a", "b", "!"]);
  });
});

describe("PunctuationStep — seeding the CLDR tier (US1)", () => {
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "hi", language_name: "Hindi" });
  });

  it("FR-001/FR-003/SC-002: the tier is already chosen on arrival and Done with zero clicks confirms it", async () => {
    mocks.inventory = hindiInventory();
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    const group = await screen.findByTestId("cldr-punctuation-group");
    const chips = group.querySelectorAll('[data-testid="proposed-punctuation-chip"]');
    expect(chips).toHaveLength(HI_TIER.length);
    expect(screen.getByText(`Your punctuation (${HI_TIER.length})`)).toBeTruthy();

    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete)).toEqual({
      phase: "C",
      answers: [],
      confirmedInventory: HI_TIER,
    });
    // The seed is keyed by the resolved locale.
    expect(usePhaseBDraftStore.getState().seededProposals).toEqual(["punctuation:hi"]);
    expect(usePhaseBDraftStore.getState().provenance["\u0964"]).toBe("cldr");
  });

  it("FR-002: the group caption names the supplying source and the resolved locale", async () => {
    mocks.inventory = hindiInventory();
    render(<PunctuationStep onComplete={vi.fn()} />);
    const group = await screen.findByTestId("cldr-punctuation-group");
    expect(group.textContent).toMatch(/CLDR/);
    expect(group.textContent).toMatch(/Hindi/);
  });

  it("FR-004: every seeded chip is removable by the existing click gesture, with no dialog", async () => {
    mocks.inventory = hindiInventory();
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);
    await screen.findByTestId("cldr-punctuation-group");

    fireEvent.click(screen.getByRole("button", { name: /Remove !/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(`Your punctuation (${HI_TIER.length - 1})`)).toBeTruthy();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(HI_TIER.filter((c) => c !== "!"));
  });

  it("FR-005: a character the author typed before the seed keeps its author attribution and is never restyled", async () => {
    usePhaseBDraftStore.getState().add("!");
    mocks.inventory = hindiInventory();
    render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("cldr-punctuation-group");

    expect(usePhaseBDraftStore.getState().provenance["!"]).toBe("author");
    const authored = screen.getAllByTestId("authored-punctuation-chip");
    expect(authored).toHaveLength(1);
    expect(authored[0]!.textContent).toContain("!");
    // The other three tier members are proposed.
    expect(screen.getAllByTestId("proposed-punctuation-chip")).toHaveLength(HI_TIER.length - 1);
  });

  it("says why the CLDR group is absent: no exemplar data at all", async () => {
    mocks.inventory = null;
    render(<PunctuationStep onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/no exemplar data/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("cldr-punctuation-group")).toBeNull();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("says why the CLDR group is absent: the source has an empty punctuation tier — a distinct message", async () => {
    mocks.inventory = hindiInventory([]);
    render(<PunctuationStep onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/attests no punctuation/i)).toBeTruthy();
    });
    expect(screen.queryByText(/no exemplar data/i)).toBeNull();
    expect(screen.queryByTestId("cldr-punctuation-group")).toBeNull();
  });

  it("FR-023: an author who already confirmed a punctuation inventory is neither overwritten nor extended, and the seed key is still recorded", async () => {
    // A phase-C confirmedInventory recorded before this feature existed.
    useWorkingCopyStore.getState().recordPhase({ phase: "C", answers: [], confirmedInventory: ["!"] });
    usePhaseBDraftStore.getState().add("!");
    mocks.inventory = hindiInventory();
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);

    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().seededProposals).toEqual(["punctuation:hi"]);
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
    expect(screen.queryByTestId("cldr-punctuation-group")).toBeNull();
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["!"]);
  });

  it("a removed proposal reappears in the suggestion panel and ticking it again is an author override (FR-022)", async () => {
    mocks.inventory = hindiInventory();
    render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("cldr-punctuation-group");

    fireEvent.click(screen.getByRole("button", { name: /Remove !/ }));
    expect(usePhaseBDraftStore.getState().rejected).toEqual(["!"]);
    fireEvent.click(await screen.findByRole("button", { name: "Add ! (U+0021)" }));
    expect(usePhaseBDraftStore.getState().chars).toContain("!");
    expect(usePhaseBDraftStore.getState().provenance["!"]).toBe("author");
  });
});

// ---------------------------------------------------------------------------
// spec 075 US2 — base-keyboard punctuation is declared, not assumed
// ---------------------------------------------------------------------------

let ruleSeq = 0;
/** A working-copy IR whose rules statically produce exactly `chars`. */
function irProducing(chars: string, raw: RawKmnFragment[] = []) {
  const rules: IRRule[] = [...chars].map((value) => {
    ruleSeq += 1;
    return {
      nodeId: `rule#${ruleSeq}`,
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value }],
    };
  });
  const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules };
  return makeTestIR([group], [], raw);
}

/** An opaque fragment with no producedOutput sketch — base coverage unknowable. */
const OPAQUE: RawKmnFragment = {
  nodeId: "frag#opaque",
  origin: "imported",
  sourceText: "if(&x = 1) c 'y'",
  reason: "opaque test fixture",
};

function setBase(ir: ReturnType<typeof irProducing>): void {
  useWorkingCopyStore.setState({
    ir,
    baseKeyboard: {
      id: "basic_kbdus",
      path: "release/b/basic_kbdus",
      script: "Latn",
      displayName: "English (US)",
      targets: ["windows"],
      version: "1.0",
    },
  });
}

function chipsIn(group: HTMLElement): string[] {
  return Array.from(group.querySelectorAll('[data-testid$="-punctuation-chip"]')).map(
    (el) => el.querySelector("span")!.textContent!,
  );
}

describe("PunctuationStep — the base-produced group (US2)", () => {
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "hi", language_name: "Hindi" });
  });

  it("FR-006/FR-009: with complete coverage the base group is every produced punctuation char not in the CLDR group, under the base caption", async () => {
    setBase(irProducing("ab.!?"));
    mocks.inventory = hindiInventory(["\u0964", "!"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    const base = await screen.findByTestId("base-punctuation-group");
    expect(chipsIn(base).sort()).toEqual([".", "?"].sort());
    expect(base.textContent).toMatch(/base keyboard/i);
    expect(base.textContent).not.toMatch(/not fully known/i);
    expect(usePhaseBDraftStore.getState().provenance["."]).toBe("base");
    expect(usePhaseBDraftStore.getState().seededProposals).toContain("punctuation-base:basic_kbdus");
  });

  it("FR-007/FR-008: with an opaque fragment the group is the ASCII floor under the incomplete caption, and the base's real output is NOT mixed in", async () => {
    // U+061B ARABIC SEMICOLON is produced but untrustworthy: it must not appear.
    setBase(irProducing(".\u061B", [OPAQUE]));
    mocks.inventory = null;
    render(<PunctuationStep onComplete={vi.fn()} />);

    const base = await screen.findByTestId("base-punctuation-group");
    const chips = chipsIn(base);
    expect(chips.every((c) => ASCII_PUNCTUATION_FLOOR.includes(c))).toBe(true);
    // The page collects Unicode punctuation only: the floor's nine symbol
    // members ($ + < = > ^ ` | ~) are not proposed here (FR-012 item 5).
    const floorPunctuation = ASCII_PUNCTUATION_FLOOR.filter((c) => /^\p{P}$/u.test(c));
    expect([...chips].sort()).toEqual([...floorPunctuation].sort());
    expect(chips).not.toContain("$");
    expect(chips).not.toContain("\u061B");
    expect(base.textContent).toMatch(/not fully known/i);
    expect(usePhaseBDraftStore.getState().provenance["#"]).toBe("ascii-floor");
  });

  it("SC-003/FR-010: the two groups are disjoint, the count is the size of their union, and a char in both is rendered once under CLDR annotated as also produced by the base", async () => {
    setBase(irProducing(".!?"));
    mocks.inventory = hindiInventory(["\u0964", "!"]);
    render(<PunctuationStep onComplete={vi.fn()} />);

    const cldr = await screen.findByTestId("cldr-punctuation-group");
    const base = await screen.findByTestId("base-punctuation-group");
    const cldrChips = chipsIn(cldr);
    const baseChips = chipsIn(base);
    expect(cldrChips.sort()).toEqual(["\u0964", "!"].sort());
    expect(baseChips.sort()).toEqual([".", "?"].sort());
    expect(cldrChips.filter((c) => baseChips.includes(c))).toEqual([]);
    expect(screen.getByText(`Your punctuation (${cldrChips.length + baseChips.length})`)).toBeTruthy();

    // "!" is in both sources: once, under CLDR, with the annotation.
    expect(within(cldr).getByRole("button", { name: /Remove !.*also produced by the base/ })).toBeTruthy();
    expect(within(cldr).getByRole("button", { name: /Remove \u0964/ }).getAttribute("aria-label")).not.toMatch(
      /also produced/,
    );
    expect(screen.getAllByRole("button", { name: /Remove !/ })).toHaveLength(1);
  });

  it("FR-011: the missing-side count of the chosen punctuation is visible before Done", async () => {
    setBase(irProducing(".!?"));
    mocks.inventory = hindiInventory(["\u0964", "\u0965", "!"]);
    render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("base-punctuation-group");

    // DANDA and DOUBLE DANDA are chosen but the base cannot type them.
    const count = screen.getByTestId("punctuation-missing-count");
    expect(count.textContent).toMatch(/^2 of these/);

    // Removing one of them updates the count; removing the other zeroes it.
    fireEvent.click(screen.getByRole("button", { name: /Remove \u0964/ }));
    expect(screen.getByTestId("punctuation-missing-count").textContent).toMatch(/^1 of these/);
    fireEvent.click(screen.getByRole("button", { name: /Remove \u0965/ }));
    expect(screen.getByTestId("punctuation-missing-count").textContent).toMatch(/already on the base keyboard/);
  });

  it("the base caption carries the always-keep note: removing here declares unsupported, but the base layout still types it", async () => {
    setBase(irProducing(".!?"));
    mocks.inventory = null;
    render(<PunctuationStep onComplete={vi.fn()} />);
    const base = await screen.findByTestId("base-punctuation-group");
    expect(within(base).getByText(/still types it/)).toBeTruthy();
  });

  it("FR-023: the base group is not seeded either when a phase-C inventory already exists", async () => {
    useWorkingCopyStore.getState().recordPhase({ phase: "C", answers: [], confirmedInventory: [] });
    setBase(irProducing(".!?"));
    mocks.inventory = null;
    render(<PunctuationStep onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().seededProposals).toContain("punctuation-base:basic_kbdus");
    });
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(screen.queryByTestId("base-punctuation-group")).toBeNull();
  });

  it("with no working copy at all, no base group is proposed (the floor is a fallback for an unknowable base, not for a missing one)", async () => {
    mocks.inventory = hindiInventory(["!"]);
    render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("cldr-punctuation-group");
    expect(screen.queryByTestId("base-punctuation-group")).toBeNull();
    expect(screen.queryByTestId("punctuation-missing-count")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 075 US3 — format characters are handed to the invisibles step
// ---------------------------------------------------------------------------

describe("PunctuationStep — format-character hand-off (FR-016, FR-021, FR-025)", () => {
  it("a typed single format character is recorded as an accepted invisible, kept out of chars, and announced with a status note — no navigation", () => {
    const onComplete = vi.fn();
    render(<PunctuationStep onComplete={onComplete} />);
    typeAndAdd("\u200D");

    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200D"]).toBe("accepted");
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    const note = screen.getByTestId("punctuation-handoff-note");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toMatch(/U\+200D/);
    expect(note.textContent).toMatch(/Invisible characters/);
    // Still on this page: Done is right here and nothing navigated away.
    expect(screen.getByTestId("punctuation-step")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    // The accepted invisible rides along in the phase-C inventory on Done.
    fireEvent.click(screen.getByTestId("punctuation-done"));
    expect(lastResult(onComplete).confirmedInventory).toEqual(["\u200D"]);
  });

  it("punctuation and a format character added in turn are each routed: the mark is chosen, the invisible is handed off", () => {
    render(<PunctuationStep onComplete={vi.fn()} />);
    // Typed together, "! " + ZWNJ would segment as one cluster (ZWNJ is a
    // grapheme extender) and be declined as a mixed cluster — see the next
    // test. Added in turn, each takes its own route.
    typeAndAdd("!");
    typeAndAdd("\u200C");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["!"]);
    expect(usePhaseBDraftStore.getState().invisibleDecisions["U+200C"]).toBe("accepted");
    expect(screen.getByTestId("punctuation-handoff-note")).toBeTruthy();
    expect(screen.queryByTestId("punctuation-declined-cluster")).toBeNull();
  });

  it("a PUNCTUATION mark fused with a format character is declined too — glyphCategory reads the cluster as punctuation, and that must not smuggle the ZWNJ in", () => {
    render(<PunctuationStep onComplete={vi.fn()} />);
    typeAndAdd("!\u200C");
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(usePhaseBDraftStore.getState().punctuation).toEqual([]);
    expect(usePhaseBDraftStore.getState().invisibleDecisions).toEqual({});
    const note = screen.getByTestId("punctuation-declined-cluster");
    expect(note.textContent).toMatch(/U\+0021 U\+200C/);
  });

  it("a multi-codepoint cluster containing a format character is neither split nor filed — it is declined with a reason", () => {
    render(<PunctuationStep onComplete={vi.fn()} />);
    // ZWNJ is a grapheme extender, so "a" + ZWNJ segments as ONE cluster.
    typeAndAdd("a\u200C");
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
    expect(usePhaseBDraftStore.getState().invisibleDecisions).toEqual({});
    const note = screen.getByTestId("punctuation-declined-cluster");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toMatch(/U\+0061 U\+200C/);
    expect(note.textContent).toMatch(/neither split up nor added/);
    expect(screen.queryByTestId("punctuation-handoff-note")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// spec 075 US4 — a rejection sticks (SC-006, FR-022)
// ---------------------------------------------------------------------------

describe("PunctuationStep — a removed proposal is never re-proposed (US4)", () => {
  beforeEach(() => {
    useSurveySessionStore.getState().setSurveyContext({ bcp47_tag: "hi", language_name: "Hindi" });
  });

  it("SC-006: removals survive a step revisit and a locale re-resolution; typing a removed mark back makes it the author's own", async () => {
    mocks.inventory = hindiInventory();
    const first = render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("cldr-punctuation-group");
    fireEvent.click(screen.getByRole("button", { name: /Remove !/ }));
    fireEvent.click(screen.getByRole("button", { name: /Remove \?/ }));
    const kept = HI_TIER.filter((c) => c !== "!" && c !== "?");
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(kept);
    expect(usePhaseBDraftStore.getState().rejected).toEqual(["!", "?"]);
    first.unmount();

    // Revisit: same locale, same seed key — nothing comes back.
    const second = render(<PunctuationStep onComplete={vi.fn()} />);
    await screen.findByTestId("cldr-punctuation-group");
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(kept);
    expect(screen.queryByRole("button", { name: /Remove !/ })).toBeNull();
    second.unmount();

    // Re-resolution: a new resolved tag fires a NEW seed — the ledger still
    // vetoes the two removed marks.
    mocks.inventory = { ...hindiInventory(), resolvedTag: "hi-IN" };
    render(<PunctuationStep onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(usePhaseBDraftStore.getState().seededProposals).toContain("punctuation:hi-IN");
    });
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(kept);

    // The override: typing a removed mark by hand restores it as the author's.
    typeAndAdd("!");
    expect(usePhaseBDraftStore.getState().punctuation).toEqual([...kept, "!"]);
    expect(usePhaseBDraftStore.getState().provenance["!"]).toBe("author");
    expect(screen.getAllByTestId("authored-punctuation-chip")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// spec 079 T027 — leave-and-return, and the phase-C answer slot's per-step
// ownership (D-4/R-08): convenience recording into the same phase must not
// erase invisibles' (or any other phase-C step's) already-recorded answers.
// ---------------------------------------------------------------------------

describe("PunctuationStep — leave and return (spec 079 FR-051)", () => {
  it("typed-in picks survive an unmount/remount with the same evidence", () => {
    const first = render(<PunctuationStep onComplete={vi.fn()} />);
    typeAndAdd("! ?");
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(["!", "?"]);
    first.unmount();

    render(<PunctuationStep onComplete={vi.fn()} />);
    expect(usePhaseBDraftStore.getState().punctuation).toEqual(["!", "?"]);
    expect(screen.getByText("Your punctuation (2)")).toBeTruthy();
  });

  it("the phase-C answer slot still holds invisibles' answers after convenience records into the same phase (D-4/R-08)", () => {
    const recordPhase = useWorkingCopyStore.getState().recordPhase;
    const invisiblesResult: SurveyPhaseResult = {
      phase: "C",
      answers: [{ questionId: "invisibles.u200c", answerType: "boolean", value: true }],
      confirmedInventory: ["‌"],
    };
    recordPhase(invisiblesResult, { stepId: "invisibles" });

    // Convenience records into the SAME phase with its own (empty) answers —
    // this must not clobber invisibles' entries.
    recordPhase({ phase: "C", answers: [] }, { stepId: "convenience" });

    const phaseC = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(phaseC).toBeDefined();
    expect(phaseC!.answers).toContainEqual(invisiblesResult.answers[0]);
  });
});
