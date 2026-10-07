// T025 — layout_family storage and the FR-023 likely-host resolution order.
//
// Resolution runs through the real T011 module
// (`packages/studio/src/lib/referenceHostLayouts.ts`) by default; the stub
// `LikelyHostDeps` path exercises the explicit three-step order contract.

import { describe, it, expect, beforeEach } from "vitest";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import {
  LAYOUT_FAMILY_ANSWER_ID,
  LAYOUT_FAMILY_STEP_ID,
  REFERENCE_HOSTS,
  getLayoutFamilyAnswer,
  getPickedWindowsLayout,
  resolveLikelyHostLayouts,
  saveLayoutFamilyAnswer,
  setLikelyHostDeps,
} from "./layoutFamily.ts";
import type { LikelyHostDeps } from "./layoutFamily.ts";
import { WINDOWS_LAYOUTS } from "./windowsLayouts.ts";

/** Record a layout pick the way the gallery host does (spec 090 T011). */
function pickWindowsLayout(layoutId: string): void {
  useDecisionStore.getState().record({
    id: "windows-layout",
    value: { layoutId, origin: "confirmed" },
    provenance: "asked",
    step: "layout",
  });
}

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  useDecisionStore.getState().reset();
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

// ---------------------------------------------------------------------------
// spec 076 A4 - the community-layout step's picked layout
// ---------------------------------------------------------------------------

describe("picked Windows layout (windows-layout decision, spec 090 T011)", () => {
  it("resolves the catalog layout from the recorded decision", () => {
    pickWindowsLayout("basic_kbdfr");
    const record = useDecisionStore.getState().decisions["windows-layout"];
    expect(record?.value).toEqual({ layoutId: "basic_kbdfr", origin: "confirmed" });
    expect(getPickedWindowsLayout()?.id).toBe("basic_kbdfr");
  });

  it("ignores an id that is not in the catalog", () => {
    pickWindowsLayout("basic_kbd_nonexistent");
    expect(getPickedWindowsLayout()).toBeUndefined();
  });

  it("derives the family from the pick", () => {
    pickWindowsLayout("basic_kbdgr");
    expect(getLayoutFamilyAnswer()).toBe("qwertz");
  });

  it("the pick wins over a legacy stored layout_family answer", () => {
    saveLayoutFamilyAnswer("qwertz");
    pickWindowsLayout("basic_kbdfr");
    expect(getLayoutFamilyAnswer()).toBe("azerty");
  });

  it("still reads a legacy layout_family answer when no pick exists", () => {
    saveLayoutFamilyAnswer("azerty");
    expect(getPickedWindowsLayout()).toBeUndefined();
    expect(getLayoutFamilyAnswer()).toBe("azerty");
  });

  it("an other-family pick contributes no family (falls through to bcp47)", () => {
    const other = WINDOWS_LAYOUTS.find((l) => l.family === "other");
    expect(other).toBeDefined();
    pickWindowsLayout(other!.id);
    expect(getLayoutFamilyAnswer()).toBeUndefined();
  });
});

describe("resolveLikelyHostLayouts - picked layout (spec 076 A4)", () => {
  it("an exact reference-host pick beats family and language tag", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: "qwerty", bcp47: ["de-DE"], pickedHost: "uk" });
    expect(r.hosts.map((h) => h.id)).toEqual(["uk"]);
    expect(r.source).toBe("layout-family");
  });

  it("a non-host pick falls back to its family", () => {
    const r = resolveLikelyHostLayouts({ layoutFamily: "qwertz", bcp47: ["en"] });
    expect(r.hosts.map((h) => h.id)).toEqual(["qwertz"]);
  });
});
