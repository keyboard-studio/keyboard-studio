// Trail behaviour tests (specs/053 T021 — FR-012/013/014/015 against the
// trail-ui contract's selectors).
//
// Rendered against a fixture record, never against the live store: the trail is
// handed its record as a prop precisely so its behaviour can be pinned without a
// session.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import { DecisionTrailView } from "./DecisionTrailView.tsx";

afterEach(cleanup);

const CAPTURED: DecisionImpact = {
  state: "captured",
  path: "source/hausa_std.kmn",
  hunks: [
    { oldStart: 4, oldLines: 2, newStart: 4, newLines: 3, lines: [" store(&NAME)", "+ 'ɓ' > 'ɓ'"] },
  ],
  magnitude: { added: 1, removed: 0 },
};

function answerEntry(
  entryId: string,
  overrides: Partial<DecisionEntry> = {},
): DecisionEntry {
  return {
    entryId,
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_target_script",
      answerType: "select",
      value: "Latn",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
    ...overrides,
  };
}

function recordOf(entries: DecisionEntry[], overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    format: "keyboard-studio.decision-record",
    version: 1,
    keyboardId: "hausa_std",
    entries,
    truncated: null,
    ...overrides,
  };
}

function renderTrail(
  record: DecisionRecord,
  resolveImpact: (entry: DecisionEntry) => DecisionImpact | null = () => CAPTURED,
  droppedCount = 0,
) {
  return render(
    <DecisionTrailView
      record={record}
      droppedCount={droppedCount}
      resolveImpact={resolveImpact}
    />,
  );
}

describe("FR-012 — ordered trail", () => {
  it("renders every entry in append order", () => {
    renderTrail(
      recordOf([
        answerEntry("d1", { payload: { kind: "survey-answer", questionId: "q_a", answerType: "text", value: "one" } }),
        answerEntry("d2", { payload: { kind: "survey-answer", questionId: "q_b", answerType: "text", value: "two" } }),
        answerEntry("d3", { payload: { kind: "survey-answer", questionId: "q_c", answerType: "text", value: "three" } }),
      ]),
    );
    const rows = screen.getAllByTestId("decision-entry");
    expect(rows.map((r) => r.getAttribute("data-entry-id"))).toEqual(["d1", "d2", "d3"]);
  });

  it("carries data-entry-id on every row, so supersede pairing needs no document order", () => {
    renderTrail(recordOf([answerEntry("d1"), answerEntry("d2", { supersedes: "d1" })]));
    for (const row of screen.getAllByTestId("decision-entry")) {
      expect(row.getAttribute("data-entry-id")).toBeTruthy();
    }
  });
});

describe("FR-013 — the headline distinguishes provenance for the same value", () => {
  it("reads differently for tool-proposed than for hand-set", () => {
    renderTrail(
      recordOf([
        answerEntry("d1", { provenance: { agency: "hand-set" } }),
        answerEntry("d2", { provenance: { agency: "tool-proposed", source: "langtags" } }),
      ]),
    );
    const [chosen, accepted] = screen.getAllByTestId("decision-entry-headline");
    // Both concern the value "Latn"; the sentences must not be the same.
    expect(chosen!.textContent).toContain("Latn");
    expect(accepted!.textContent).toContain("Latn");
    expect(chosen!.textContent).not.toBe(accepted!.textContent);
    expect(accepted!.textContent).toContain("langtags");
  });

  it("names the base for a base-derived value", () => {
    renderTrail(recordOf([answerEntry("d1", { provenance: { agency: "base-derived", source: "base" } })]));
    expect(screen.getByTestId("decision-entry-headline").textContent).toMatch(/base/i);
  });

  it("shows an editor step's counts", () => {
    renderTrail(
      recordOf([
        answerEntry("d1", {
          stepId: "carve",
          payload: {
            kind: "editor-action",
            actionType: "gallery_edit",
            summary: {
              keysRemoved: 17,
              keysAdded: 0,
              mechanismsAssigned: 0,
              touchKeysAffected: 0,
              sample: ["K_Q"],
              sampleTruncated: true,
            },
          },
        }),
      ]),
    );
    expect(screen.getByTestId("decision-entry-headline").textContent).toContain("17");
  });
});

describe("FR-014 — expandable to the attributed change", () => {
  it("reveals decision-entry-impact only after the expand control is used", () => {
    renderTrail(recordOf([answerEntry("d1", { impact: CAPTURED })]));
    expect(screen.queryByTestId("decision-entry-impact")).toBeNull();
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    expect(screen.getByTestId("decision-entry-impact")).toBeTruthy();
    expect(screen.getByTestId("decision-entry-impact").textContent).toContain("+ 'ɓ' > 'ɓ'");
  });

  it("collapses again on a second click", () => {
    renderTrail(recordOf([answerEntry("d1", { impact: CAPTURED })]));
    const toggle = screen.getByTestId("decision-entry-expand");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByTestId("decision-entry-impact")).toBeNull();
  });
});

describe("SC-007 — the list mounts computing no impact", () => {
  it("does not call resolveImpact for any row on mount", () => {
    const resolveImpact = vi.fn(() => CAPTURED);
    renderTrail(
      recordOf([answerEntry("d1"), answerEntry("d2"), answerEntry("d3")]),
      resolveImpact,
    );
    expect(resolveImpact).not.toHaveBeenCalled();
  });

  it("resolves exactly the expanded entry, and no other", () => {
    const resolveImpact = vi.fn(() => CAPTURED);
    renderTrail(recordOf([answerEntry("d1"), answerEntry("d2")]), resolveImpact);
    fireEvent.click(screen.getAllByTestId("decision-entry-expand")[1]!);
    expect(resolveImpact.mock.calls.every(([e]) => (e as DecisionEntry).entryId === "d2")).toBe(true);
  });
});

describe("FR-015 — superseded entries remain visible as history", () => {
  it("keeps a superseded entry in the DOM, marked, and hidden until the toggle", () => {
    renderTrail(recordOf([answerEntry("d1"), answerEntry("d2", { supersedes: "d1" })]));

    const rows = screen.getAllByTestId("decision-entry");
    const superseded = rows.find((r) => r.getAttribute("data-entry-id") === "d1")!;
    // Present — history that unmounts is history the author cannot be sure of.
    expect(superseded).toBeTruthy();
    expect(superseded.hasAttribute("hidden")).toBe(true);
    expect(within(superseded).getByTestId("decision-entry-superseded")).toBeTruthy();

    // Its replacement is visible.
    const live = rows.find((r) => r.getAttribute("data-entry-id") === "d2")!;
    expect(live.hasAttribute("hidden")).toBe(false);
  });

  it("reveals superseded entries via decision-superseded-toggle", () => {
    renderTrail(recordOf([answerEntry("d1"), answerEntry("d2", { supersedes: "d1" })]));
    fireEvent.click(screen.getByTestId("decision-superseded-toggle"));
    const superseded = screen
      .getAllByTestId("decision-entry")
      .find((r) => r.getAttribute("data-entry-id") === "d1")!;
    expect(superseded.hasAttribute("hidden")).toBe(false);
  });

  it("omits the toggle entirely when nothing has been superseded", () => {
    renderTrail(recordOf([answerEntry("d1")]));
    expect(screen.queryByTestId("decision-superseded-toggle")).toBeNull();
  });
});
