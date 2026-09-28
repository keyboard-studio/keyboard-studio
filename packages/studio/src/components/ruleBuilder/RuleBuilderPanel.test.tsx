// Tests for RuleBuilderPanel (spec 082 Track B, FR-007).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, fireEvent, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { validateRulePack } from "@keyboard-studio/contracts";
import type { IRRule } from "@keyboard-studio/contracts";
import { RuleBuilderPanel, formatRuleSummary } from "./RuleBuilderPanel.tsx";

const RULES: IRRule[] = [
  {
    nodeId: "r1",
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_C", modifiers: ["RALT"] },
    ],
    output: [{ kind: "raw", text: "context" }],
  },
  {
    nodeId: "r2",
    context: [
      { kind: "any", storeRef: "diablock" },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: "K_QUOTE", modifiers: [] },
    ],
    output: [{ kind: "raw", text: "context" }],
  },
];

const META = {
  id: "sil_cameroon_qwerty",
  name: "Cameroon QWERTY",
  copyright: "© SIL Cameroon",
  license: "MIT (assumed from keymanapp/keyboards; verify)",
};

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Pack name"), { target: { value: "Test pack" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A test pack." } });
  fireEvent.change(screen.getByLabelText("Script key"), { target: { value: "Latn" } });
  fireEvent.click(screen.getByText("Add pair manually"));
  fireEvent.change(screen.getByLabelText("Typed input (description)"), {
    target: { value: "type 5, then press the grave-accent key" },
  });
  fireEvent.change(screen.getByLabelText("Expected stored output"), {
    target: { value: "5" },
  });
}

afterEach(() => {
  cleanup();
});

describe("formatRuleSummary", () => {
  it("renders a one-line KMN-style summary", () => {
    expect(formatRuleSummary(RULES[0]!)).toBe("any(diablock) + [RALT K_C] > context");
    expect(formatRuleSummary(RULES[1]!)).toBe("any(diablock) + [K_QUOTE] > context");
  });
});

describe("RuleBuilderPanel", () => {
  it("renders the selected rules as a checked checkbox list with KMN texts", () => {
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={() => {}} />);
    expect(screen.getByText("any(diablock) + [RALT K_C] > context")).toBeTruthy();
    expect(screen.getByText("any(diablock) + [K_QUOTE] > context")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect((box as HTMLInputElement).checked).toBe(true);
    }
  });

  it("pre-fills provenance from keyboardMeta", () => {
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={() => {}} />);
    expect((screen.getByLabelText("Source keyboard ID") as HTMLInputElement).value).toBe(
      "sil_cameroon_qwerty",
    );
    expect((screen.getByLabelText("Source keyboard name") as HTMLInputElement).value).toBe(
      "Cameroon QWERTY",
    );
    expect((screen.getByLabelText("Copyright") as HTMLInputElement).value).toBe("© SIL Cameroon");
    expect((screen.getByLabelText("License") as HTMLInputElement).value).toContain("MIT");
  });

  it("blocks export with validation errors and does not call onExport", () => {
    const onExport = vi.fn();
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={onExport} />);
    // No name, no description, no script key, no demo pairs — all required.
    fireEvent.click(screen.getByText("Export rule pack"));
    expect(onExport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("exports a schema-valid pack after the form is completed", () => {
    const onExport = vi.fn();
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={onExport} />);
    fillValidForm();
    fireEvent.click(screen.getByText("Export rule pack"));

    expect(onExport).toHaveBeenCalledTimes(1);
    const json = onExport.mock.calls[0]![0] as string;
    expect(json.endsWith("\n")).toBe(true);
    const result = validateRulePack(JSON.parse(json));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.id).toBe("test-pack");
      expect(result.pack.name).toBe("Test pack");
      expect(result.pack.scriptKey).toBe("Latn");
      expect(result.pack.behaviours).toHaveLength(1);
      const behaviour = result.pack.behaviours[0]!;
      expect(behaviour.kind).toBe("block");
      expect(behaviour.rules).toEqual([
        "any(diablock) + [RALT K_C] > context",
        "any(diablock) + [K_QUOTE] > context",
      ]);
      expect(behaviour.demoPairs).toHaveLength(1);
      expect(behaviour.demoPairs[0]!.expectedOutput).toBe("5");
      expect(behaviour.provenance.sourceKeyboardId).toBe("sil_cameroon_qwerty");
      expect(behaviour.provenance.copyright).toBe("© SIL Cameroon");
    }
  });

  it("excludes unchecked rules from the exported pack", () => {
    const onExport = vi.fn();
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={onExport} />);
    fillValidForm();
    // Uncheck the first rule.
    const firstBox = screen.getByLabelText("any(diablock) + [RALT K_C] > context");
    fireEvent.click(firstBox);
    fireEvent.click(screen.getByText("Export rule pack"));

    expect(onExport).toHaveBeenCalledTimes(1);
    const json = onExport.mock.calls[0]![0] as string;
    const result = validateRulePack(JSON.parse(json));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.behaviours[0]!.rules).toEqual(["any(diablock) + [K_QUOTE] > context"]);
    }
  });

  it("records a demo pair through onRecordDemo when wired", async () => {
    const onExport = vi.fn();
    const onRecordDemo = vi.fn().mockResolvedValue({
      input: "typed 5 then grave",
      expectedOutput: "5",
    });
    render(
      <RuleBuilderPanel
        selectedRules={RULES}
        keyboardMeta={META}
        onExport={onExport}
        onRecordDemo={onRecordDemo}
      />,
    );
    fireEvent.click(screen.getByText("Record from demo pane"));
    expect(onRecordDemo).toHaveBeenCalledTimes(1);
    // The recorded pair appears as editable fields.
    expect(await screen.findByDisplayValue("typed 5 then grave")).toBeTruthy();
    expect(await screen.findByDisplayValue("5")).toBeTruthy();
  });

  it("hides the record button when onRecordDemo is absent (manual entry still works)", () => {
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={() => {}} />);
    expect(screen.queryByText("Record from demo pane")).toBeNull();
    expect(screen.getByText("Add pair manually")).toBeTruthy();
  });

  it("rejects raw-snippet-only parameters (FR-005)", () => {
    const onExport = vi.fn();
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={onExport} />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Structured parameters (JSON)"), {
      target: { value: `{"kmnText": "any(diablock) + [K_QUOTE] > context"}` },
    });
    fireEvent.click(screen.getByText("Export rule pack"));
    expect(onExport).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/not raw KMN text/)).toBeTruthy();
  });

  it("derives the pack ID from the pack name until manually edited", () => {
    render(<RuleBuilderPanel selectedRules={RULES} keyboardMeta={META} onExport={() => {}} />);
    fireEvent.change(screen.getByLabelText("Pack name"), {
      target: { value: "Cameroon diacritic blocking" },
    });
    expect((screen.getByLabelText("Pack ID") as HTMLInputElement).value).toBe(
      "cameroon-diacritic-blocking",
    );
    // Manual edit wins over later name changes.
    fireEvent.change(screen.getByLabelText("Pack ID"), { target: { value: "custom-id" } });
    fireEvent.change(screen.getByLabelText("Pack name"), { target: { value: "Something else" } });
    expect((screen.getByLabelText("Pack ID") as HTMLInputElement).value).toBe("custom-id");
  });
});
