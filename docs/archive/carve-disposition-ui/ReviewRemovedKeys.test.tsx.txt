// ReviewRemovedKeys.test.tsx — T017 (spec 076 FR-023, amendments A1/A2/A3).
//
// The "Review removed keys" panel lists every carved combination with its
// disposition, provenance, and cross-host consequence table, ending in the
// A2 two-sided verdict. These tests assert the binding copy verbatim and the
// retired slogan's absence, plus the gallery wiring (button entry point).

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import type { KeyboardIR, IRRule, IRGroup } from "@keyboard-studio/contracts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { saveLayoutFamilyAnswer } from "../../lib/layoutFamily.ts";
import { CarveGalleryV2 } from "./CarveGalleryV2.tsx";
import {
  ReviewRemovedKeysDialog,
  resolveCarvedCombos,
  PROVENANCE_LABELS,
  RETIRED_SLOGAN,
} from "./ReviewRemovedKeys.tsx";
import type { CarvedCombo } from "./ReviewRemovedKeys.tsx";
import type { CarveDisposition } from "@keyboard-studio/contracts";

// Offline stub — keeps the gallery-wiring tests deterministic and network-free.
vi.mock("../../lib/services.ts", () => ({
  neededCharsForLanguage: async () => null,
}));

afterEach(() => {
  cleanup();
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRule(nodeId: string, vkey: string, char: string, modifiers: string[] = []): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers }],
    output: [{ kind: "char", value: char }],
  };
}

function makeGroup(nodeId: string, name: string, rules: IRRule[]): IRGroup {
  return { nodeId, name, usingKeys: true, rules, readonly: false };
}

function makeStore(nodeId: string, name: string, chars: string[]) {
  return {
    nodeId,
    name,
    items: chars.map((c) => ({ kind: "char" as const, value: c })),
    isSystem: false,
  };
}

const RULE_COMBOS: CarveDisposition[] = [
  { comboId: "r-altgr4", disposition: "block", provenance: "bulk-default" },
  { comboId: "r-quote", disposition: "allow-host", provenance: "author-override" },
];

function makeIR(groups: IRGroup[], stores: ReturnType<typeof makeStore>[] = []): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores,
    groups,
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

function ruleIr(): KeyboardIR {
  return makeIR([
    makeGroup("g1", "main", [
      makeRule("r-altgr4", "K_4", "€", ["RALT"]),
      makeRule("r-quote", "K_QUOTE", "é"),
    ]),
  ]);
}

