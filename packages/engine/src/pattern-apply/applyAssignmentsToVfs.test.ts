// Tests for applyAssignmentsToVfs — VFS adapter for pattern-apply.

import { describe, it, expect } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { latinDeadkeyAcuteSingle } from "@keyboard-studio/contracts/fixtures";
import type { Pattern } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { applyAssignmentsToVfs } from "./applyAssignmentsToVfs.js";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const VALID_SLOT_VALUES = {
  triggerKey: "K_QUOTE",
  accentChar: "́",
  baseLetters: "aeiouAEIOU",
  accentedForms: "áéíóúÁÉÍÓÚ",
};

function makeAssignment(): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [
      { patternId: latinDeadkeyAcuteSingle.id, slotValues: VALID_SLOT_VALUES },
    ],
  };
}

function makeResolver(patterns: Pattern[]): (id: string) => Pattern | undefined {
  const map = new Map(patterns.map((p) => [p.id, p]));
  return (id: string) => map.get(id);
}

const SCAFFOLD_KMN =
  "c Auto-generated scaffold\n" +
  "store(&VERSION) '10.0'\n" +
  "begin Unicode > use(main)\n";

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("applyAssignmentsToVfs — happy path", () => {
  it("reads source/<keyboardId>.kmn, applies, writes back", () => {
    const vfs = createVirtualFS([
      { path: "source/tyv.kmn", content: SCAFFOLD_KMN, isBinary: false },
    ]);
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { warnings } = applyAssignmentsToVfs(
      vfs,
      "tyv",
      [makeAssignment()],
      resolver
    );
    expect(warnings).toEqual([]);

    // Check that the VFS entry was updated.
    const entry = vfs.get("source/tyv.kmn");
    expect(entry).toBeDefined();
    const updated = entry!.content as string;
    expect(updated).toContain("store(dk_bases)");
    expect(updated).toContain("[K_QUOTE] > deadkey(accent)");
  });

  it("returns the updated kmn text in the result", () => {
    const vfs = createVirtualFS([
      { path: "source/tyv.kmn", content: SCAFFOLD_KMN, isBinary: false },
    ]);
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { kmn } = applyAssignmentsToVfs(vfs, "tyv", [makeAssignment()], resolver);
    expect(kmn).toContain("store(dk_bases)");
  });
});

// ---------------------------------------------------------------------------
// Missing VFS entry — fallback to empty source
// ---------------------------------------------------------------------------

describe("applyAssignmentsToVfs — missing entry", () => {
  it("emits a warning when the .kmn file does not exist in VFS", () => {
    const vfs = createVirtualFS(); // empty
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { warnings } = applyAssignmentsToVfs(
      vfs,
      "tyv",
      [makeAssignment()],
      resolver
    );
    expect(warnings.some((w) => w.includes("source/tyv.kmn"))).toBe(true);
    expect(warnings.some((w) => w.includes("not found"))).toBe(true);
  });

  it("creates the .kmn file in VFS even when it did not exist before", () => {
    const vfs = createVirtualFS();
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    applyAssignmentsToVfs(vfs, "tyv", [makeAssignment()], resolver);
    const entry = vfs.get("source/tyv.kmn");
    expect(entry).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Binary entry — rejected with warning, no mutation
// ---------------------------------------------------------------------------

describe("applyAssignmentsToVfs — binary entry", () => {
  it("emits a warning for a binary .kmn entry and returns empty kmn", () => {
    const vfs = createVirtualFS([
      {
        path: "source/tyv.kmn",
        content: new Uint8Array([0x00, 0x01]),
        isBinary: true,
      },
    ]);
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { kmn, warnings } = applyAssignmentsToVfs(
      vfs,
      "tyv",
      [makeAssignment()],
      resolver
    );
    expect(kmn).toBe("");
    expect(warnings.some((w) => w.includes("binary"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty assignments — VFS entry unchanged
// ---------------------------------------------------------------------------

describe("applyAssignmentsToVfs — empty assignments", () => {
  it("does not modify the VFS entry when there are no assignments", () => {
    const vfs = createVirtualFS([
      { path: "source/tyv.kmn", content: SCAFFOLD_KMN, isBinary: false },
    ]);
    const resolver = makeResolver([latinDeadkeyAcuteSingle]);
    const { kmn, warnings } = applyAssignmentsToVfs(vfs, "tyv", [], resolver);
    expect(warnings).toEqual([]);
    // VFS is still written back (idempotent set), content is unchanged.
    expect(kmn).toBe(SCAFFOLD_KMN);
  });
});
