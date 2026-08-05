// Unit tests for the shared Enter-to-advance guard (enterToAdvance.ts, #536).
//
// The helper is pure — it takes a (React) keyboard event and options and either
// calls advance() + preventDefault() or stands down. These tests pin every
// branch: the Enter/repeat gate, the tag-skip list, multiline textarea handling
// (plain Enter advances, Shift+Enter inserts a newline), and the
// defaultPrevented deferral used against the inner combobox handler.

import { describe, it, expect, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { handleEnterToAdvance, type EnterToAdvanceOptions } from "./enterToAdvance.ts";

interface MockEventInit {
  key?: string;
  repeat?: boolean;
  shiftKey?: boolean;
  tagName?: string;
  defaultPrevented?: boolean;
}

/** Build a minimal object shaped like the React KeyboardEvent fields the helper reads. */
function mockEvent(init: MockEventInit = {}): KeyboardEvent<HTMLElement> {
  const preventDefault = vi.fn();
  return {
    key: init.key ?? "Enter",
    repeat: init.repeat ?? false,
    shiftKey: init.shiftKey ?? false,
    defaultPrevented: init.defaultPrevented ?? false,
    target: { tagName: init.tagName ?? "INPUT" } as HTMLElement,
    preventDefault,
  } as unknown as KeyboardEvent<HTMLElement>;
}

/** Run the helper against a mock event and report whether it advanced. */
function run(init: MockEventInit, opts?: Partial<EnterToAdvanceOptions>) {
  const advance = vi.fn();
  const e = mockEvent(init);
  handleEnterToAdvance(e, { advance, ...opts });
  return { advance, preventDefault: e.preventDefault as ReturnType<typeof vi.fn> };
}

describe("handleEnterToAdvance — base gate", () => {
  it("advances on a plain Enter from a text input", () => {
    const { advance, preventDefault } = run({ key: "Enter", tagName: "INPUT" });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Enter keys", () => {
    const { advance, preventDefault } = run({ key: "a" });
    expect(advance).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat Enter (held key)", () => {
    const { advance } = run({ key: "Enter", repeat: true });
    expect(advance).not.toHaveBeenCalled();
  });
});

describe("handleEnterToAdvance — tag skip", () => {
  it("does not advance when the target is a BUTTON (default skip)", () => {
    const { advance, preventDefault } = run({ tagName: "BUTTON" });
    expect(advance).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("honours a custom skipTags list", () => {
    const { advance } = run({ tagName: "A" }, { skipTags: ["A"] });
    expect(advance).not.toHaveBeenCalled();
  });
});

describe("handleEnterToAdvance — multiline textarea", () => {
  it("plain Enter in a textarea advances when multiline is on", () => {
    const { advance, preventDefault } = run({ tagName: "TEXTAREA" }, { multiline: true });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Shift+Enter in a textarea inserts a newline (no advance, no preventDefault)", () => {
    const { advance, preventDefault } = run(
      { tagName: "TEXTAREA", shiftKey: true },
      { multiline: true },
    );
    expect(advance).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("without multiline, a textarea is treated like any other element (advances)", () => {
    const { advance } = run({ tagName: "TEXTAREA" });
    expect(advance).toHaveBeenCalledTimes(1);
  });
});

describe("handleEnterToAdvance — defaultPrevented deferral", () => {
  it("stands down when an inner handler already called preventDefault", () => {
    const { advance } = run({ defaultPrevented: true }, { deferIfDefaultPrevented: true });
    expect(advance).not.toHaveBeenCalled();
  });

  it("still advances on defaultPrevented when deferral is off", () => {
    const { advance } = run({ defaultPrevented: true });
    expect(advance).toHaveBeenCalledTimes(1);
  });
});
