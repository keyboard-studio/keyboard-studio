// Trail behaviour tests (specs/053 T021 — FR-012/013/014/015 against the
// trail-ui contract's selectors).
//
// Rendered against a fixture record, never against the live store: the trail is
// handed its record as a prop precisely so its behaviour can be pinned without a
// session.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PRE_IDENTITY_STEP_ID } from "@keyboard-studio/contracts";
import type {
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  EditorActionSummary,
  EditorActionType,
} from "@keyboard-studio/contracts";
import { DecisionTrailView } from "./DecisionTrailView.tsx";

afterEach(cleanup);

const CAPTURED: DecisionImpact = {
  state: "captured",
  files: [
    {
      path: "source/hausa_std.kmn",
      hunks: [
        { oldStart: 4, oldLines: 2, newStart: 4, newLines: 3, lines: [" store(&NAME)", "+ 'ɓ' > 'ɓ'"] },
      ],
      magnitude: { added: 1, removed: 0 },
    },
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

// ===========================================================================
// specs/055-legible-decision-trail T038 — the staged presentation
// (FR-022 .. FR-026) rendered by DecisionTrailView over stageGroups.ts.
//
// The property these tests exist to protect is that grouping is PRESENTATION:
// it re-arranges the flat trail and adds a per-stage account, and it must not
// cost the author a single entry, nor invent activity for a stage that made
// none, nor sum a revisit into a number the keyboard never had.
// ===========================================================================

function editorSummary(overrides: Partial<EditorActionSummary> = {}): EditorActionSummary {
  return { sample: [], sampleTruncated: false, ...overrides };
}

function editorEntry(
  entryId: string,
  stepId: string,
  actionType: EditorActionType,
  summary: EditorActionSummary,
  overrides: Partial<DecisionEntry> = {},
): DecisionEntry {
  return {
    entryId,
    stepId,
    payload: { kind: "editor-action", actionType, summary },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
    ...overrides,
  };
}

function baseEntry(entryId: string, startingKeyCount: number): DecisionEntry {
  return {
    entryId,
    stepId: "choose_base",
    payload: {
      kind: "base-contribution",
      baseId: "basic_kbdfr",
      baseDisplayName: "French",
      startingKeyCount,
      derivedAxes: [],
      inheritedMetadata: [],
      instantiationMode: "new-from-base",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };
}

function textAnswer(entryId: string, stepId: string, questionId: string, value: string): DecisionEntry {
  return answerEntry(entryId, {
    stepId,
    payload: { kind: "survey-answer", questionId, answerType: "text", value },
  });
}

/**
 * A record spanning a whole walk: a pre-identity answer, an identity answer
 * revised in place, a base contribution, a carve revisited, mechanisms, touch,
 * and one entry under a stepId this build's manifest no longer has.
 *
 * Deliberately appended OUT of walked order (touch and the removed step come
 * last, the removed step's own decision was made early) so a derivation that
 * fell back to append order would be caught.
 */
function walkedRecord(): DecisionRecord {
  return recordOf([
    textAnswer("p0", PRE_IDENTITY_STEP_ID, "q_before_identity", "early"),
    textAnswer("i1", "identity", "il_language_english", "Bambara"),
    answerEntry("i2", {
      stepId: "identity",
      payload: {
        kind: "survey-answer",
        questionId: "il_language_english",
        answerType: "text",
        value: "Bamanankan",
      },
      supersedes: "i1",
    }),
    baseEntry("b1", 220),
    editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 40 })),
    editorEntry("c2", "carve", "gallery_edit", editorSummary({ keysRemoved: 172 }), {
      supersedes: "c1",
    }),
    editorEntry("m1", "mechanisms", "mechanism_edit", editorSummary({ mechanismsAssigned: 6 })),
    editorEntry("t1", "touch", "touch_edit", editorSummary({ touchKeysAffected: 9 })),
    textAnswer("x1", "a_step_a_later_build_removed", "q_gone", "still recorded"),
  ]);
}

const stepIdsOf = () =>
  screen.getAllByTestId("decision-stage-group").map((g) => g.getAttribute("data-step-id"));

const groupFor = (stepId: string): HTMLElement =>
  screen
    .getAllByTestId("decision-stage-group")
    .find((g) => g.getAttribute("data-step-id") === stepId)!;

