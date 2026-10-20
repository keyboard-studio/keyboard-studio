// Spec 104 T015/T016 — TouchKeyIdentityList tests.
//
// Pins: dead-key rows render at the touch step with key + layer named and
// the FR-009 default preselected; answering records the RepairProposal
// outcome on the decision spine BEFORE/WITH the fix application; a decline
// applies nothing and the row stays visible-and-answered; a recorded
// swallow-guard specification moves a mark's default to mint-and-rule; the
// Output listing shows unapplied repairs and records them unvisited.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { KeyboardIR, TouchLayoutIR, VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { TouchKeyIdentityList, UnappliedRepairList } from "./TouchKeyIdentityList.tsx";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'w3-list-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ [K_A] > 'a'
`;

function irOf(): KeyboardIR {
  return parseKmn(BASE_KMN, "w3_list_test").ir;
}

function layoutOf(): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "tablet",
        layers: [
          {
            id: "default",
            rows: [
              {
                keys: [
                  { nodeId: "k1", id: "K_A", text: "a" },
                  { nodeId: "k2", id: "T_0031", text: "1" },
                  { nodeId: "k3", id: "T_0300", text: "◌̀" },
                ],
              },
            ],
          },
        ],
      },
    ],
    nodeIds: [],
  } as unknown as TouchLayoutIR;
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("TouchKeyIdentityList — repair rows (T015)", () => {
  it("renders one row per dead key, naming key and layer, default preselected", () => {
    render(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={layoutOf()}
        onCommitOps={() => {}}
        onInstallIr={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("touch-key-repair-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("This touch key types nothing");
    expect(rows[0]!.textContent).toContain("T_0031");
    expect(rows[0]!.textContent).toContain("default");
    // Convert-to-U_ is the FR-009 default for T_0031 and is preselected.
    const convert = within(rows[0]!).getByLabelText(/Unicode name U_0031/);
    expect((convert as HTMLInputElement).checked).toBe(true);
  });

  it("applying the default records 'applied' and commits rename ops for every occurrence", () => {
    const onCommitOps = vi.fn();
    render(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={layoutOf()}
        onCommitOps={onCommitOps}
        onInstallIr={() => {}}
      />,
    );
    const row = screen.getAllByTestId("touch-key-repair-row")[0]!;
    fireEvent.click(within(row).getByText("Apply fix"));
    expect(onCommitOps).toHaveBeenCalledWith([
      { kind: "rename", address: "tablet:default:T_0031", toId: "U_0031" },
    ]);
    const records = useWorkingCopyStore.getState().touchKeyIdentity;
    expect(records?.repairProposals).toHaveLength(1);
    expect(records?.repairProposals[0]).toMatchObject({
      keyRef: "tablet:default:T_0031",
      defaultAction: "convert-to-u",
      outcome: "applied",
    });
    // The row stays visible-and-answered.
    expect(row.textContent).toContain("Fixed with the recommended repair.");
  });

  it("the answered row survives a re-render with the post-repair layout (the finding has resolved)", () => {
    // Regression: deriveRepairRows used to build rows ONLY from live
    // findings, so the moment the rename landed and the parent re-rendered
    // with the repaired layout, the row — and its "Fixed…" outcome line —
    // vanished. The row is re-derived from the recorded proposal instead.
    const { rerender } = render(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={layoutOf()}
        onCommitOps={() => {}}
        onInstallIr={() => {}}
      />,
    );
    const row = screen.getAllByTestId("touch-key-repair-row")[0]!;
    fireEvent.click(within(row).getByText("Apply fix"));

    const repaired = layoutOf();
    for (const platform of repaired.platforms) {
      for (const layer of platform.layers) {
        for (const r of layer.rows) {
          for (const key of r.keys) {
            if (key.id === "T_0031") key.id = "U_0031";
          }
        }
      }
    }
    rerender(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={repaired}
        onCommitOps={() => {}}
        onInstallIr={() => {}}
      />,
    );
    const rowsAfter = screen.getAllByTestId("touch-key-repair-row");
    const answered = rowsAfter.find((r) => r.textContent?.includes("T_0031"));
    expect(answered).toBeDefined();
    expect(answered!.textContent).toContain("Fixed with the recommended repair.");
  });

  it("declining records 'declined', applies NOTHING, and the row stays answered (SC-004 at the UI seam)", () => {
    const onCommitOps = vi.fn();
    const onInstallIr = vi.fn();
    render(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={layoutOf()}
        onCommitOps={onCommitOps}
        onInstallIr={onInstallIr}
      />,
    );
    const row = screen.getAllByTestId("touch-key-repair-row")[0]!;
    fireEvent.click(within(row).getByText("Leave as-is"));
    expect(onCommitOps).not.toHaveBeenCalled();
    expect(onInstallIr).not.toHaveBeenCalled();
    const records = useWorkingCopyStore.getState().touchKeyIdentity;
    expect(records?.repairProposals[0]).toMatchObject({
      keyRef: "tablet:default:T_0031",
      outcome: "declined",
    });
    expect(row.textContent).toContain("Left as-is — this key still types nothing.");
    // Change answer re-opens the prompt on the same row.
    fireEvent.click(within(row).getByText("Change answer"));
    expect(within(row).getByText("Apply fix")).toBeTruthy();
  });

  it("a swallow-guard specification in force preselects mint-and-rule for the mark", () => {
    useWorkingCopyStore.getState().setTouchKeyIdentity({
      repairProposals: [],
      identityDecisions: [],
      transplantRecords: [],
      guardSpecifications: [
        {
          recordId: "guard:g:1",
          behaviour: "swallow",
          origin: "asked",
          confirmed: true,
          recordedAt: 1760000000000,
          supersedes: null,
        },
      ],
    });
    render(
      <TouchKeyIdentityList
        ir={irOf()}
        layout={layoutOf()}
        onCommitOps={() => {}}
        onInstallIr={() => {}}
      />,
    );
    const markRow = screen
      .getAllByTestId("touch-key-repair-row")
      .find((r) => r.textContent?.includes("T_0300"))!;
    const mint = within(markRow).getByLabelText(/Add a rule so it types/);
    expect((mint as HTMLInputElement).checked).toBe(true);
  });

  it("renders nothing when no key is dead and no decision is recorded", () => {
    const kmn = BASE_KMN.replace("+ [K_A] > 'a'", "+ [K_A] > 'a'\n+ [T_0031] > '1'\n+ [T_0300] > 'x'");
    const { container } = render(
      <TouchKeyIdentityList
        ir={parseKmn(kmn, "w3_list_test").ir}
        layout={layoutOf()}
        onCommitOps={() => {}}
        onInstallIr={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="touch-key-identity-list"]')).toBeNull();
  });
});

describe("UnappliedRepairList — Output step (FR-015)", () => {
  function outputVfs(): VirtualFS {
    return createVirtualFS([
      { path: "source/w3_list_test.kmn", content: BASE_KMN, isBinary: false },
      {
        path: "source/w3_list_test.keyman-touch-layout",
        content: JSON.stringify({
          tablet: {
            layer: [
              {
                id: "default",
                row: [
                  {
                    id: 1,
                    key: [
                      { id: "K_A", text: "a" },
                      { id: "T_0031", text: "1" },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        isBinary: false,
      },
    ]);
  }

  it("lists unapplied repairs and records them as unvisited", () => {
    render(<UnappliedRepairList vfs={outputVfs()} keyboardId="w3_list_test" />);
    const section = screen.getByTestId("touch-key-unapplied-repairs");
    expect(section.textContent).toContain("T_0031");
    expect(section.textContent).toContain("still type nothing");
    const records = useWorkingCopyStore.getState().touchKeyIdentity;
    expect(records?.repairProposals).toHaveLength(1);
    expect(records?.repairProposals[0]).toMatchObject({
      keyRef: "tablet:default:T_0031",
      outcome: "unvisited",
    });
  });

  it("an answered repair is not listed as unapplied", () => {
    useWorkingCopyStore.getState().setTouchKeyIdentity({
      repairProposals: [
        {
          recordId: "repair:tablet:default:T_0031:1",
          keyRef: "tablet:default:T_0031",
          defaultAction: "convert-to-u",
          options: ["convert-to-u", "mint-and-rule", "blank"],
          outcome: "declined",
          recordedAt: 1760000000000,
          supersedes: null,
        },
      ],
      identityDecisions: [],
      transplantRecords: [],
      guardSpecifications: [],
    });
    const { container } = render(
      <UnappliedRepairList vfs={outputVfs()} keyboardId="w3_list_test" />,
    );
    expect(container.querySelector('[data-testid="touch-key-unapplied-repairs"]')).toBeNull();
  });
});
