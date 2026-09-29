// DeadkeyDetailEditor tests — spec 083 US3–US5: pairs, numeric rename +
// author name, retarget, atomic delete (referenced blocks).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
import { screen, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { listDeadkeys } from "@keyboard-studio/contracts";
import { parseKmn, defineDeadkey } from "@keyboard-studio/engine";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { DeadkeyDetailEditor } from "./DeadkeyDetailEditor.tsx";
import { withAddedDeadkeyPair, commitDeadkeyEdit } from "./deadkeyWrite.ts";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-detail-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

function parseIr(extra = ""): KeyboardIR {
  return parseKmn(BASE_KMN + extra, "deadkey-detail-test").ir;
}

/** A studio-defined deadkey with a recognized cluster (pairs editable). */
function definedIr(extra: {
  triggerKey?: string;
  id?: number;
  pairs?: Array<[string, string]>;
} = {}): KeyboardIR {
  const { triggerKey = "K_COLON", id = 0x3000, pairs = [["a", "á"]] } = extra;
  const result = defineDeadkey(parseIr(), { triggerKey, id, accentChar: ";" });
  if (!result.ok) throw new Error(`defineDeadkey failed: ${JSON.stringify(result.conflicts)}`);
  let ir = result.ir;
  // Add pairs through the studio seam (mirrors the editor's own path).
  for (const [base, accented] of pairs) {
    const info = listDeadkeys(ir).find((d) => d.id === id);
    if (!info?.baseStore || !info.outputStore) throw new Error("no fan-out stores");
    ir = commitDeadkeyEdit(ir, withAddedDeadkeyPair(ir, info.baseStore, info.outputStore, base, accented));
  }
  return ir;
}

function renderEditor(ir: KeyboardIR, id: number | null = 0x3000, name?: string) {
  const onCommitIr = vi.fn();
  const onRenamed = vi.fn();
  const onAdoptExisting = vi.fn();
  const onDeleted = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <DeadkeyDetailEditor
      ir={ir}
      deadkeyId={id}
      deadkeyName={name}
      onCommitIr={onCommitIr}
      onRenamed={onRenamed}
      onAdoptExisting={onAdoptExisting}
      onDeleted={onDeleted}
      onClose={onClose}
    />,
  );
  const rerenderWithIr = (nextIr: KeyboardIR) =>
    view.rerender(
      <DeadkeyDetailEditor
        ir={nextIr}
        deadkeyId={id}
        onCommitIr={onCommitIr}
        onRenamed={onRenamed}
        onAdoptExisting={onAdoptExisting}
        onDeleted={onDeleted}
        onClose={onClose}
      />,
    );
  return { onCommitIr, onRenamed, onAdoptExisting, onDeleted, onClose, rerenderWithIr };
}

