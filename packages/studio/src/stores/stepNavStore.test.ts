// stepNavStore — the transitions table in specs/081-footer-step-nav/data-model.md.

import { afterEach, describe, expect, it, vi } from "vitest";
import { useStepNavStore, sameSpec, type StepNavSpec } from "./stepNavStore.ts";

const noop = (): void => {};

function spec(overrides: Partial<StepNavSpec> = {}): StepNavSpec {
  return {
    back: { label: "← Back", onClick: noop, testId: "x-back" },
    forward: { label: "Next →", onClick: noop, testId: "x-next" },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stepNavStore — publish", () => {
  it("inserts an entry for a step with none", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    const entry = useStepNavStore.getState().entries["identity"];
    expect(entry?.owner).toBe("a");
    expect(entry?.spec.forward?.testId).toBe("x-next");
  });

  it("is a no-op for the same owner and an equal spec, notifying no subscriber (FR-050)", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    const before = useStepNavStore.getState().entries;
    const listener = vi.fn();
    const unsubscribe = useStepNavStore.subscribe(listener);
    // A fresh object with fresh closures: only the handlers differ.
    useStepNavStore.getState().publish("identity", "a", spec({
      forward: { label: "Next →", onClick: () => {}, testId: "x-next" },
    }));
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(useStepNavStore.getState().entries).toBe(before);
  });

  it("replaces the spec when a descriptive field changes", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    useStepNavStore.getState().publish("identity", "a", spec({
      forward: { label: "Finish", onClick: noop, testId: "x-next", disabled: true },
    }));
    const forward = useStepNavStore.getState().entries["identity"]?.spec.forward;
    expect(forward?.label).toBe("Finish");
    expect(forward?.disabled).toBe(true);
  });

  it("keeps the first publisher when a different owner publishes, and reports it in DEV (FR-013)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    useStepNavStore.getState().publish("identity", "a", spec());
    useStepNavStore.getState().publish("identity", "b", spec({
      back: { label: "Boundary back", onClick: noop, testId: "wrapper-back" },
    }));
    const entry = useStepNavStore.getState().entries["identity"];
    expect(entry?.owner).toBe("a");
    expect(entry?.spec.back?.testId).toBe("x-back");
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("stepNavStore — clear and reset", () => {
  it("clear by the owner deletes the entry", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    useStepNavStore.getState().clear("identity", "a");
    expect(useStepNavStore.getState().entries["identity"]).toBeUndefined();
  });

  it("clear by a non-owner does nothing", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    useStepNavStore.getState().clear("identity", "b");
    expect(useStepNavStore.getState().entries["identity"]?.owner).toBe("a");
  });

  it("reset empties every entry", () => {
    useStepNavStore.getState().publish("identity", "a", spec());
    useStepNavStore.getState().publish("characters", "c", spec());
    useStepNavStore.getState().reset();
    expect(useStepNavStore.getState().entries).toEqual({});
  });
});

describe("sameSpec", () => {
  it("treats slot presence as significant", () => {
    const withBack = spec();
    const { back: _back, ...withoutBack } = withBack;
    expect(sameSpec(withBack, withoutBack)).toBe(false);
  });

  it("treats an absent disabled flag as false", () => {
    const a = spec({ forward: { label: "Next →", onClick: noop, testId: "x-next" } });
    const b = spec({ forward: { label: "Next →", onClick: noop, testId: "x-next", disabled: false } });
    expect(sameSpec(a, b)).toBe(true);
  });

  it("compares aria-label and aria-describedby", () => {
    const a = spec({ forward: { label: "Next →", onClick: noop, testId: "x-next", ariaDescribedBy: "hint" } });
    expect(sameSpec(a, spec())).toBe(false);
    const b = spec({ back: { label: "← Back", onClick: noop, testId: "x-back", ariaLabel: "Back to ɓ" } });
    expect(sameSpec(b, spec())).toBe(false);
  });
});
