// T009 — recordConfirmation writes exactly one event per resolution, preserves
// provenanceTier, and never aggregates (FR-007 / SC-006).

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordConfirmation,
  readConfirmationEvents,
  resetConfirmationEvents,
} from "./confirmationEvents.ts";

describe("recordConfirmation", () => {
  beforeEach(() => resetConfirmationEvents());

  it("writes exactly one event per resolution", () => {
    recordConfirmation({
      questionId: "q_sa1_target_script_spread",
      facetIds: ["script", "lineage.siblings"],
      prefilledValue: "Latn",
      finalValue: "Latn",
      action: "confirmed",
      provenanceTier: "content-derived",
    });
    const events = readConfirmationEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.questionId).toBe("q_sa1_target_script_spread");
    expect(events[0]!.action).toBe("confirmed");
  });

  it("stamps an ISO-8601 `at` on every event", () => {
    recordConfirmation({
      questionId: "q_ip1_keep_strategies",
      facetIds: ["strategy-fingerprint"],
      prefilledValue: null,
      finalValue: "keep",
      action: "confirmed",
      provenanceTier: "declared-metadata",
    });
    const at = readConfirmationEvents()[0]!.at;
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });

  it("preserves the provenanceTier so the harness can weight fallback prefills", () => {
    recordConfirmation({
      questionId: "q_sa2_base_script_mismatch",
      facetIds: ["script"],
      prefilledValue: "Latn",
      finalValue: "Arab",
      action: "overridden",
      provenanceTier: "language-default",
    });
    expect(readConfirmationEvents()[0]!.provenanceTier).toBe("language-default");
  });

  it("does not aggregate — three resolutions yield three distinct events", () => {
    for (const id of ["q_sa1", "q_sa2", "q_sa3"]) {
      recordConfirmation({
        questionId: id,
        facetIds: ["script"],
        prefilledValue: "Latn",
        finalValue: "Latn",
        action: "confirmed",
        provenanceTier: "content-derived",
      });
    }
    const events = readConfirmationEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.questionId)).toEqual(["q_sa1", "q_sa2", "q_sa3"]);
  });

  it("readConfirmationEvents returns a copy — callers cannot mutate the log", () => {
    recordConfirmation({
      questionId: "q_tp3_orthography_join",
      facetIds: ["script"],
      prefilledValue: null,
      finalValue: "N'Ko",
      action: "confirmed",
      provenanceTier: "content-derived",
    });
    const copy = readConfirmationEvents();
    copy.push({
      questionId: "injected",
      facetIds: [],
      prefilledValue: null,
      finalValue: "x",
      action: "confirmed",
      provenanceTier: "content-derived",
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(readConfirmationEvents()).toHaveLength(1);
  });
});
