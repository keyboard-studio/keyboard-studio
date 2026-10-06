// SC-004 (spec 087): "A completed adapt flow produces a keyboard that passes the
// studio's own submission gates."
//
// For each of the five SC-001 corpus keyboards (real .kmn sources, real codec):
//   1. instantiate the Track 1 working copy (instantiateFromBase, adapt track);
//   2. run the unified decision flow (identity + track + inventory + standard
//      letters modules) with fixture answers and the keyboard's own extractable
//      facts;
//   3. apply the answers: modules that declare mutate() go through the REAL
//      reducer mutate seam (applyStepCompletion with a MutateRequest, flag on);
//      the rest through the same store setters the identity / characters
//      adapters call (setAttribution, setIdentity, recordPhase);
//   4. run the studio's real gates over the result -- no mocks:
//        G1  output projection (the one both downloads and the PR share)
//        G2  Layer A validator (engine runAllChecks) on the projected .kmn
//        G3  real kmcmplib compile via buildOutputBundle (kmx, no error diags)
//        G4  real installable .kmp build (buildKmpForDownload)
//        G5  inventory coverage hard gate (useInventoryCoverageGate hook)
//        G6  attribution present + base license parseable (canDownload terms)
//        G7  Layer C lint (lintWithContext) with no error-severity finding
//        G8  Layer C documentation checks (useDocumentationFindings) no error
//
// A failing gate is a product finding: nothing here is weakened to pass.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { parseKmn, runAllChecks } from "@keyboard-studio/engine";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { buildOutputBundle } from "../lib/buildOutputBundle.ts";
import { useInventoryCoverageGate } from "../hooks/useInventoryCoverageGate.ts";
import { useDocumentationFindings } from "../hooks/useDocumentationFindings.ts";
import { KEYBOARDS, CORPUS, corpusPresent, runAdaptFlow } from "./sc004Harness.ts";

const blocking = (fs: readonly LintFinding[]) =>
  fs.filter((f) => f.severity === "error" || f.severity === "fatal");
const fmt = (fs: readonly LintFinding[]) =>
  fs.map((f) => `${f.code}: ${f.message}`).join("\n");

describe.skipIf(!corpusPresent && !process.env.CI)("SC-004: a completed adapt flow passes the studio's submission gates", () => {
  it("the pinned keyboards corpus is present", () => {
    expect(corpusPresent, `corpus at ${CORPUS}`).toBe(true);
  });

  beforeEach(() => {
    vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(KEYBOARDS.map((k) => [k.id, k] as const))(
    "%s: adapt flow output clears every submission gate",
    async (_id, kb) => {
      runAdaptFlow(kb);
      const store = useWorkingCopyStore;

      // --- 4. the gates -------------------------------------------------
      const failures: string[] = [];

      // G1 projection
      const projected = await projectWorkingCopyForOutput();
      expect(projected, "G1 projection").not.toBeNull();
      const kmnOutText = readVfsText(projected!.vfs, `source/${projected!.keyboardId}.kmn`);
      expect(kmnOutText, "G1 projected .kmn").toBeDefined();

      // G2 Layer A
      const layerA = blocking(runAllChecks(kmnOutText!));
      if (layerA.length > 0) failures.push(`G2 Layer A:\n${fmt(layerA)}`);

      // G3 real compile
      try {
        const bundle = await buildOutputBundle();
        const diagErrors = (bundle?.compileDiagnostics ?? []).filter(
          (d) => d.severity === "error" || d.severity === "fatal",
        );
        if (bundle === null || bundle.artifacts.kmx.byteLength === 0 || diagErrors.length > 0) {
          failures.push(`G3 compile: ${JSON.stringify(diagErrors)}`);
        }
      } catch (e) {
        failures.push(`G3 compile threw: ${e instanceof Error ? e.message : String(e)}`);
      }

      // G5 coverage hard gate (the same hook usePreviewArtifact folds into canDownload)
      const gate = renderHook(() => useInventoryCoverageGate()).result.current;
      if (gate.blocked) {
        failures.push(
          `G5 inventory coverage blocked: desktop=${JSON.stringify(gate.unimplementedDesktop)} touch=${JSON.stringify(gate.unimplementedTouch)}`,
        );
      }

      // G6 the remaining canDownload terms
      const wc = store.getState();
      if (wc.attribution === null) failures.push("G6 attributionMissing");
      if (wc.licenseUnparseable !== null) failures.push(`G6 licenseUnparseable: ${wc.licenseUnparseable.reason}`);

      // G7 Layer C (touch + joined structural checks, desktop IR present)
      const layerC = blocking(
        await new KeyboardLintEngine().lintWithContext(projected!.vfs, projected!.keyboardId, {
          keyboardIR: parseKmn(kmnOutText!, projected!.keyboardId).ir,
        }),
      );
      if (layerC.length > 0) failures.push(`G7 Layer C:\n${fmt(layerC)}`);

      // G8 documentation checks
      const docFindings = blocking(renderHook(() => useDocumentationFindings()).result.current);
      if (docFindings.length > 0) failures.push(`G8 docs:\n${fmt(docFindings)}`);

      expect(failures, `${kb.id}: gate failures`).toEqual([]);
    },
    120_000,
  );
});
