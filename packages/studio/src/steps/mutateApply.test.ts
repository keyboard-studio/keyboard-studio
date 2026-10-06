// Tests for the mutate() apply path (spec 087 T030, FR-007).
//
// A patch touching any path outside the module's declared `writes` is
// rejected WHOLE-PATCH: the error names the offending paths, nothing is
// partially applied, and the working copy is left untouched.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { irPath } from "@keyboard-studio/contracts";
import {
  applyMutatePatch,
  MutatePatchContainmentError,
} from "./mutateApply.ts";

function fixtureIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_keyboard",
      name: "Test",
      bcp47: [],
      copyright: "© 2026 Test",
      version: "1.0",
      targets: ["windows"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe("applyMutatePatch containment (T030)", () => {
  it("rejects the whole patch when any leaf falls outside declared writes", () => {
    const base = fixtureIR();
    const patch = {
      header: {
        copyright: "© 2026 New",
        // Undeclared: this module may only write header.copyright.
        name: "Sneaky Rename",
      },
    };
    let thrown: unknown;
    try {
      applyMutatePatch(base, patch, [irPath("header", "copyright")]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MutatePatchContainmentError);
    const err = thrown as MutatePatchContainmentError;
    expect(err.offendingPaths).toEqual(["header.name"]);
    // The working copy is untouched — no partial apply.
    expect(base.header.copyright).toBe("© 2026 Test");
    expect(base.header.name).toBe("Test");
  });

  it("applies a contained patch and leaves siblings intact", () => {
    const base = fixtureIR();
    const next = applyMutatePatch(
      base,
      { header: { copyright: "© 2026 New" } },
      [irPath("header", "copyright")],
    );
    expect(next.header.copyright).toBe("© 2026 New");
    expect(next.header.name).toBe("Test");
    // The input IR is never mutated.
    expect(base.header.copyright).toBe("© 2026 Test");
  });

  it("rejects a patch that escapes through an undeclared subtree", () => {
    const base = fixtureIR();
    expect(() =>
      applyMutatePatch(base, { stores: [] }, [irPath("header", "copyright")]),
    ).toThrow(MutatePatchContainmentError);
    expect(base.stores).toEqual([]);
  });
});
