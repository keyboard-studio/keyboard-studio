// State-coverage tests for the trail's notices and the four impact states
// (specs/053 T022 — spec Edge Cases and FR-011).
//
// The through-line of every case below: the trail never shows an ABSENCE where it
// should show a STATEMENT. An empty record says decisions will appear; a decision
// that changed nothing says so; one whose change cannot be isolated gives the
// reason; one whose detail was dropped says it was dropped. Rendering a blank in
// any of those four situations reads as a failure, and none of them is one.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import { manifest } from "../steps/manifest.ts";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";
import { DecisionTrailView } from "./DecisionTrailView.tsx";

// spec 057 T039 — the deep-link jump affordance. `jumpToLocation` is mocked
// only so the "activates jumpToLocation" test can assert on the call; every
// other test in this file never clicks the jump control, so the mock has no
// effect on the 053 coverage above.
vi.mock("../lib/jumpToLocation.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/jumpToLocation.ts")>();
  return { ...actual, jumpToLocation: vi.fn(() => ({ kind: "arrived", at: { route: "survey" } })) };
});

import { jumpToLocation } from "../lib/jumpToLocation.ts";

afterEach(() => {
  cleanup();
  vi.mocked(jumpToLocation).mockClear();
});

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

// ---------------------------------------------------------------------------
// Async resolution and the third unavailability reason (spec 059 T036)
// ---------------------------------------------------------------------------
//
// Same through-line as above: a STATEMENT, never an absence — and never the WRONG
// statement. The row previously told an author who answered the identity questions
// that their answers had no re-derivable write path, which was true only because
// nothing wrote them anywhere.

