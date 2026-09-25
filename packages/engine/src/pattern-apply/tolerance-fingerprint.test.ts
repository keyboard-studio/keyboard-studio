import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { toleranceFingerprint } from "./tolerance-fingerprint.js";

const KMN = [
  "store(&NAME) 'Fingerprint'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "any(base) + ']' > index(acute,1)",
  "+ ']' > U+00B4",
  "+ 'q' > 'q'",
  "",
].join("\n");

function ruleIds(kmn: string): { ir: ReturnType<typeof parse>["ir"]; ids: string[] } {
  const { ir } = parse(kmn, "fp_fixture");
  return { ir, ids: ir.groups.flatMap((g) => g.rules.map((r) => r.nodeId)) };
}

describe("toleranceFingerprint (spec 078, research D7)", () => {
  it("is a 16-hex-digit digest", () => {
    const { ir, ids } = ruleIds(KMN);
    expect(toleranceFingerprint(ir, ids)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable across a parse -> emit -> parse round trip", () => {
    const { ir, ids } = ruleIds(KMN);
    const { ir: reparsed } = parse(emit(ir), "fp_fixture");
    expect(toleranceFingerprint(reparsed, ids)).toBe(toleranceFingerprint(ir, ids));
  });

  it("is independent of the order the rule ids are given in", () => {
    const { ir, ids } = ruleIds(KMN);
    expect(toleranceFingerprint(ir, [...ids].reverse())).toBe(toleranceFingerprint(ir, ids));
  });

  it("changes when one covered rule's text changes", () => {
    const { ir, ids } = ruleIds(KMN);
    const { ir: edited } = parse(KMN.replace("+ ']' > U+00B4", "+ ']' > U+02CA"), "fp_fixture");
    expect(toleranceFingerprint(edited, ids)).not.toBe(toleranceFingerprint(ir, ids));
  });

  it("ignores rules outside the covered set", () => {
    const { ir, ids } = ruleIds(KMN);
    const covered = ids.slice(0, 2);
    const { ir: edited } = parse(KMN.replace("+ 'q' > 'q'", "+ 'q' > 'Q'"), "fp_fixture");
    expect(toleranceFingerprint(edited, covered)).toBe(toleranceFingerprint(ir, covered));
  });

  it("changes when a covered rule disappears", () => {
    const { ir, ids } = ruleIds(KMN);
    expect(toleranceFingerprint(ir, [...ids, "no-such-rule"])).not.toBe(toleranceFingerprint(ir, ids));
  });
});
