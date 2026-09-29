// deadkeyOps tests — the spec-083 deadkey lifecycle overlay replay
// (projectWorkingCopyVfs step 1.8).
//
// Strategy, mirroring the key-edit overlay's applyKeyEditsToVfs tests:
// - unit-test applyDeadkeyOpsToVfs against a VFS holding a minimal .kmn;
// - prove end-to-end that projectWorkingCopyVfs honors its deadkeyOps
//   input (the step-1.8 wiring), and that carve/identity layers compose;
// - prove the author-name token survives the projection round-trip.
//
// All engine functions here are the REAL dist implementations (no vi.mock)
// — this is the seam where a mock would hide a codec regression.

import { describe, it, expect } from "vitest";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { createVirtualFS, listDeadkeys } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { applyDeadkeyOpsToVfs, type DeadkeyOperation } from "./deadkeyOps.ts";

const KEYBOARD_ID = "deadkey_overlay_test";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-overlay-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
+ 'a' > 'a'
`;

/** A VFS holding exactly the base .kmn at source/<id>.kmn. */
function makeVfs(kmn: string = BASE_KMN): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: kmn, isBinary: false },
  ]);
}

/** Read back the projected .kmn and list its deadkeys. */
function projectedDeadkeys(vfs: VirtualFS) {
  const entry = vfs.get(`source/${KEYBOARD_ID}.kmn`);
  expect(entry).toBeDefined();
  const text = entry!.content as string;
  return { text, deadkeys: listDeadkeys(parseKmn(text, KEYBOARD_ID).ir) };
}

const DEFINE: DeadkeyOperation = {
  kind: "define",
  triggerKey: "K_5",
  id: 0x3000,
  accentChar: "´",
  authorName: "acute",
};

describe("applyDeadkeyOpsToVfs", () => {
  it("empty op log leaves the .kmn byte-identical and reports no change", () => {
    const vfs = makeVfs();
    const before = (vfs.get(`source/${KEYBOARD_ID}.kmn`)!.content as string);
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, []);
    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(vfs.get(`source/${KEYBOARD_ID}.kmn`)!.content as string).toBe(before);
  });

  it("define projects the full cluster: trigger rule, fan-out, escape, two stores", () => {
    const vfs = makeVfs();
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [DEFINE]);
    expect(result.warnings).toEqual([]);
    expect(result.changed).toBe(true);

    const { text, deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(1);
    expect(deadkeys[0]!.id).toBe(0x3000);
    expect(deadkeys[0]!.triggerKey).toBe("K_5");
    // The cluster emits numeric ids only — never a bare dk(name).
    expect(text).toContain("dk(3000)");
    expect(text).not.toMatch(/dk\([a-z_]/);
    // Author name recorded as the round-tripping comment token.
    expect(text).toContain("@deadkey:3000 name=acute");
    // Fan-out stores exist and start empty.
    expect(deadkeys[0]!.baseStore).not.toBeNull();
    expect(deadkeys[0]!.outputStore).not.toBeNull();
    expect(deadkeys[0]!.pairCount).toBe(0);
  });

  it("define + add-pair projects the pairs into the fan-out stores", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "add-pair", id: 0x3000, base: "e", accented: "é" },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(1);
    expect(deadkeys[0]!.pairCount).toBe(2);
  });

  it("add-pair then remove-pair projects an empty fan-out", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "remove-pair", id: 0x3000, index: 0 },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys[0]!.pairCount).toBe(0);
  });

  it("rename rewrites the id atomically — same trigger, new id, old id gone", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "rename", from: 0x3000, to: 0x3001 },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { text, deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(1);
    expect(deadkeys[0]!.id).toBe(0x3001);
    expect(deadkeys[0]!.triggerKey).toBe("K_5");
    expect(deadkeys[0]!.pairCount).toBe(1);
    expect(text).not.toContain("dk(3000)");
    expect(text).toContain("dk(3001)");
  });

  it("retarget moves the trigger and keeps the id", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      { kind: "retarget", id: 0x3000, newTriggerKey: "K_6" },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(1);
    expect(deadkeys[0]!.id).toBe(0x3000);
    expect(deadkeys[0]!.triggerKey).toBe("K_6");
  });

  it("delete removes the whole entity — trigger rule, fan-out, stores", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "delete", id: 0x3000 },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { text, deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(0);
    expect(text).not.toContain("dk(3000)");
    expect(text).not.toContain("K_5");
    // The unrelated base rule survives (re-emitted in canonical U+ form).
    expect(text).toContain("+ U+0061 > U+0061");
  });

  it("a delete of an already-absent deadkey is a silent-safe no-op, not an error", () => {
    const vfs = makeVfs();
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [
      { kind: "delete", id: 0x3999 },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("an op whose preconditions are gone is skipped with a warning — never silent, never corrupt", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      // No deadkey holds 0x3999 — the rename's precondition is gone.
      { kind: "rename", from: 0x3999, to: 0x399a },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.changed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("rename");
    // The successful define still landed.
    const { deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys.map((d) => d.id)).toEqual([0x3000]);
  });

  it("a missing .kmn is a warning, not a throw", () => {
    const vfs = createVirtualFS([]);
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [DEFINE]);
    expect(result.changed).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("not in VFS");
  });

  it("merge-pairs moves one deadkey's pairs onto another", () => {
    const vfs = makeVfs();
    const ops: DeadkeyOperation[] = [
      DEFINE,
      {
        kind: "define",
        triggerKey: "K_6",
        id: 0x3001,
        accentChar: "`",
        authorName: "grave",
      },
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "add-pair", id: 0x3001, base: "e", accented: "è" },
      { kind: "merge-pairs", fromId: 0x3000, toId: 0x3001 },
    ];
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, ops);
    expect(result.warnings).toEqual([]);
    const { deadkeys } = projectedDeadkeys(vfs);
    const target = deadkeys.find((d) => d.id === 0x3001)!;
    expect(target.pairCount).toBe(2);
  });

  it("repair-duplicate-ids fixes a 'dead0' corruption through the overlay", () => {
    const corruptKmn =
      BASE_KMN + "+ [K_COLON] > dk(dead0)\n+ [K_LBRKT] > dk(dead0)\n";
    const vfs = makeVfs(corruptKmn);
    const result = applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [
      { kind: "repair-duplicate-ids" },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.changed).toBe(true);
    const { deadkeys } = projectedDeadkeys(vfs);
    const ids = deadkeys.map((d) => d.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("set-name writes the name token and clearing it keeps the authorship marker", () => {
    const vfs = makeVfs();
    applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [
      { kind: "define", triggerKey: "K_5", id: 0x3000, accentChar: "´" },
      { kind: "set-name", id: 0x3000, name: "acute" },
    ]);
    let { text, deadkeys } = projectedDeadkeys(vfs);
    expect(text).toContain("@deadkey:3000 name=acute");
    expect(deadkeys[0]!.authorName).toBe("acute");

    applyDeadkeyOpsToVfs(vfs, KEYBOARD_ID, [
      { kind: "set-name", id: 0x3000, name: undefined },
    ]);
    ({ text } = projectedDeadkeys(vfs));
    expect(text).toContain("@deadkey:3000");
    expect(text).not.toContain("name=acute");
  });
});

