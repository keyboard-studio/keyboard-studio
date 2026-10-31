// Tests for generatePRBody (#506, spec §12).
//
// Covers the green/yellow/red mapping from resolved criteria rows, the
// honesty rules (not-yet-checkable never renders as passed; red items are
// never pre-checked), finding deduplication against criterion rows,
// upstream-finding segregation, the three attestation states, and a
// full-body snapshot (the issue's "render correctly in a real GitHub PR
// body" criterion, verified by snapshot).

import { describe, expect, it } from "vitest";
import { ALL_CRITERIA, type Criterion, type LintFinding } from "@keyboard-studio/contracts";
import {
  COPYRIGHT_ATTESTATION_LINE,
  generatePRBody,
  type PRBodyCriterionResult,
} from "./generatePRBody.ts";

function criterion(id: string): Criterion {
  const found = ALL_CRITERIA.find((c) => c.id === id);
  if (found === undefined) throw new Error(`unknown criterion ${id}`);
  return found;
}

function row(
  id: string,
  status: PRBodyCriterionResult["status"],
  emittedValue?: string,
): PRBodyCriterionResult {
  return {
    criterion: criterion(id),
    status,
    ...(emittedValue !== undefined ? { emittedValue } : {}),
  };
}

const CONFIRMED = { confirmed: true } as const;

describe("generatePRBody — criteria sections", () => {
  it("renders met rows as pre-checked Green items", () => {
    const body = generatePRBody(
      { criteria: [row("1.1-no-files-outside-keyboard-folder", "met")] },
      CONFIRMED,
    );
    expect(body).toContain("### Green — checks passed");
    expect(body).toContain(
      "- [x] 1.1-no-files-outside-keyboard-folder: No files modified outside the keyboard's own folder",
    );
  });

  it("renders needs-author rows as Yellow items and shows the emitted value", () => {
    const body = generatePRBody(
      { criteria: [row("3.2-history-header-sensible", "needs-author", "ewo-Latn")] },
      CONFIRMED,
    );
    expect(body).toContain("### Yellow — advisory, please review");
    expect(body).toContain(
      "- [ ] 3.2-history-header-sensible: HISTORY.md header is sensible — studio emitted: `ewo-Latn`",
    );
  });

  it("renders needs-author rows without an emitted value when none is supplied", () => {
    const body = generatePRBody(
      { criteria: [row("3.2-history-header-sensible", "needs-author")] },
      CONFIRMED,
    );
    expect(body).toContain("- [ ] 3.2-history-header-sensible: HISTORY.md header is sensible");
    expect(body).not.toContain("studio emitted");
  });

  it("never claims a not-yet-checkable row as passed", () => {
    const body = generatePRBody(
      { criteria: [row("1.5-keyboard-id-not-already-used", "not-yet-checkable")] },
      CONFIRMED,
    );
    expect(body).not.toContain("### Green");
    expect(body).toContain("(not yet checkable)");
    expect(body).not.toContain("- [x] 1.5-keyboard-id-not-already-used");
  });

  it("renders needs-human rows in Red from their pre-submit checklist text, unchecked", () => {
    const body = generatePRBody(
      { criteria: [row("4.3-copyright-holder-is-authorized", "needs-human")] },
      CONFIRMED,
    );
    expect(body).toContain("### Red — manual action required");
    expect(body).toContain(
      "- [ ] The copyright holder named in LICENSE.md is the author or a legal entity the author is authorized to represent",
    );
  });

  it("renders not-met rows in Red, unchecked", () => {
    const body = generatePRBody(
      { criteria: [row("1.1-no-files-outside-keyboard-folder", "not-met")] },
      CONFIRMED,
    );
    expect(body).toContain("### Red — manual action required");
    expect(body).toContain("- [ ] 1.1-no-files-outside-keyboard-folder:");
    expect(body).toContain("(not met)");
    expect(body).not.toContain("- [x]");
  });

  it("omits not-applicable rows entirely", () => {
    const body = generatePRBody(
      { criteria: [row("3.2-history-header-sensible", "not-applicable")] },
      CONFIRMED,
    );
    expect(body).not.toContain("3.2-history-header-sensible");
  });

  it("orders sections Green, Yellow, Red", () => {
    const body = generatePRBody(
      {
        criteria: [
          row("4.3-copyright-holder-is-authorized", "needs-human"),
          row("3.2-history-header-sensible", "needs-author"),
          row("1.1-no-files-outside-keyboard-folder", "met"),
        ],
      },
      CONFIRMED,
    );
    const greenAt = body.indexOf("### Green");
    const yellowAt = body.indexOf("### Yellow");
    const redAt = body.indexOf("### Red");
    expect(greenAt).toBeGreaterThanOrEqual(0);
    expect(yellowAt).toBeGreaterThan(greenAt);
    expect(redAt).toBeGreaterThan(yellowAt);
  });
});

