// State-coverage tests for the trail's notices and the four impact states
// (specs/053 T022 — spec Edge Cases and FR-011).
//
// The through-line of every case below: the trail never shows an ABSENCE where it
// should show a STATEMENT. An empty record says decisions will appear; a decision
// that changed nothing says so; one whose change cannot be isolated gives the
// reason; one whose detail was dropped says it was dropped. Rendering a blank in
// any of those four situations reads as a failure, and none of them is one.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import { DecisionTrailView } from "./DecisionTrailView.tsx";

afterEach(cleanup);

function entry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d1",
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

/** Render one row already expanded, with the given resolved impact. */
function renderExpandedRow(
  impact: DecisionImpact | null,
  entryOverrides: Partial<DecisionEntry> = {},
) {
  const result = render(
    <ul>
      <DecisionEntryRow
        entry={entry(entryOverrides)}
        superseded={false}
        resolveImpact={() => impact}
      />
    </ul>,
  );
  fireEvent.click(screen.getByTestId("decision-entry-expand"));
  return result;
}

describe("record-level notices", () => {
  it("renders decision-trail-empty for a record with no entries", () => {
    render(<DecisionTrailView record={recordOf([])} resolveImpact={() => null} />);
    expect(screen.getByTestId("decision-trail-empty")).toBeTruthy();
    // Never an error, never hidden — it explains what will happen.
    expect(screen.getByTestId("decision-trail-empty").textContent).toMatch(/appear/i);
  });

  it("renders decision-trail-truncated when truncated is non-null", () => {
    render(
      <DecisionTrailView
        record={recordOf([entry()], { truncated: { shedCount: 4 } })}
        resolveImpact={() => null}
      />,
    );
    expect(screen.getByTestId("decision-trail-truncated")).toBeTruthy();
    // The notice appears ALONGSIDE the list — a thinned trail is still worth reading.
    expect(screen.getAllByTestId("decision-entry")).toHaveLength(1);
  });

  it("renders decision-trail-partial when droppedCount > 0", () => {
    render(
      <DecisionTrailView record={recordOf([entry()])} droppedCount={2} resolveImpact={() => null} />,
    );
    expect(screen.getByTestId("decision-trail-partial")).toBeTruthy();
    expect(screen.getAllByTestId("decision-entry")).toHaveLength(1);
  });

  it("shows neither notice for a complete, fully-read record", () => {
    render(<DecisionTrailView record={recordOf([entry()])} resolveImpact={() => null} />);
    expect(screen.queryByTestId("decision-trail-truncated")).toBeNull();
    expect(screen.queryByTestId("decision-trail-partial")).toBeNull();
  });
});

describe("the four impact states", () => {
  it("captured — renders the hunks", () => {
    renderExpandedRow({
      state: "captured",
      files: [
        {
          path: "source/hausa_std.kmn",
          hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" a", "+ 'ɓ'"] }],
          magnitude: { added: 1, removed: 0 },
        },
      ],
      magnitude: { added: 1, removed: 0 },
    });
    const region = screen.getByTestId("decision-entry-impact");
    expect(region.textContent).toContain("+ 'ɓ'");
    expect(region.textContent).toContain("@@");
  });

  it("none — states that nothing changed, and renders no diff region content", () => {
    renderExpandedRow({ state: "none" });
    const region = screen.getByTestId("decision-entry-impact");
    // A positive statement, NOT an empty diff.
    expect(region.textContent).toMatch(/changed nothing/i);
    expect(region.textContent).not.toContain("@@");
    expect(region.textContent!.trim()).not.toBe("");
  });

  it("unavailable / lock-gate-dependency — gives the lock reason", () => {
    renderExpandedRow({ state: "unavailable", reason: "lock-gate-dependency" });
    expect(screen.getByTestId("decision-entry-impact").textContent).toMatch(/locked/i);
  });

  it("unavailable / no-rederivable-write-path — gives the write-path reason", () => {
    renderExpandedRow({ state: "unavailable", reason: "no-rederivable-write-path" });
    expect(screen.getByTestId("decision-entry-impact").textContent).toMatch(/write path/i);
  });

  it("the two unavailable reasons render different text", () => {
    renderExpandedRow({ state: "unavailable", reason: "lock-gate-dependency" });
    const lockText = screen.getByTestId("decision-entry-impact").textContent;
    cleanup();
    renderExpandedRow({ state: "unavailable", reason: "no-rederivable-write-path" });
    expect(screen.getByTestId("decision-entry-impact").textContent).not.toBe(lockText);
  });

  it("shed — a null impact renders the dropped-detail notice", () => {
    renderExpandedRow(null, { impact: null });
    const region = screen.getByTestId("decision-entry-impact");
    expect(region.textContent).toMatch(/dropped/i);
    expect(region.textContent).not.toContain("@@");
  });

  it("no state renders an empty impact region", () => {
    // Belt-and-braces over the four cases above: whichever branch is taken, the
    // revealed region always says something.
    const states: Array<[DecisionImpact | null, Partial<DecisionEntry>]> = [
      [{ state: "none" }, {}],
      [{ state: "unavailable", reason: "lock-gate-dependency" }, {}],
      [{ state: "unavailable", reason: "no-rederivable-write-path" }, {}],
      [null, { impact: null }],
    ];
    for (const [impact, overrides] of states) {
      renderExpandedRow(impact, overrides);
      expect(screen.getByTestId("decision-entry-impact").textContent!.trim().length)
        .toBeGreaterThan(0);
      cleanup();
    }
  });
});

