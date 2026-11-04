// H1 + H2 + H3 over the corpus (FR-050, FR-051, SC-001; contracts/test-harnesses.md).
//
// Profile 46, hardware form: the Keyman compile's error codes equal the K rows' `keymanCodes`
// (empty), there is no WARN_StringDenorm, and the CLDR 46 XSD accepts the document. Both
// profiles: tr35Conformance returns []. Profile 49: the Keyman checks are skipped; the CLDR 49
// XSD and the TR35 checks are the gate.
//
// A missing corpus is a failed precondition, never a skip: this suite is the proof of SC-001.
import { describe, expect, it } from "vitest";
import { loadCorpusKeyboard, resolvableCorpusEntries } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { errorCodes, keymanCompile } from "./__testing__/keymanCompile.js";
import { tr35Conformance } from "./__testing__/tr35Conformance.js";
import { validateAgainstCldr } from "./__testing__/xsdValidate.js";
import { compareToKeymanGaps } from "./compile/compareToKeymanGaps.js";
import { compileLdmlInBrowser } from "./compile/loadLdmlCompiler.js";
import { buildLdmlExport } from "./package.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";

describe("LDML compile corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: the H1-H3 corpus suite proves nothing without it`).toBe(true);
  });
});

/** Keyman codes the profile's K rows are expected to raise (H1). */
function expectedKeymanCodes(profileId: "46" | "49", items: readonly { rowId: string; status: string }[]): string[] {
  const profile = resolveLdmlProfile(profileId);
  const codes = new Set<string>();
  for (const i of items) if (i.status === "K") for (const c of profile.rows.get(i.rowId)?.keymanCodes ?? []) codes.add(c);
  return [...codes].sort();
}

for (const entry of resolvableCorpusEntries()) {
  describe(`${entry.id}`, () => {
    for (const p of entry.profiles) {
      const profileId = String(p) as "46" | "49";
      it(`profile ${profileId}: valid and conformant`, async () => {
        const kb = loadCorpusKeyboard(entry.id);
        expect(kb, `${entry.id} is not in the corpus checkout`).toBeDefined();
        if (kb?.kmn === undefined) {
          // A hand-written LDML counterpart has no KMN source to export.
          console.info(`[INFO] ${entry.id} ${profileId}: no KMN source (${entry.role}); not exported`);
          return;
        }
        const built = corpusExportInput(kb, profileId);
        expect(built).not.toBeNull();
        const result = await buildLdmlExport(built!.input);
        expect(result.ok, `${entry.id}: export refused`).toBe(true);
        if (!result.ok) return;
        const xml = [...result.files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string;

        const failures: string[] = [];
        const tr35 = tr35Conformance(xml);
        if (tr35.length > 0) failures.push(`tr35: ${tr35.map((v) => `${v.rule}@${v.line}`).join(",")}`);
        const xsd = await validateAgainstCldr(xml, profileId);
        if (xsd.length > 0) failures.push(`xsd: ${xsd.slice(0, 3).map((e) => e.message).join(" | ")}`);
        if (profileId === "46") {
          const k = await keymanCompile(xml);
          const codes = errorCodes(k.messages);
          const expected = expectedKeymanCodes("46", result.classification.items);
          if (JSON.stringify(codes) !== JSON.stringify(expected)) failures.push(`keyman: ${codes.join(",")} (expected ${expected.join(",")})`);
          if (k.messages.some((m) => m.code.includes("StringDenorm"))) failures.push("keyman: WARN_StringDenorm");
          // SC-013: the in-browser compile equals the H1 compile, message for message, and the
          // K-row comparison puts every error in `expected`. (Profile 46's K rows list no Keyman
          // codes today, so a clean corpus keyboard has none to place: this holds the invariant
          // that no unexplained error exists, and starts to exercise the split once a code is listed.)
          const browser = await compileLdmlInBrowser(xml);
          const key = (ms: readonly { code: string; severity: string; text: string; line?: number | undefined }[]) =>
            ms.map((m) => `${m.code}|${m.severity}|${m.line ?? ""}|${m.text}`).sort();
          if (browser.ok !== k.ok) failures.push(`browser: ok ${browser.ok} vs H1 ${k.ok}`);
          if (JSON.stringify(key(browser.messages)) !== JSON.stringify(key(k.messages))) failures.push("browser: messages differ from H1");
          const split = compareToKeymanGaps(browser.messages, result.classification, resolveLdmlProfile("46"));
          if (split.unexpected.length > 0) failures.push(`unexpected: ${split.unexpected.map((m) => m.code).join(",")}`);
          if (split.expected.map((e) => e.message.code).sort().join(",") !== expected.join(",")) failures.push("split: expected set differs from the K rows");
        }
        console.info(failures.length === 0 ? `[OK] ${entry.id} ${profileId}` : `[FAIL] ${entry.id} ${profileId} ${failures.join("; ")}`);
        expect(failures).toEqual([]);
      }, 120_000);
    }
  });
}
