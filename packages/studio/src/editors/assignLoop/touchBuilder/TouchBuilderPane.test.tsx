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
  return (
    <TouchBuilderPane
      layout={layout}
      activePlatformId={platform}
      onSelectPlatform={setPlatform}
      activeLayerId={layer}
      onSelectLayer={setLayer}
      selectedKeyAddress={selected}
      onSelectKey={setSelected}
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
});
