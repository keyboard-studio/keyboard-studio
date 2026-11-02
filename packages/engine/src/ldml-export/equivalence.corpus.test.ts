// H5 over the corpus (FR-051, SC-002, SC-003; research R24).
//
// KMN side: the simulator over a test copy with `&TARGETS any`. The simulator's base is fixed to
// `us`, so the export always uses the US base layout whatever the keyboard's natural host; fill
// for other hosts is proven by baseFill.test.ts. LDML side: ldmlInterpreter. Sequences: every key
// in every layer, every context rule's context + key path, and 200 seeded random walks.
// Comparison: NFC(kmn) === ldml. A mismatch is allowed only when a KMN rule
// that fired in the sequence (the simulator's `firedRule`, mapped to its source line) is the line of an A/N
// item; a keyboard with no A/N items allows none. Mismatches excused only by a partial call chain
// (rows 1.6, 1.7) are reported apart, as they have no KMN rule to name.
//
// A missing corpus is a failed precondition, never a skip.
import { describe, expect, it } from "vitest";
import { loadCorpusKeyboard, resolvableCorpusEntries } from "./__testing__/corpus.js";
import { corpusAvailable, corpusExportInput, KEYBOARDS_ROOT } from "./__testing__/corpusExport.js";
import { checkEquivalence } from "./__testing__/equivalence.js";
import { buildLdmlExport } from "./package.js";
import { US_BASE } from "./__fixtures__/us-base.js";

describe("LDML equivalence corpus: precondition", () => {
  it("the sibling ../keyboards corpus is present", () => {
    expect(corpusAvailable, `${KEYBOARDS_ROOT}/release is missing: H5 proves nothing without it`).toBe(true);
  });
});

for (const entry of resolvableCorpusEntries()) {
  it(`${entry.id}: keystroke equivalence`, async () => {
    const kb = loadCorpusKeyboard(entry.id);
    expect(kb, `${entry.id} is not in the corpus checkout`).toBeDefined();
    if (kb?.kmn === undefined) {
      console.info(`[INFO] ${entry.id}: no KMN source (${entry.role}); not compared`);
      return;
    }
    const built = corpusExportInput(kb, "46", US_BASE);
    expect(built).not.toBeNull();
    const r = await checkEquivalence(entry.id, built!.text, built!.input.ir, buildLdmlExport, built!.input, [], built!.lineOffset);
    console.info(
      `[${r.unexcused.length === 0 ? "OK" : "FAIL"}] ${entry.id}: ${r.total} sequences, ${r.mismatches.length} mismatches, ${r.unexcused.length} unexcused, ${r.skipped} skipped, ${r.lossyItems.length} A/N items, compile ${r.compileOk ? "ok" : "no JS"}`,
    );
    for (const m of r.unexcused.slice(0, 5)) console.info(`  ${JSON.stringify(m)}`);
    // The simulator needs a compiled script; a keyboard it cannot compile cannot be compared.
    expect(r.compileOk, `${entry.id}: the KMN test copy produced no KeymanWeb script`).toBe(true);
    expect(r.skipped, `${entry.id}: sequences the simulator could not run`).toBe(0);
    expect(r.unexcused).toEqual([]);
  }, 300_000);
}
