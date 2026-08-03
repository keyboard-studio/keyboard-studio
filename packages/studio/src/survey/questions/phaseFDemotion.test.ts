// Phase F documentation revision — no-delete guardrail for the demoted tip slots.
//
// "Demotion is NOT deletion." Mirrors the established spec-022 guardrail for the
// demoted Phase A battery (noDeleteGuardrail.test.ts), applied to the three fixed
// usage-tip slots dropped from the live Phase F membership.
//
// WHY THEY WERE DEMOTED: a fixed five required tip slots fit neither end of the
// shipped corpus. 54% of published help pages are under 1500 bytes — one prose
// paragraph plus an auto-rendered layout placeholder — so slots 3-5 sat empty.
// Meanwhile complex-script keyboards document far more than five rules
// (release/m/mozhi_malayalam has ~30 named rule sections, release/gff/gff_amharic
// ~14), so five was also a ceiling. pf_more_detail_gate scales depth to the author
// instead of hard-coding a count.
//
// The demoted modules MUST remain:
//   • REGISTERED   — a key in phaseFRegistry and in the merged questionRegistry,
//                    with the key matching definition.id;
//   • ON DISK      — resolvable at survey/questions/f/<id>.ts;
//   • TEST-COVERED — a colocated spec at tests/survey/questions/f/<id>.test.ts;
//   • REVIVABLE    — re-adding the id to content/flows/phase_f_helpdocs.modular.yaml
//                    restores it with no code change, no re-registration, no file
//                    restore.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { questionRegistry } from "./registry.ts";
import { phaseFRegistry } from "./registry.f.ts";

/** The demoted Phase F tip slots. */
export const DEMOTED_PHASE_F: readonly string[] = [
  "pf_usage_tip_3",
  "pf_usage_tip_4",
  "pf_usage_tip_5",
];

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.join(thisDir, "f");
const testDir = path.resolve(thisDir, "../../../tests/survey/questions/f");

function modulePath(id: string): string {
  return path.join(moduleDir, `${id}.ts`);
}
function testPath(id: string): string {
  return path.join(testDir, `${id}.test.ts`);
}

describe("Phase F demotion — no-delete guardrail", () => {
  it("covers exactly 3 demoted tip slots", () => {
    expect(new Set(DEMOTED_PHASE_F).size).toBe(3);
  });

  it("every demoted id is REGISTERED (sub-registry + merged registry, key == definition.id)", () => {
    for (const id of DEMOTED_PHASE_F) {
      expect(
        Object.prototype.hasOwnProperty.call(phaseFRegistry, id),
        `demoted module "${id}" missing from phaseFRegistry — silent unregistration`,
      ).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(questionRegistry, id),
        `demoted module "${id}" missing from merged questionRegistry`,
      ).toBe(true);
      expect(phaseFRegistry[id]?.definition.id, `registry key "${id}" vs definition.id`).toBe(id);
    }
  });

  it("every demoted id RESOLVES TO A MODULE ON DISK (survey/questions/f/<id>.ts)", () => {
    for (const id of DEMOTED_PHASE_F) {
      expect(
        existsSync(modulePath(id)),
        `demoted module file missing on disk: ${modulePath(id)}`,
      ).toBe(true);
    }
  });

  it("every demoted id REMAINS TEST-COVERED (tests/survey/questions/f/<id>.test.ts)", () => {
    for (const id of DEMOTED_PHASE_F) {
      expect(
        existsSync(testPath(id)),
        `demoted module test coverage missing: ${testPath(id)}`,
      ).toBe(true);
    }
  });

  // REVIVABLE, asserted structurally: the demoted chain still resolves to real
  // ids, so re-adding tip 3 to the YAML restores a coherent tip3 -> tip4 -> tip5
  // -> pf_credits run without editing any module.
  it("the demoted chain still resolves to registered ids (revivable)", () => {
    expect(phaseFRegistry["pf_usage_tip_3"]?.definition.next).toBe("pf_usage_tip_4");
    expect(phaseFRegistry["pf_usage_tip_4"]?.definition.next).toBe("pf_usage_tip_5");
    expect(phaseFRegistry["pf_usage_tip_5"]?.definition.next).toBe("pf_credits");
  });
});