const summaryTextFor = (stepId: string): string =>
  within(groupFor(stepId)).getByTestId("decision-stage-summary").textContent ?? "";

const renderedEntryIds = () =>
  screen.getAllByTestId("decision-entry").map((r) => r.getAttribute("data-entry-id"));

describe("FR-022 — stages appear in the order the author walked them", () => {
  it("orders groups by the flow manifest, not by append order and not alphabetically", () => {
    // Appended touch-first on purpose. Append order would be
    // ["touch","identity","carve"]; alphabetical would be
    // ["carve","identity","touch"]; the manifest walks identity -> carve -> touch.
    renderTrail(
      recordOf([
        editorEntry("t1", "touch", "touch_edit", editorSummary({ touchKeysAffected: 3 })),
        textAnswer("i1", "identity", "il_language_english", "Bambara"),
        editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 5 })),
      ]),
    );

    expect(stepIdsOf()).toEqual(["identity", "carve", "touch"]);
  });

  it("places a stepId the manifest does not know ahead of every manifest stage, in first-appearance order", () => {
    renderTrail(walkedRecord());

    expect(stepIdsOf()).toEqual([
      PRE_IDENTITY_STEP_ID,
      "a_step_a_later_build_removed",
      "identity",
      "choose_base",
      "carve",
      "mechanisms",
      "touch",
    ]);
  });
});

