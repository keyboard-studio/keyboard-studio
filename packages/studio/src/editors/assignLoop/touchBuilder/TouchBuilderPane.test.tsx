// TouchBuilderPane.test.tsx — gesture → op wiring for the visual builder
// pane. The pane is store-free: `commitOp`/`onSelectKey`/etc. are props, so
// these tests assert the exact `PendingKeyEditOperation` each gesture
// produces (the op-level contract), not the store's reaction to it.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, within, type RenderResult } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { useState, type ReactElement } from "react";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { replayKeyEditOverlay } from "@keyboard-studio/engine";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import { TouchBuilderPane } from "./TouchBuilderPane.tsx";

const LAYOUT_JSON = `{
  "phone": {
    "layer": [
      { "id": "default", "row": [
        { "id": 1, "key": [
          { "id": "K_A", "text": "zzz" },
          { "id": "K_B", "text": "b", "nextlayer": "shift" },
          { "id": "K_C", "text": "c" }
        ]}
      ]},
      { "id": "shift", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "A" } ]}
      ]}
    ]
  },
  "tablet": {
    "layer": [
      { "id": "default", "row": [
        { "id": 1, "key": [ { "id": "K_A", "text": "a" } ]}
      ]}
    ]
  }
}`;

// Module-level recording: assigned once, never replaced by a re-render
// (a per-render array reassigned onto a static is wiped by the next render).
let recorded: PendingKeyEditOperation[] = [];

function Harness() {
  // Mini working-copy: ops are RECORDED and APPLIED through the real
  // applier, so the pane re-renders against the updated layout exactly
  // like it does against the real store.
  const [layout, setLayout] = useState(() => parseTouchLayoutString(LAYOUT_JSON));
  const [platform, setPlatform] = useState<string | null>("phone");
  const [layer, setLayer] = useState("default");
  const [selected, setSelected] = useState<string | null>(null);
  // Tray state mirrors TouchGallery (the bar lives in its locked header).
  const [trayLetter, setTrayLetter] = useState<string | null>(null);
  const [, setTrayReturns] = useState<string[]>([]);
  return (
    <TouchBuilderPane
      layout={layout}
      activePlatformId={platform}
      onSelectPlatform={setPlatform}
      activeLayerId={layer}
      onSelectLayer={setLayer}
      selectedKeyAddress={selected}
      onSelectKey={setSelected}
      trayLetter={trayLetter}
      onSelectTrayLetter={setTrayLetter}
      onTrayReturnsChange={setTrayReturns}
      commitOp={(op) => {
        recorded.push(op);
        setLayout((prev) => replayKeyEditOverlay(prev, { ops: [op] }).layout);
        return true;
      }}
    />
  );
}

function committedOps(): PendingKeyEditOperation[] {
  return recorded;
}

// Scoped test setup: every query runs against the CURRENT render's
// container (RTL auto-cleanup is not installed under vitest
// `globals: false`, so `screen.*` would leak across tests).
interface Setup {
  readonly q: ReturnType<typeof within>;
  readonly keyEl: (address: string) => HTMLElement;
  readonly selectKey: (address: string) => void;
}

function setup(ui?: ReactElement): Setup {
  const result: RenderResult = render(ui ?? <Harness />);
  const q = within(result.container);
  const keyEl = (address: string): HTMLElement => {
    const el = result.container.querySelector(`[data-address="${address}"]`);
    if (!(el instanceof HTMLElement)) throw new Error(`no key element for ${address}`);
    return el;
  };
  return {
    q,
    keyEl,
    selectKey: (address: string) => {
      fireEvent.click(keyEl(address));
    },
  };
}

function directRender(onSelectLayer: (id: string) => void, onSelectPlatform: (id: string) => void): Setup {
  return setup(
    <TouchBuilderPane
      layout={parseTouchLayoutString(LAYOUT_JSON)}
      activePlatformId="phone"
      onSelectPlatform={onSelectPlatform}
      activeLayerId="default"
      onSelectLayer={onSelectLayer}
      selectedKeyAddress={null}
      onSelectKey={() => {}}
      commitOp={() => true}
    />,
  );
}