describe("projectWorkingCopyVfs step 1.8 (deadkey overlay wiring)", () => {
  function project(deadkeyOps: DeadkeyOperation[]): { vfs: VirtualFS; warnings: string[] } {
    const vfs = makeVfs();
    const baseIr = parseKmn(BASE_KMN, KEYBOARD_ID).ir;
    const { warnings } = projectWorkingCopyVfs({
      vfs,
      keyboardId: KEYBOARD_ID,
      baseIr,
      deletedNodeIds: new Set<string>(),
      deletedItemIds: new Set<string>(),
      deletedTouchKeyIds: new Set<string>(),
      assignments: [],
      getPattern: () => undefined,
      identity: null,
      deadkeyOps,
    });
    return { vfs, warnings };
  }

  it("replays the deadkey log onto the projected .kmn — define + rename + pairs", () => {
    const { vfs, warnings } = project([
      DEFINE,
      { kind: "add-pair", id: 0x3000, base: "a", accented: "á" },
      { kind: "rename", from: 0x3000, to: 0x3001 },
      { kind: "set-name", id: 0x3001, name: "acute_renamed" },
    ]);
    // No overlay warnings from the deadkey pass.
    expect(warnings.filter((w) => w.includes("deadkey"))).toEqual([]);

    const { text, deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(1);
    expect(deadkeys[0]!.id).toBe(0x3001);
    expect(deadkeys[0]!.triggerKey).toBe("K_5");
    expect(deadkeys[0]!.pairCount).toBe(1);
    // Author name survives the full projection round-trip.
    expect(text).toContain("@deadkey:3001 name=acute_renamed");
  });

  it("an empty deadkey log leaves the projection untouched by the deadkey pass", () => {
    const { vfs, warnings } = project([]);
    expect(warnings.filter((w) => w.includes("deadkey"))).toEqual([]);
    const { deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(0);
  });

  it("delete through the projection removes the cluster while carve leaves the base rule", () => {
    const { vfs, warnings } = project([
      DEFINE,
      { kind: "delete", id: 0x3000 },
    ]);
    expect(warnings.filter((w) => w.includes("deadkey"))).toEqual([]);
    const { text, deadkeys } = projectedDeadkeys(vfs);
    expect(deadkeys).toHaveLength(0);
    expect(text).toContain("+ U+0061 > U+0061");
  });
});
