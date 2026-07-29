// Tests for existingMethodLabels — the shared label composer for the
// "Existing methods" (desktop) / "Deleted methods" (touch) sections.
//
// `composeContributorLabel` / `composeTouchMethodLabel` resolve their msg()
// descriptors via resolveMessage (lib/i18nResolve.ts): called with no `i18n`
// argument (the convention documented at the top of existingMethodLabels.ts),
// they fall back to the English text baked into the descriptor by the macro —
// no bootstrapped singleton or React tree required. Every test below exercises
// that no-i18n fallback path.

import { describe, it, expect } from "vitest";
import type {
  ContributorDescriptor,
  TouchMethodDescriptor,
} from "@keyboard-studio/engine";
import {
  composeContributorLabel,
  composeTouchMethodLabel,
} from "./existingMethodLabels.ts";

describe("composeContributorLabel", () => {
  it("single-token inputSequence -> \"X -> Y\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "y",
      keystrokeDisplay: "X",
      inputSequence: ["X"],
      output: "y",
    };
    expect(composeContributorLabel(descriptor)).toBe("X → y");
  });

  it("multi-vkey inputSequence -> \"A + Shift+B -> GHG\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "GHG",
      inputSequence: ["A", "Shift+B"],
      output: "GHG",
    };
    expect(composeContributorLabel(descriptor)).toBe("A + Shift+B → GHG");
  });

  it("deadkey inputSequence uses the \"then\" connector -> \"' then a -> á\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "deadkey",
      producedChar: "á",
      mark: "'",
      base: "a",
      inputSequence: ["'", "a"],
      output: "á",
    };
    expect(composeContributorLabel(descriptor)).toBe("' then a → á");
  });

  it("fallback: kind \"keystroke\" with no inputSequence and a keystrokeDisplay -> \"Press ... -> ...\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "a",
      keystrokeDisplay: "A",
    };
    expect(composeContributorLabel(descriptor)).toBe("Press A → a");
  });

  it("fallback: kind \"keystroke\" with no keystrokeDisplay -> generic \"Type this key\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "a",
    };
    expect(composeContributorLabel(descriptor)).toBe("Type this key → a");
  });

  it("fallback: kind \"deadkey\" with no mark/base -> \"Part of a two-step combination -> ...\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "deadkey",
      producedChar: "a",
    };
    expect(composeContributorLabel(descriptor)).toBe(
      "Part of a two-step combination → a",
    );
  });

  it("fallback: kind \"store-slot\" with a storeDisplayName -> \"Produced from the ... table -> ...\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "store-slot",
      producedChar: "ɛ",
      storeDisplayName: "Alphabet Table",
    };
    expect(composeContributorLabel(descriptor)).toBe(
      "Produced from the Alphabet Table table → ɛ",
    );
  });

  it("fallback: kind \"store-slot\" with no storeDisplayName -> \"Also produces ...\"", () => {
    const descriptor: ContributorDescriptor = {
      kind: "store-slot",
      producedChar: "a",
    };
    expect(composeContributorLabel(descriptor)).toBe("Also produces a");
  });

  it("fallback: kind \"blocked\" -> the bundled-output message", () => {
    const descriptor: ContributorDescriptor = {
      kind: "blocked",
      producedChar: "a",
      blockedReasonCode: "multi-char-output",
    };
    expect(composeContributorLabel(descriptor)).toBe(
      "Bundled with other output — can't remove a alone",
    );
  });

  it("FIX 3 collision guard: a context token equal to the \"+\" connector falls back to the per-kind template rather than render an ambiguous join", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "z",
      keystrokeDisplay: "Q",
      inputSequence: ["+", "b"],
      output: "z",
    };
    // The literal sequence path is skipped entirely (collision detected) —
    // falls through to the "keystroke" fallback, which uses keystrokeDisplay
    // directly rather than joining the (ambiguous) inputSequence tokens.
    expect(composeContributorLabel(descriptor)).toBe("Press Q → z");
  });

  it("called with no i18n argument at all defaults to English (no bootstrapped singleton required)", () => {
    const descriptor: ContributorDescriptor = {
      kind: "keystroke",
      producedChar: "a",
      keystrokeDisplay: "A",
      inputSequence: ["A"],
      output: "a",
    };
    // No second argument passed — exercises the exact same no-i18n path as
    // every other test in this file, called out explicitly per the module's
    // documented "callable with no i18n" contract.
    const label = composeContributorLabel(descriptor);
    expect(label).toBe("A → a");
  });
});

describe("composeTouchMethodLabel", () => {
  const baseMethod: TouchMethodDescriptor = {
    id: "k1",
    kind: "tap",
    host: "A",
    producedChar: "a",
    platform: "phone",
    layer: "default",
    deletable: true,
  };

  it("tap with a host renders \"Tap [X] -> Y\"", () => {
    expect(composeTouchMethodLabel(baseMethod, [baseMethod])).toBe(
      "Tap [A] → a",
    );
  });

  it("longpress with no host falls back to the generic phrasing", () => {
    const method: TouchMethodDescriptor = {
      id: "k2",
      kind: "longpress",
      producedChar: "b",
      platform: "phone",
      layer: "default",
      deletable: true,
    };
    expect(composeTouchMethodLabel(method, [method])).toBe(
      "Long-press this key → b",
    );
  });

  it("appends a platform/layer suffix when the layer isn't default", () => {
    const method: TouchMethodDescriptor = {
      id: "k3",
      kind: "tap",
      host: "A",
      producedChar: "a",
      platform: "phone",
      layer: "shift",
      deletable: true,
    };
    expect(composeTouchMethodLabel(method, [method])).toBe(
      "Tap [A] → a (phone, Shift)",
    );
  });
});
