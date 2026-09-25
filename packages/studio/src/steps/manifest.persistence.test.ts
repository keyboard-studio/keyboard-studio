// manifest.persistence.test.ts — cross-checks the manifest's `persistence` and
// `evidence` declarations against STEP_ORDER and against
// specs/079-survey-answer-persistence/contracts/step-classification.md
// (spec 079 T006, R-12).

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { manifest } from "./manifest.ts";
import { STEP_ORDER } from "./stepOrder.ts";
import type { EvidenceKeyFnId } from "./evidence.ts";

const KNOWN_KEY_FNS: ReadonlySet<EvidenceKeyFnId> = new Set([
  "alphabet",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
]);

describe("stepClassification", () => {
  it("STEP_ORDER equals manifest.map(s => s.id), in order", () => {
    expect(STEP_ORDER).toEqual(manifest.map((s) => s.id));
  });

  it("every manifest step declares a persistence value", () => {
    for (const step of manifest) {
      expect(step.persistence, `step "${step.id}" is missing persistence`).toBeDefined();
    }
  });

  it("every `{ exempt }` step carries a non-empty, trimmed justification", () => {
    for (const step of manifest) {
      if (typeof step.persistence === "object" && step.persistence !== null) {
        const { exempt } = step.persistence;
        expect(typeof exempt, `step "${step.id}" exempt is not a string`).toBe("string");
        expect(exempt.trim().length, `step "${step.id}" exempt is blank`).toBeGreaterThan(0);
        expect(exempt.trim()).toBe(exempt);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Parse the markdown table in contracts/step-classification.md
  // ---------------------------------------------------------------------------

  interface TableRow {
    stepId: string;
    declarationAfter079: string;
  }

  function parseTable(): TableRow[] {
    // src/steps/manifest.persistence.test.ts -> repo root is 4 levels up:
    // src/steps -> src -> packages/studio -> packages -> <root>
    const testFileDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(testFileDir, "..", "..", "..", "..");
    const docPath = resolve(
      repoRoot,
      "specs/079-survey-answer-persistence/contracts/step-classification.md",
    );
    const text = readFileSync(docPath, "utf8");
    const lines = text.split(/\r?\n/);

    // Find the first markdown table (a header row starting with "| Step id",
    // followed by a "---" separator row), then read data rows until a blank
    // line or a non-table line.
    const headerIndex = lines.findIndex((l) => l.trim().startsWith("| Step id"));
    if (headerIndex === -1) throw new Error("no table found in step-classification.md");
    const rows: TableRow[] = [];
    for (let i = headerIndex + 2; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim().startsWith("|")) break;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const stepId = cells[0];
      const declarationAfter079 = cells[3];
      if (stepId === undefined || declarationAfter079 === undefined) continue;
      rows.push({ stepId, declarationAfter079 });
    }
    return rows;
  }

  const tableRows = parseTable();

  it("parsed at least one row from the table (guards the parser itself)", () => {
    expect(tableRows.length).toBeGreaterThan(0);
  });

  it("the table's step ids equal the manifest's ids, in both directions", () => {
    const manifestIds = manifest.map((s) => s.id).sort();
    const tableIds = tableRows.map((r) => r.stepId).sort();
    expect(tableIds).toEqual(manifestIds);
  });

  /**
   * Extract the declaration this row asserts: either the first backtick-quoted
   * string token (a `PersistenceDeclaration` string literal), or an
   * `{ exempt: "..." }` object whose quoted text is compared against the
   * manifest's exempt string.
   *
   * The characters row reads:
   *   `phase-b-draft` (alphabet) + `answer-store` (sub-screen position, ...)
   * — the FIRST backtick token is the declaration under test, per the task.
   */
  function firstDeclaredToken(cellText: string): { kind: "string"; value: string } | { kind: "exempt"; value: string } {
    const exemptMatch = /\{\s*exempt:\s*"([^"]*)"\s*\}/.exec(cellText);
    if (exemptMatch !== null && cellText.trim().startsWith("`{")) {
      return { kind: "exempt", value: exemptMatch[1]! };
    }
    if (exemptMatch !== null && cellText.includes('{ exempt: "')) {
      // exempt object present anywhere but not backtick-first — still the only
      // token for package's row, which has no other backtick token before it.
      const firstBacktick = /`([^`]*)`/.exec(cellText);
      if (firstBacktick === null || firstBacktick.index > exemptMatch.index) {
        return { kind: "exempt", value: exemptMatch[1]! };
      }
    }
    const stringMatch = /`([^`]*)`/.exec(cellText);
    if (stringMatch === null) {
      throw new Error(`no backtick-quoted token found in declaration cell: "${cellText}"`);
    }
    return { kind: "string", value: stringMatch[1]! };
  }

  it("each row's declaration matches the manifest's persistence for that step", () => {
    const byId = new Map(manifest.map((s) => [s.id, s]));
    for (const row of tableRows) {
      const step = byId.get(row.stepId);
      expect(step, `no manifest step for table row "${row.stepId}"`).toBeDefined();
      if (step === undefined) continue;

      const token = firstDeclaredToken(row.declarationAfter079);
      if (token.kind === "exempt") {
        expect(
          typeof step.persistence === "object" && step.persistence !== null
            ? step.persistence.exempt
            : undefined,
          `step "${row.stepId}" table declares exempt but manifest does not`,
        ).toBe(token.value);
      } else {
        expect(
          step.persistence,
          `step "${row.stepId}" table declares "${token.value}" but manifest declares ${JSON.stringify(step.persistence)}`,
        ).toBe(token.value);
      }
    }
  });

  it("steps declaring an `evidence` block have a non-empty inputs list and a known keyFn", () => {
    for (const step of manifest) {
      if (step.evidence === undefined) continue;
      expect(step.evidence.inputs.length, `step "${step.id}" evidence.inputs is empty`).toBeGreaterThan(0);
      expect(
        KNOWN_KEY_FNS.has(step.evidence.keyFn),
        `step "${step.id}" evidence.keyFn "${step.evidence.keyFn}" is not in the known key-fn set`,
      ).toBe(true);
    }
  });
});
