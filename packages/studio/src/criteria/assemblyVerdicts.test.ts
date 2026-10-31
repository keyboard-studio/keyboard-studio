import { describe, it, expect } from "vitest";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import {
  computeAssemblyVerdicts,
  resolveAssemblyVerdictRow,
  DUPLICATE_ID_CODE,
  SPURIOUS_VERSION_BUMP_CODE,
  VERSION_NOT_BUMPED_CODE,
  VERSION_NOT_INCREMENTED_CODE,
} from "./assemblyVerdicts.js";
import { resolveCriteria } from "./resolveCriteria.ts";
import type { CriteriaInput } from "./criteriaTypes.ts";

const CATALOG = [
  { id: "sil_cameroon_qwerty", path: "release/sil/sil_cameroon_qwerty" },
  { id: "experiment_one", path: "experimental/e/experiment_one" },
  { id: "old_one", path: "legacy/o/old_one" },
];

describe("computeAssemblyVerdicts — 1.5 duplicate keyboard ID", () => {
  it("passes when the output ID is unused (base's own entry excluded)", () => {
    const v = computeAssemblyVerdicts({
      catalog: CATALOG,
      baseKeyboardId: "sil_cameroon_qwerty",
      outputKeyboardId: "sil_cameroon_qwerty",
      instantiationMode: "adapt-existing",
      startVersion: "1.0",
    });
    expect(v.get(DUPLICATE_ID_CODE)?.status).toBe("met");
  });

  it("flags an output ID taken by another keyboard in any tier", () => {
    for (const taken of ["experiment_one", "old_one", "sil_cameroon_qwerty"]) {
      const v = computeAssemblyVerdicts({
        catalog: CATALOG,
        baseKeyboardId: "experiment_one",
        outputKeyboardId: taken === "experiment_one" ? "old_one" : taken,
        instantiationMode: "new-from-base",
        startVersion: "1.0",
      });
      expect(v.get(DUPLICATE_ID_CODE)?.status).toBe("not-met");
    }
  });

  it("withholds the verdict while the catalog has not loaded", () => {
    const v = computeAssemblyVerdicts({
      catalog: null,
      baseKeyboardId: "base",
      outputKeyboardId: "base",
      instantiationMode: "adapt-existing",
      startVersion: "1.0",
    });
    expect(v.has(DUPLICATE_ID_CODE)).toBe(false);
  });
});

describe("computeAssemblyVerdicts — version rows (adapt semantics)", () => {
  const adapt = computeAssemblyVerdicts({
    catalog: CATALOG,
    baseKeyboardId: "sil_cameroon_qwerty",
    outputKeyboardId: "sil_cameroon_qwerty",
    instantiationMode: "adapt-existing",
    startVersion: "1.0",
  });

  it("2.6 Met: the derived output version is strictly greater", () => {
    expect(adapt.get(VERSION_NOT_INCREMENTED_CODE)?.status).toBe("met");
    expect(
      adapt.get(VERSION_NOT_INCREMENTED_CODE)?.lines.join(" "),
    ).toContain("1.0");
  });

  it("2.1 Met (the bump is proved) and 2.2 Met (vacuous on adapt)", () => {
    expect(adapt.get(VERSION_NOT_BUMPED_CODE)?.status).toBe("met");
    expect(adapt.get(SPURIOUS_VERSION_BUMP_CODE)?.status).toBe("met");
  });

  it("new-from-base issues NO version verdicts (the rows resolve Not applicable instead)", () => {
    const v = computeAssemblyVerdicts({
      catalog: CATALOG,
      baseKeyboardId: "sil_cameroon_qwerty",
      outputKeyboardId: "brand_new",
      instantiationMode: "new-from-base",
      startVersion: "1.0",
    });
    expect(v.has(VERSION_NOT_BUMPED_CODE)).toBe(false);
    expect(v.has(VERSION_NOT_INCREMENTED_CODE)).toBe(false);
    expect(v.has(SPURIOUS_VERSION_BUMP_CODE)).toBe(false);
    expect(v.get(DUPLICATE_ID_CODE)?.status).toBe("met");
  });
});

