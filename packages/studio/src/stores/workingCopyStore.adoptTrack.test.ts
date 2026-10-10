// adoptTrack — the copy/adapt answer recorded on the working copy that was
// instantiated at choose_base, before the track step asked (spec 094
// quickstart finding: the adapt track used to stay `new-from-base`).

import { describe, it, expect, afterEach } from "vitest";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { seedInstantiatedWorkingCopy } from "../test/workingCopy.ts";

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("adoptTrack", () => {
  it("adapt makes the working copy adapt-existing, keeping the keyboard's id and name and the chosen language", () => {
    seedInstantiatedWorkingCopy(["a"]);
    useWorkingCopyStore.getState().setIdentity({ bcp47: "fr-Latn", languageName: "French" });
    const { ir, phaseResults } = useWorkingCopyStore.getState();

    useWorkingCopyStore.getState().adoptTrack("adapt");

    const s = useWorkingCopyStore.getState();
    expect(s.instantiationMode).toBe("adapt-existing");
    expect(s.identity).toEqual({
      bcp47: "fr-Latn",
      languageName: "French",
      keyboardId: basicKbdus.id,
      displayName: basicKbdus.displayName,
    });
    // Converted in place: the working copy and the survey results recorded so far stand.
    expect(s.ir).toBe(ir);
    expect(s.phaseResults).toBe(phaseResults);
  });

  it("adapt falls back to the keyboard's own language when none was chosen", () => {
    seedInstantiatedWorkingCopy();
    useWorkingCopyStore.getState().adoptTrack("adapt");
    expect(useWorkingCopyStore.getState().identity?.bcp47).toBe(basicKbdus.languages?.[0] ?? "");
  });

  it("copy after adapt returns to new-from-base and drops the borrowed id and name", () => {
    seedInstantiatedWorkingCopy();
    useWorkingCopyStore.getState().setIdentity({ bcp47: "fr-Latn" });
    useWorkingCopyStore.getState().adoptTrack("adapt");

    useWorkingCopyStore.getState().adoptTrack("copy");

    const s = useWorkingCopyStore.getState();
    expect(s.instantiationMode).toBe("new-from-base");
    expect(s.identity).toEqual({ bcp47: "fr-Latn" });
  });

  it("is a no-op when the mode already matches, or before instantiation", () => {
    seedInstantiatedWorkingCopy();
    useWorkingCopyStore.getState().setIdentity({ bcp47: "fr-Latn", keyboardId: "my_kbd" });
    useWorkingCopyStore.getState().adoptTrack("copy");
    expect(useWorkingCopyStore.getState().identity).toEqual({ bcp47: "fr-Latn", keyboardId: "my_kbd" });

    useWorkingCopyStore.getState().reset();
    useWorkingCopyStore.getState().adoptTrack("adapt");
    expect(useWorkingCopyStore.getState().instantiationMode).toBeNull();
  });
});
