// Phase A survey wrapper — Identity + routing (spec §8 step 3).
//
// Loads phase_a_identity.yaml, runs it through SurveyRunner, and on completion
// derives KeyboardProvenance + routing_group / script_family from the answers.
//
// Outputs:
//   onComplete receives a SurveyPhaseResult with phase "A" plus an `identity`
//   field populated from the key answers. The provenance data is carried in the
//   answers array; the caller extracts it via PhaseA.extractProvenance() helper.

import { useMemo } from "react";
import type {
  SurveyPhaseResult,
  KeyboardIdentity,
  KeyboardProvenance,
  LintFinding,
} from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { parseFlow } from "./loadFlow.ts";
import type { SurveyContext } from "./types.ts";

// Vite ?raw import — YAML source as a plain string, no network request.
// Typed via the `*.yaml?raw` module declaration in src/vite-env.d.ts.
import phaseARaw from "../../../../content/flows/phase_a_identity.yaml?raw";

// ---------------------------------------------------------------------------
// Answer extraction helpers (exported for callers)
// ---------------------------------------------------------------------------

function answerString(result: SurveyPhaseResult, questionId: string): string {
  const answer = result.answers.find((a: { questionId: string }) => a.questionId === questionId);
  if (answer === undefined) return "";
  if (answer.answerType === "text" || answer.answerType === "select") {
    return String(answer.value);
  }
  return "";
}

/**
 * Derive a partial KeyboardIdentity from a completed Phase A result.
 * Returns undefined if required fields are missing.
 */
export function extractIdentity(
  result: SurveyPhaseResult,
): KeyboardIdentity | undefined {
  const languageName = answerString(result, "language_name_english");
  const copyrightHolder = answerString(result, "pa_copyright_holder");
  const layoutFamily = answerString(result, "layout_family");
  const scriptFamily = answerString(result, "script_family");
  const langNameAutonym = answerString(result, "language_name_autonym");
  const isoCode = answerString(result, "iso_code");
  const primaryScript = answerString(result, "primary_script");

  // Without an ISO 639 code the resulting bcp47Tag would be "und", which the
  // keymanapp/keyboards submission validator rejects. Treat a blank iso_code
  // the same as missing languageName/copyrightHolder and refuse to build an
  // identity rather than emit an unsubmittable .kps.
  if (languageName === "" || copyrightHolder === "" || isoCode === "")
    return undefined;

  const routingGroup: KeyboardIdentity["routingGroup"] =
    layoutFamily === "azerty"
      ? "azerty"
      : layoutFamily === "non-roman"
        ? "non-roman"
        : "qwerty-qwertz";

  // Compose a full BCP47 tag: language subtag + ISO 15924 script subtag when
  // both are known (e.g. "bfd-Latn"). Minority-language tags benefit from an
  // explicit script subtag; suppress-script defaults are not applied here. The
  // primary_script "Other" choice is a UI sentinel, not a real script code, so
  // it is never appended.
  const bcp47Tag =
    primaryScript !== "" && primaryScript !== "Other"
      ? `${isoCode}-${primaryScript}`
      : isoCode;
  const displayName =
    langNameAutonym !== ""
      ? `${langNameAutonym} (${languageName})`
      : languageName;

  const base: KeyboardIdentity = {
    languageName,
    bcp47Tag,
    displayName,
    copyrightHolder,
    routingGroup,
  };

  if (scriptFamily !== "" && routingGroup === "non-roman") {
    const validFamilies = new Set([
      "indic",
      "sea",
      "rtl",
      "syllabic",
      "alpha-nonlatin",
      "other",
    ]);
    if (validFamilies.has(scriptFamily)) {
      return {
        ...base,
        scriptFamily: scriptFamily as NonNullable<KeyboardIdentity["scriptFamily"]>,
      };
    }
  }
  return base;
}

/**
 * Extract a KeyboardProvenance from Phase A answers.
 * All fields are optional; missing answers produce an empty object.
 */
export function extractProvenance(result: SurveyPhaseResult): KeyboardProvenance {
  const s = (id: string) => answerString(result, id) || undefined;
  const provenance: KeyboardProvenance = {};

  const requesterName = s("provenance_requester_name");
  const requesterContact = s("provenance_requester_contact");
  const requesterAffiliation = s("provenance_requester_affiliation");
  const requesterRelation = s("provenance_requester_relation");
  if (
    requesterName !== undefined ||
    requesterContact !== undefined ||
    requesterAffiliation !== undefined ||
    requesterRelation !== undefined
  ) {
    provenance.requester = Object.fromEntries(
      Object.entries({
        name: requesterName,
        contact: requesterContact,
        affiliation: requesterAffiliation,
        relationToCommunity: requesterRelation,
      }).filter(([, v]) => v !== undefined),
    ) as NonNullable<KeyboardProvenance["requester"]>;
  }

  const repName = s("provenance_community_rep_name");
  const repRole = s("provenance_community_rep_role");
  const repEmail = s("provenance_community_rep_email");
  if (repName !== undefined || repRole !== undefined || repEmail !== undefined) {
    provenance.communityRep = Object.fromEntries(
      Object.entries({ name: repName, role: repRole, email: repEmail }).filter(
        ([, v]) => v !== undefined,
      ),
    ) as NonNullable<KeyboardProvenance["communityRep"]>;
  }

  const localizedName = answerString(result, "language_name_autonym");
  if (localizedName !== "") provenance.localizedName = localizedName;

  const speakerCount = s("provenance_speaker_count");
  if (speakerCount !== undefined) provenance.speakerCount = speakerCount;

  const regions = s("provenance_regions");
  if (regions !== undefined) provenance.regions = regions;

  const languageStatus = s("provenance_language_status");
  if (languageStatus !== undefined) provenance.languageStatus = languageStatus;

  const existingTools = s("provenance_existing_tools");
  if (existingTools !== undefined) provenance.existingTools = existingTools;

  const orthographyUrl = s("provenance_orthography_url");
  if (orthographyUrl !== undefined) provenance.orthographyUrl = orthographyUrl;

  const communityInvolvement = s("provenance_community_involvement");
  if (communityInvolvement !== undefined)
    provenance.communityInvolvement = communityInvolvement;

  const casingNotes = s("provenance_casing_notes");
  if (casingNotes !== undefined) provenance.casingNotes = casingNotes;

  const additionalNotes = s("provenance_additional_notes");
  if (additionalNotes !== undefined) provenance.additionalNotes = additionalNotes;

  return provenance;
}

// ---------------------------------------------------------------------------
// PhaseA component
// ---------------------------------------------------------------------------

export interface PhaseAProps {
  context?: SurveyContext;
  onComplete: (
    result: SurveyPhaseResult,
    identity: KeyboardIdentity | undefined,
    provenance: KeyboardProvenance,
  ) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function PhaseA({ context = {}, onComplete, onBack, findingsByQuestionId }: PhaseAProps) {
  const flow = useMemo(() => parseFlow(phaseARaw as string), []);

  function handleComplete(result: SurveyPhaseResult) {
    const identity = extractIdentity(result);
    const provenance = extractProvenance(result);
    // Annotate the result with resolved identity
    const annotated: SurveyPhaseResult = {
      ...result,
      ...(identity !== undefined ? { identity } : {}),
    };
    onComplete(annotated, identity, provenance);
  }

  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Phase A — Language identity
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={handleComplete}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}