describe("FR-023 — a stage's one-line account, available without expanding", () => {
  it("still shows the roll-up after the group is collapsed", () => {
    renderTrail(
      recordOf([editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 17 }))]),
    );

    const expandedText = summaryTextFor("carve");
    expect(expandedText).toContain("Edited the character gallery");
    expect(expandedText).toContain("17 keys removed");

    fireEvent.click(within(groupFor("carve")).getByTestId("decision-stage-toggle"));

    // Collapsed: no entry rows left in the group, yet the account is unchanged.
    expect(within(groupFor("carve")).queryAllByTestId("decision-entry")).toHaveLength(0);
    expect(within(groupFor("carve")).getByTestId("decision-stage-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(summaryTextFor("carve")).toBe(expandedText);
  });

  it("names each editor stage and its non-zero dimensions, resolving no entry's impact", () => {
    const resolveImpact = vi.fn(() => CAPTURED);
    renderTrail(walkedRecord(), resolveImpact);

    expect(summaryTextFor("carve")).toContain("Edited the character gallery");
    expect(summaryTextFor("mechanisms")).toContain("6 mechanisms assigned");
    expect(summaryTextFor("touch")).toContain("9 touch keys affected");
    // Zero-suppression (FR-011): touch reports only the dimension it moved.
    expect(summaryTextFor("touch")).not.toContain("keys removed");

    // FR-021/SC-009: the account is derived from the record alone.
    expect(resolveImpact).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // FIXED PRODUCTION DEFECT (was: `stageRollUpText` reused ONE message id,
  // `trail.stage.rollUp.composed`, for three different messages — an editor
  // stage's dimension list, the base's starting-key clause, and the survey's
  // answer-count clause. Lingui extraction keeps one string per id, so the
  // shipped `en` catalog held only the editor-stage wording and the other two
  // branches rendered an EMPTY parenthesis, e.g. "Keyboard identity ()".
  //
  // Fix: `trail.stage.rollUp.composed` now carries a single, genuinely GENERIC
  // meaning — "{stage} ({detail})" — mirroring
  // `trail.entry.headline.baseContribution.withDetail`'s established pattern.
  // Each branch pre-formats its own already-pluralized clause (via its own
  // distinct id) before handing it to `detail`, so one id can honestly serve
  // all three without merging distinct meanings.
  // -------------------------------------------------------------------------

  it("names a survey stage's roll-up with its effective answer count", () => {
    renderTrail(walkedRecord());
    // i1 was revised by i2, so the identity stage produced one answer, not two.
    expect(summaryTextFor("identity")).toContain("1 answer recorded");
  });

  it("names a base stage's roll-up with its starting key count", () => {
    renderTrail(walkedRecord());
    expect(summaryTextFor("choose_base")).toContain("started with 220 keys");
  });
});

describe("FR-024 — every entry reachable in the flat trail stays reachable after grouping", () => {
  it("renders exactly the record's entry set, each entry once", () => {
    const record = walkedRecord();
    renderTrail(record);

    const rendered = renderedEntryIds();
    // Set equality against the record itself, not a spot check: grouping may
    // reorder, but it may neither drop an entry nor duplicate one.
    expect([...rendered].sort()).toEqual([...record.entries.map((e) => e.entryId)].sort());
    expect(rendered).toHaveLength(record.entries.length);
  });

  it("files every entry under the group for its own stepId", () => {
    const record = walkedRecord();
    renderTrail(record);

    const renderedStepById: Record<string, string> = {};
    for (const group of screen.getAllByTestId("decision-stage-group")) {
      const stepId = group.getAttribute("data-step-id")!;
      for (const row of within(group).getAllByTestId("decision-entry")) {
        renderedStepById[row.getAttribute("data-entry-id")!] = stepId;
      }
    }

    const recordedStepById: Record<string, string> = {};
    for (const entry of record.entries) recordedStepById[entry.entryId] = entry.stepId;

    expect(renderedStepById).toEqual(recordedStepById);
  });

  it("brings back exactly the same entries when a collapsed group is re-expanded", () => {
    const record = walkedRecord();
    renderTrail(record);

    const before = renderedEntryIds();

    fireEvent.click(within(groupFor("carve")).getByTestId("decision-stage-toggle"));
    const collapsed = renderedEntryIds();
    expect(collapsed).not.toContain("c1");
    expect(collapsed).not.toContain("c2");

    fireEvent.click(within(groupFor("carve")).getByTestId("decision-stage-toggle"));
    expect(renderedEntryIds()).toEqual(before);
  });
});

describe("FR-025 — a stage nothing was recorded for is never shown as one that changed something", () => {
  it("omits every manifest stage the author recorded nothing in", () => {
    renderTrail(walkedRecord());

    // The manifest also holds track, project_name, characters, marks,
    // punctuation, convenience, touch_seed_source, help and package; none of
    // them was walked, so none of them may appear at all.
    const shown = stepIdsOf();
    for (const untouched of [
      "track",
      "project_name",
      "characters",
      "marks",
      "punctuation",
      "convenience",
      "touch_seed_source",
      "help",
      "package",
    ]) {
      expect(shown).not.toContain(untouched);
    }
  });

  it("reads a stage whose only decision was superseded elsewhere as 'no decisions recorded'", () => {
    // The production route for this shape: a pre-identity answer is later
    // revised once the identity step exists, via the store's supersede() with a
    // different stepId — leaving the pre-identity stage holding history only.
    renderTrail(
      recordOf([
        textAnswer("p0", PRE_IDENTITY_STEP_ID, "il_language_english", "Bambara"),
        answerEntry("i1", {
          stepId: "identity",
          payload: {
            kind: "survey-answer",
            questionId: "il_language_english",
            answerType: "text",
            value: "Bamanankan",
          },
          supersedes: "p0",
        }),
      ]),
    );

    const preIdentity = summaryTextFor(PRE_IDENTITY_STEP_ID);
    expect(preIdentity).toContain("no decisions recorded");
    // It claims no activity: no answer count, no dimension, no number at all.
    expect(preIdentity).not.toMatch(/\d/);
    expect(preIdentity).not.toMatch(/answer recorded|removed|added|assigned|affected/);
    // The stage that did record something reads differently, so the assertions
    // above are about this stage rather than about an empty render.
    expect(summaryTextFor("identity")).toContain("Keyboard identity");
    expect(summaryTextFor("identity")).not.toContain("no decisions recorded");
  });
});

describe("FR-026 — a revisit stays visible as history inside its stage", () => {
  it("keeps the superseded carve entry in its own group, hidden until the toggle", () => {
    renderTrail(
      recordOf([
        editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 40 })),
        editorEntry("c2", "carve", "gallery_edit", editorSummary({ keysRemoved: 172 }), {
          supersedes: "c1",
        }),
      ]),
    );

    const rows = within(groupFor("carve")).getAllByTestId("decision-entry");
    expect(rows.map((r) => r.getAttribute("data-entry-id"))).toEqual(["c1", "c2"]);

    const superseded = rows[0]!;
    expect(superseded.hasAttribute("hidden")).toBe(true);
    expect(within(superseded).getByTestId("decision-entry-superseded")).toBeTruthy();
    expect(rows[1]!.hasAttribute("hidden")).toBe(false);

    fireEvent.click(screen.getByTestId("decision-superseded-toggle"));
    const revealed = within(groupFor("carve"))
      .getAllByTestId("decision-entry")
      .find((r) => r.getAttribute("data-entry-id") === "c1")!;
    expect(revealed.hasAttribute("hidden")).toBe(false);
  });

  it("rolls a carve of 40 revisited to 172 up as 172, never 212", () => {
    // The single most important correctness property of the staged view: an
    // editor step's counts are the step's cumulative TOTAL, so summing a
    // stage's entries would double-count the revisit and report a carve of 212
    // keys the keyboard never had.
    renderTrail(
      recordOf([
        editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 40 })),
        editorEntry("c2", "carve", "gallery_edit", editorSummary({ keysRemoved: 172 }), {
          supersedes: "c1",
        }),
      ]),
    );

    expect(summaryTextFor("carve")).toContain("172 keys removed");
    expect(summaryTextFor("carve")).not.toContain("212");
    expect(summaryTextFor("carve")).not.toContain("40");

    // Revealing the history does not change the stage's net account.
    fireEvent.click(screen.getByTestId("decision-superseded-toggle"));
    expect(summaryTextFor("carve")).toContain("172 keys removed");
    expect(summaryTextFor("carve")).not.toContain("212");
  });
});

