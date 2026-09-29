// Tests for RuleBuilderPanel (spec 082 Track B, FR-007; FR-018 family
// selection; Matthew's 2026-09-28 rewrite: 3-step bundle flow, "bundle"
// copy, verified-pair gate).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { validateRulePack } from "@keyboard-studio/contracts";
import type { IRRule } from "@keyboard-studio/contracts";
import { RuleBuilderPanel, formatRuleSummary, type RuleFamily } from "./RuleBuilderPanel.tsx";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";

function vkeyRule(nodeId: string, name: string, modifiers: string[] = []): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name, modifiers },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

const RULES: IRRule[] = [
  vkeyRule("r1", "K_C", ["RALT"]),
  vkeyRule("r2", "K_QUOTE"),
  vkeyRule("t1", "T_0300"),
  vkeyRule("t2", "T_0301"),
];

function family(
  id: string,
  name: string,
  memberIds: string[],
  explanation: string,
): RuleFamily {
  return {
    id,
    name,
    guardStore: "diablock",
    outputShape: "context",
    kind: "blocking",
    memberIds,
    count: memberIds.length,
    explanation,
    sampleRuleTexts: [],
    patternSummary: "any(diablock) + key > context",
  };
}

const FAMILIES: RuleFamily[] = [
  family("diacritic-blocking-hardware", "Diacritic blocking (hardware)", ["r1", "r2"],
    "Swallows combining marks after space, digit or punctuation — hardware keys."),
  family("diacritic-blocking-touch", "Diacritic blocking (touch)", ["t1", "t2"],
    "Swallows combining marks after space, digit or punctuation — touch layer."),
];

const META = {
  id: "sil_cameroon_qwerty",
  name: "Cameroon QWERTY",
  copyright: "© SIL Cameroon",
  license: "MIT (assumed from keymanapp/keyboards; verify)",
};

const RECORDED = { input: "typed 5 then grave", expectedOutput: "5" };

function renderPanel(extra: Record<string, unknown> = {}) {
  const onExport = vi.fn();
  render(
    <RuleBuilderPanel
      selectedRules={RULES}
      families={FAMILIES}
      keyboardMeta={META}
      scriptKey="Latn"
      onExport={onExport}
      {...extra}
    />,
  );
  return { onExport };
}

/** Complete step 1 (name) and step 2 (one verified pair via the pane). */
async function completeNameAndProof(recordDemo: ReturnType<typeof vi.fn>) {
  fireEvent.change(screen.getByLabelText("Bundle name"), {
    target: { value: "Cameroon diacritic blocking" },
  });
  fireEvent.click(screen.getByText("Record from demo pane"));
  expect(recordDemo).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/Verified in the demo pane/)).toBeTruthy();
}

afterEach(() => {
  cleanup();
  useGuardIntentStore.getState().resetForTest();
});

describe("formatRuleSummary", () => {
  it("renders a one-line KMN-style summary", () => {
    expect(formatRuleSummary(RULES[0]!)).toBe("any(diablock) + [RALT K_C] > context");
    expect(formatRuleSummary(RULES[3]!)).toBe("any(diablock) + [T_0301] > context");
  });
});

