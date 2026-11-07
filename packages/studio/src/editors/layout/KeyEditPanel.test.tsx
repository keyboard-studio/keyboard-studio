// KeyEditPanel (spec 113 T054): text, inventory pick and nothing; the preview; the case partner
// accepted or declined in the same confirm; duplicate and displacement choices; the warning before
// overriding an Assign-tab assignment; the base character on a provisional key becoming hand-set;
// and at most three interactions from selecting a key to confirming.

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attributeLayer, emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KmnEditsValue, LayerCombo, MechanismAssignment } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
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
  useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false, phaseResults: [], displacedDeclined: [] });
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
});
