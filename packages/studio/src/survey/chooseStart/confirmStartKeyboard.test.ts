import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeStartKeyboard } from "@keyboard-studio/contracts";
import { confirmStartKeyboard } from "./confirmStartKeyboard.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

const base = makeStartKeyboard({
  id: "basic_kbdus",
  script: "Latn",
  path: "release/basic/basic_kbdus",
  targets: ["windows"],
  displayName: "US Basic",
  version: "1.0",
});

describe("confirmStartKeyboard", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
  });

  it("reports the base's catalog identity, then returns the step result", () => {
    const onChange = vi.fn();
    const result = confirmStartKeyboard(base, onChange);
    expect(onChange).toHaveBeenCalledWith({ id: "basic_kbdus", name: "US Basic" });
    expect(result).toEqual({ base });
  });
});
