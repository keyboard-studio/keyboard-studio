// KeyEditPanel (spec 113 T054): text, inventory pick and nothing; the preview; the case partner
// accepted or declined in the same confirm; duplicate and displacement choices; the warning before
// overriding an Assign-tab assignment; the base character on a provisional key becoming hand-set;
// and at most three interactions from selecting a key to confirming.

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attributeLayer, emitKmn, parseKmn } from "@keyboard-studio/engine";
import { listDeadkeys } from "@keyboard-studio/contracts";
import type { KmnEditsValue, LayerCombo, MechanismAssignment } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeIdleRulesDemoArtifact, makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { buildDesktopGridViewModel } from "./desktopGridViewModel.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { KeyEditPanel } from "./KeyEditPanel.tsx";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'kep'
store(&TARGETS) 'any'
store(letters) 'abc'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [SHIFT K_B] > any(letters)
+ [K_N] > 'n'
+ [RALT K_N] > U+00F1
+ [K_E] > dk(0001)
dk(0001) + [K_A] > U+00E1
`;

function seed(): void {
  const ir = parseKmn(KMN, "kep").ir;
  useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false, phaseResults: [], displacedDeclined: [], deadkeyOverlay: { ops: [] } });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:kep", "kep"));
}

function cellFor(vkey: string, layer: LayerCombo = []): DesktopCellViewModel {
  const ir = useWorkingCopyStore.getState().ir!;
  const attributed = attributeLayer(ir, layer, [vkey]);
  const vm = buildDesktopGridViewModel({ layer, cells: attributed, state: "ready" });
  const found = vm.cells.find((c) => c.vkey === vkey);
  if (found === undefined) throw new Error(`no cell ${vkey}`);
  return found;
}

const logged = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
const text = (): string => emitKmn(useWorkingCopyStore.getState().ir!);
const type = (value: string) => fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value } });

beforeEach(seed);
afterEach(cleanup);

describe("KeyEditPanel", () => {
  it("is not rendered for a read-only cell", () => {
    render(<KeyEditPanel cell={cellFor("K_B", ["SHIFT"])} onViewInCode={vi.fn()} />);
    expect(screen.queryByTestId("key-edit-panel")).toBeNull();
  });

  it("types text: preview, then one confirm is one entry (three interactions: select, enter, confirm)", () => {
    // Selecting the key is the first interaction (the grid); entering and confirming are the other two.
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    type("1");
    expect(screen.getByTestId("key-edit-preview").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries).toHaveLength(1);
    expect(text()).toContain("U+0031");
  });

  it("picks a character from the inventory", () => {
    useDecisionStore.getState().record({ id: "character-inventory", value: ["ŋ", "ɔ"], provenance: "asked" });
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    fireEvent.change(screen.getByTestId("key-edit-inventory"), { target: { value: "ɔ" } });
    expect((screen.getByTestId("key-edit-text") as HTMLInputElement).value).toBe("ɔ");
  });

  it("makes a key type nothing", () => {
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    fireEvent.click(screen.getByTestId("key-edit-nothing"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries[0]).toMatchObject({ op: "set-key", output: { kind: "nul" } });
  });

  it("the preview lists the deadkey combinations the key completes and what each produces", () => {
    render(<KeyEditPanel cell={cellFor("K_A")} onViewInCode={vi.fn()} />);
    type("z");
    const list = screen.getByTestId("key-edit-preview-deadkeys");
    expect(list.textContent).toContain("0001");
    expect(list.textContent).toContain("á");
  });

  it("accepts the case partner in the same confirm (one undo removes both)", () => {
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    type("ŋ");
    expect(screen.getByTestId("key-edit-partner").textContent).toContain("Ŋ");
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries.map((e) => e.op)).toEqual(["set-key", "set-key"]);
    expect(text()).toContain("U+014A");
    expect(useWorkingCopyStore.getState().undoStack.map((e) => e.k)).toEqual(["lb"]);
  });

  it("declines the case partner in the same confirm, recording the decline", () => {
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    type("ŋ");
    fireEvent.click(screen.getByTestId("key-edit-partner-accept"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries.map((e) => e.op)).toEqual(["set-key", "decline-case-partner"]);
    expect(text()).not.toContain("U+014A");
  });

  it("reports a read-only partner instead of offering it", () => {
    seed();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    type("ŋ");
    expect(screen.queryByTestId("key-edit-partner")).toBeNull();
    expect(screen.getByTestId("key-edit-partner-readonly")).toBeTruthy();
  });

  it("names the other keys that already type the text (a duplicate)", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    type("ñ");
    expect(screen.getByTestId("key-edit-duplicate").textContent).toContain("N");
  });

  it("offers to keep a displaced character that is typed nowhere else, in the same confirm", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    type("z");
    expect(screen.getByTestId("key-edit-displacement")).toBeTruthy();
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    const edits = logged()!.entries;
    expect(edits).toHaveLength(2);
    expect(edits[1]).toMatchObject({ op: "set-key", layer: ["RALT"], output: { kind: "text", text: "b" } });
  });

  it("leaving a displaced character records the decline the Assign tab also reads", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    type("z");
    fireEvent.click(screen.getByTestId("key-edit-keep-displaced"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()!.entries).toHaveLength(1);
    expect(useWorkingCopyStore.getState().displacedDeclined).toContain("b|K_B||z");
  });

  it("warns before overriding an Assign-tab assignment, then needs a second confirm", () => {
    const assignment: MechanismAssignment = {
      target: "a",
      modality: "physical",
      scope: "individual",
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_N] > U+0061" } }],
    } as unknown as MechanismAssignment;
    useWorkingCopyStore.setState({ phaseResults: [{ phase: "C", answers: [], assignments: [assignment] }] as never });
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    type("1");
    expect(screen.getByTestId("key-edit-override-warning")).toBeTruthy();
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()).toBeUndefined();
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries).toHaveLength(1);
  });

  it("assigning the base character to a provisional key makes it hand-set (FR-023)", () => {
    // K_Q has no rule: the base keyboard supplies it. Setting the same character writes a rule.
    render(<KeyEditPanel cell={cellFor("K_Q")} onViewInCode={vi.fn()} />);
    type("q");
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(logged()?.entries[0]).toMatchObject({ op: "set-key", vkey: "K_Q" });
    expect(cellFor("K_Q").provenance).toBe("hand-set");
  });

  it("a refused commit shows the reason and writes nothing", () => {
    useWorkingCopyStore.setState({ desktopLocked: true });
    render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
    type("z");
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(screen.getByTestId("key-edit-refusal")).toBeTruthy();
    expect(logged()).toBeUndefined();
  });
  describe("the deadkey option (spec 113 US3)", () => {
    const deadkeysDefined = () =>
      useDecisionStore.getState().decisions["deadkeys-defined"]?.value as { ops: Array<{ kind: string }> } | undefined;

    it("a new deadkey on an unhandled key goes through the spec 083 define op with its disclosure", () => {
      const onDeadkeyDefined = vi.fn();
      render(<KeyEditPanel cell={cellFor("K_RBRKT")} onViewInCode={vi.fn()} onDeadkeyDefined={onDeadkeyDefined} />);
      fireEvent.click(screen.getByTestId("key-edit-deadkey"));
      // The base-keyboard disclosure (spec 083) is shown before the author confirms.
      expect(screen.getByText(/best guess, not sight/i)).toBeTruthy();
      fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "´" } });
      expect(screen.getByTestId("key-edit-preview").textContent).toContain("new deadkey");
      fireEvent.click(screen.getByTestId("key-edit-confirm"));

      const ops = useWorkingCopyStore.getState().deadkeyOverlay.ops;
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: "define", triggerKey: "K_RBRKT", accentChar: "´" });
      expect(text()).toContain("@deadkey:");
      expect(deadkeysDefined()?.ops).toHaveLength(1);
      expect(onDeadkeyDefined).toHaveBeenCalledTimes(1);
    });

    it("a new deadkey on a key that types something goes ahead of that rule, in one undo step, keeping its authorship marker", () => {
      const before = text();
      render(<KeyEditPanel cell={cellFor("K_N")} onViewInCode={vi.fn()} />);
      fireEvent.click(screen.getByTestId("key-edit-deadkey"));
      fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "~" } });
      fireEvent.click(screen.getByTestId("key-edit-confirm"));
      const state = useWorkingCopyStore.getState();
      expect(state.deadkeyOverlay.ops[0]).toMatchObject({ kind: "define", triggerKey: "K_N" });
      expect(logged()).toBeUndefined();
      expect(state.undoStack.map((e) => e.k)).toEqual(["ld"]);
      const after = text();
      expect(after.indexOf("@deadkey:")).toBeGreaterThan(-1);
      expect(after.indexOf("> dk(")).toBeLessThan(after.indexOf("+ [K_N] > U+006E"));
      expect(listDeadkeys(state.ir!).find((d) => d.triggerKey === "K_N")?.origin).toBe("studio");
      useWorkingCopyStore.getState().undoKmnEdit();
      expect(text()).toBe(before);
      expect(useWorkingCopyStore.getState().undoStack).toEqual([]);
    });

    it("a new deadkey on a modifier layer defines the trigger on that layer", () => {
      render(<KeyEditPanel cell={cellFor("K_RBRKT", ["RALT"])} onViewInCode={vi.fn()} />);
      fireEvent.click(screen.getByTestId("key-edit-deadkey"));
      fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "^" } });
      fireEvent.click(screen.getByTestId("key-edit-confirm"));
      expect(useWorkingCopyStore.getState().deadkeyOverlay.ops[0]).toMatchObject({
        kind: "define",
        triggerKey: "K_RBRKT",
        triggerModifiers: ["RALT"],
      });
    });

    it("an existing deadkey is a set-key entry with a deadkey output, and records deadkeys-defined", () => {
      render(<KeyEditPanel cell={cellFor("K_RBRKT")} onViewInCode={vi.fn()} />);
      fireEvent.click(screen.getByTestId("key-edit-deadkey"));
      fireEvent.change(screen.getByTestId("key-edit-deadkey-target"), { target: { value: "0001" } });
      expect(screen.queryByTestId("key-edit-deadkey-display")).toBeNull();
      fireEvent.click(screen.getByTestId("key-edit-confirm"));
      expect(logged()?.entries[0]).toMatchObject({
        op: "set-key",
        vkey: "K_RBRKT",
        output: { kind: "deadkey", deadkeyId: "0001" },
      });
      expect(text()).toContain("+ [K_RBRKT] > dk(0001)");
      expect(deadkeysDefined()).toBeDefined();
    });

    it("refuses, writing nothing, when the keyboard has not compiled", () => {
      useRulesDemoArtifactStore.getState().setArtifact(makeIdleRulesDemoArtifact());
      render(<KeyEditPanel cell={cellFor("K_RBRKT")} onViewInCode={vi.fn()} />);
      fireEvent.click(screen.getByTestId("key-edit-deadkey"));
      fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "´" } });
      fireEvent.click(screen.getByTestId("key-edit-confirm"));
      expect(screen.getByTestId("key-edit-refusal")).toBeTruthy();
      expect(useWorkingCopyStore.getState().deadkeyOverlay.ops).toHaveLength(0);
    });
  });
});
