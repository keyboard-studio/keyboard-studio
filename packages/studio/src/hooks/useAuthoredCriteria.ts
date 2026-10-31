// useAuthoredCriteria — the authored-mode criteria result for one
// artifact stage (spec 084, T4.2/T4.3).
//
// The one assembly both authored surfaces share: CriteriaScreen (the
// full page) and OutputScreen (the summary card) must judge the SAME
// artifact with the SAME inputs, or their counts could disagree. This
// hook wraps useCriteriaFindings (findings + contextMissing over the
// stage's VFS), the criteria record store's current attestations /
// confirmations, and the VFS-derived package facts, and runs the pure
// resolver over the full catalog.
//
// Returns null while the findings are not ready: a half-judged result
// would state verdicts the lint run has not actually produced, so both
// hosts render a not-ready statement instead (absence = a statement).
// The stage is a parameter for the reason useCriteriaFindings documents:
// the host owns the one usePreviewArtifact pipeline instance and hands
// its stage down — this hook mounts no pipeline of its own.

import { useMemo } from "react";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";

import { deriveCriteriaFacts } from "../criteria/deriveCriteriaFacts.ts";
import { licenseTextHints } from "../criteria/fontLicense.ts";
import { PRECERTIFIED_LINT_CODES } from "../criteria/precertify.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import type { Stage } from "./useKeyboardArtifact.ts";
import { useCriteriaFindings } from "./useCriteriaFindings.ts";

export function useAuthoredCriteria(stage: Stage): CriteriaResult | null {
  const findings = useCriteriaFindings(stage);
  const attestations = useCriteriaRecordStore((s) => s.attestations);
  const confirmations = useCriteriaRecordStore((s) => s.confirmations);
  const contrastiveAttestation = useCriteriaRecordStore(
    (s) => s.contrastiveAttestation,
  );
  const fontLicenseAttestations = useCriteriaRecordStore(
    (s) => s.fontLicenseAttestations,
  );

  const {
    ready,
    vfs,
    lintFindings,
    verifiedByCode,
    contextMissing,
    compileResult,
    assemblyVerdicts,
    instantiationMode,
  } = findings;

  return useMemo(() => {
    if (!ready || vfs === null) return null;
    return resolveCriteria({
      criteria: ALL_CRITERIA,
      mode: "authored",
      lintFindings,
      verifiedByCode,
      record: {
        attestations,
        confirmations,
        fontLicenseAttestations: fontLicenseAttestations ?? {},
      },
      facts: deriveCriteriaFacts(vfs, instantiationMode ?? undefined),
      contextMissing,
      // The artifact under judgment is the generator's own output
      // bundle, so the generation-manifest criteria are precertified
      // (precertify.ts). Foreign mode never passes this.
      precertified: PRECERTIFIED_LINT_CODES,
      compileResult,
      assemblyVerdicts,
      contrastiveRegionAttested: contrastiveAttestation != null,
      // §9.2 supporting evidence only: what the artifact's LICENSE.md
      // mentions. Never decides the row (fontLicense.ts).
      licenseTextHints: licenseTextHints(readVfsText(vfs, "LICENSE.md")),
    });
  }, [
    ready,
    vfs,
    lintFindings,
    contextMissing,
    attestations,
    confirmations,
    compileResult,
    assemblyVerdicts,
    instantiationMode,
    contrastiveAttestation,
    fontLicenseAttestations,
  ]);
}
