// Phase A survey wrapper — Identity + routing (spec §8 step 3).
//
// Loads phase_a_identity.yaml, runs it through SurveyRunner, and on completion
// derives KeyboardProvenance + routing_group / script_family from the answers.
//
// Outputs:
//   onComplete receives a SurveyPhaseResult with phase "A" plus an `identity`
//   field populated from the key answers. The provenance data is carried in the
//   answers array; the caller extracts it via PhaseA.extractProvenance() helper.

import { useMemo, useRef, useCallback, useEffect } from "react";
import type {
  SurveyPhaseResult,
  KeyboardIdentity,
  KeyboardProvenance,
  LintFinding,
  LangtagsProvenance,
} from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext } from "./types.ts";
import {
  loadLangtags,
  regionNameFor,
} from "../lib/langtagsDefaults.ts";
import { primarySubtag } from "../lib/suggestBase.ts";

// Vite ?raw import — YAML source as a plain string, no network request.
// Typed via the `*.yaml?raw` module declaration in src/vite-env.d.ts.
import phaseARaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";

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
  const flow = useMemo(() => loadModularFlow(phaseARaw as string), []);

  // ---------------------------------------------------------------------------
  // Langtags seeding for Phase A (T019 / T020 / US2)
  //
  // Phase A runs AFTER identity-lite so the language code is already known
  // via context.bcp47_tag.  We extract the primary subtag from that tag and
  // look up langtags defaults to pre-fill:
  //   - language_name_autonym  (autonym / localname)
  //   - language_name_english  (English name)
  //   - region                 (defaultRegion → country name via iso3166Names)
  //
  // FR-008: the seed is only applied on FIRST arrival (SurveyRunner's
  // "seed on first arrival" contract).  A committed/edited value is never
  // overwritten — SurveyRunner restores the saved stack entry on Back,
  // bypassing getSeedValue entirely.
  // ---------------------------------------------------------------------------

  // Seeds map: questionId → seed value.  Populated once per mount from the
  // known language code.  A module-scoped ref is enough; no re-seeding is
  // needed because the language code is fixed for the lifetime of Phase A.
  const seedsRef = useRef<Map<string, string>>(new Map());
  const provenanceRef = useRef<Map<string, LangtagsProvenance>>(new Map());

  useEffect(() => {
    const bcp47Tag = context.bcp47_tag ?? "";
    const code = bcp47Tag !== "" ? primarySubtag(bcp47Tag) : "";
    if (code === "") return;

    void loadLangtags().then((mod) => {
      const defaults = mod.getLanguageDefaults(code);
      if (defaults === null) return;

      const provenance: LangtagsProvenance = {
        source: "langtags",
        caption: "Suggested from langtags — edit if needed",
      };

      const seeds = new Map<string, string>();
      const prov = new Map<string, LangtagsProvenance>();

      if (defaults.autonym !== undefined && defaults.autonym !== "") {
        seeds.set("language_name_autonym", defaults.autonym);
        prov.set("language_name_autonym", provenance);
      }

      if (defaults.englishName !== undefined && defaults.englishName !== "") {
        seeds.set("language_name_english", defaults.englishName);
        prov.set("language_name_english", provenance);
      }

      // Resolve defaultRegion (alpha-2 code) → English country name (FR-006 / T020).
      // regionNameFor() returns undefined for UN M.49 numeric codes and any code
      // not in the static map — in that case we do NOT seed the field (FR-009).
      const regionName = regionNameFor(defaults.defaultRegion);
      if (regionName !== undefined) {
        seeds.set("region", regionName);
        prov.set("region", provenance);
      }

      seedsRef.current = seeds;
      provenanceRef.current = prov;
    }).catch(() => {
      // Degrade silently on import failure — seeds stay empty, all Phase A
      // fields remain free-text (FR-009). No unhandled rejection.
    });
    // Effect deps: only fire once per Phase A mount (the language code is fixed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return a seed value for the given questionId, if any.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => {
      return seedsRef.current.get(questionId);
    },
    [],
  );

  // Return provenance for the given questionId, if any.
  const getSeedProvenance = useCallback(
    (questionId: string): LangtagsProvenance | undefined => {
      return provenanceRef.current.get(questionId);
    },
    [],
  );

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
        getSeedValue={getSeedValue}
        getSeedProvenance={getSeedProvenance}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}