describe("entry-expand aria-controls (trail a11y review P2)", () => {
  it("wires the expand button to the impact region it reveals", () => {
    render(
      <ul>
        <DecisionEntryRow entry={entry()} superseded={false} resolveImpact={() => ({ state: "none" })} />
      </ul>,
    );
    const toggle = screen.getByTestId("decision-entry-expand");
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    // Before expansion the referenced region does not exist yet — the button
    // still carries the id it WILL reveal (ARIA APG disclosure pattern).
    fireEvent.click(toggle);
    expect(document.getElementById(controlsId!)).toBe(screen.getByTestId("decision-entry-impact"));
  });
});

describe("clause lists are locale-formatted, not comma-joined (km-triage/km-domain)", () => {
  // The dimension list, the derived-axis list and the inherited-metadata list are
  // all assembled from clauses that have ALREADY been through the catalog. A
  // hardcoded `", "` between them bakes an English list convention into
  // translated output with no seam a translator can reach — the same defect
  // `trail.entry.headline.baseContribution.joinTwo` exists to avoid for two
  // items. `Intl.ListFormat` in the active locale is the seam.
  it("joins two headline dimensions with the locale's conjunction", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={entry({
            stepId: "carve",
            payload: {
              kind: "editor-action",
              actionType: "gallery_edit",
              summary: {
                keysRemoved: 17,
                keysAdded: 4,
                mechanismsAssigned: 0,
                touchKeysAffected: 0,
                sample: [],
                sampleTruncated: false,
              },
            },
          })}
          superseded={false}
          resolveImpact={() => ({ state: "none" })}
        />
      </ul>,
    );
    const headline = screen.getByTestId("decision-entry-headline").textContent!;
    // Both dimensions are named (FR-011 mentions only the non-zero ones), and the
    // separator between them is the locale's — "17 keys removed and 4 keys added",
    // not "17 keys removed, 4 keys added".
    expect(headline).toContain("17 keys removed");
    expect(headline).toContain("4 keys added");
    expect(headline).toMatch(/17 keys removed and 4 keys added/);
  });

  it("joins three inherited-metadata items with the locale's list separators", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={entry({
            stepId: "choose_base",
            payload: {
              kind: "base-contribution",
              baseId: "basic_kbdus",
              baseDisplayName: "US English",
              derivedAxes: [],
              inheritedMetadata: [
                { field: "script", value: "Latn" },
                { field: "targets", value: "windows" },
                { field: "version", value: "1.0" },
              ],
              instantiationMode: "from-base",
            },
          })}
          superseded={false}
          resolveImpact={() => ({ state: "none" })}
        />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    const text = screen.getByTestId("decision-entry-impact").textContent!;
    // English long-form conjunction list: "a, b, and c" — the "and" is what a
    // plain `join(", ")` cannot produce, so this pins the seam rather than the
    // exact punctuation of one locale.
    expect(text).toMatch(/and keyboard version: 1\.0/);
  });
});
