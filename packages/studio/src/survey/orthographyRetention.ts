// Spec 022 — orthographyUrl retention on the canonical surface (FR-008).
//
// Demoting the orphaned full non-identity Phase A drops the runtime capture of
// `orthographyUrl` (a linguist-agent grounding input — it is the single most
// reliable orthography reference for CharacterDiscoveryService.synthesizeInventory,
// provenance.ts:100-107). The `provenance_*` modules stay on disk (no-delete) but
// are no longer reached at runtime, so this retains the capture on the canonical
// `identity_lite` / documentation surface.
//
// Phase-1 invariants: it REUSES the existing `provenance.orthographyUrl` contract
// field (packages/contracts/src/provenance.ts:107) — NO new field, NO contracts
// bump. It introduces NO write routing and NO mutate(): it is a pure extractor that
// returns a Partial<KeyboardProvenance> the canonical surface merges into its
// provenance, exactly mirroring the reference capture at PhaseA.tsx:163-164. When
// no orthographyUrl is provided it is a clean no-op (the field stays unset, exactly
// as today — retention never forces or fabricates the value).

import type { SurveyPhaseResult, KeyboardProvenance } from "@keyboard-studio/contracts";

/** The questionRegistry id that captures the orthography URL (Phase A provenance). */
export const ORTHOGRAPHY_URL_QUESTION_ID = "provenance_orthography_url";

/**
 * Extract the orthography-URL answer from a survey result as a string, or "" if
 * absent/empty. Mirrors the answerString helpers in PhaseA.tsx / IdentityLite.tsx.
 */
function orthographyAnswer(result: SurveyPhaseResult): string {
  for (const a of result.answers) {
    if (a.questionId === ORTHOGRAPHY_URL_QUESTION_ID) {
      return typeof a.value === "string" ? a.value : "";
    }
  }
  return "";
}

/**
 * Retain `orthographyUrl` capture on the canonical identity-lite / documentation
 * surface when Phase A is demoted to the library.
 *
 * Returns a Partial<KeyboardProvenance> carrying `orthographyUrl` ONLY when a
 * non-empty value was provided; otherwise an EMPTY object (a clean no-op — the
 * field stays unset, exactly as today). Reuses the existing provenance field; no
 * contracts bump. The caller merges the returned partial into its provenance, e.g.
 *   provenance = { ...provenance, ...captureOrthographyUrl(result) };
 */
export function captureOrthographyUrl(
  result: SurveyPhaseResult,
): Partial<KeyboardProvenance> {
  const url = orthographyAnswer(result);
  // No-op when absent — do not force or fabricate the field (FR-008).
  if (url === "") return {};
  return { orthographyUrl: url };
}
