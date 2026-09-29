// deadkeyWrite tests — the studio mutate seam for spec 083, especially the
// minimal real KM_ERROR_DUPLICATE_DEADKEY_ID repair ("dead0" corruption).

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  listDeadkeys,
  validateDeadkeyLifecycle,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { withRepairedDuplicateTriggerIds } from "./deadkeyWrite.ts";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-repair-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

/** The "dead0" corruption: two S-02 mints on unknown keys shared one id. */
const CORRUPT_KMN =
  BASE_KMN + `+ [K_COLON] > dk(dead0)\n+ [K_LBRKT] > dk(dead0)\n`;

function parseIr(kmn: string): KeyboardIR {
  return parseKmn(kmn, "deadkey-repair-test").ir;
}

describe("withRepairedDuplicateTriggerIds", () => {
  it("the fixture really is corrupt: validator flags KM_ERROR_DUPLICATE_DEADKEY_ID", () => {
    const ir = parseIr(CORRUPT_KMN);
    const codes = validateDeadkeyLifecycle(ir).map((f) => f.code);
    expect(codes).toContain("KM_ERROR_DUPLICATE_DEADKEY_ID");
  });

  it("repair clears the duplicate finding and both deadkeys stay listed", () => {
    const repaired = withRepairedDuplicateTriggerIds(parseIr(CORRUPT_KMN));
    const codes = validateDeadkeyLifecycle(repaired).map((f) => f.code);
    expect(codes).not.toContain("KM_ERROR_DUPLICATE_DEADKEY_ID");

    const ids = listDeadkeys(repaired)
      .map((d) => d.id)
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("the first trigger keeps the original id; the extra is re-minted above the legacy ceiling", () => {
    const repaired = withRepairedDuplicateTriggerIds(parseIr(CORRUPT_KMN));
    const byTrigger = new Map(
      listDeadkeys(repaired).map((d) => [d.triggerKey, d.id] as const),
    );
    // First trigger rule keeps dk(dead0) = 0xdead0.
    expect(byTrigger.get("K_COLON")).toBe(0xdead0);
    // The extra mint gets a fresh studio id (never a codepoint-legacy id).
    const reminted = byTrigger.get("K_LBRKT");
    expect(reminted).not.toBe(0xdead0);
    expect(reminted).toBeGreaterThan(0x2fff);
    // A valid numeric id — not blanked, not zero, not the duplicate.
    expect(Number.isInteger(reminted)).toBe(true);
    expect(reminted!).toBeGreaterThan(0);
  });

  it("a clean IR passes through unchanged (no duplicate → no rewrite)", () => {
    const clean = parseIr(BASE_KMN + `+ [K_COLON] > dk(3000)\n`);
    const repaired = withRepairedDuplicateTriggerIds(clean);
    expect(listDeadkeys(repaired).map((d) => d.id)).toEqual([0x3000]);
  });

  it("repair re-mints only true trigger rules — non-trigger dk(id) outputs are untouched", () => {
    // Two triggers share 0x3000; a third rule outputs dk(3000) but is NOT a
    // trigger (two outputs) — the repair must leave it alone. The validator
    // still flags the bystander (it outputs the same id), which is honest:
    // the repair fixes trigger duplication; the bystander needs a human.
    const ir = parseIr(
      BASE_KMN + `+ [K_COLON] > dk(3000)\n+ [K_LBRKT] > dk(3000)\n+ [K_B] > dk(3000) 'x'\n`,
    );
    const repaired = withRepairedDuplicateTriggerIds(ir);

    // Both triggers now have distinct ids.
    const triggerIds = listDeadkeys(repaired)
      .map((d) => d.id)
      .filter((id): id is number => id !== null);
    expect(new Set(triggerIds).size).toBe(triggerIds.length);

    // The non-trigger rule still outputs dk(3000) followed by 'x'.
    const rules = repaired.groups.flatMap((g) => g.rules);
    const bystander = rules.find(
      (r) =>
        r.output.length === 2 &&
        r.output[0]?.kind === "deadkey" &&
        (r.output[0] as { id?: number }).id === 0x3000,
    );
    expect(bystander).toBeDefined();
  });
});