describe("spec 059 — identity entries resolved on expand", () => {
  /** Render a row with an async resolver, not yet expanded. */
  function renderAsyncRow(
    resolveImpactAsync: (e: DecisionEntry) => Promise<DecisionImpact | null>,
    entryOverrides: Partial<DecisionEntry> = {},
  ) {
    return render(
      <ul>
        <DecisionEntryRow
          entry={entry(entryOverrides)}
          superseded={false}
          resolveImpact={() => null}
          resolveImpactAsync={resolveImpactAsync}
        />
      </ul>,
    );
  }

  const DESCRIPTOR_CAPTURE: DecisionImpact = {
    state: "captured",
    files: [
      {
        path: "source/hausa_std.kps",
        hunks: [
          {
            oldStart: 6,
            oldLines: 1,
            newStart: 6,
            newLines: 1,
            lines: ['-  <Language ID="fr">fr</Language>', '+  <Language ID="ha-Latn">Hausa</Language>'],
          },
        ],
        magnitude: { added: 1, removed: 1 },
      },
    ],
    magnitude: { added: 1, removed: 1 },
  };

  // US2-1: the thing the author actually wanted to see.
  it("names the package descriptor as the changed file once resolved", async () => {
    renderAsyncRow(async () => DESCRIPTOR_CAPTURE);
    fireEvent.click(screen.getByTestId("decision-entry-expand"));

    const file = await screen.findByTestId("decision-entry-impact-file");
    expect(file.getAttribute("data-file-path")).toBe("source/hausa_std.kps");
    expect(screen.getByTestId("decision-entry-impact").textContent).toContain("ha-Latn");
  });

  it("shows the pending notice while resolving, then replaces it with the change", async () => {
    let release!: (impact: DecisionImpact) => void;
    renderAsyncRow(
      () => new Promise<DecisionImpact>((resolve) => { release = resolve; }),
    );
    fireEvent.click(screen.getByTestId("decision-entry-expand"));

    // A statement, not a blank region.
    expect(screen.getByTestId("decision-entry-impact-pending")).toBeTruthy();
    expect(screen.queryByTestId("decision-entry-impact-file")).toBeNull();

    release(DESCRIPTOR_CAPTURE);
    await screen.findByTestId("decision-entry-impact-file");
    expect(screen.queryByTestId("decision-entry-impact-pending")).toBeNull();
  });

  // US2-2 / FR-012: its own words. This is the assertion that would have caught the
  // reason being absorbed into a trailing else.
  it("renders no-working-copy-yet distinctly from both other reasons and from 'none'", async () => {
    const texts: Record<string, string> = {};
    for (const [label, impact] of [
      ["noWorkingCopyYet", { state: "unavailable", reason: "no-working-copy-yet" }],
      ["lockGate", { state: "unavailable", reason: "lock-gate-dependency" }],
      ["noWritePath", { state: "unavailable", reason: "no-rederivable-write-path" }],
      ["none", { state: "none" }],
    ] as Array<[string, DecisionImpact]>) {
      renderAsyncRow(async () => impact);
      fireEvent.click(screen.getByTestId("decision-entry-expand"));
      await screen.findByTestId("decision-entry-impact");
      texts[label] = screen.getByTestId("decision-entry-impact").textContent!.trim();
      cleanup();
    }

    // Non-empty, and all four mutually distinct.
    for (const [label, text] of Object.entries(texts)) {
      expect(text.length, `${label} must render prose`).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(texts)).size).toBe(4);
    // And it reads as "not yet", pointing at the action that resolves it.
    expect(texts["noWorkingCopyYet"]).toMatch(/base keyboard/i);
    expect(texts["noWorkingCopyYet"]).not.toBe(texts["noWritePath"]);
  });

  // US2-3 / SC-006: FR-011 by construction. Mounting resolves nothing; expanding one
  // row resolves exactly that row.
  it("resolves nothing on mount, and only the expanded entry on expand", async () => {
    const resolved: string[] = [];
    const resolveImpactAsync = async (e: DecisionEntry) => {
      resolved.push(e.entryId);
      return { state: "none" } as DecisionImpact;
    };

    render(
      <ul>
        <DecisionEntryRow
          entry={entry({ entryId: "d1" })}
          superseded={false}
          resolveImpact={() => null}
          resolveImpactAsync={resolveImpactAsync}
        />
        <DecisionEntryRow
          entry={entry({ entryId: "d2" })}
          superseded={false}
          resolveImpact={() => null}
          resolveImpactAsync={resolveImpactAsync}
        />
      </ul>,
    );

    expect(resolved).toEqual([]);

    const expandButtons = screen.getAllByTestId("decision-entry-expand");
    fireEvent.click(expandButtons[1]!);
    await screen.findByTestId("decision-entry-impact");
    expect(resolved).toEqual(["d2"]);
  });

  // SC-005: a stored capture must not flicker through the pending state. It was
  // recorded at a boundary and is a fact, not a derivation.
  it("renders a stored capture synchronously, with no pending state", () => {
    renderAsyncRow(
      async () => {
        throw new Error("must not be called for a stored capture");
      },
      { impact: DESCRIPTOR_CAPTURE },
    );
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    expect(screen.queryByTestId("decision-entry-impact-pending")).toBeNull();
    expect(screen.getByTestId("decision-entry-impact-file")).toBeTruthy();
  });

  // US2-4 / FR-014: an answer that contributes to a shared value says so.
  it("names co-decisions when the change is jointly attributed", async () => {
    renderAsyncRow(async () => ({
      ...DESCRIPTOR_CAPTURE,
      sharedWith: ["d-region", "d-script"],
    }));
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    const shared = await screen.findByTestId("decision-entry-impact-shared");
    expect(shared.textContent).toMatch(/2/);
  });

  it("keeps the sync-only path working when no async resolver is supplied", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={entry()}
          superseded={false}
          resolveImpact={() => ({ state: "none" })}
        />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
    expect(screen.queryByTestId("decision-entry-impact-pending")).toBeNull();
    expect(screen.getByTestId("decision-entry-impact").textContent).toContain("changed nothing");
  });
});

// ---------------------------------------------------------------------------
// spec 057 T039 — the deep-link jump affordance (FR-030, FR-031, FR-035,
// FR-036). `resolveCtx` is a plain, fully-controlled prop here (see
// DecisionEntryRow.tsx's own doc comment for why it must be a prop rather
// than something the row reads for itself — the decisions-layer depcruise
// rule forbids this component importing stores/, even for a type-only
// reference). A synthetic traversal + a narrow registry, in the same style
// resolveLocation.test.ts already uses, is enough to construct both a
// genuinely-reached step and a genuinely un-reached one without needing the
// real questionRegistry. The real `manifest` IS used, since resolveLocation
// needs to find "identity"/"touch" in it before it can decide reachability.
// ---------------------------------------------------------------------------

/** Registry carrying only the one id these fixtures name. */
const JUMP_REGISTRY = { il_language_english: {} };

/** Same cast idiom resolveLocation.test.ts uses: the real TraversalSnapshot
 * has many more slots that are not load-bearing for resolveLocation. */
function jumpTraversal(activeStepId: string): TraversalSnapshot {
  return { activeStepId, history: [], selectedTrack: null } as unknown as TraversalSnapshot;
}

function jumpCtxWith(activeStepId: string, hasProject = true): ResolveContext {
  return {
    manifest,
    questionRegistry: JUMP_REGISTRY,
    traversal: jumpTraversal(activeStepId),
    hasProject,
  };
}

