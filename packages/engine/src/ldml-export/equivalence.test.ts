// H5 on the engine fixtures (no corpus needed): the LDML export types what the KMN keyboard types.
import { describe, expect, it } from "vitest";
import { exportInput, fixtureIr, fixtureText } from "./__fixtures__/helpers.js";
import { checkEquivalence } from "./__testing__/equivalence.js";
import { buildLdmlExport } from "./package.js";

describe("keystroke equivalence on the fixtures (H5)", () => {
  for (const name of ["plain.kmn", "nul-beep.kmn", "shared-output.kmn", "unruled.kmn", "options-postkeystroke.kmn"]) {
    it(`${name}: no unexcused mismatch, nothing skipped`, async () => {
      const id = name.replace(/\.kmn$/, "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
      const r = await checkEquivalence(id, fixtureText(name), fixtureIr(name, id), buildLdmlExport, exportInput(name));
      expect(r.compileOk).toBe(true);
      expect(r.skipped).toBe(0);
      expect(r.unexcused).toEqual([]);
      // These keyboards lose nothing that the keys they use depend on: plain, nul-beep, shared-output
      // and unruled allow no mismatch at all.
      if (name !== "options-postkeystroke.kmn") expect(r.mismatches).toEqual([]);
    }, 120_000);
  }
});