describe("RuleBuilderPanel family selection (FR-018)", () => {
  it("leads with family-level checkboxes and hides individual rules until expanded", () => {
    renderPanel();
    expect(screen.getByText("Diacritic blocking (hardware)")).toBeTruthy();
    expect(screen.getByText("Diacritic blocking (touch)")).toBeTruthy();
    // Individual rule rows are hidden until the family is expanded.
    expect(screen.queryByText("any(diablock) + [RALT K_C] > context")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Show individual rules in “Diacritic blocking \(hardware\)”/ });
    fireEvent.click(toggle);
    expect(screen.getByText("any(diablock) + [RALT K_C] > context")).toBeTruthy();
    expect(screen.getByText("any(diablock) + [K_QUOTE] > context")).toBeTruthy();
  });

  it("one tap on a family checkbox bundles/unbundles the whole family", () => {
    renderPanel();
    const familyBox = screen.getByRole("checkbox", {
      name: /Bundle all 2 rules in “Diacritic blocking \(hardware\)”/,
    }) as HTMLInputElement;
    expect(familyBox.checked).toBe(true);
    // One tap unbundles the whole family.
    fireEvent.click(familyBox);
    expect(screen.getByText("· 2 groups · 2 rules selected")).toBeTruthy();
    // One tap re-bundles it.
    fireEvent.click(screen.getByRole("checkbox", {
      name: /Bundle all 2 rules in “Diacritic blocking \(hardware\)”/,
    }));
    expect(screen.getByText("· 2 groups · 4 rules selected")).toBeTruthy();
  });

  it("expanding a family allows fine-tuning individual rules", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: /Show individual rules in “Diacritic blocking \(hardware\)”/ }),
    );
    fireEvent.click(screen.getByLabelText("any(diablock) + [RALT K_C] > context"));
    expect(screen.getByText("· 2 groups · 3 rules selected")).toBeTruthy();
    // The family checkbox is now partially selected (indeterminate, unchecked).
    const familyBox = screen.getByRole("checkbox", {
      name: /Bundle all 2 rules in “Diacritic blocking \(hardware\)”/,
    }) as HTMLInputElement;
    expect(familyBox.checked).toBe(false);
    expect(familyBox.indeterminate).toBe(true);
  });

  it("suggests touch-layer twins computed from guard store + output shape", () => {
    renderPanel();
    // Unbundle the touch family: the hardware family is still fully selected,
    // so its touch twins are suggested — computed, not hardcoded.
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Bundle all 2 rules in “Diacritic blocking \(touch\)”/ }),
    );
    expect(screen.getByText("Also include 2 touch-layer twins?")).toBeTruthy();
    fireEvent.click(screen.getByText("Include"));
    expect(screen.queryByText("Also include 2 touch-layer twins?")).toBeNull();
    expect(screen.getByText("· 2 groups · 4 rules selected")).toBeTruthy();
  });

  it("does not suggest twins when the guard store differs", () => {
    const otherStore: RuleFamily[] = [
      family("diacritic-blocking-hardware", "Diacritic blocking (hardware)", ["r1", "r2"], "hw"),
      { ...family("diacritic-blocking-touch", "Diacritic blocking (touch)", ["t1", "t2"], "tw"), guardStore: "otherstore" },
    ];
    render(
      <RuleBuilderPanel
        selectedRules={RULES}
        families={otherStore}
        keyboardMeta={META}
        scriptKey="Latn"
        onExport={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Bundle all 2 rules in “Diacritic blocking \(touch\)”/ }),
    );
    expect(screen.queryByText(/touch-layer twins/)).toBeNull();
  });

  it("falls back to the flat individual-rule list when families is absent", () => {
    render(
      <RuleBuilderPanel
        selectedRules={RULES}
        keyboardMeta={META}
        scriptKey="Latn"
        onExport={() => {}}
      />,
    );
    expect(screen.getByText("any(diablock) + [RALT K_C] > context")).toBeTruthy();
    expect(screen.queryByText("Diacritic blocking (hardware)")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("toggling a family signals guard intent — the family was edited (FR-020)", () => {
    renderPanel();
    expect(useGuardIntentStore.getState().editedFamilyIds.size).toBe(0);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Bundle all 2 rules in “Diacritic blocking \(hardware\)”/,
      }),
    );
    expect(useGuardIntentStore.getState().editedFamilyIds.has("diacritic-blocking-hardware")).toBe(true);
    // The signal does not name the other family.
    expect(useGuardIntentStore.getState().editedFamilyIds.has("diacritic-blocking-touch")).toBe(false);
  });
});

