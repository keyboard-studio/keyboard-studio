// Layout-tab edits on Open that need the author's agreement (spec 111 T082a): everything the panel
// does on success (completing the step, leaving deadkey mode, recording a declined displacement,
// reporting the commit) waits for the change to be in the file; a decline does none of it; with no
// host mounted the panel says so rather than blaming the code.

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attributeLayer, parseKmn } from "@keyboard-studio/engine";
import { createVirtualFS, type LayerCombo, type StartKeyboard } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { applyOpenChange } from "../../lib/openApply.ts";
import { setOpenApplyNotifier, type HandOver } from "../../lib/openApplyNotifier.ts";
import { buildDesktopGridViewModel } from "./desktopGridViewModel.ts";
import { KeyEditPanel } from "./KeyEditPanel.tsx";
import { DeadkeyList } from "./DeadkeyList.tsx";

const forced = vi.hoisted(() => ({ refuse: true }));
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...actual,
    projectKmnText: (...args: Parameters<typeof actual.projectKmnText>) =>
      forced.refuse ? { ok: false as const, reason: "forced for test" } : actual.projectKmnText(...args),
  };
});

const ID = "kcn";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = [
  "store(&NAME) 'kcn'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_B] > 'b'",
  "+ [K_E] > dk(0001)",
  "dk(0001) + [K_A] > U+00E1",
  "dk(0002) + [K_A] > U+00E9",
  "",
].join("\r\n");
const KB = { id: ID, path: "release/k/kcn", script: "Latn", targets: ["desktop"], displayName: "K", version: "1.0", languages: ["en"] } as StartKeyboard;

let handed: HandOver[];

beforeEach(() => {
  forced.refuse = true;
  handed = [];
  setOpenApplyNotifier((item) => handed.push(item));
  useOpenUndoStore.getState().clear();
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${ID}`, ID));
});
afterEach(() => {
  cleanup();
  setOpenApplyNotifier(null);
});

const file = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const cellFor = (vkey: string, layer: LayerCombo = []) =>
  buildDesktopGridViewModel({ layer, cells: attributeLayer(useWorkingCopyStore.getState().startIr!, layer, [vkey]), state: "ready" }).cells.find(
    (c) => c.vkey === vkey,
  )!;
const agree = (item: HandOver): void => {
  act(() => {
    expect(applyOpenChange(item.build()!, { consentedReemit: true }).status).toBe("applied");
    item.onApplied?.();
  });
};

describe("a pending Layout-tab change", () => {
  it("a displaced character is declined only once the change is applied", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "z" } });
    fireEvent.click(screen.getByTestId("key-edit-keep-displaced"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(handed).toHaveLength(1);
    expect(useWorkingCopyStore.getState().displacedDeclined).toEqual([]);
    agree(handed[0]!);
    expect(useWorkingCopyStore.getState().displacedDeclined).toContain("b|K_B||z");
  });

  it("a decline records no displacement decline", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "z" } });
    fireEvent.click(screen.getByTestId("key-edit-keep-displaced"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    handed[0]!.onNotApplied();
    expect(useWorkingCopyStore.getState().displacedDeclined).toEqual([]);
    expect(file()).toBe(KMN);
  });

  it("a text edit: the panel keeps the input and reports nothing until agreement", () => {
    const onCommitted = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onCommitted={onCommitted} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "z" } });
    fireEvent.click(screen.getByTestId("key-edit-keep-displaced"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(handed).toHaveLength(1);
    expect(onCommitted).not.toHaveBeenCalled();
    expect((screen.getByTestId("key-edit-text") as HTMLInputElement).value).toBe("z");
    agree(handed[0]!);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId("key-edit-text") as HTMLInputElement).value).toBe("");
  });

  it("a text edit declined: the input stays and nothing is reported", () => {
    const onCommitted = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onCommitted={onCommitted} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "z" } });
    fireEvent.click(screen.getByTestId("key-edit-keep-displaced"));
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    act(() => handed[0]!.onNotApplied());
    expect(onCommitted).not.toHaveBeenCalled();
    expect((screen.getByTestId("key-edit-text") as HTMLInputElement).value).toBe("z");
    expect(file()).toBe(KMN);
  });

  it("an existing deadkey: the commit is reported on agreement, not before, and never on a decline", () => {
    const onCommitted = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onCommitted={onCommitted} />);
    fireEvent.click(screen.getByTestId("key-edit-deadkey"));
    fireEvent.change(screen.getByTestId("key-edit-deadkey-target"), { target: { value: "0001" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(handed).toHaveLength(1);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("key-edit-deadkey-options")).not.toBeNull();
    agree(handed[0]!);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("key-edit-deadkey-options")).toBeNull();
  });

  it("an existing deadkey declined: nothing is reported and deadkey mode stays", () => {
    const onCommitted = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onCommitted={onCommitted} />);
    fireEvent.click(screen.getByTestId("key-edit-deadkey"));
    fireEvent.change(screen.getByTestId("key-edit-deadkey-target"), { target: { value: "0001" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    handed[0]!.onNotApplied();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("key-edit-deadkey-options")).not.toBeNull();
  });

  it("a new deadkey: the step finishes on agreement, not before", () => {
    const onDeadkeyDefined = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onDeadkeyDefined={onDeadkeyDefined} />);
    fireEvent.click(screen.getByTestId("key-edit-deadkey"));
    fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "´" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    expect(handed).toHaveLength(1);
    expect(onDeadkeyDefined).not.toHaveBeenCalled();
    agree(handed[0]!);
    expect(onDeadkeyDefined).toHaveBeenCalledTimes(1);
  });

  it("a new deadkey declined: nothing is reported", () => {
    const onDeadkeyDefined = vi.fn();
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} onDeadkeyDefined={onDeadkeyDefined} />);
    fireEvent.click(screen.getByTestId("key-edit-deadkey"));
    fireEvent.change(screen.getByTestId("key-edit-deadkey-display"), { target: { value: "´" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    handed[0]!.onNotApplied();
    expect(onDeadkeyDefined).not.toHaveBeenCalled();
  });
});

describe("with no consent host mounted", () => {
  beforeEach(() => setOpenApplyNotifier(null));

  it("the store reports no-host, not refused", () => {
    const r = useWorkingCopyStore.getState().commitKmnEdit({ op: "set-key", vkey: "K_B", layer: [], output: { kind: "text", text: "z" } });
    expect(r).toEqual({ ok: false, reason: "no-host" });
  });

  it("KeyEditPanel says the change needs agreement, not 'change it in the Code tab'", () => {
    render(<KeyEditPanel cell={cellFor("K_B")} onViewInCode={vi.fn()} />);
    fireEvent.change(screen.getByTestId("key-edit-text"), { target: { value: "z" } });
    fireEvent.click(screen.getByTestId("key-edit-confirm"));
    const text = screen.getByTestId("key-edit-refusal").textContent ?? "";
    expect(text).toContain("needs your agreement");
    expect(text).not.toContain("Code tab");
  });

  it("DeadkeyList says so too", () => {
    render(<DeadkeyList layers={[[]]} openId={null} expanded selectedCell={cellFor("K_B")} onOpen={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId("deadkey-list-place")[0]!);
    expect(screen.getByTestId("deadkey-list-problem").textContent).toContain("needs your agreement");
  });
});
