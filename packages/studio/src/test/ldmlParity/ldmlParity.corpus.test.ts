// LDML parity (H6, spec 108 FR-012, SC-005): the findings the author sees while authoring name
// the same sites as the report in the download.
//
// For each corpus working copy, built with the spec 106 replay helpers, both projections are
// built headlessly with no React hook mounted:
//
//   preview   projectWorkingCopyVfs, called with the input useWorkingCopyTransform passes
//             (a display-name-only identity), then its .kmn, touch layout and .kvks parsed;
//   download  projectWorkingCopyForOutput, then the same three parsed.
//
// Both use the same resolveLdmlBaseLayout result. A working copy whose FR-027 default is
// unavailable gets the override `us`, never a skip. The coded-item site keys (A, N, K, and M
// with a hint) must be equal, and the studio findings must be exactly the report's coded rows.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { Pattern, VirtualFS } from "@keyboard-studio/contracts";
import {
  OUTPUT_FORM_SEAM_PATTERN_IDS,
  classifyForLdml,
  parseKmn,
  parseKvks,
  parseTouchLayout,
  renderReport,
  resolveLdmlProfile,
} from "@keyboard-studio/engine";
import type { LdmlBaseLayout, LdmlClassification, LdmlClassifyInput } from "@keyboard-studio/engine";
import type { DecisionSet } from "../../decisions/decisionTypes.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { projectWorkingCopyVfs } from "../../lib/projectWorkingCopyVfs.ts";
import { projectionInputFromState } from "../../lib/projectionInput.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { physicalAssignmentsOf } from "../../lib/physicalAssignments.ts";
import { getMarksTreatmentValue } from "../../survey/marks/marksValue.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import { findTouchLayoutPath } from "../../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { getPickedWindowsLayouts, getLayoutFamilyAnswer } from "../../lib/layoutFamily.ts";
import { buildLdmlBaseLayout, resolveLdmlBaseLayout } from "../../lib/ldmlBaseLayout.ts";
import { ldmlClassifyOptions } from "../../lib/ldmlExportInputs.ts";
import { buildLdmlFindings } from "../../lint/ldmlFindings.ts";
import { buildDecisionPointFixture } from "../decisionPointFixture.ts";
import {
  DECISION_POINT_BASES,
  DECISION_POINT_FIXTURE_DIR,
  fixtureRelPath,
  type DecisionPoint,
  type DecisionPointBase,
} from "../decisionPointBases.ts";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";

announceSc004Skip("LDML parity", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", "..", DECISION_POINT_FIXTURE_DIR);

/** The replay point whose working copy carries every decision the walk records. */
const POINTS: readonly DecisionPoint[] = ["assignments", "tolerance"];

function loadDecisions(b: DecisionPointBase, point: DecisionPoint): DecisionSet {
  return JSON.parse(readFileSync(resolve(fixtureRoot, fixtureRelPath(b, point)), "utf-8")) as DecisionSet;
}

/** The base layout both projections use: the FR-027 default, or `us` when it is unavailable. */
function sharedBaseLayout(languages: readonly string[]): LdmlBaseLayout {
  const base = resolveLdmlBaseLayout({
    windowsLayoutPicks: getPickedWindowsLayouts(),
    layoutFamily: getLayoutFamilyAnswer() ?? null,
    bcp47: languages,
    override: useWorkingCopyStore.getState().ldmlBaseLayout,
  });
  return base.chosen ?? buildLdmlBaseLayout("us", "author");
}

function classifyProjected(
  vfs: VirtualFS,
  keyboardId: string,
  baseLayout: LdmlBaseLayout,
  languages: readonly string[],
): LdmlClassification {
  const kmn = readVfsText(vfs, `source/${keyboardId}.kmn`);
  if (kmn === undefined) throw new Error(`projected source/${keyboardId}.kmn is missing`);
  const ir = parseKmn(kmn, keyboardId).ir;
  const touchText = readVfsText(vfs, `source/${keyboardId}.keyman-touch-layout`) ??
    (() => {
      const p = findTouchLayoutPath(vfs);
      return p === undefined ? undefined : readVfsText(vfs, p);
    })();
  const kvksText = readVfsText(vfs, `source/${keyboardId}.kvks`);
  const input: LdmlClassifyInput = {
    ir,
    touchLayout: touchText === undefined ? null : parseTouchLayout(touchText),
    visualKeyboard: kvksText === undefined ? null : parseKvks(kvksText),
    baseLayout,
  };
  return classifyForLdml(input, resolveLdmlProfile("46"), ldmlClassifyOptions({ languages, attributionText: "" }));
}

/** The preview projection, built the way useWorkingCopyTransform builds it (no hook mounted). */
async function previewProjection(): Promise<{ vfs: VirtualFS; keyboardId: string }> {
  const state = useWorkingCopyStore.getState();
  const { startVfs, startIr, startKeyboard, identity, phaseResults } = state;
  if (startVfs === null || startIr === null || startKeyboard === null) throw new Error("not instantiated");

  const assignments = physicalAssignmentsOf(phaseResults);
  const patterns = new Map<string, Pattern>();
  if (assignments.length > 0) {
    const library = getPatternLibraryService();
    const ids = new Set([
      ...assignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)),
      ...OUTPUT_FORM_SEAM_PATTERN_IDS,
    ]);
    await Promise.all(
      [...ids].map(async (id) => {
        const p = await library.getById(id);
        if (p !== undefined) patterns.set(id, p);
      }),
    );
  }

  const vfs = createVirtualFS(startVfs.entries());
  const keyboardId = startKeyboard.id;
  const displayName = identity?.displayName;
  const identityKeyboardId = identity?.keyboardId;
  const { effectiveKeyboardId } = projectWorkingCopyVfs(
    projectionInputFromState(
      { ...state, startIr },
      {
        vfs,
        keyboardId,
        ...(identityKeyboardId !== undefined && identityKeyboardId !== "" && identityKeyboardId !== keyboardId
          ? { targetKeyboardId: identityKeyboardId }
          : {}),
        assignments,
        getPattern: (id) => patterns.get(id),
        identity: displayName !== undefined && displayName !== "" ? { displayName } : null,
        marksTreatment: getMarksTreatmentValue(),
        kmnEdits: undefined,
        baseDisplayName: startKeyboard.displayName,
      },
    ),
  );
  return { vfs, keyboardId: effectiveKeyboardId ?? keyboardId };
}