const reachableJumpEntry = (): DecisionEntry =>
  entry({
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Bambara",
    },
  });

// "touch" is real but far ahead of "identity" on every track — the author
// standing at "identity" with empty history has not reached it, so this
// degrades to `beyond-gate` rather than a bare `unreachable` (resolveLocation
// never reports `unreachable` for a step-scoped location — see
// DecisionEntryRow.tsx's own comment on `jumpUnreachableReason`).
const unreachedJumpEntry = (): DecisionEntry =>
  entry({
    stepId: "touch",
    payload: {
      kind: "editor-action",
      actionType: "touch_edit",
      summary: { sample: [], sampleTruncated: false },
    },
  });

describe("the jump control (FR-030, FR-031)", () => {
  it("a reachable entry renders a real jump control, not a reason", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={reachableJumpEntry()}
          superseded={false}
          resolveImpact={() => null}
          resolveCtx={jumpCtxWith("identity")}
        />
      </ul>,
    );
    expect(screen.getByTestId("decision-entry-jump")).not.toBeNull();
    expect(screen.queryByTestId("decision-entry-jump-unreachable")).toBeNull();
  });

  it("without a resolveCtx, optimistically offers the jump control", () => {
    // Documents the dormant-fallback behaviour DecisionEntryRow.tsx's doc
    // comment describes: until a caller wires `resolveCtx` through (a
    // concurrent task's responsibility — DecisionTrailView.tsx is out of
    // this file's ownership), every entry still offers a working control,
    // because `jumpToLocation` resolves for real at click time regardless.
    render(
      <ul>
        <DecisionEntryRow entry={reachableJumpEntry()} superseded={false} resolveImpact={() => null} />
      </ul>,
    );
    expect(screen.getByTestId("decision-entry-jump")).not.toBeNull();
  });

  it("clicking the jump control activates jumpToLocation with the entry's location and a trail returnTo (FR-034)", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={reachableJumpEntry()}
          superseded={false}
          resolveImpact={() => null}
          resolveCtx={jumpCtxWith("identity")}
        />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("decision-entry-jump"));
    expect(jumpToLocation).toHaveBeenCalledWith(
      { route: "survey", step: "identity", question: "il_language_english" },
      { returnTo: { route: "trail" } },
    );
  });
});

describe("the unreachable reason (FR-035)", () => {
  it("an entry ahead of the author's reached position renders the reason IN PLACE of a link", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={unreachedJumpEntry()}
          superseded={false}
          resolveImpact={() => null}
          resolveCtx={jumpCtxWith("identity")}
        />
      </ul>,
    );
    expect(screen.queryByTestId("decision-entry-jump")).toBeNull();
    const reason = screen.getByTestId("decision-entry-jump-unreachable");
    expect(reason).not.toBeNull();
    // "beyond-gate"'s shared prose (progressDots.ts's unreachableReasonLabel,
    // reused here rather than a second wording for the same reason code).
    expect(reason.textContent).toMatch(/not yet reached/i);
  });

  it("no project instantiated renders the no-project reason", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={reachableJumpEntry()}
          superseded={false}
          resolveImpact={() => null}
          resolveCtx={jumpCtxWith("identity", false)}
        />
      </ul>,
    );
    expect(screen.queryByTestId("decision-entry-jump")).toBeNull();
    expect(screen.getByTestId("decision-entry-jump-unreachable").textContent).toMatch(/project/i);
  });

  it("never renders a dead control — the reason always carries legible text", () => {
    render(
      <ul>
        <DecisionEntryRow
          entry={unreachedJumpEntry()}
          superseded={false}
          resolveImpact={() => null}
          resolveCtx={jumpCtxWith("identity")}
        />
      </ul>,
    );
    const reason = screen.getByTestId("decision-entry-jump-unreachable");
    expect(reason.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

describe("mounting resolves no impact (FR-036)", () => {
  it("resolveImpact is never called merely by rendering the row, jump control included", () => {
    const resolveImpact = vi.fn(() => null);
    render(
      <ul>
        <DecisionEntryRow
          entry={reachableJumpEntry()}
          superseded={false}
          resolveImpact={resolveImpact}
          resolveCtx={jumpCtxWith("identity")}
        />
        <DecisionEntryRow
          entry={unreachedJumpEntry()}
          superseded={false}
          resolveImpact={resolveImpact}
          resolveCtx={jumpCtxWith("identity")}
        />
      </ul>,
    );
    expect(resolveImpact).not.toHaveBeenCalled();
  });
});
