import { describe, it, expect, beforeEach } from "vitest";
import { confirmWindowsLayout, seedCapsHandlingDefault } from "./confirmWindowsLayout.ts";
import { buildGalleryHostDeps } from "../../lib/galleryHostDeps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { LAYOUT_FAMILY_STEP_ID } from "../../lib/layoutFamily.ts";

describe("confirmWindowsLayout", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useSurveyAnswerStore.getState().reset();
  });

  it("records the proposal as confirmed when nothing is recorded, and finishes the step", () => {
    confirmWindowsLayout(undefined, "basic_kbdus", buildGalleryHostDeps());
    const record = useDecisionStore.getState().decisions["windows-layout"];
    expect(record?.value).toEqual({ layoutIds: ["basic_kbdus"], origin: "confirmed" });
    expect(record?.provenance).toBe("asked");
    expect(useSurveyAnswerStore.getState().steps[LAYOUT_FAMILY_STEP_ID]?.status).toEqual({ kind: "finished" });
  });

  it("leaves an existing pick alone and still finishes the step", () => {
    const deps = buildGalleryHostDeps();
    confirmWindowsLayout(undefined, "basic_kbdus", deps);
    const existing = useDecisionStore.getState().decisions["windows-layout"];
    useSurveyAnswerStore.getState().reset();
    confirmWindowsLayout(existing, "other", deps);
    expect(useDecisionStore.getState().decisions["windows-layout"]?.value).toEqual(existing?.value);
    expect(useSurveyAnswerStore.getState().steps[LAYOUT_FAMILY_STEP_ID]?.status).toEqual({ kind: "finished" });
  });

  describe("seedCapsHandlingDefault", () => {
    const setInventory = (chars: string[]): void => {
      useDecisionStore.getState().record({
        id: "character-inventory",
        value: { chars },
        provenance: "asked",
      } as never);
    };

    it("records cased keys as the default once the alphabet is cased, without a layout visit", () => {
      setInventory(["a", "A", "ŋ", "Ŋ"]);
      seedCapsHandlingDefault(buildGalleryHostDeps());
      const record = useDecisionStore.getState().decisions["caps-handling"];
      expect(record?.value).toEqual({ mode: "cased-keys" });
      expect(record?.provenance).toBe("default");
    });

    it("records nothing for a caseless alphabet, and never overwrites an author answer", () => {
      setInventory(["က", "ခ"]);
      seedCapsHandlingDefault(buildGalleryHostDeps());
      expect(useDecisionStore.getState().decisions["caps-handling"]).toBeUndefined();

      setInventory(["a", "A"]);
      useDecisionStore.getState().record({ id: "caps-handling", value: { mode: "none" }, provenance: "asked" });
      seedCapsHandlingDefault(buildGalleryHostDeps());
      expect(useDecisionStore.getState().decisions["caps-handling"]?.value).toEqual({ mode: "none" });
    });
  });
});