describe("DeadkeyDetailEditor", () => {
  it("adds and removes pairs", () => {
    const { onCommitIr, rerenderWithIr } = renderEditor(definedIr());
    // One pair from the fixture.
    expect(screen.getByText("a")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Base character/), { target: { value: "e" } });
    fireEvent.change(screen.getByLabelText(/Accented character/), { target: { value: "é" } });
    fireEvent.click(screen.getByRole("button", { name: "Add pair" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const withPair = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(withPair).find((d) => d.id === 0x3000)?.pairCount).toBe(2);

    // Same mounted editor, now with the new IR — remove the first pair.
    rerenderWithIr(withPair);
    const removeBtns = screen.getAllByRole("button", { name: /Remove pair/ });
    expect(removeBtns).toHaveLength(2);
    fireEvent.click(removeBtns[0]!);
    expect(onCommitIr).toHaveBeenCalledTimes(2);
    const removed = onCommitIr.mock.calls[1]![0] as KeyboardIR;
    expect(listDeadkeys(removed).find((d) => d.id === 0x3000)?.pairCount).toBe(1);
  });

  it("renames the numeric id and follows to the new id", () => {
    const { onCommitIr, onRenamed } = renderEditor(definedIr());
    fireEvent.change(screen.getByLabelText(/New numeric id/), { target: { value: "3001" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename id" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const renamed = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(renamed).some((d) => d.id === 0x3001)).toBe(true);
    expect(onRenamed).toHaveBeenCalledWith(0x3001);
  });

  it("renames to a 5-digit id — the pipeline has no 0xffff cap", () => {
    const { onCommitIr, onRenamed } = renderEditor(definedIr());
    fireEvent.change(screen.getByLabelText(/New numeric id/), { target: { value: "dead1" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename id" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const renamed = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(renamed).some((d) => d.id === 0xdead1)).toBe(true);
    expect(onRenamed).toHaveBeenCalledWith(0xdead1);
  });

  it("saves the always-available author name", () => {
    const { onCommitIr } = renderEditor(definedIr());
    fireEvent.change(screen.getByLabelText(/Author name \(optional\)/), { target: { value: "acute" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const named = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(named).find((d) => d.id === 0x3000)?.authorName).toBe("acute");
  });

  it("retargets the trigger while the id stays put", async () => {
    const { onCommitIr } = renderEditor(definedIr());
    await changeSelectMenu(screen.getByLabelText(/New trigger key/), "K_LBRKT");
    fireEvent.click(screen.getByRole("button", { name: "Move trigger" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const retargeted = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    const info = listDeadkeys(retargeted).find((d) => d.id === 0x3000);
    expect(info?.triggerKey).toBe("K_LBRKT");
  });

  it("deletes an unreferenced deadkey atomically", () => {
    const { onCommitIr, onDeleted } = renderEditor(definedIr());
    fireEvent.click(screen.getByRole("button", { name: "Delete dk(3000)" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const deleted = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(deleted).some((d) => d.id === 0x3000)).toBe(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("a referenced delete is blocked and lists the referrers (never a half-delete)", () => {
    // The extra rule references dk(3000) outside the deadkey's own cluster.
    const ir = parseIr(`+ [K_COLON] > dk(3000)\n+ [K_B] > dk(3000) 'x'\n`);
    const { onCommitIr, onDeleted } = renderEditor(ir);
    fireEvent.click(screen.getByRole("button", { name: "Delete dk(3000)" }));

    // Blocked: the dialog names the referrers, nothing committed.
    expect(screen.getByText(/can't be deleted yet/)).toBeTruthy();
    expect(onCommitIr).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    // Cancel keeps the deadkey.
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("id:null — a named deadkey can be deleted (its raw fragments are removed)", () => {
    const ir = parseIr(`+ [K_BKQUOTE] > dk(acute)\n`);
    expect(listDeadkeys(ir).some((d) => d.id === null && d.name === "acute")).toBe(true);

    const { onCommitIr, onDeleted } = renderEditor(ir, null, "acute");
    fireEvent.click(screen.getByRole("button", { name: "Delete dk(acute)" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const deleted = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    expect(listDeadkeys(deleted).some((d) => d.name === "acute")).toBe(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("id:null — a named deadkey can be retargeted (trigger fragment rewritten)", async () => {
    const ir = parseIr(`+ [K_BKQUOTE] > dk(acute)\n`);
    const { onCommitIr } = renderEditor(ir, null, "acute");
    await changeSelectMenu(screen.getByLabelText(/New trigger key/), "K_COLON");
    fireEvent.click(screen.getByRole("button", { name: "Move trigger" }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    const retargeted = onCommitIr.mock.calls[0]![0] as KeyboardIR;
    const info = listDeadkeys(retargeted).find((d) => d.name === "acute");
    expect(info?.triggerKey).toBe("K_COLON");
  });

  it("id:null — pairs and rename stay unavailable; only delete/retarget are offered", () => {
    const ir = parseIr(`+ [K_BKQUOTE] > dk(acute)\n`);
    renderEditor(ir, null, "acute");
    // No pair controls, no rename controls for the null-id deadkey.
    expect(screen.queryByRole("button", { name: "Add pair" })).toBeNull();
    expect(screen.queryByLabelText(/New numeric id/)).toBeNull();
    // Delete and retarget are present.
    expect(screen.getByRole("button", { name: "Delete dk(acute)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move trigger" })).toBeTruthy();
  });
});
