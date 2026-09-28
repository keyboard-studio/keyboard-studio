// Tests for GuardSuggestions intent gating (spec 082 FR-020 / FR-022):
// the analysis may return suggestions, but cards surface ONLY after an
// intent signal — never on step entry. Kept guards and dismissed groups
// never reappear.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { GuardSuggestions } from "./GuardSuggestions.tsx";
import { analyzeGuardCoverage } from "./guardAnalysis.ts";
import type { MissingGuardGroup, OverBroadGuard } from "./guardAnalysis.ts";
import { groupRules } from "./ruleFamilies.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";

vi.mock("./guardAnalysis.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./guardAnalysis.ts")>();
  return { ...mod, analyzeGuardCoverage: vi.fn(() => ({ missing: [], overBroad: [] })) };
});

const mockedAnalyze = vi.mocked(analyzeGuardCoverage);

const GUARD: OverBroadGuard = {
  markKey: "K_E",
  markChar: "́",
  blockedChar: "e",
  guardRuleId: "guard-1",
  question:
    "You block the acute key after 'e', but your orthography says acute combines with e. Intentional?",
};

const GROUP: MissingGuardGroup = {
  store: "diablock",
  familyName: "Diacritic blocking",
  missing: [
    { key: "K_O", outputChar: "̧", suggestedStore: "diablock" },
  ],
};

function diablockRule(nodeId: string, vkey: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: vkey, modifiers: ["RALT"] },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

function seedIr(): void {
  const ir = {
    origin: "scaffolded",
    header: { keyboardId: "t", name: "t", bcp47: [], copyright: "", version: "1.0", targets: [], storeDirectives: [] },
    stores: [],
    groups: [
      { nodeId: "g1", name: "main", usingKeys: true, rules: [diablockRule("guard-1", "K_E")], readonly: false },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

function diablockFamilyId(): string {
  const rules = useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules) ?? [];
  const family = groupRules(rules).find((f) => f.guardStore === "diablock");
  if (family === undefined) throw new Error("test IR has no diablock family");
  return family.id;
}

beforeEach(() => {
  seedIr();
  useGuardIntentStore.getState().resetForTest();
  mockedAnalyze.mockReset();
  mockedAnalyze.mockReturnValue({ missing: [GROUP], overBroad: [GUARD] });
});

afterEach(() => {
  cleanup();
});

describe("GuardSuggestions intent gating", () => {
  it("renders nothing on step entry — suggestions wait for an intent signal", () => {
    render(<GuardSuggestions />);
    expect(screen.queryByTestId("guard-suggestions")).toBeNull();
    expect(mockedAnalyze).toHaveBeenCalled();
  });

  it("surfaces both directions after the author opens the family card", () => {
    useGuardIntentStore.getState().noteFamilyCardOpened(diablockFamilyId());
    render(<GuardSuggestions />);
    expect(screen.getByTestId("guard-suggestions")).toBeTruthy();
    expect(screen.getByTestId("overbroad-guard-guard-1")).toBeTruthy();
    expect(
      screen.getByTestId(`missing-guard-${missingGuardGroupKey(GROUP)}`),
    ).toBeTruthy();
  });

  it("surfaces after the author edits in the family", () => {
    useGuardIntentStore.getState().noteFamilyEdited(diablockFamilyId());
    render(<GuardSuggestions />);
    expect(screen.getByTestId("guard-suggestions")).toBeTruthy();
  });

  it("a block-behaviour bundle install signals broadly", () => {
    useGuardIntentStore.getState().noteBlockBundleInstalled();
    render(<GuardSuggestions />);
    expect(screen.getByTestId("guard-suggestions")).toBeTruthy();
    expect(screen.getByTestId("overbroad-guard-guard-1")).toBeTruthy();
  });

  it("a kept over-broad guard never reappears", () => {
    const intent = useGuardIntentStore.getState();
    intent.noteFamilyCardOpened(diablockFamilyId());
    intent.keepOverBroadGuard("guard-1");
    render(<GuardSuggestions />);
    expect(screen.getByTestId("guard-suggestions")).toBeTruthy();
    expect(screen.queryByTestId("overbroad-guard-guard-1")).toBeNull();
    // The missing-guard card still shows.
    expect(
      screen.getByTestId(`missing-guard-${missingGuardGroupKey(GROUP)}`),
    ).toBeTruthy();
  });

  it("a dismissed missing-guard group stays hidden", () => {
    const intent = useGuardIntentStore.getState();
    intent.noteFamilyCardOpened(diablockFamilyId());
    intent.dismissMissingGroup(missingGuardGroupKey(GROUP));
    render(<GuardSuggestions />);
    expect(screen.getByTestId("guard-suggestions")).toBeTruthy();
    expect(screen.queryByTestId(`missing-guard-${missingGuardGroupKey(GROUP)}`)).toBeNull();
    expect(screen.getByTestId("overbroad-guard-guard-1")).toBeTruthy();
  });
});