describe("generatePRBody — findings", () => {
  const advisory: LintFinding = {
    code: "KM_HINT_LONGPRESS_ORDER",
    severity: "hint",
    layer: "B",
    message: "Longpress order differs from the base layout.",
  };
  const blocking: LintFinding = {
    code: "KM_ERROR_DUPLICATE_STORE",
    severity: "error",
    layer: "A",
    message: "Duplicate store name.",
  };

  it("renders uncovered authored advisory findings in Yellow and blocking findings in Red", () => {
    const body = generatePRBody(
      { criteria: [], findings: [advisory, blocking] },
      CONFIRMED,
    );
    expect(body).toContain(
      "- [ ] KM_HINT_LONGPRESS_ORDER: Longpress order differs from the base layout.",
    );
    expect(body).toContain("- [ ] KM_ERROR_DUPLICATE_STORE: Duplicate store name.");
    expect(body.indexOf("KM_HINT_LONGPRESS_ORDER")).toBeLessThan(
      body.indexOf("KM_ERROR_DUPLICATE_STORE"),
    );
  });

  it("deduplicates a finding whose code a criterion row already covers", () => {
    const covered: LintFinding = {
      code: "KM_LINT_FILES_OUTSIDE_FOLDER",
      severity: "warning",
      layer: "C",
      message: "A file sits outside the keyboard folder.",
    };
    const body = generatePRBody(
      {
        criteria: [row("1.1-no-files-outside-keyboard-folder", "not-met")],
        findings: [covered],
      },
      CONFIRMED,
    );
    expect(body).not.toContain("KM_LINT_FILES_OUTSIDE_FOLDER");
    expect(body).not.toContain("A file sits outside the keyboard folder.");
  });

  it("segregates upstream findings under their own heading, never as checklist items", () => {
    const upstream: LintFinding = {
      code: "KM_WARN_DEPRECATED_STORE",
      severity: "warning",
      layer: "A",
      message: "Deprecated store in the starting keyboard.",
      origin: "upstream",
    };
    const body = generatePRBody(
      { criteria: [], findings: [upstream] },
      CONFIRMED,
    );
    expect(body).toContain("### Inherited from the starting keyboard");
    expect(body).toContain("- KM_WARN_DEPRECATED_STORE: Deprecated store in the starting keyboard.");
    expect(body).not.toContain("- [ ] KM_WARN_DEPRECATED_STORE");
    expect(body).not.toContain("- [x] KM_WARN_DEPRECATED_STORE");
  });
});

describe("generatePRBody — attestation", () => {
  it("renders the landed attestation line verbatim when confirmed and no holder is known", () => {
    const body = generatePRBody({ criteria: [] }, CONFIRMED);
    expect(body).toContain(COPYRIGHT_ATTESTATION_LINE);
  });

  it("renders the spec §12 sentence with the holder when confirmed with a holder", () => {
    const body = generatePRBody(
      { criteria: [] },
      { confirmed: true, holder: "Jane Author" },
    );
    expect(body).toContain(
      "**Copyright attestation:** I confirm I am the copyright holder or am authorized to submit on behalf of Jane Author.",
    );
  });

  it("renders the attestation as an unchecked Red item when not confirmed", () => {
    const body = generatePRBody({ criteria: [] }, { confirmed: false });
    expect(body).toContain("### Red — manual action required");
    expect(body).toContain(
      "- [ ] Copyright attestation: I confirm I am the copyright holder or am authorized to submit on behalf of the copyright holder.",
    );
    expect(body).not.toContain(COPYRIGHT_ATTESTATION_LINE);
  });
});

describe("generatePRBody — empty inputs", () => {
  it("states plainly when no lint results were available, claiming no passes", () => {
    const body = generatePRBody({ criteria: null }, CONFIRMED);
    expect(body).toContain("No lint results were available");
    expect(body).not.toContain("- [x]");
    expect(body).toContain(COPYRIGHT_ATTESTATION_LINE);
  });

  it("full-body snapshot: mixed criteria + findings + confirmed attestation", () => {
    const body = generatePRBody(
      {
        criteria: [
          row("1.2-keyboard-under-release-or-experimental", "met"),
          row("1.1-no-files-outside-keyboard-folder", "met"),
          row("3.2-history-header-sensible", "needs-author", "ewo-Latn"),
          row("1.5-keyboard-id-not-already-used", "not-yet-checkable"),
          row("4.3-copyright-holder-is-authorized", "needs-human"),
        ],
        findings: [
          {
            code: "KM_HINT_LONGPRESS_ORDER",
            severity: "hint",
            layer: "B",
            message: "Longpress order differs from the base layout.",
          },
          {
            code: "KM_WARN_DEPRECATED_STORE",
            severity: "warning",
            layer: "A",
            message: "Deprecated store in the starting keyboard.",
            origin: "upstream",
          },
        ],
      },
      { confirmed: true, holder: "Jane Author" },
    );
    expect(body).toMatchSnapshot();
  });
});