/** Two fabricated combos for dialog copy tests (resolution is tested above). */
function dialogCombos(): CarvedCombo[] {
  return [
    {
      comboId: "r-altgr4",
      label: "RALT + 4",
      key: "K_4",
      modifiers: ["RALT"],
      disposition: "block",
      provenance: "bulk-default",
      isStoreSlot: false,
    },
    {
      comboId: "r-quote",
      label: "'",
      key: "K_QUOTE",
      modifiers: [],
      disposition: "allow-host",
      provenance: "author-override",
      isStoreSlot: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// resolveCarvedCombos
// ---------------------------------------------------------------------------

describe("resolveCarvedCombos", () => {
  it("resolves rule combos to key+modifiers with humanized labels", () => {
    const rows = resolveCarvedCombos(ruleIr(), RULE_COMBOS);
    expect(rows).toHaveLength(2);
    const altgr4 = rows.find((r) => r.comboId === "r-altgr4")!;
    expect(altgr4.label).toBe("RALT + 4");
    expect(altgr4.key).toBe("K_4");
    expect(altgr4.modifiers).toEqual(["RALT"]);
    expect(altgr4.disposition).toBe("block");
    expect(altgr4.provenance).toBe("bulk-default");
    expect(altgr4.isStoreSlot).toBe(false);
  });

  it("uses the trigger (last) vkey when a rule has a multi-key context", () => {
    const ir = ruleIr();
    ir.groups[0]!.rules.push({
      nodeId: "r-seq",
      context: [
        { kind: "vkey", name: "K_A", modifiers: [] },
        { kind: "vkey", name: "K_B", modifiers: ["SHIFT"] },
      ],
      output: [{ kind: "char", value: "x" }],
    } as IRRule);
    const rows = resolveCarvedCombos(ir, [
      { comboId: "r-seq", disposition: "block", provenance: "author-override" },
    ]);
    expect(rows[0]!.label).toBe("SHIFT + B");
    expect(rows[0]!.key).toBe("K_B");
  });

  it("drops stale rule comboIds instead of rendering broken rows", () => {
    const rows = resolveCarvedCombos(ruleIr(), [
      { comboId: "r-gone", disposition: "block", provenance: "bulk-default" },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("resolves slot combos with the paired any() rule's trigger key", () => {
    const ir = makeIR(
      [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r-pair",
              context: [
                { kind: "vkey", name: "K_E", modifiers: ["SHIFT"] },
                { kind: "any", storeRef: "deadkeyChars", index: 0 },
              ],
              output: [{ kind: "char", value: "É" }],
            } as IRRule,
          ],
        },
      ],
      [makeStore("store1", "deadkeyChars", ["É"])],
    );
    const rows = resolveCarvedCombos(ir, [
      { comboId: "store1#0", disposition: "allow-host", provenance: "closed-keyboard-card" },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.isStoreSlot).toBe(true);
    expect(row.label).toBe('store "deadkeyChars" slot 0 — ‘É’');
    expect(row.key).toBe("K_E");
    expect(row.modifiers).toEqual(["SHIFT"]);
    expect(row.provenance).toBe("closed-keyboard-card");
  });

  it("renders slot combos with unknown host consequence when no rule pairs", () => {
    const ir = makeIR([], [makeStore("store9", "lone", ["ñ"])]);
    const rows = resolveCarvedCombos(ir, [
      { comboId: "store9#0", disposition: "block", provenance: "bulk-default" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBeUndefined();
    expect(rows[0]!.label).toBe('store "lone" slot 0 — ‘ñ’');
  });

  it("drops stale slot comboIds (store or item gone)", () => {
    const ir = ruleIr();
    const rows = resolveCarvedCombos(ir, [
      { comboId: "nostore#0", disposition: "block", provenance: "bulk-default" },
    ]);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dialog content and binding copy
// ---------------------------------------------------------------------------

describe("ReviewRemovedKeysDialog", () => {
  it("lists every carved combo with disposition and provenance", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    const table = screen.getByTestId("review-removed-keys-table");
    expect(within(table).getByTestId("review-removed-keys-row-r-altgr4")).toBeTruthy();
    expect(within(table).getByTestId("review-removed-keys-row-r-quote")).toBeTruthy();
    expect(screen.getByText("RALT + 4")).toBeTruthy();
    expect(screen.getByText("Block")).toBeTruthy();
    expect(screen.getByText("Allow host")).toBeTruthy();
    expect(screen.getByText(PROVENANCE_LABELS["bulk-default"])).toBeTruthy();
    expect(screen.getByText(PROVENANCE_LABELS["author-override"])).toBeTruthy();
  });

  it("shows the cross-host consequence: UK AltGr+4 is €, unmapped cells are unknown", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    const row = screen.getByTestId("review-removed-keys-row-r-altgr4");
    // UK English reference data: RALT/AltGr + K_4 produces €.
    expect(within(row).getByText("€")).toBeTruthy();
  });

  it("marks the unknown host cell as unknown rather than guessing", () => {
    render(
      <ReviewRemovedKeysDialog
        combos={[
          {
            comboId: "r-orphan",
            label: "store entry",
            key: undefined,
            modifiers: [],
            disposition: "block",
            provenance: "bulk-default",
            isStoreSlot: true,
          },
        ]}
        onClose={() => {}}
      />,
    );
    const row = screen.getByTestId("review-removed-keys-row-r-orphan");
    const unknowns = within(row).getAllByText("unknown");
    expect(unknowns.length).toBeGreaterThan(0);
  });

  it("renders the deadkey sentinel where the host has a deadkey cell", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    const row = screen.getByTestId("review-removed-keys-row-r-quote");
    // US-International: bare K_QUOTE is a deadkey.
    expect(within(row).getByText("deadkey")).toBeTruthy();
  });

  it("defaults to all five reference hosts with no language signal", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    const table = screen.getByTestId("review-removed-keys-table");
    const headers = within(table).getAllByRole("columnheader");
    const labels = headers.map((h) => h.textContent);
    expect(labels).toContain("US English");
    expect(labels).toContain("US International");
    expect(labels).toContain("AZERTY (French)");
    expect(labels).toContain("QWERTZ (German)");
    expect(labels).toContain("UK English");
  });

  it("resolves likely hosts from the stored layout_family answer, not bcp47 alone", () => {
    saveLayoutFamilyAnswer("qwerty");
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} bcp47="en-GB" onClose={() => {}} />);
    const table = screen.getByTestId("review-removed-keys-table");
    const labels = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(labels).toContain("UK English");
    expect(labels).not.toContain("US English");
    expect(labels).not.toContain("QWERTZ (German)");
  });

  it("shows the host-guess honesty caption", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    expect(
      screen.getByText(
        "Shown layouts are the studio's best guess at your typists' machines, not sight of them.",
      ),
    ).toBeTruthy();
  });

  it("states the two-sided verdict with both risk framings and the expectation prompt", () => {
    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    const verdict = screen.getByTestId("review-removed-keys-verdict");
    expect(
      within(verdict).getByText(
        "1 allowed — those keys will type something different on different computers. " +
          "1 blocked — silent everywhere (dead keys if your typists expect output there).",
      ),
    ).toBeTruthy();
    expect(
      within(verdict).getByText(
        "Allow the typist's own keyboard to decide — the key will type something, but what varies by computer.",
      ),
    ).toBeTruthy();
    expect(
      within(verdict).getByText(
        "Block it — the key does nothing on every computer. If your typists expect a character here, they'll find a dead key.",
      ),
    ).toBeTruthy();
    expect(
      within(verdict).getByText("Do your typists expect a character on this key?"),
    ).toBeTruthy();
  });

  it("never shows the retired one-sided slogan", () => {
    const { container } = render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={() => {}} />);
    expect(container.textContent ?? "").not.toContain(RETIRED_SLOGAN);
    expect(RETIRED_SLOGAN).toBe("Allow means unpredictable; Block means predictable.");
  });

  it("renders the empty state when nothing is carved", () => {
    render(<ReviewRemovedKeysDialog combos={[]} onClose={() => {}} />);
    expect(screen.getByText(/No carved combinations yet/)).toBeTruthy();
    expect(screen.getByTestId("review-removed-keys-verdict")).toBeTruthy();
  });

  it("closes on Close button, backdrop click, and Escape", () => {
    let closed = 0;
    const onClose = () => {
      closed += 1;
    };
    const { unmount } = render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("review-removed-keys-close"));
    expect(closed).toBe(1);
    unmount();

    const r2 = render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("review-removed-keys-backdrop"));
    expect(closed).toBe(2);
    r2.unmount();

    render(<ReviewRemovedKeysDialog combos={dialogCombos()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Gallery wiring: the "Review removed keys" entry point
// ---------------------------------------------------------------------------

function renderGalleryV2(ir: KeyboardIR) {
  const vfs = createVirtualFS();
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, {
    vfs,
    ir,
    removalCapabilities: new Map(),
  });
  render(<CarveGalleryV2 onComplete={() => {}} />);
}

describe("CarveGalleryV2 review entry point", () => {
  it("opens the review panel from the status strip for every carved combination", async () => {
    renderGalleryV2(ruleIr());
    useWorkingCopyStore.getState().prefillCarveDispositions(["r-altgr4", "r-quote"], {
      sparseLatinOverlay: false,
    });

    const button = (await screen.findByTestId("carve-review-removed-keys")) as HTMLButtonElement;
    // The prefill write lands outside React's event batching; wait for the
    // gallery subscription to pick it up.
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    const dialog = screen.getByTestId("review-removed-keys-dialog");
    expect(dialog).toBeTruthy();
    // Every carved combination appears, with its current disposition.
    // (Both seeds take the block bulk-default here: sparseLatinOverlay false,
    // no closed-keyboard-card answer.)
    const rowAltgr4 = within(dialog).getByTestId("review-removed-keys-row-r-altgr4");
    expect(within(rowAltgr4).getByText("RALT + 4")).toBeTruthy();
    expect(within(rowAltgr4).getByText("Block")).toBeTruthy();
    const rowQuote = within(dialog).getByTestId("review-removed-keys-row-r-quote");
    expect(within(rowQuote).getByText("Block")).toBeTruthy();
    // The binding prompt is present — the panel is review-only here, the
    // per-row control (T016) owns disposition changes.
    expect(
      within(dialog).getByText("Do your typists expect a character on this key?"),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("review-removed-keys-close"));
    expect(screen.queryByTestId("review-removed-keys-dialog")).toBeNull();
  });
});