// ===========================================================================
// specs/055-legible-decision-trail T037-a11y — the stage-toggle's accessible
// name (trail-ui a11y review, P1). Every toggle used to expose the SAME
// name — "Show decisions" / "Hide decisions" — regardless of which stage it
// belonged to, so a screen-reader user tabbing through a multi-stage trail
// could not tell one button from another. The fix names the stage in the
// accessible name; these tests prove distinguishability by ROLE + NAME, the
// same lookup a screen-reader user's rotor/button list performs, rather than
// inspecting an attribute value directly.
// ===========================================================================

describe("stage-toggle accessible name (trail a11y review P1)", () => {
  it("gives each stage's toggle a name that includes its own stage, not a generic 'Hide decisions'", () => {
    renderTrail(walkedRecord());

    // Every group starts expanded, so every toggle currently reads "Hide
    // decisions for <stage>" — and each of the four lookups below must
    // resolve to exactly one button, proving the names do not collide.
    expect(
      screen.getByRole("button", { name: "Hide decisions for Keyboard identity" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide decisions for Choosing a base keyboard" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide decisions for Edited the character gallery" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide decisions for Assigned key mechanisms" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide decisions for Edited the touch layout" }),
    ).toBeTruthy();
  });

  it("keeps the visible label as a leading substring of the accessible name (WCAG 2.5.3)", () => {
    renderTrail(recordOf([editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 17 }))]));
    const toggle = within(groupFor("carve")).getByTestId("decision-stage-toggle");
    expect(toggle.textContent).toBe("Hide decisions");
    expect(toggle.getAttribute("aria-label")).toMatch(/^Hide decisions for /);
  });

  it("flips the name's state word on collapse, while still naming the same stage", () => {
    renderTrail(recordOf([editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 17 }))]));
    fireEvent.click(within(groupFor("carve")).getByTestId("decision-stage-toggle"));
    expect(
      within(groupFor("carve")).getByRole("button", {
        name: "Show decisions for Edited the character gallery",
      }),
    ).toBeTruthy();
  });

  it("wires the toggle's aria-controls to the region it reveals", () => {
    renderTrail(recordOf([editorEntry("c1", "carve", "gallery_edit", editorSummary({ keysRemoved: 17 }))]));
    const toggle = within(groupFor("carve")).getByTestId("decision-stage-toggle");
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    // The referenced id resolves to the entries region the toggle reveals.
    expect(document.getElementById(controlsId!)).toBe(
      within(groupFor("carve")).getAllByTestId("decision-entry")[0]!.closest("ul"),
    );
  });
});
