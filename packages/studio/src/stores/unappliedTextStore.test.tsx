// The shared leave guard (spec 111 FR-046): when it asks, what each answer does, and when it does not ask.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../test/renderWithI18n.tsx";
import { UnappliedTextDialog } from "../components/UnappliedTextDialog.tsx";
import { guardLeave, useUnappliedTextStore, type UnappliedTextHandle } from "./unappliedTextStore.ts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

const KMN = "store(&NAME) 'Kb'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
const KB: StartKeyboard = { id: "kb", path: "release/k/kb", script: "Latn", targets: ["windows"], displayName: "Kb", version: "1.0" };

function openKeyboard(withDescriptor: boolean): void {
  const vfs = createVirtualFS();
  vfs.set("source/kb.kmn", KMN, false);
  if (withDescriptor) vfs.set("source/kb.kps", "<Package/>", false);
  useWorkingCopyStore.getState().instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, "kb").ir });
}

function handle(label: string, over: Partial<UnappliedTextHandle> = {}): UnappliedTextHandle {
  return {
    label,
    hasUnapplied: () => true,
    apply: () => Promise.resolve(true),
    discard: () => undefined,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  useUnappliedTextStore.setState({ handles: new Map(), asking: null });
  useWorkingCopyStore.getState().reset();
});

describe("guardLeave", () => {
  beforeEach(() => openKeyboard(true));

  it("leaves at once, synchronously, when no view is registered", () => {
    const leave = vi.fn();
    guardLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("does not ask on a keyboard that was not opened for update (Copy keeps its behaviour)", () => {
    useWorkingCopyStore.getState().reset();
    useUnappliedTextStore.getState().register("a", handle("a view"));
    const leave = vi.fn();
    guardLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(useUnappliedTextStore.getState().asking).toBeNull();
  });

  it("names every view that holds text, in one question", () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle("the stylesheet"));
    useUnappliedTextStore.getState().register("b", handle("the touch layout"));
    useUnappliedTextStore.getState().register("c", handle("clean view", { hasUnapplied: () => false }));
    act(() => guardLeave(() => undefined));
    const body = screen.getByTestId("unapplied-text-body").textContent ?? "";
    expect(body).toContain("the stylesheet");
    expect(body).toContain("the touch layout");
    expect(body).not.toContain("clean view");
  });

  it("the question is a labelled dialog and Escape keeps the author where they are", async () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle("the stylesheet"));
    const leave = vi.fn();
    act(() => guardLeave(leave));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label") ?? dialog.getAttribute("aria-labelledby")).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("unapplied-text-dialog")).toBeNull());
    expect(leave).not.toHaveBeenCalled();
  });

  it("Apply runs each view's apply in turn and leaves only when all took the text", async () => {
    render(<UnappliedTextDialog />);
    const order: string[] = [];
    useUnappliedTextStore.getState().register("a", handle("a", { apply: () => (order.push("a"), Promise.resolve(true)) }));
    useUnappliedTextStore.getState().register("b", handle("b", { apply: () => (order.push("b"), Promise.resolve(true)) }));
    const leave = vi.fn();
    act(() => guardLeave(leave));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["a", "b"]);
  });

  it("a view that refuses stops the leave and the rest are not applied", async () => {
    render(<UnappliedTextDialog />);
    const second = vi.fn(() => Promise.resolve(true));
    useUnappliedTextStore.getState().register("a", handle("a", { apply: () => Promise.resolve(false) }));
    useUnappliedTextStore.getState().register("b", handle("b", { apply: second }));
    const leave = vi.fn();
    act(() => guardLeave(leave));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(leave).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("a view whose apply throws stays", async () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle("a", { apply: () => Promise.reject(new Error("boom")) }));
    const leave = vi.fn();
    act(() => guardLeave(leave));
    fireEvent.click(screen.getByTestId("unapplied-text-apply"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(leave).not.toHaveBeenCalled();
  });

  it("Discard drops every view's text, then leaves", async () => {
    render(<UnappliedTextDialog />);
    const discardA = vi.fn();
    const discardB = vi.fn();
    useUnappliedTextStore.getState().register("a", handle("a", { discard: discardA }));
    useUnappliedTextStore.getState().register("b", handle("b", { discard: discardB }));
    const leave = vi.fn();
    act(() => guardLeave(leave));
    fireEvent.click(screen.getByTestId("unapplied-text-discard"));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    expect(discardA).toHaveBeenCalledTimes(1);
    expect(discardB).toHaveBeenCalledTimes(1);
  });

  it("a second leave while the question is open is ignored", () => {
    render(<UnappliedTextDialog />);
    useUnappliedTextStore.getState().register("a", handle("a"));
    const first = vi.fn();
    const second = vi.fn();
    act(() => guardLeave(first));
    act(() => guardLeave(second));
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("a view that unregisters is no longer asked about", () => {
    const off = useUnappliedTextStore.getState().register("a", handle("a"));
    off();
    const leave = vi.fn();
    guardLeave(leave);
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