describe("RuleBuilderPanel 3-step flow", () => {
  it("derives the bundle id from the name and shows it read-only", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Bundle name"), {
      target: { value: "Cameroon diacritic blocking" },
    });
    const details = screen.getByText("Details").closest("details")!;
    expect(within(details).getByText("cameroon-diacritic-blocking")).toBeTruthy();
    // No editable id field anywhere.
    expect(screen.queryByLabelText("Bundle ID")).toBeNull();
  });

  it("auto-drafts the description from the family explanation with an edit toggle", () => {
    renderPanel();
    // Both selected families contribute their kmAssist explanation to the draft.
    const fullDraft =
      "“Swallows combining marks after space, digit or punctuation — hardware keys. " +
      "Swallows combining marks after space, digit or punctuation — touch layer.”";
    expect(screen.getByText(fullDraft)).toBeTruthy();
    fireEvent.click(screen.getByText("edit"));
    const area = screen.getByLabelText("Bundle description") as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "Custom description." } });
    fireEvent.click(screen.getByText("Done"));
    expect(screen.getByText("“Custom description.”")).toBeTruthy();
    // Restore draft brings the family explanation back.
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByText("Restore draft"));
    expect(screen.getByText(fullDraft)).toBeTruthy();
  });

  it("blocks saving until a verified pair exists; manual pairs do not count", async () => {
    const onRecordDemo = vi.fn().mockResolvedValue(RECORDED);
    const { onExport } = renderPanel({ onRecordDemo });
    const saveButton = screen.getByText("Save bundle") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText(/at least one verified pair is needed/)).toBeTruthy();

    // A manually added pair is unverified: still blocked. Remove it again so
    // the later save is not tripped by its empty fields.
    fireEvent.click(screen.getByText("Add pair manually"));
    expect(screen.getByText(/Not verified/)).toBeTruthy();
    expect((screen.getByText("Save bundle") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("Remove"));

    // Recording from the pane verifies: saving enables.
    fireEvent.change(screen.getByLabelText("Bundle name"), { target: { value: "Test bundle" } });
    fireEvent.click(screen.getByText("Record from demo pane"));
    expect(await screen.findByText(/Verified in the demo pane/)).toBeTruthy();
    expect((screen.getByText("Save bundle") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByText("Save bundle"));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows inline errors for an empty name instead of saving", async () => {
    const onRecordDemo = vi.fn().mockResolvedValue(RECORDED);
    const { onExport } = renderPanel({ onRecordDemo });
    fireEvent.click(screen.getByText("Record from demo pane"));
    expect(await screen.findByText(/Verified in the demo pane/)).toBeTruthy();
    fireEvent.click(screen.getByText("Save bundle"));
    expect(onExport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Give the bundle a name.")).toBeTruthy();
  });

  it("exports one behaviour per family with familyId/familyName parameters and a detected kind", async () => {
    const onRecordDemo = vi.fn().mockResolvedValue(RECORDED);
    const { onExport } = renderPanel({ onRecordDemo });
    await completeNameAndProof(onRecordDemo);
    fireEvent.click(screen.getByText("Save bundle"));

    expect(onExport).toHaveBeenCalledTimes(1);
    const json = onExport.mock.calls[0]![0] as string;
    expect(json.endsWith("\n")).toBe(true);
    const result = validateRulePack(JSON.parse(json));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.id).toBe("cameroon-diacritic-blocking");
    expect(result.pack.scriptKey).toBe("Latn");
    expect(result.pack.behaviours).toHaveLength(2);
    const [hardware, touch] = result.pack.behaviours;
    expect(hardware!.kind).toBe("block");
    expect(hardware!.parameters.familyId).toBe("diacritic-blocking-hardware");
    expect(hardware!.parameters.familyName).toBe("Diacritic blocking (hardware)");
    expect(hardware!.parameters.guardStore).toBe("diablock");
    expect(hardware!.rules).toEqual([
      "any(diablock) + [RALT K_C] > context",
      "any(diablock) + [K_QUOTE] > context",
    ]);
    expect(touch!.parameters.familyId).toBe("diacritic-blocking-touch");
    expect(touch!.demoPairs).toHaveLength(1);
    expect(touch!.demoPairs[0]).toMatchObject({ ...RECORDED, verified: true });
  });

  it("shows the plain confirmation card after saving", async () => {
    const onRecordDemo = vi.fn().mockResolvedValue(RECORDED);
    renderPanel({ onRecordDemo });
    await completeNameAndProof(onRecordDemo);
    fireEvent.click(screen.getByText("Save bundle"));
    expect(
      await screen.findByText(
        "Saved — “Cameroon diacritic blocking” becomes a card other Latin keyboards are offered, with your demo attached.",
      ),
    ).toBeTruthy();
  });

  it("Details shows the auto-derived bundle id, detected kind, and provenance", () => {
    renderPanel();
    const details = screen.getByText("Details").closest("details")!;
    fireEvent.change(screen.getByLabelText("Bundle name"), { target: { value: "Test bundle" } });
    const body = within(details);
    expect(body.getByText("test-bundle")).toBeTruthy();
    expect(body.getAllByText("block · detected from the rules")).toHaveLength(2);
    expect(body.getByText("Latn")).toBeTruthy();
    expect(
      body.getByText("sil_cameroon_qwerty · © SIL Cameroon · MIT (assumed from keymanapp/keyboards; verify)"),
    ).toBeTruthy();
    // Provenance is read-only: no editable fields in Details.
    expect(body.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("renders no “pack” or “JSON” in user-facing copy", async () => {
    const onRecordDemo = vi.fn().mockResolvedValue(RECORDED);
    const { container } = render(
      <RuleBuilderPanel
        selectedRules={RULES}
        families={FAMILIES}
        keyboardMeta={META}
        scriptKey="Latn"
        onExport={() => {}}
        onRecordDemo={onRecordDemo}
      />,
    );
    await completeNameAndProof(onRecordDemo);
    fireEvent.click(screen.getByText("Save bundle"));
    await screen.findByText(/becomes a card other Latin keyboards/);
    const html = container.innerHTML;
    expect(html).not.toMatch(/pack/i);
    expect(html).not.toMatch(/json/i);
  });
});
