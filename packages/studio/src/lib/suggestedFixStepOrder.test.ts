// suggestedFixStepOrder — issue #2528: owning-step mapping and manifest-order
// visibility, including the fail-open edges (no/unknown target, an active
// step outside the manifest such as "done").

import { describe, expect, it } from "vitest";

import type { SuggestedFix } from "./consistencySuggestions.ts";
import {
  isSuggestedFixVisibleAtStep,
  suggestedFixOwningStepId,
} from "./suggestedFixStepOrder.ts";

function targetedFix(target: "physical" | "touch" | "docs" | "mechanisms"): SuggestedFix {
  return {
    id: `consistency:add:${target}:x`,
    kind: "consistency",
    findingKey: null,
    preview: [],
    status: "pending",
    title: `fix for ${target}`,
    action: { target, change: "add", subject: "x" },
  };
}

describe("suggestedFixOwningStepId", () => {
  it("maps physical and mechanisms to mechanisms, touch to touch, docs to help", () => {
    expect(suggestedFixOwningStepId(targetedFix("physical"))).toBe("mechanisms");
    expect(suggestedFixOwningStepId(targetedFix("mechanisms"))).toBe("mechanisms");
    expect(suggestedFixOwningStepId(targetedFix("touch"))).toBe("touch");
    expect(suggestedFixOwningStepId(targetedFix("docs"))).toBe("help");
  });

  it("returns null (fail open) for a fix with no action", () => {
    const fix: SuggestedFix = {
      id: "untargeted",
      kind: "consistency",
      findingKey: null,
      preview: [],
      status: "pending",
      title: "untargeted",
    };
    expect(suggestedFixOwningStepId(fix)).toBeNull();
  });
});

describe("isSuggestedFixVisibleAtStep", () => {
  // The order the caller (StudioShell) supplies from the manifest; the
  // helper itself never imports the manifest (depcruise cycle — see the
  // module doc). The relative order here mirrors the manifest tail.
  const ORDER = ["rules", "mechanisms", "touch", "css", "help", "html"];

  it("shows a fix on its owning step and every later step", () => {
    expect(isSuggestedFixVisibleAtStep(targetedFix("docs"), "help", ORDER)).toBe(true);
    expect(isSuggestedFixVisibleAtStep(targetedFix("docs"), "html", ORDER)).toBe(true);
    expect(isSuggestedFixVisibleAtStep(targetedFix("touch"), "touch", ORDER)).toBe(true);
    expect(isSuggestedFixVisibleAtStep(targetedFix("physical"), "mechanisms", ORDER)).toBe(true);
  });

  it("hides a fix on any earlier step (manifest order: mechanisms < touch < help)", () => {
    expect(isSuggestedFixVisibleAtStep(targetedFix("docs"), "touch", ORDER)).toBe(false);
    expect(isSuggestedFixVisibleAtStep(targetedFix("docs"), "css", ORDER)).toBe(false);
    expect(isSuggestedFixVisibleAtStep(targetedFix("touch"), "mechanisms", ORDER)).toBe(false);
    expect(isSuggestedFixVisibleAtStep(targetedFix("physical"), "rules", ORDER)).toBe(false);
  });

  it("fails open for a fix with no action target", () => {
    const fix: SuggestedFix = {
      id: "untargeted",
      kind: "consistency",
      findingKey: null,
      preview: [],
      status: "pending",
      title: "untargeted",
    };
    expect(isSuggestedFixVisibleAtStep(fix, "characters", ORDER)).toBe(true);
  });

  it("fails open for an unknown target and for an active step outside the manifest", () => {
    const unknown = targetedFix("touch");
    unknown.action = { target: "nope" as never, change: "add", subject: "x" };
    expect(isSuggestedFixVisibleAtStep(unknown, "touch", ORDER)).toBe(true);
    expect(isSuggestedFixVisibleAtStep(targetedFix("docs"), "done", ORDER)).toBe(true);
  });
});
