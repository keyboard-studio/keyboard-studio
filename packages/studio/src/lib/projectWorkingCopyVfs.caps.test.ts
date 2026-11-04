// projectWorkingCopyVfs step 2.8 (spec 112 R10): the recorded caps-handling
// decision drives the &CasedKeys store and the copied keyboard's CAPS/NCAPS
// rules, in the projected .kmn the preview compiles and the download ships.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile, parseKmn } from "@keyboard-studio/engine";
import { simulate } from "@keyboard-studio/engine/simulator";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import type { CapsHandlingValue } from "../decisions/decisionTypes.ts";

const KBID = "caps_proj";

// Vitest runs with the package root as cwd; the fixture lives with the engine's caps code.
// Sibling-asset stores are dropped: this VFS holds the .kmn alone, so a bitmap
// or layout-file reference would fail the compile for reasons unrelated to caps.
const UPSTREAM = readFileSync(
  resolve(process.cwd(), "../engine/src/caps/__fixtures__/upstream_basic_kbdus/basic_kbdus.kmn"),
  "utf8",
)
  .split("\n")
  .filter((l) => !/^store\(&(BITMAP|VISUALKEYBOARD|LAYOUTFILE|KMW_\w+)\)/i.test(l))
  .join("\n");

// Bafut-style assignment: eng on a non-letter key (K_LBRKT) and on RAlt K_N.
const ASSIGNED = `${UPSTREAM
  .replace("+ [K_LBRKT] > U+005b", "+ [K_LBRKT] > 'ŋ'")
  .replace("+ [SHIFT K_LBRKT] > U+007b", "+ [SHIFT K_LBRKT] > 'Ŋ'")}
+ [RALT K_N] > 'ŋ'
+ [SHIFT RALT K_N] > 'Ŋ'
`;

function project(kmn: string, capsHandling: CapsHandlingValue | null, bcp47?: string) {
  const vfs = createVirtualFS();
  vfs.set(`source/${KBID}.kmn`, kmn, false);
  const { warnings } = projectWorkingCopyVfs({
    vfs,
    keyboardId: KBID,
    startIr: parseKmn(kmn, KBID).ir,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: bcp47 === undefined ? null : { bcp47 },
    capsHandling,
  });
  const entry = vfs.get(`source/${KBID}.kmn`);
  return { vfs, kmn: typeof entry?.content === "string" ? entry.content : "", warnings };
}

const store = (kmn: string) => /^store\(&CasedKeys\)\s*(.*)$/im.exec(kmn)?.[1]?.trim();

describe("projectWorkingCopyVfs step 2.8 - caps handling (spec 112)", () => {
  it("cased-keys writes the derived store: floor plus the assigned non-letter and RAlt keys", () => {
    const { kmn, warnings } = project(ASSIGNED, { mode: "cased-keys" });
    expect(warnings.filter((w) => w.includes("caps"))).toEqual([]);
    const items = store(kmn) ?? "";
    expect(items).toContain("[K_A]..[K_Z]");
    expect(items).toContain("[K_LBRKT]");
    expect(kmn).toMatch(/store\(&VERSION\) '14\.0'/);
  });

  it("cased-keys includes a key assigned later (derived from the projected IR, not stored)", () => {
    const withoutAssignment = project(UPSTREAM, { mode: "cased-keys" });
    expect(store(withoutAssignment.kmn)).toBe("[K_A]..[K_Z]");
    const withAssignment = project(ASSIGNED, { mode: "cased-keys" });
    expect(store(withAssignment.kmn)).not.toBe("[K_A]..[K_Z]");
  });

  it("cased-keys rewrites the caps rules on the covered keys only", () => {
    const { kmn } = project(UPSTREAM, { mode: "cased-keys" });
    expect(kmn).not.toMatch(/CAPS K_A\]/);
    expect(kmn).not.toMatch(/CAPS SHIFT K_A\]/);
    expect(kmn).toMatch(/\+ \[K_A\] > U\+0061/);
    expect(kmn).toMatch(/\+ \[SHIFT K_A\] > U\+0041/);
  });

  it("explicit-rules keeps the rules and writes no store", () => {
    const { kmn } = project(UPSTREAM, { mode: "explicit-rules" });
    expect(store(kmn)).toBeUndefined();
    expect(kmn).toMatch(/\[CAPS K_A\]/);
    expect(kmn).toMatch(/\[NCAPS K_A\]/);
  });

  it("none writes no store and rewrites every caps rule", () => {
    const { kmn } = project(UPSTREAM, { mode: "none" });
    expect(store(kmn)).toBeUndefined();
    expect(kmn).not.toMatch(/\bCAPS\b/);
    expect(kmn).not.toMatch(/\bNCAPS\b/);
    expect(kmn).toMatch(/\+ \[K_A\] > U\+0061/);
  });

  it("null (not asked) writes no store and leaves the copy as it was", () => {
    const { kmn } = project(UPSTREAM, null);
    expect(store(kmn)).toBeUndefined();
    expect(kmn).toMatch(/\[CAPS K_A\]/);
  });

  it("removes a store the copied keyboard already declared when the mode is not cased-keys", () => {
    const declared = `${UPSTREAM.replace("begin Unicode", "store(&CasedKeys) [K_A]..[K_Z]\nbegin Unicode")}`;
    expect(store(project(declared, { mode: "none" }).kmn)).toBeUndefined();
    expect(store(project(declared, { mode: "explicit-rules" }).kmn)).toBeDefined();
  });

  describe("R6 regression: letters keep typing in every mode", () => {
    const key = (vkey: string, shift: boolean, caps: boolean): SimKeyInput => ({
      vkey,
      modifiers: shift ? ["shift"] : [],
      caps,
    });

    for (const mode of ["cased-keys", "explicit-rules", "none"] as const) {
      it(`${mode}: a and A still type, with and without Caps Lock`, async () => {
        const { vfs } = project(UPSTREAM, { mode });
        const compiled = await compile(vfs, KBID);
        expect(compiled.success, JSON.stringify(compiled.diagnostics?.slice(0, 5))).toBe(true);
        expect(simulate(compiled, [key("K_A", false, false)]).finalOutput).toBe("a");
        expect(simulate(compiled, [key("K_A", true, false)]).finalOutput).toBe("A");
        if (mode !== "none") {
          // Caps still upper-cases letters (via the store or the kept rules).
          expect(simulate(compiled, [key("K_A", false, true)]).finalOutput).toBe("A");
          expect(simulate(compiled, [key("K_A", true, true)]).finalOutput).toBe("a");
        }
      });
    }
  });
});
