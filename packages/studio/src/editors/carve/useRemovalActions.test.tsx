// The carve gallery's remove / restore / restore-all (spec 111 "live files", S1):
// Copy keeps the store's overlay actions byte for byte; Open writes into the
// files through the consent host and writes no overlay.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenRemovalStore } from "../../stores/openRemovalStore.ts";
import { OpenApplyHost } from "../../components/OpenApplyHost.tsx";
import { readVfsText } from "../../lib/vfsText.ts";
import { useOpenRemovals, useRemovalActions } from "./useRemovalActions.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = "store(&NAME) 'Tiny'\r\nbegin Unicode > use(main)\r\ngroup(main) using keys\r\n+ [K_A] > 'a'\r\n+ [K_B] > 'b'\r\n+ [K_C] > 'c'\r\n";
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

function seed(mode: "adapt-existing" | "new-from-base", withKps = true): void {
  useOpenRemovalStore.getState().clear();
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    ...(withKps ? [{ path: `source/${ID}.kps`, content: "<Package/>", isBinary: false }] : []),
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  const opts = { vfs, ir: parseKmn(KMN, ID).ir };
  if (mode === "adapt-existing") wc.instantiateFromExisting(KB, opts);
  else wc.instantiateFromStart(KB, opts);
  wc.setFallbackPolicy("pass-through");
}

const ruleId = (vkey: string): string =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules)
    .find((r) => r.context.some((c) => c.kind === "vkey" && c.name === vkey))!.nodeId;
const kmn = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)!;

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider i18n={i18n}><OpenApplyHost>{children}</OpenApplyHost></I18nProvider>
);

function overlaySnapshot() {
  const s = useWorkingCopyStore.getState();
  return {
    items: [...s.deletedItemIds], chars: [...s.carveChars], undo: JSON.stringify(s.undoStack),
    suggestion: JSON.stringify(s.carveSuggestion),
  };
}

afterEach(cleanup);

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

describe("useRemovalActions on Copy", () => {
  it("writes exactly what the raw store actions write, and no file", () => {
    seed("new-from-base");
    const rawId = ruleId("K_B");
    const startVfs = useWorkingCopyStore.getState().startVfs;
    const st = useWorkingCopyStore.getState();
    st.cascadeDelete([rawId], [], ["b"]);
    st.cascadeRestore([rawId], ["b"]);
    st.cascadeDelete([rawId], [], ["b"]);
    const raw = overlaySnapshot();
    st.restoreAll();
    const rawAfterAll = overlaySnapshot();

    seed("new-from-base");
    const { result } = renderHook(() => useRemovalActions(), { wrapper });
    result.current.cascadeDelete([ruleId("K_B")], [], ["b"]);
    result.current.cascadeRestore([ruleId("K_B")], ["b"]);
    result.current.cascadeDelete([ruleId("K_B")], [], ["b"]);
    expect(overlaySnapshot()).toEqual(raw);
    result.current.restoreAll();
    expect(overlaySnapshot()).toEqual(rawAfterAll);
    expect(kmn()).toBe(KMN);
    expect(useWorkingCopyStore.getState().startVfs).not.toBe(startVfs); // fresh seed, never rewritten
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
  });

  it("an Open draft with no descriptor keeps the overlay behaviour", () => {
    seed("adapt-existing", false);
    const { result } = renderHook(() => useRemovalActions(), { wrapper });
    result.current.cascadeDelete([ruleId("K_B")], [], ["b"]);
    expect([...useWorkingCopyStore.getState().deletedItemIds]).toEqual([ruleId("K_B")]);
    expect(kmn()).toBe(KMN);
  });
});

