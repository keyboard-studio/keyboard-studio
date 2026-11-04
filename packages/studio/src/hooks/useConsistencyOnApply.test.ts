// Spec 111 US5: an applied change raises follow-ups; the first state, Copy
// mode, and already-decided suggestions raise nothing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { parseKmn } from "@keyboard-studio/engine";

import { useConsistencyOnApply } from "./useConsistencyOnApply.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSuggestedFixesStore } from "../stores/suggestedFixesStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { recordSuggestionDisposition } from "../lib/suggestionDispositions.ts";

const kmn = (rules: string) =>
  `begin Unicode > use(main)\ngroup(main) using keys\n${rules}\n`;
const irOf = (rules: string) => parseKmn(kmn(rules), "t").ir;
const TOUCH = `{ "phone": { "layer": [ { "id": "default", "row": [ { "id": 1, "key": [ { "id": "K_0", "text": "a" } ] } ] } ] } }`;

function setWorking(mode: "adapt-existing" | "new-from-base", rules: string): void {
  act(() => {
    useWorkingCopyStore.setState({
      instantiationMode: mode,
      ir: irOf(rules),
      touchLayoutJson: TOUCH,
    });
  });
}

describe("useConsistencyOnApply", () => {
  beforeEach(() => {
    useSuggestedFixesStore.getState().clear();
    useDecisionLogStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    act(() => useWorkingCopyStore.setState({ instantiationMode: null, ir: null, touchLayoutJson: null }));
  });

  it("offers a touch follow-up after a physical-only addition on Open", () => {
    setWorking("adapt-existing", "+ [K_A] > 'a'");
    renderHook(() => useConsistencyOnApply());
    expect(useSuggestedFixesStore.getState().offered).toEqual([]); // first state is the baseline
    setWorking("adapt-existing", "+ [K_A] > 'a'\n+ [K_B] > 'b'");
    expect(useSuggestedFixesStore.getState().offered.map((f) => f.id)).toContain(
      "consistency:add:touch:b",
    );
  });

  it("does not re-offer a suggestion the author already skipped", () => {
    recordSuggestionDisposition({ id: "consistency:add:touch:b", title: "x" }, "declined");
    setWorking("adapt-existing", "+ [K_A] > 'a'");
    renderHook(() => useConsistencyOnApply());
    setWorking("adapt-existing", "+ [K_A] > 'a'\n+ [K_B] > 'b'");
    expect(useSuggestedFixesStore.getState().offered.map((f) => f.id)).not.toContain(
      "consistency:add:touch:b",
    );
  });

  it("raises nothing on Copy", () => {
    setWorking("new-from-base", "+ [K_A] > 'a'");
    renderHook(() => useConsistencyOnApply());
    setWorking("new-from-base", "+ [K_A] > 'a'\n+ [K_B] > 'b'");
    expect(useSuggestedFixesStore.getState().offered).toEqual([]);
  });
});
