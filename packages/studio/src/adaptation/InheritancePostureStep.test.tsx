// Component test for InheritancePostureStep (spec 038 US2; contract §2).
//
// Renders the three governed radio groups (input-strategies, device-targets,
// script-conventions — script is owned by US1's Prefill rows) and exercises
// confirm(): a pure-confirm path (no changes → all "confirmed") and an
// override path (one changed facet → exactly one "overridden" event, the
// other two "confirmed", and the onConfirm payload reflects the override).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { InheritancePostureStep } from "./InheritancePostureStep.tsx";
import { buildPosture } from "./posture.ts";
import type { AdaptationEvidence } from "./evidence.ts";
import { resetConfirmationEvents, readConfirmationEvents } from "./confirmationEvents.ts";

function evidence(overrides: Partial<AdaptationEvidence> = {}): AdaptationEvidence {
  return {
    targetScript: "Latn",
    baseScriptDistribution: { Latn: 1.0 },
    siblingScriptSpread: { Latn: 3 },
    latinSubProfile: "plain",
    strategyFingerprint: { distribution: { "S-01": 0.7, "S-02": 0.2 }, residue: 0.1 },
    baseTargetMix: ["desktop", "touch"],
    statedDeviceMix: ["desktop"],
    provenanceTier: "content-derived",
    ...overrides,
  };
}

const GOVERNED_FACETS = ["input-strategies", "device-targets", "script-conventions"] as const;

afterEach(() => cleanup());

describe("InheritancePostureStep", () => {
  beforeEach(() => resetConfirmationEvents());

  it("renders a radio group per governed facet (not script)", () => {
    const posture = buildPosture(evidence(), "base_x");
    render(
      <InheritancePostureStep posture={posture} provenanceTier="content-derived" onConfirm={vi.fn()} />,
    );
    for (const facet of GOVERNED_FACETS) {
      for (const p of ["keep", "propose", "discard"]) {
        expect(screen.getByTestId(`posture-${facet}-${p}`)).toBeTruthy();
      }
    }
    expect(screen.queryByTestId("posture-script-keep")).toBeNull();
  });

  it("pure confirm (no change) yields all `confirmed` events", () => {
    const posture = buildPosture(evidence(), "base_x");
    const onConfirm = vi.fn();
    render(
      <InheritancePostureStep posture={posture} provenanceTier="content-derived" onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByTestId("posture-confirm"));

    const events = readConfirmationEvents();
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.action === "confirmed")).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("overriding one facet records exactly 3 events: one overridden, two confirmed", () => {
    const posture = buildPosture(evidence(), "base_x");
    const onConfirm = vi.fn();
    render(
      <InheritancePostureStep posture={posture} provenanceTier="content-derived" onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByTestId("posture-input-strategies-discard"));
    fireEvent.click(screen.getByTestId("posture-confirm"));

    const events = readConfirmationEvents();
    expect(events).toHaveLength(3);

    const overridden = events.filter((e) => e.action === "overridden");
    const confirmed = events.filter((e) => e.action === "confirmed");
    expect(overridden).toHaveLength(1);
    expect(confirmed).toHaveLength(2);
    expect(overridden[0]!.questionId).toBe("q_ip1_keep_strategies");
    expect(overridden[0]!.finalValue).toBe("discard");

    const resolved = onConfirm.mock.calls[0]![0] as ReturnType<typeof buildPosture>;
    const strategies = resolved.entries.find((e) => e.facet === "input-strategies")!;
    expect(strategies.posture).toBe("discard");
    expect(strategies.source).toBe("overridden");
  });
});
