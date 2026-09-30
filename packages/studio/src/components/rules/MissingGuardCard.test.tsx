// Tests for MissingGuardCard (spec 082 FR-020): one grouped dismissible
// card per suggestion group, per-key key + emitted-mark preview, one-tap
// "Add all" through the normal reversible working-copy path — never
// auto-applied, idempotent on re-run.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { MissingGuardCard } from "./MissingGuardCard.tsx";
import type { MissingGuardGroup } from "./guardAnalysis.ts";
import { groupRules } from "./ruleFamilies.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";

const GROUP: MissingGuardGroup = {
  store: "diablock",
  familyName: "Diacritic blocking",
  missing: [
    { key: "K_E", outputChar: "́", outputName: "COMBINING ACUTE ACCENT", suggestedStore: "diablock" },
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

function seedIr(rules: IRRule[] = [diablockRule("r1", "K_C")]): void {
  const ir = {
    origin: "scaffolded",
    header: { keyboardId: "t", name: "t", bcp47: [], copyright: "", version: "1.0", targets: [], storeDirectives: [] },
    stores: [],
    groups: [
      { nodeId: "g1", name: "main", usingKeys: true, rules, readonly: false },
    ],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
  useWorkingCopyStore.getState().setIR(ir);
}

function ruleCount(): number {
  return useWorkingCopyStore.getState().ir?.groups.flatMap((g) => g.rules).length ?? 0;
}

beforeEach(() => {
  seedIr();
});

afterEach(() => {
  cleanup();
  useGuardIntentStore.getState().resetForTest();
});

describe("MissingGuardCard", () => {
  it("renders one grouped card with per-key key + emitted-mark preview", () => {
    render(<MissingGuardCard group={GROUP} />);
    expect(screen.getByTestId("missing-guard-diablock::Diacritic blocking")).toBeTruthy();
    expect(screen.getByTestId("missing-guard-entry-K_E").textContent).toContain("́");
    expect(screen.getByTestId("missing-guard-entry-K_E").textContent).toContain(
      "COMBINING ACUTE ACCENT",
    );
    expect(screen.getByTestId("missing-guard-entry-K_O")).toBeTruthy();
  });

  it("Add all stages rules through the working-copy path — never auto-applied", () => {
    render(<MissingGuardCard group={GROUP} />);
    // Nothing staged before the author taps.
    expect(ruleCount()).toBe(1);
    fireEvent.click(screen.getByTestId("missing-guard-add-all-diablock::Diacritic blocking"));
    expect(ruleCount()).toBe(3);
    expect(
      screen.getByTestId("missing-guard-added-diablock::Diacritic blocking").textContent,
    ).toMatch(/Added 2/);
  });

  it("Add all is idempotent — re-running adds nothing", () => {
    render(<MissingGuardCard group={GROUP} />);
    const button = screen.getByTestId("missing-guard-add-all-diablock::Diacritic blocking");
    fireEvent.click(button);
    expect(ruleCount()).toBe(3);
    fireEvent.click(button);
    expect(ruleCount()).toBe(3);
    const note = screen.getByTestId("missing-guard-added-diablock::Diacritic blocking").textContent;
    expect(note).toMatch(/Added 0/);
    expect(note).toMatch(/2 skipped: already guarded/);
    expect(note).not.toMatch(/no rule to copy/);
  });

  it("says there was no rule to copy when the family has no template — not 'already covered'", () => {
    // No rule references the guard store, so there is no family template.
    seedIr([
      { nodeId: "r1", context: [{ kind: "raw", text: "+" }, { kind: "vkey", name: "K_C", modifiers: [] }], output: [{ kind: "char", value: "c" }] },
    ]);
    render(<MissingGuardCard group={GROUP} />);
    fireEvent.click(screen.getByTestId("missing-guard-add-all-diablock::Diacritic blocking"));
    expect(ruleCount()).toBe(1);
    const note = screen.getByTestId("missing-guard-added-diablock::Diacritic blocking").textContent;
    expect(note).toMatch(/Added 0/);
    expect(note).toMatch(/2 not added: the “Diacritic blocking” family has no rule to copy/);
    expect(note).not.toMatch(/already guarded/);
  });

  it("Dismiss records the group so it stays hidden", () => {
    render(<MissingGuardCard group={GROUP} />);
    fireEvent.click(screen.getByTestId("missing-guard-dismiss-diablock::Diacritic blocking"));
    expect(
      useGuardIntentStore
        .getState()
        .dismissedMissingGroups.has(missingGuardGroupKey(GROUP)),
    ).toBe(true);
  });

  it("Add all signals both guard intents — bundle installed and family edited", () => {
    render(<MissingGuardCard group={GROUP} />);
    fireEvent.click(screen.getByTestId("missing-guard-add-all-diablock::Diacritic blocking"));
    const intent = useGuardIntentStore.getState();
    expect(intent.blockBundleInstalled).toBe(true);
    // The synthesized rules join the diablock guard family; that family was
    // edited.
    const ir = useWorkingCopyStore.getState().ir!;
    const family = groupRules(ir.groups.flatMap((g) => g.rules)).find(
      (f) => f.guardStore === "diablock",
    )!;
    expect(intent.editedFamilyIds.has(family.id)).toBe(true);
  });
});