function input(over: Partial<CriteriaInput>): CriteriaInput {
  return {
    criteria: ALL_CRITERIA,
    mode: "authored",
    lintFindings: [],
    record: { attestations: {}, confirmations: {} },
    facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    ...over,
  };
}

function rowFor(result: ReturnType<typeof resolveCriteria>, code: string) {
  return result.rows.find((r) => r.criterion.lintRuleId === code);
}

describe("resolver integration — assembly verdicts", () => {
  it("a supplied verdict resolves its row Met with assembly evidence", () => {
    const result = resolveCriteria(
      input({
        assemblyVerdicts: computeAssemblyVerdicts({
          catalog: CATALOG,
          baseKeyboardId: "sil_cameroon_qwerty",
          outputKeyboardId: "sil_cameroon_qwerty",
          instantiationMode: "adapt-existing",
          startVersion: "1.0",
        }),
      }),
    );
    const row = rowFor(result, DUPLICATE_ID_CODE);
    expect(row?.status).toBe("met");
    expect(row?.evidence().kind).toBe("assembly");
    expect(rowFor(result, VERSION_NOT_INCREMENTED_CODE)?.status).toBe("met");
  });

  it("no verdict → Not yet checkable with the reason, never Met (authored)", () => {
    const result = resolveCriteria(input({}));
    const row = rowFor(result, DUPLICATE_ID_CODE);
    expect(row?.status).toBe("not-yet-checkable");
    expect(row?.evidence().lines.join(" ")).toContain("catalog");
  });

  it("foreign mode gets no verdicts and names the foreign reason", () => {
    const result = resolveCriteria(input({ mode: "foreign" }));
    const row = rowFor(result, VERSION_NOT_BUMPED_CODE);
    expect(row?.status).toBe("not-yet-checkable");
    expect(row?.evidence().lines.join(" ")).toContain("instantiation context");
    // 1.5 and 2.6 defer to their lint checks in foreign mode: with no
    // reviewContext in this synthetic input they resolve through the
    // findings path (no findings → met). The assembly names the missing
    // input when it actually assembles the context (see
    // assembleLintContext.test.ts).
    const dup = rowFor(result, DUPLICATE_ID_CODE);
    expect(dup?.status).toBe("met");
    const vinc = rowFor(result, VERSION_NOT_INCREMENTED_CODE);
    expect(vinc?.status).toBe("met");
  });

  it("new-from-base facts resolve the version rows Not applicable, verdicts or not", () => {
    const result = resolveCriteria(
      input({
        facts: {
          fontBundled: true,
          deprecated: true,
          partnerPackage: true,
          instantiationMode: "new-from-base",
        },
      }),
    );
    for (const code of [
      VERSION_NOT_BUMPED_CODE,
      SPURIOUS_VERSION_BUMP_CODE,
      VERSION_NOT_INCREMENTED_CODE,
    ]) {
      const row = rowFor(result, code);
      expect(row?.status).toBe("not-applicable");
      expect(row?.evidence().lines.join(" ")).toContain(
        "no previously deployed version",
      );
    }
    // 1.5 is not a version row: it still resolves (here: no verdict → NYC).
    expect(rowFor(result, DUPLICATE_ID_CODE)?.status).toBe("not-yet-checkable");
  });

  it("resolveAssemblyVerdictRow ignores non-verdict codes", () => {
    const criterion = ALL_CRITERIA.find(
      (c) => c.lintRuleId === "KM_LINT_VERSION_FORMAT",
    )!;
    expect(
      resolveAssemblyVerdictRow(
        criterion,
        "KM_LINT_VERSION_FORMAT",
        new Map(),
        "authored",
      ),
    ).toBeNull();
  });
});
