// DeadkeyDefineForm tests — spec 083 US1: the define flow proposes (never
// blanks) the id, trigger suggestions, accent, and author name.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);
import { screen, fireEvent } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parseKmn, defineDeadkey } from "@keyboard-studio/engine";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
import { DeadkeyDefineForm } from "./DeadkeyDefineForm.tsx";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-define-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

function parseIr(extra = ""): KeyboardIR {
  return parseKmn(BASE_KMN + extra, "deadkey-define-test").ir;
}

function renderForm(ir: KeyboardIR) {
  const onCommitIr = vi.fn();
  const onAdoptExisting = vi.fn();
  const onDefined = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeadkeyDefineForm
      ir={ir}
      onCommitIr={onCommitIr}
      onAdoptExisting={onAdoptExisting}
      onDefined={onDefined}
      onCancel={onCancel}
    />,
  );
  return { onCommitIr, onAdoptExisting, onDefined, onCancel };
}

describe("DeadkeyDefineForm", () => {
  it("proposes a non-blank numeric id (§3c: propose, don't blank)", () => {
    renderForm(parseIr());
    const idInput = screen.getByLabelText(/deadkey id/i) as HTMLInputElement;
    expect(idInput.value.trim()).not.toBe("");
    expect(idInput.value.trim()).toMatch(/^[0-9a-f]{4}$/i);
  });

  it("the proposed id skips ids already minted in the IR", () => {
    const base = parseIr();
    const first = defineDeadkey(base, { triggerKey: "K_COLON", id: 0x3000, accentChar: ";" });
    if (!first.ok) throw new Error("fixture failed");
    renderForm(first.ir);
    const idInput = screen.getByLabelText(/deadkey id/i) as HTMLInputElement;
    expect(parseInt(idInput.value.trim(), 16)).toBeGreaterThan(0x3000);
  });

  it("asks the typist-expectation question verbatim and shows the FR-004 name promise", () => {
    renderForm(parseIr());
    expect(
      screen.getByText("Do your typists expect a character on this key?"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Recorded now, becomes the real id when the FR-004 codec closure lands. You won't be asked twice.",
      ),
    ).toBeTruthy();
  });

  it("proposes the trigger's literal character as the double-tap accent", async () => {
    renderForm(parseIr());
    await changeSelectMenu(
      screen.getByLabelText(/trigger key for the new deadkey/i),
      "K_COLON",
    );
    const accentInput = screen.getByLabelText(/double-tap emits/i) as HTMLInputElement;
    expect(accentInput.value).toBe(";");
  });

  it("define commits through onCommitIr and opens the new deadkey", async () => {
    const { onCommitIr, onDefined } = renderForm(parseIr());
    await changeSelectMenu(
      screen.getByLabelText(/trigger key for the new deadkey/i),
      "K_COLON",
    );
    fireEvent.change(screen.getByLabelText(/deadkey id/i), {
      target: { value: "3002" },
    });
    fireEvent.click(screen.getByRole("button", { name: /define deadkey/i }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
    expect(onDefined).toHaveBeenCalledWith(0x3002);
  });

  it("accepts an astral double-tap accent (one scalar, two UTF-16 units)", async () => {
    const { onCommitIr } = renderForm(parseIr());
    await changeSelectMenu(
      screen.getByLabelText(/trigger key for the new deadkey/i),
      "K_COLON",
    );
    // U+1D4B6 — length 2 in UTF-16, one scalar.
    fireEvent.change(screen.getByLabelText(/double-tap emits/i), {
      target: { value: "\u{1D4B6}" },
    });
    fireEvent.click(screen.getByRole("button", { name: /define deadkey/i }));
    expect(onCommitIr).toHaveBeenCalledTimes(1);
  });

  it("a trigger conflict opens the shared dialog with explicit choices and Cancel", async () => {
    const base = parseIr();
    const first = defineDeadkey(base, { triggerKey: "K_COLON", id: 0x3000, accentChar: ";" });
    if (!first.ok) throw new Error("fixture failed");
    const { onCommitIr } = renderForm(first.ir);

    // K_COLON is taken — pick it as the trigger with a fresh id.
    await changeSelectMenu(
      screen.getByLabelText(/trigger key for the new deadkey/i),
      "K_COLON",
    );
    fireEvent.change(screen.getByLabelText(/deadkey id/i), {
      target: { value: "3005" },
    });
    fireEvent.click(screen.getByRole("button", { name: /define deadkey/i }));

    // The shared conflict dialog appears — explicit choices, Cancel present,
    // and nothing committed silently.
    expect(screen.getByText(/already triggers a deadkey/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
    expect(onCommitIr).not.toHaveBeenCalled();
  });
});