// Row 5.15 (the touch delivery note) is a report note, not a finding (FR-012). It carries no
// code in the profile, so the filter below already leaves it out; it is named here so a future
// code on that row cannot silently join the comparison.
const codedKeys = (c: LdmlClassification): string[] =>
  c.items
    .filter((i) => i.code !== null && i.rowId !== "5.15")
    .map((i) => i.siteKey)
    .sort();

describe.skipIf(!sc004GatesEnabled)("LDML parity: preview findings and download report (H6, SC-005)", () => {
  for (const b of DECISION_POINT_BASES) {
    for (const point of POINTS) {
      describe(`${b.base} at ${point}`, () => {
        let preview: LdmlClassification;
        let download: LdmlClassification;
        let report: string;
        let findingCount: number;

        beforeAll(async () => {
          await buildDecisionPointFixture({ ...b, point, decisions: loadDecisions(b, point) });
          const state = useWorkingCopyStore.getState();
          const bcp47 = state.identity?.bcp47;
          const languages = bcp47 !== undefined && bcp47 !== "" ? [bcp47] : [];
          const baseLayout = sharedBaseLayout(languages);

          const previewVfs = await previewProjection();
          preview = classifyProjected(previewVfs.vfs, previewVfs.keyboardId, baseLayout, languages);

          const projected = await projectWorkingCopyForOutput();
          if (projected === null) throw new Error("working copy not instantiated");
          download = classifyProjected(projected.vfs, projected.keyboardId, baseLayout, languages);

          report = renderReport(download, resolveLdmlProfile("46"), {
            keyboardName: projected.displayName,
            keyboardId: projected.keyboardId,
            version: projected.version,
            mnemonic: false,
            provenance: null,
          });
          findingCount = buildLdmlFindings(preview, undefined, previewVfs.keyboardId).length;
        }, 240_000);

        it("the preview and the download name the same coded sites", () => {
          // Never vacuous: the provenance record is a coded Keyman gap on every keyboard.
          expect(codedKeys(download).length).toBeGreaterThan(0);
          expect(codedKeys(preview)).toEqual(codedKeys(download));
        });

        it("the studio findings are exactly the report's coded rows", () => {
          // Each coded item is one report table row and one finding. The row-5.15 delivery
          // note is a coded item on both sides, so it cancels out of the comparison.
          const reportRows = report.split("\n").filter((l) => /^\|.*\| KM_LINT_LDML_[A-Z_]+ \|/.test(l)).length;
          expect(download.items.filter((i) => i.rowId === "5.15").every((i) => i.code === null)).toBe(true);
          expect(reportRows).toBe(download.items.filter((i) => i.code !== null && i.rowId !== "5.15").length);
          expect(findingCount).toBe(reportRows);
        });
      });
    }
  }
});
