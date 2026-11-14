// The footer's one Undo on an opened keyboard (spec 111 FR-045, T093) and the
// revision Discard that restores the file text with the log at its arrival depth.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../test/renderWithI18n.tsx";
import { StepNavCluster } from "./StepNavCluster.tsx";
import { STANDALONE_STEP_ID } from "../stores/stepNavStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { applyOpenChange, undoLastOpenApply } from "../lib/openApply.ts";
import { captureRevisionSnapshot, restoreRevisionSnapshot } from "../lib/draftPersistence.ts";
import { CODE_VIEW_EDIT_LABEL } from "../lib/replaceStartingPoint.ts";
import { readVfsText } from "../lib/vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = ["store(&NAME) 'Tiny'", "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", "+ [K_B] > 'b'", ""].join("\n");
const text = () => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;
const ruleId = (v: string) =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules).find((r) => JSON.stringify(r.context).includes(v))!.nodeId;

function open(): void {
  clearOpenSession();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(
    { id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"], displayName: "Tiny", version: "1.0", languages: ["en"] } as StartKeyboard,
    { vfs, ir: parseKmn(KMN, ID).ir },
  );
  wc.setAttribution({ authorName: "T", copyrightHolder: "T" });
  wc.setFallbackPolicy("pass-through");
}

const apply = (c: Parameters<typeof applyOpenChange>[0]) => act(() => { expect(applyOpenChange(c).status).toBe("applied"); });
const button = () => screen.getByTestId("open-undo-button") as HTMLButtonElement;
/** The Undo is a lazy chunk: wait for it once per render. */
async function renderCluster(): Promise<void> {
  render(<StepNavCluster stepId={STANDALONE_STEP_ID} />);
  await screen.findByTestId("open-undo-button");
}

beforeEach(() => open());
afterEach(() => cleanup());

describe("OpenUndoButton in the footer cluster", () => {
  it("with nothing to undo stays focusable, named Undo, and says why through a description", async () => {
    await renderCluster();
    const b = button();
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("aria-label")).toBeNull();
    expect(b.textContent).toBe("Undo");
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe("Nothing to undo");
    act(() => b.focus());
    expect(document.activeElement).toBe(b);
    fireEvent.click(b); // guarded: nothing happens
    expect(text()).toBe(KMN);
  });

  it("names the change it will undo, undoes it, and is disabled again", async () => {
    await renderCluster();
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect(button().getAttribute("aria-label")).toBe("Undo: removed b");
    act(() => button().focus());
    fireEvent.click(button());
    expect(text()).toBe(KMN);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    // Focus stays on the button after the last undo.
    expect(document.activeElement).toBe(button());
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
  });

  it("reads well for a code-view edit and says the next step to undo", async () => {
    await renderCluster();
    apply({ kind: "files", files: { [KMN_PATH]: KMN.replace("'b'", "'bb'") }, label: CODE_VIEW_EDIT_LABEL, labelKey: "code-view" });
    expect(button().getAttribute("aria-label")).toBe("Undo: code view edit");
    apply({ kind: "remove", itemIds: [ruleId("K_A")], chars: ["a"] });
    expect(button().getAttribute("aria-label")).toBe("Undo: removed a");
    fireEvent.click(button());
    expect(button().getAttribute("aria-label")).toBe("Undo: code view edit");
  });

  it("shows a refusal as a notice when the file changed since, and writes nothing", async () => {
    await renderCluster();
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    // Something outside the log edits the file.
    const edited = `${text()}c edited elsewhere\n`;
    act(() => { useWorkingCopyStore.getState().replaceStartingPointFromText(KMN_PATH, edited); });
    fireEvent.click(button());
    expect(screen.getByTestId("open-undo-notice").textContent).toContain(`${KMN_PATH} changed since`);
    expect(text()).toBe(edited);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
  });

  it("announces the same refusal again: the live region is emptied, then set, on each click", async () => {
    await renderCluster();
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    act(() => { useWorkingCopyStore.getState().replaceStartingPointFromText(KMN_PATH, `${text()}c edited elsewhere\n`); });
    const region = screen.getByTestId("open-undo-notice");
    const seen: string[] = [];
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        r.removedNodes.forEach((n) => seen.push(`-${n.textContent}`));
        r.addedNodes.forEach((n) => seen.push(`+${n.textContent}`));
      }
    });
    obs.observe(region, { childList: true, characterData: true, subtree: true });
    fireEvent.click(button());
    await act(async () => {});
    fireEvent.click(button());
    await act(async () => {});
    obs.disconnect();
    expect(region.textContent).toContain("changed since");
    // The text is removed and added again for the second click: announced twice.
    expect(seen.filter((x) => x.startsWith("+") && x.includes("changed since"))).toHaveLength(2);
    expect(seen.filter((x) => x.startsWith("-") && x.includes("changed since"))).toHaveLength(1);
  });

  it("refuses with a stale step instead of undoing a different one", () => {
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    const shownId = useOpenUndoStore.getState().records[0]!.id;
    apply({ kind: "remove", itemIds: [ruleId("K_A")], chars: ["a"] });
    const r = undoLastOpenApply(shownId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("stale");
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
  });

  it("is not offered outside Open", () => {
    act(() => { useWorkingCopyStore.getState().reset(); });
    render(<StepNavCluster stepId={STANDALONE_STEP_ID} />);
    expect(screen.queryByTestId("open-undo-button")).toBeNull();
  });
});

describe("Discard changes and go back on Open (FR-045)", () => {
  it("restores the file text and cuts the log back to its depth at arrival", async () => {
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    const atArrival = text();
    const snapshot = captureRevisionSnapshot();
    expect(snapshot.openUndo).toHaveLength(1);

    apply({ kind: "files", files: { [KMN_PATH]: `${atArrival}c revising\n` }, label: CODE_VIEW_EDIT_LABEL });
    apply({ kind: "remove", itemIds: [ruleId("K_A")], chars: ["a"] });
    expect(useOpenUndoStore.getState().records).toHaveLength(3);

    act(() => restoreRevisionSnapshot(snapshot));
    expect(text()).toBe(atArrival);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    // The Removed list is rebuilt from the cut log: only the arrival removal is on it.
    expect(useOpenRemovalStore.getState().entries.map((e) => e.chars)).toEqual([["b"]]);
    // The step from before the revision is still undoable.
    await renderCluster();
    expect(button().getAttribute("aria-label")).toBe("Undo: removed b");
    fireEvent.click(button());
    expect(text()).toBe(KMN);
  });

  it("puts back a step that was undone during the revision", async () => {
    apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    const atArrival = text();
    const snapshot = captureRevisionSnapshot();
    await renderCluster();
    fireEvent.click(button());
    expect(text()).toBe(KMN);
    act(() => restoreRevisionSnapshot(snapshot));
    expect(text()).toBe(atArrival);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
  });
});
