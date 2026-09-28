// T025 — layout_family storage and the FR-023 likely-host resolution order.
//
// Resolution runs through the real T011 module
// (`packages/studio/src/lib/referenceHostLayouts.ts`) by default; the stub
// `LikelyHostDeps` path exercises the explicit three-step order contract.

import { describe, it, expect, beforeEach } from "vitest";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import {
  LAYOUT_FAMILY_ANSWER_ID,
  LAYOUT_FAMILY_STEP_ID,
  REFERENCE_HOSTS,
  getLayoutFamilyAnswer,
  resolveLikelyHostLayouts,
  saveLayoutFamilyAnswer,
  setLikelyHostDeps,
} from "./layoutFamily.ts";
import type { LikelyHostDeps } from "./layoutFamily.ts";

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  setLikelyHostDeps(undefined);
});

describe("layout_family answer storage", () => {
  it("persists the answer under the canonical slot", () => {
    saveLayoutFamilyAnswer("qwertz");
    expect(getLayoutFamilyAnswer()).toBe("qwertz");
    const saved =
      useSurveyAnswerStore.getState().steps[LAYOUT_FAMILY_STEP_ID]?.answers[LAYOUT_FAMILY_ANSWER_ID];
    expect(saved?.value).toBe("qwertz");
    expect(saved?.answerType).toBe("select");
  });

  it("is editable: answering again overwrites the stored value", () => {
    saveLayoutFamilyAnswer("qwerty");
    saveLayoutFamilyAnswer("azerty");
    expect(getLayoutFamilyAnswer()).toBe("azerty");
  });

  it("reads undefined when unanswered", () => {
    expect(getLayoutFamilyAnswer()).toBeUndefined();
  });

  it("clearing returns to unanswered", () => {
    saveLayoutFamilyAnswer("qwerty");
    saveLayoutFamilyAnswer(undefined);
    expect(getLayoutFamilyAnswer()).toBeUndefined();
  });
});

describe("resolveLikelyHostLayouts — FR-023 resolution order", () => {
  // Stub matching T011's LikelyHostDeps contract.
  const stubDeps: LikelyHostDeps = {
    likelyHostLayouts: (bcp47) => bcp47.map((t) => ({ id: `host-for-${t}`, label: `Host for ${t}` })),
    layoutFamilyHosts: (answer, bcp47) => [
      { id: `lf-${answer}`, label: `LF ${answer} ${bcp47.join(",")}` },
    ],
  };

  it("prefers the stored layout_family answer (step a)", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: "qwerty", bcp47: ["en-GB"], deps: stubDeps });
    expect(r.source).toBe("layout-family");
    expect(r.hosts).toHaveLength(1);
    expect(r.hosts[0]?.id).toBe("lf-qwerty");
    // The bcp47 tags reach the table so it can refine coarse answers.
    expect(r.hosts[0]?.label).toContain("en-GB");
  });

  it("falls back to bcp47 inference when the question is unanswered (step b)", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: undefined, bcp47: ["de"], deps: stubDeps });
    expect(r.source).toBe("bcp47");
    expect(r.hosts[0]?.id).toBe("host-for-de");
  });

  it("falls back to the five reference hosts with no signal (step c)", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: undefined, bcp47: [] });
    expect(r.source).toBe("default");
    expect(r.hosts).toHaveLength(5);
    expect(r.hosts.map((h) => h.id)).toEqual(REFERENCE_HOSTS.map((h) => h.id));
  });

  it("an empty table result falls through to bcp47 inference, never to silence", () => {
    const deps: LikelyHostDeps = { ...stubDeps, layoutFamilyHosts: () => [] };
    const r = resolveLikelyHostLayouts({ layoutFamily: "qwerty", bcp47: ["fr"], deps });
    expect(r.source).toBe("bcp47");
    expect(r.hosts).toHaveLength(1);
  });

  it("uses the override deps when set (test seam)", () => {
    setLikelyHostDeps(stubDeps);
    const r = resolveLikelyHostLayouts({ layoutFamily: undefined, bcp47: ["en"] });
    expect(r.source).toBe("bcp47");
  });
});

describe("resolveLikelyHostLayouts — real T011 default path", () => {
  it("refines a coarse qwerty answer by bcp47 region: en-GB → UK English", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: "qwerty", bcp47: ["en-GB"] });
    expect(r.source).toBe("layout-family");
    expect(r.hosts.map((h) => h.id)).toEqual(["uk"]);
  });

  it("maps qwertz and azerty answers directly", () => {
    expect(
      resolveLikelyHostLayouts({ layoutFamily: "qwertz", bcp47: ["de"] }).hosts.map((h) => h.id),
    ).toEqual(["qwertz"]);
    expect(
      resolveLikelyHostLayouts({ layoutFamily: "azerty", bcp47: ["fr"] }).hosts.map((h) => h.id),
    ).toEqual(["azerty"]);
  });

  it("infers from bcp47 region when unanswered", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: undefined, bcp47: ["de-DE"] });
    expect(r.source).toBe("bcp47");
    expect(r.hosts.map((h) => h.id)).toEqual(["qwertz"]);
  });

  it("treats non-roman as non-discriminating: falls through to bcp47", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: "non-roman", bcp47: ["de-DE"] });
    expect(r.source).toBe("bcp47");
    expect(r.hosts.map((h) => h.id)).toEqual(["qwertz"]);
  });

  it("labels come from T011's host data, not a local copy", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: undefined, bcp47: [] });
    expect(r.hosts.map((h) => h.label)).toEqual(
      REFERENCE_HOSTS.map((h) => h.label),
    );
    expect(r.hosts.some((h) => h.label === "UK English")).toBe(true);
  });
});
