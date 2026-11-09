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
//
// Reviewer source (the /review parity): the assembly also builds the
// reviewer-source facts from the same judged VFS and lint context — the
// .kps name/description/author, the .kmn &NAME, the README title, the
// document excerpts, the copyright lines — so the authored page shows
// the same side-by-side text previews the /review report shows. The
// language-tag half of that context needs the async langtags /
// Glottolog lookups; they load in the background and the tag lines
// appear when they land. Statuses never wait on them: no verdict in
// authored mode is decided by the tag analysis (the author's
// attestation decides the yellow rows), and the tag lines are evidence
// only. While the lookups are loading the tag list is withheld, so no
// row ever reads "not in langtags" for a tag the lookup simply hasn't
// resolved yet.

import { useEffect, useMemo, useState } from "react";
import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import { outputScriptProfile } from "@keyboard-studio/engine";

import { deriveCriteriaFacts } from "../criteria/deriveCriteriaFacts.ts";
import { licenseTextHints } from "../criteria/fontLicense.ts";
import {
  analyzeLanguageTags,
  type LanguageTagAnalysis,
} from "../criteria/languageTags.ts";
import {
  loadConlangLookup,
  loadLangtagsLookup,
} from "../criteria/langtagsLookup.ts";
import { PRECERTIFIED_LINT_CODES } from "../criteria/precertify.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import {
  buildReviewerSource,
  type LangtagsLookup,
} from "../criteria/reviewerSource.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { buildFileTree } from "../review/fileTree.ts";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import type { Stage } from "./useKeyboardArtifact.ts";
import { useCriteriaFindings } from "./useCriteriaFindings.ts";

/** The async half of the reviewer source: langtags defaults for the
 * side-by-side tag lines, and the tag analysis for the language-tag
 * context lines. Null while loading, or when the lookups are
 * unavailable — the name / excerpt / copyright lines do not need it. */
interface LanguageEnrichment {
  langtags: LangtagsLookup;
  languageTags: LanguageTagAnalysis;
}

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
    lintCtx,
    keyboardId,
    lintFindings,
    verifiedByCode,
    contextMissing,
    compileResult,
    assemblyVerdicts,
    instantiationMode,
    expectedCoverage,
  } = findings;

  // The judged package's declared language tags and parsed IR, from the
  // same assembled context the engine run judged.
  const kpsLanguages = useMemo(
    () => lintCtx?.criteriaInput?.kpsLanguages ?? [],
    [lintCtx],
  );
  const keyboardIR = lintCtx?.keyboardIR;

  const [enrichment, setEnrichment] = useState<LanguageEnrichment | null>(
    null,
  );
  useEffect(() => {
    if (vfs === null || kpsLanguages.length === 0) {
      setEnrichment(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [langtags, conlang] = await Promise.all([
        loadLangtagsLookup(),
        loadConlangLookup(),
      ]);
      if (cancelled) return;
      if (langtags === undefined) {
        setEnrichment(null);
        return;
      }
      setEnrichment({
        langtags: langtags.defaults,
        languageTags: analyzeLanguageTags(
          kpsLanguages,
          langtags.tags,
          conlang,
          keyboardIR !== undefined
            ? outputScriptProfile(keyboardIR)
            : undefined,
        ),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [vfs, kpsLanguages, keyboardIR]);

  // The reviewer-source facts for this artifact: names, tags, excerpts,
  // copyright lines, history years. No review context — there is no PR
  // here — so no scope note and no PR comment counts; the resolver
  // shows the context lines and the positive copyright/history facts
  // exactly as it does for a foreign keyboard.
  const reviewerSource = useMemo(() => {
    if (vfs === null || lintCtx === null) return undefined;
    return buildReviewerSource({
      vfs,
      kpsText: lintCtx.criteriaInput?.kpsText,
      // While the language lookups are still loading, pass no languages
      // (see the module header): a tag the lookup hasn't resolved yet
      // must not read as "not in langtags".
      kpsLanguages: enrichment !== null ? kpsLanguages : [],
      keyboardIR: lintCtx.keyboardIR,
      reviewContext: undefined,
      isUpgradePr: false,
      ...(enrichment !== null
        ? {
            langtags: enrichment.langtags,
            languageTags: enrichment.languageTags,
          }
        : {}),
    });
  }, [vfs, lintCtx, kpsLanguages, enrichment]);

  return useMemo(() => {
    if (!ready || vfs === null) return null;
    const resolved = resolveCriteria({
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
      // The reviewer context lines (names, tags, excerpts, copyright).
      // Evidence only — the yellow rows are still decided by the
      // author's attestation, never by the tag analysis: no
      // reviewerVerdicts and no language-tag facts are passed.
      ...(reviewerSource !== undefined ? { reviewerSource } : {}),
    });
    return {
      ...resolved,
      // The file inventory above the list, same tree the /review report
      // shows — built from the judged VFS, so a missing required file
      // is red here exactly when its row reports it.
      fileTree: buildFileTree(vfs.list(), keyboardId ?? ""),
      ...(expectedCoverage !== null ? { expectedCoverage } : {}),
    };
  }, [
    ready,
    vfs,
    keyboardId,
    lintFindings,
    verifiedByCode,
    contextMissing,
    attestations,
    confirmations,
    compileResult,
    assemblyVerdicts,
    instantiationMode,
    contrastiveAttestation,
    fontLicenseAttestations,
    expectedCoverage,
    reviewerSource,
  ]);
}
