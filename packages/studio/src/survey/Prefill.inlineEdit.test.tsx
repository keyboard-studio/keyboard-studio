// Prefill inline editing (issue 542) — component-level tests.
//
// The remaining acceptance criterion of issue 542: each prefilled value
// editable inline, Enter confirms. Only the Language and Script rows have
// a write-back source of truth (the identity step's `language-name` /
// `target-script` decision records); these tests pin the component's side
// of that channel — the host-side record write and the downstream
// recompute are pinned in CharactersStep.prefillEdits.test.tsx.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { makeStartKeyboard, type StartKeyboard } from "@keyboard-studio/contracts";
import { Prefill, type PrefillIdentityEdits } from "./Prefill.tsx";
import type { IdentityLiteResult } from "./IdentityLite.tsx";
import { changeSelectMenu } from "../test/selectMenuTestUtils.ts";

const base: StartKeyboard = makeStartKeyboard({
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows", "web"],
  version: "1.0",
});

const identity: IdentityLiteResult = {
  autonym: "Fà'",
  english: "Bafut",
  languageSubtag: "bfd",
  region: "",
  targetScriptRaw: "Latn",
  bcp47: "bfd-Latn",
  supported: true,
  attribution: null,
  prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
};

function edits(overrides: Partial<PrefillIdentityEdits> = {}): PrefillIdentityEdits {
  return {
    onLanguageName: vi.fn(),
    onTargetScript: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("Prefill inline editing — read-only by default", () => {
  it("renders no Edit affordance when no edit channel is supplied", () => {
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} />);
    expect(screen.getByText("Bafut")).toBeTruthy();
    expect(screen.queryByTestId("prefill-edit-language")).toBeNull();
    expect(screen.queryByTestId("prefill-edit-script")).toBeNull();
  });

  it("offers Edit only on the Language and Script rows", () => {
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} identityEdits={edits()} />);
    expect(screen.getByTestId("prefill-edit-language")).toBeTruthy();
    expect(screen.getByTestId("prefill-edit-script")).toBeTruthy();
    // Pure derivations of the script and the picker's decision: no editor.
    expect(screen.queryByTestId("prefill-edit-scriptClass")).toBeNull();
    expect(screen.queryByTestId("prefill-edit-routingGroup")).toBeNull();
    expect(screen.queryByTestId("prefill-edit-startingKeyboard")).toBeNull();
  });

  it("Enter outside an editor still confirms the step", () => {
    const onConfirm = vi.fn();
    render(<Prefill identity={identity} base={base} onConfirm={onConfirm} identityEdits={edits()} />);
    fireEvent.keyDown(screen.getByText("Confirm the basics"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("Prefill inline editing — language row", () => {
  it("Enter in the editor commits the edit and does NOT confirm the step", () => {
    const onConfirm = vi.fn();
    const channel = edits();
    render(<Prefill identity={identity} base={base} onConfirm={onConfirm} identityEdits={channel} />);

    fireEvent.click(screen.getByTestId("prefill-edit-language"));
    const input = screen.getByTestId("prefill-edit-language-input") as HTMLInputElement;
    expect(input.value).toBe("Bafut");

    fireEvent.change(input, { target: { value: "Bafut (revised)" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(channel.onLanguageName).toHaveBeenCalledTimes(1);
    expect(channel.onLanguageName).toHaveBeenCalledWith("Bafut (revised)");
    expect(onConfirm).not.toHaveBeenCalled();
    // Editor closed; the row is back to its read-only rendering.
    expect(screen.queryByTestId("prefill-edit-language-input")).toBeNull();
  });

  it("Escape cancels the edit without writing", () => {
    const channel = edits();
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} identityEdits={channel} />);

    fireEvent.click(screen.getByTestId("prefill-edit-language"));
    const input = screen.getByTestId("prefill-edit-language-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(channel.onLanguageName).not.toHaveBeenCalled();
    expect(screen.queryByTestId("prefill-edit-language-input")).toBeNull();
    expect(screen.getByText("Bafut")).toBeTruthy();
  });

  it("an unchanged draft commits nothing", () => {
    const channel = edits();
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} identityEdits={channel} />);

    fireEvent.click(screen.getByTestId("prefill-edit-language"));
    const input = screen.getByTestId("prefill-edit-language-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });

    expect(channel.onLanguageName).not.toHaveBeenCalled();
    expect(screen.queryByTestId("prefill-edit-language-input")).toBeNull();
  });
});

describe("Prefill inline editing — script row", () => {
  it("explicitly selecting a script commits it and does NOT confirm the step", async () => {
    const onConfirm = vi.fn();
    const channel = edits();
    render(<Prefill identity={identity} base={base} onConfirm={onConfirm} identityEdits={channel} />);

    fireEvent.click(screen.getByTestId("prefill-edit-script"));
    const trigger = screen.getByRole("button", { name: "Target script" });
    await changeSelectMenu(trigger, "Deva");

    expect(channel.onTargetScript).toHaveBeenCalledTimes(1);
    expect(channel.onTargetScript).toHaveBeenCalledWith("Deva");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Target script" })).toBeNull();
  });

  it("Cancel leaves the script untouched", () => {
    const channel = edits();
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} identityEdits={channel} />);

    fireEvent.click(screen.getByTestId("prefill-edit-script"));
    fireEvent.click(screen.getByTestId("prefill-edit-cancel"));

    expect(channel.onTargetScript).not.toHaveBeenCalled();
    expect(screen.queryByTestId("prefill-edit-cancel")).toBeNull();
    expect(screen.getByText("Latn")).toBeTruthy();
  });

  it("does not offer the v1-gated scripts as inline-edit targets", async () => {
    render(<Prefill identity={identity} base={base} onConfirm={vi.fn()} identityEdits={edits()} />);
    fireEvent.click(screen.getByTestId("prefill-edit-script"));
    const trigger = screen.getByRole("button", { name: "Target script" });
    fireEvent.click(trigger);
    const listbox = await screen.findByRole("listbox");
    const values = Array.from(listbox.querySelectorAll("li[data-value]")).map((li) =>
      li.getAttribute("data-value"),
    );
    expect(values).toContain("Latn");
    expect(values).toContain("Deva");
    expect(values).not.toContain("Ethi");
    expect(values).not.toContain("Hani");
    expect(values).not.toContain("Hang");
  });
});

describe("Prefill inline editing — provenance", () => {
  it("marks an edited language row 'edited by you'", () => {
    render(
      <Prefill
        identity={identity}
        base={base}
        onConfirm={vi.fn()}
        identityEdits={edits({ languageEdited: true })}
      />,
    );
    expect(screen.getByText("edited by you")).toBeTruthy();
  });

  it("an edited script row replaces its derived note with 'edited by you'", () => {
    render(
      <Prefill
        identity={identity}
        base={base}
        onConfirm={vi.fn()}
        identityEdits={edits({ scriptEdited: true })}
      />,
    );
    expect(screen.getByText("edited by you")).toBeTruthy();
    expect(screen.queryByText("BCP47 script subtag (§5)")).toBeNull();
    // The dependent rows keep their honest "derived from script" note.
    expect(screen.getAllByText("derived from script")).toHaveLength(2);
  });
});