describe("TouchBuilderPane", () => {
  beforeEach(() => {
    recorded = [];
  });

  it("renders platform tabs, layer tabs, and canvas keys", () => {
    const { q } = setup();
    expect(q.getByTestId("touch-builder-platform-phone")).toBeDefined();
    expect(q.getByTestId("touch-builder-platform-tablet")).toBeDefined();
    expect(q.getByTestId("touch-builder-layer-default")).toBeDefined();
    expect(q.getByTestId("touch-builder-layer-shift")).toBeDefined();
    expect(q.getAllByTestId("touch-builder-key")).toHaveLength(3);
  });

  it("clicking a key selects it and reveals the toolbar", () => {
    const { q, selectKey } = setup();
    expect(q.queryByTestId("touch-builder-field-text")).toBeNull();
    selectKey("phone:default:K_A");
    expect(q.getByTestId("touch-builder-field-text")).toBeDefined();
    expect(q.getByTestId("touch-builder-add-right")).toBeDefined();
  });

  it("keycap text edit commits one set {text} op on blur", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    const input = q.getByTestId("touch-builder-field-text") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ä" } });
    fireEvent.blur(input);
    expect(committedOps()).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "ä" } },
    ]);
  });

  it("id edit commits a rename op, not a set", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    const input = q.getByTestId("touch-builder-field-id") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "K_AX" } });
    fireEvent.blur(input);
    expect(committedOps()).toEqual([
      { address: "phone:default:K_A", kind: "rename", toId: "K_AX" },
    ]);
  });

  it("renaming a key whose id was minted by an add op renames the minted key", () => {
    const { q, selectKey, keyEl } = setup();
    // Mint a new key via the add wedge, then rename it: the rename must
    // address the minted id (T_new_1), not the anchor key.
    selectKey("phone:default:K_A");
    fireEvent.click(q.getByTestId("touch-builder-add-right"));
    selectKey("phone:default:T_new_1");
    const input = q.getByTestId("touch-builder-field-id") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "K_ZZ" } });
    fireEvent.blur(input);
    const ops = committedOps();
    expect(ops[ops.length - 1]).toEqual({
      address: "phone:default:T_new_1",
      kind: "rename",
      toId: "K_ZZ",
    });
    // The key answers to its new id in the replayed layout.
    expect(keyEl("phone:default:K_ZZ")).toBeTruthy();
  });

  it("key type → Blank commits the compound suppress op", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_C");
    fireEvent.change(q.getByTestId("touch-builder-field-sp"), {
      target: { value: "9" },
    });
    expect(committedOps()).toEqual([
      {
        address: "phone:default:K_C",
        kind: "suppress",
        spClass: 9,
        sentinelId: "T_BLANK",
      },
    ]);
  });

  it("add-right wedge commits an add op with a T_new_N id", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    fireEvent.click(q.getByTestId("touch-builder-add-right"));
    expect(committedOps()).toEqual([
      {
        address: "phone:default:K_A",
        kind: "add",
        position: "after",
        key: { id: "T_new_1", text: "", sp: 0 },
      },
    ]);
  });

  it("delete wedge commits remove {reflow}", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_B");
    fireEvent.click(q.getByTestId("touch-builder-delete-key"));
    expect(committedOps()).toEqual([
      { address: "phone:default:K_B", kind: "remove", outcome: "reflow" },
    ]);
  });

  it("double-click with nextlayer navigates to that layer", () => {
    const onSelectLayer = vi.fn();
    const { keyEl } = directRender(onSelectLayer, () => {});
    fireEvent.doubleClick(keyEl("phone:default:K_B"));
    expect(onSelectLayer).toHaveBeenCalledWith("shift");
  });

  it("subkey add → select → delete decomposes to setSubKey/removeSubKey", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    // Add a longpress subkey: upsert with a T_new_N id.
    fireEvent.click(q.getByTestId("touch-builder-subkeys-sk").querySelector("button")!);
    const afterAdd = committedOps();
    expect(afterAdd).toHaveLength(1);
    expect(afterAdd[0]).toMatchObject({
      address: "phone:default:K_A",
      kind: "setSubKey",
      sub: { kind: "sk", id: "T_new_1" },
    });
    // The new subkey is selected; editing its text commits setSubKey.
    const textInput = q.getByTestId("touch-builder-subkey-field-text") as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: "à" } });
    fireEvent.blur(textInput);
    expect(committedOps()[1]).toMatchObject({
      address: "phone:default:K_A",
      kind: "setSubKey",
      sub: { kind: "sk", id: "T_new_1" },
      fields: { text: "à" },
    });
    // Delete removes it.
    fireEvent.click(q.getByTestId("touch-builder-subkey-delete"));
    expect(committedOps()[2]).toEqual({
      address: "phone:default:K_A",
      kind: "removeSubKey",
      sub: { kind: "sk", id: "T_new_1" },
    });
  });

  it("template apply commits set {text} ops for id+layer matches", () => {
    const { q } = setup();
    fireEvent.click(q.getByTestId("touch-builder-template-button"));
    expect(q.getByTestId("touch-builder-template-dialog")).toBeDefined();
    // Two-step: Continue, then Apply.
    fireEvent.click(q.getByTestId("touch-builder-template-apply"));
    fireEvent.click(q.getByTestId("touch-builder-template-apply"));
    expect(q.queryByTestId("touch-builder-template-dialog")).toBeNull();
    // K_A on phone/default: current "zzz" vs template-latin "a".
    expect(committedOps()).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { text: "a" } },
    ]);
  });

  it("platform switcher changes the active platform", () => {
    const onSelectPlatform = vi.fn();
    const { q } = directRender(() => {}, onSelectPlatform);
    fireEvent.click(q.getByTestId("touch-builder-platform-tablet"));
    expect(onSelectPlatform).toHaveBeenCalledWith("tablet");
  });

  // #2596 item 1 — copy a key, with its longpress keys, to another layer.
  it("copy control commits copyToLayer and the clone carries its subkeys", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_B");
    // Give K_B a longpress subkey first: the copy must carry it.
    fireEvent.click(q.getByTestId("touch-builder-subkeys-sk").querySelector("button")!);
    expect(committedOps()[0]).toMatchObject({
      kind: "setSubKey",
      sub: { kind: "sk", id: "T_new_1" },
    });
    // Copy K_B to shift (shift has no K_B, so no collision).
    fireEvent.change(q.getByTestId("touch-builder-copy-layer-select"), {
      target: { value: "shift" },
    });
    fireEvent.click(q.getByTestId("touch-builder-copy-layer-apply"));
    expect(committedOps()).toContainEqual({
      address: "phone:default:K_B",
      kind: "copyToLayer",
      toLayer: "shift",
    });
    // The pane switched the display to the target layer; the source key is
    // still there, and the copy answers on shift with its longpress intact.
    expect(q.getAllByTestId("touch-builder-key")).toHaveLength(2);
    selectKey("phone:shift:K_B");
    expect(q.getByTestId("touch-builder-subkey-sk-T_new_1")).toBeDefined();
  });

  it("copy control offers only other layers", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    const select = q.getByTestId("touch-builder-copy-layer-select") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).not.toContain("default");
    expect(options).toContain("shift");
  });

  // #2596 item 5 — key id suggested from the text typed into a new key.
  it("suggests the key id from the text of a fresh key", () => {
    const { q, selectKey, keyEl } = setup();
    selectKey("phone:default:K_A");
    fireEvent.click(q.getByTestId("touch-builder-add-right"));
    selectKey("phone:default:T_new_1");
    // No text yet — no suggestion.
    expect(q.queryByTestId("touch-builder-suggest-id")).toBeNull();
    // Type the text: the suggestion appears.
    const textInput = q.getByTestId("touch-builder-field-text") as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: "ä" } });
    fireEvent.blur(textInput);
    const suggest = q.getByTestId("touch-builder-suggest-id");
    expect(suggest).toBeDefined();
    fireEvent.click(suggest);
    const ops = committedOps();
    expect(ops[ops.length - 1]).toEqual({
      address: "phone:default:T_new_1",
      kind: "rename",
      toId: "U_00E4",
    });
    expect(keyEl("phone:default:U_00E4")).toBeTruthy();
  });

  it("offers no id suggestion for an established key or a combining mark", () => {
    const { q, selectKey } = setup();
    // Established key: id is not a fresh T_new_N.
    selectKey("phone:default:K_A");
    expect(q.queryByTestId("touch-builder-suggest-id")).toBeNull();
    // Fresh key with a combining mark: guarded T_ per spec 104 FR-005(d),
    // so no U_ suggestion.
    fireEvent.click(q.getByTestId("touch-builder-add-right"));
    selectKey("phone:default:T_new_1");
    const textInput = q.getByTestId("touch-builder-field-text") as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: "\u0301" } });
    fireEvent.blur(textInput);
    expect(q.queryByTestId("touch-builder-suggest-id")).toBeNull();
  });

  // #2596 item 4 — snap to grid + right-edge position.
  it("shows the selected key's right-edge position in its row", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    // Default width 100 + default pad 15.
    expect(q.getByTestId("touch-builder-right-edge").textContent).toContain("115");
    selectKey("phone:default:K_B");
    expect(q.getByTestId("touch-builder-right-edge").textContent).toContain("230");
    selectKey("phone:default:K_C");
    expect(q.getByTestId("touch-builder-right-edge").textContent).toContain("345");
  });

  it("snaps a typed width to the 10-unit grid on commit", () => {
    const { q, selectKey } = setup();
    selectKey("phone:default:K_A");
    const widthInput = q.getByTestId("touch-builder-field-width") as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: "106" } });
    fireEvent.blur(widthInput);
    expect(committedOps()).toEqual([
      { address: "phone:default:K_A", kind: "set", fields: { width: 110 } },
    ]);
  });
});