describe("useRemovalActions on Open", () => {
  it("remove writes the file and no overlay; restore and restore-all put the text back", async () => {
    seed("adapt-existing");
    const { result } = renderHook(
      () => ({ actions: useRemovalActions(), removals: useOpenRemovals() }),
      { wrapper },
    );
    await act(async () => { result.current.actions.cascadeDelete([ruleId("K_B")], [], ["b"]); });
    await waitFor(() => expect(result.current.removals).toHaveLength(1));
    expect(kmn()).toBe(KMN.replace("+ [K_B] > 'b'\r\n", ""));
    expect(overlaySnapshot()).toEqual({ items: [], chars: [], undo: "[]", suggestion: "null" });

    await act(async () => { result.current.actions.cascadeRestore([], ["b"]); });
    await waitFor(() => expect(result.current.removals).toHaveLength(0));
    expect(kmn()).toBe(KMN);

    await act(async () => {
      result.current.actions.cascadeDelete([ruleId("K_A")], [], ["a"]);
    });
    await act(async () => {
      result.current.actions.cascadeDelete([ruleId("K_C")], [], ["c"]);
    });
    await waitFor(() => expect(result.current.removals).toHaveLength(2));
    await act(async () => { result.current.actions.restoreAll(); });
    await waitFor(() => expect(result.current.removals).toHaveLength(0));
    expect(kmn()).toBe(KMN);
  });

  it("keepAll leaves the key-edit and deadkey overlays alone on Open, clears them on Copy", () => {
    for (const [mode, expected] of [["adapt-existing", 1], ["new-from-base", 0]] as const) {
      seed(mode);
      useWorkingCopyStore.setState({
        keyEditOverlay: { ops: [{ seq: 1 } as never] },
        deadkeyOverlay: { ops: [{ seq: 1 } as never] },
      });
      useWorkingCopyStore.getState().keepAll();
      const s = useWorkingCopyStore.getState();
      expect(s.keyEditOverlay.ops).toHaveLength(expected);
      expect(s.deadkeyOverlay.ops).toHaveLength(expected);
    }
  });
});

describe("OpenApplyHost consent", () => {
  // A rule with no source line cannot be spliced out, so the change needs consent.
  function unspliceable(): void {
    for (const g of useWorkingCopyStore.getState().startIr!.groups) {
      for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    }
  }

  function Remover() {
    const { cascadeDelete } = useRemovalActions();
    return (
      <button type="button" onClick={() => cascadeDelete([ruleId("K_B")], [], ["b"])}>
        remove-b
      </button>
    );
  }

  it("asks first, leaves the file unchanged on decline, and says so", async () => {
    seed("adapt-existing");
    unspliceable();
    render(wrapper({ children: <Remover /> }));
    await act(async () => { screen.getByText("remove-b").click(); });
    await screen.findByTestId("reformat-consent-dialog");
    expect(kmn()).toBe(KMN);
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    expect(await screen.findByTestId("open-apply-notice")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("not applied");
    expect(kmn()).toBe(KMN);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(0);
  });

  it("re-emits when the author agrees", async () => {
    seed("adapt-existing");
    unspliceable();
    render(wrapper({ children: <Remover /> }));
    await act(async () => { screen.getByText("remove-b").click(); });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    await waitFor(() => expect(kmn()).not.toBe(KMN));
    expect(kmn()).not.toContain("[K_B]");
    expect(screen.queryByTestId("open-apply-notice")).toBeNull();
  });
});

describe("OpenApplyHost consent for a restore", () => {
  it("asks, and a decline leaves the file as it is", async () => {
    seed("adapt-existing");
    function Both() {
      const { cascadeDelete, cascadeRestore } = useRemovalActions();
      return (
        <>
          <button type="button" onClick={() => cascadeDelete([ruleId("K_B")], [], ["b"])}>remove-b</button>
          <button type="button" onClick={() => cascadeRestore([], ["b"])}>restore-b</button>
        </>
      );
    }
    render(wrapper({ children: <Both /> }));
    await act(async () => { screen.getByText("remove-b").click(); });
    await waitFor(() => expect(useOpenRemovalStore.getState().entries).toHaveLength(1));
    // The neighbour the record names is gone and the file moved on.
    const [entry] = useOpenRemovalStore.getState().entries;
    act(() => {
      useOpenRemovalStore.setState({
        entries: [{ ...entry!, files: {}, rules: entry!.rules.map((r) => ({ ...r, prevText: "gone", prevOrdinal: 1 })) }],
      });
    });
    const after = kmn();
    await act(async () => { screen.getByText("restore-b").click(); });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    expect(await screen.findByTestId("open-apply-notice")).toBeTruthy();
    expect(kmn()).toBe(after);
    expect(useOpenRemovalStore.getState().entries).toHaveLength(1);
  });
});
