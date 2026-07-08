// Identity-lite survey step — the head of the hybrid flow (spec §8 "Workflow
// ordering"). Loads content/flows/identity_lite.yaml, runs it through
// SurveyRunner, and on completion extracts the language autonym, English name,
// and the INDEPENDENT target script, deriving the routing/A2 prefill
// confirmations (spec §5, §9). Language and script are decoupled. refs #369.

import { useMemo, useRef, useCallback, useEffect } from "react";
import type { SurveyPhaseResult, LintFinding, LangtagsProvenance } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowOption } from "./types.ts";
import {
  deriveScriptPrefill,
  normalizeTargetScript,
  type ScriptPrefill,
} from "../lib/scriptAxes.ts";
import {
  loadLangtags,
  scriptToTargetOption,
} from "../lib/langtagsDefaults.ts";

import identityLiteRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

// Scripts gated out of v1 (spec §9). When the target is one of these the flow
// ends on the "not supported" notice and the slice should not proceed.
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

/** Typed result of the identity-lite step. */
export interface IdentityLiteResult {
  /** Language name in its own script (autonym). */
  autonym: string;
  /** Language name in English. */
  english: string;
  /**
   * ISO 639 language subtag entered by the author (e.g. "ha", "hi", "fr").
   * Empty string when the author left the field blank.
   * Region and variant refinement are deferred to the documentation stage (§8).
   */
  languageSubtag: string;
  /** Raw `il_target_script` answer (e.g. "Latn", "romanization-Latn", "fonipa"). */
  targetScriptRaw: string;
  /**
   * Full BCP47 target tag combining language subtag + normalized script/variant,
   * e.g. "ha-Latn", "hi-Deva", "fr-Latn", "und-fonipa".
   * Empty string when `languageSubtag` was left blank — `suggestBases()` falls
   * back to script-match ranking in that case.
   */
  bcp47: string;
  /** Whether the chosen target script is supported in v1. */
  supported: boolean;
  /** Routing/A2 prefill confirmations derived from the target script (spec §5). */
  prefill: ScriptPrefill;
}

/**
 * Build the full BCP47 target tag from an ISO 639 language subtag and a raw
 * `il_target_script` value.
 *
 * Rules (language + script → BCP47):
 * - `lang` + plain script subtag (Latn/Deva/…) → `${lang}-${script}`
 *   e.g. "ha" + "Latn" → "ha-Latn", "hi" + "Deva" → "hi-Deva"
 * - `lang` + "romanization-Latn" → `${lang}-Latn`
 *   (Latn script implied; the fact it is a romanization is a strategy detail)
 * - `lang` + "fonipa" → `${lang}-fonipa`
 *   (Latin is implied by the variant; BCP47 omits the script subtag for fonipa)
 * - empty `lang` → "" (no BCP47; caller degrades to script-match ranking)
 *
 * @param languageSubtag  ISO 639 subtag from `il_language_code`, may be "".
 * @param targetScriptRaw Raw `il_target_script` value from the survey.
 */
export function buildTargetBcp47(
  languageSubtag: string,
  targetScriptRaw: string,
): string {
  const lang = languageSubtag.trim();
  if (lang === "") return "";
  if (targetScriptRaw === "fonipa") return `${lang}-fonipa`;
  if (targetScriptRaw === "romanization-Latn") return `${lang}-Latn`;
  const { script } = normalizeTargetScript(targetScriptRaw);
  // "other" and empty string are not valid ISO-15924 subtags; return the bare
  // language tag (valid BCP47) rather than the malformed "lang-other".
  if (script === "" || script === "other") return lang;
  return `${lang}-${script}`;
}

function answerString(result: SurveyPhaseResult, questionId: string): string {
  const answer = result.answers.find((a) => a.questionId === questionId);
  if (answer === undefined) return "";
  if (answer.answerType === "text" || answer.answerType === "select") {
    return String(answer.value);
  }
  return "";
}

/** Derive the typed identity-lite result from a completed flow. */
export function extractIdentityLite(result: SurveyPhaseResult): IdentityLiteResult {
  const targetScriptRaw = answerString(result, "il_target_script");
  const languageSubtag = answerString(result, "il_language_code");
  return {
    autonym: answerString(result, "il_language_autonym"),
    english: answerString(result, "il_language_english"),
    languageSubtag,
    targetScriptRaw,
    bcp47: buildTargetBcp47(languageSubtag, targetScriptRaw),
    supported: !UNSUPPORTED_SCRIPTS.has(targetScriptRaw),
    prefill: deriveScriptPrefill(targetScriptRaw),
  };
}

export interface IdentityLiteProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult, identity: IdentityLiteResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
}

export function IdentityLite({
  context = {},
  onComplete,
  onBack,
  findingsByQuestionId,
}: IdentityLiteProps) {
  const flow = useMemo(() => loadModularFlow(identityLiteRaw as string), []);

  // Track the latest committed language code (from il_language_code — now the
  // FIRST question), used to look up langtags defaults for the downstream seeds.
  const languageCodeRef = useRef<string>("");

  // Autonym seed from the resolved langtags entry (spec 030). Seeds
  // il_language_autonym. Read synchronously by getSeedValue in the same tick as
  // onAnswerCommit. SurveyRunner enforces "seed on first arrival, never overwrite
  // a user value", so Back-and-change re-seeds correctly. Frequently undefined —
  // only ~40% of languages carry a local name (T008).
  const autonymSeedRef = useRef<string | undefined>(undefined);

  // Local-name options from the resolved entry (spec 030 US2): the datalist
  // choices for il_language_autonym, supplied via getSeedOptions. Frequently
  // undefined/empty (~60% of languages have no local name — T008), in which case
  // the autocomplete field behaves as plain free text.
  const localNamesSeedRef = useRef<readonly string[] | undefined>(undefined);

  // Track the proposed script seed from langtags (derived from the language
  // code), and whether it has been seeded already. The seeded flag prevents
  // re-seeding if the user goes Back and changes a prior answer.
  //
  // "Default once, then user owns it" — SurveyRunner already enforces this for
  // the seed on first arrival; we use the ref so our seed function always
  // returns the langtags-derived value when arriving forward at il_target_script.
  // If the user edits the script and goes Back, Back discards the edit and the
  // seed fires again on re-arrival — which is correct behavior (spec §8).
  const scriptSeedRef = useRef<string | undefined>(undefined);

  // English-name seed from the resolved langtags entry (spec 030): seeds the
  // il_language_english confirmation. Only seeds when blank; never overwrites a
  // user value — enforced by SurveyRunner's "seed on first arrival" contract.
  const englishNameSeedRef = useRef<string | undefined>(undefined);

  // Provenance map: questionId → LangtagsProvenance, for seeded fields.
  // Stored in a ref so getSeedProvenance reads it without re-renders.
  const provenanceRef = useRef<Map<string, LangtagsProvenance>>(new Map());

  // Kick off the one-time lazy load on mount so the langtags module is ready
  // by the time the user reaches il_language_code. Does NOT block rendering.
  useEffect(() => {
    void loadLangtags().catch(() => {
      // Degrade silently on import failure — no seed, fields stay free-text (FR-009).
    });
  }, []);

  const handleAnswerCommit = useCallback(
    (questionId: string, value: string | string[] | undefined) => {
      if (questionId === "il_language_code") {
        const code = typeof value === "string" ? value.trim() : "";
        languageCodeRef.current = code;
        // Reset prior seeds so re-selecting the language re-derives them.
        scriptSeedRef.current = undefined;
        englishNameSeedRef.current = undefined;
        autonymSeedRef.current = undefined;
        localNamesSeedRef.current = undefined;
        provenanceRef.current = new Map();

        if (code !== "") {
          // Resolve langtags defaults asynchronously. The module is already
          // loaded from the mount effect; by the time the user reaches the
          // downstream confirmations (english/autonym/script) it has resolved.
          void loadLangtags().then((mod) => {
            const defaults = mod.getLanguageDefaults(code);
            if (defaults !== null) {
              const scriptOption = scriptToTargetOption(defaults.defaultScript);
              // Only seed when there is a dedicated option for this script.
              // null means no mapping — seeding "other" would be misleading.
              scriptSeedRef.current = scriptOption ?? undefined;

              // Seed the English-name and autonym confirmations from the resolved
              // entry. autonym is frequently absent (~60% of languages) — then the
              // seed stays undefined and the author types it (FR-003/FR-005).
              if (defaults.englishName !== undefined && defaults.englishName !== "") {
                englishNameSeedRef.current = defaults.englishName;
              }
              if (defaults.autonym !== undefined && defaults.autonym !== "") {
                autonymSeedRef.current = defaults.autonym;
              }
              // Local-name choices for the autonym picker (US2). Absent for most
              // languages — then the field stays free text.
              if (defaults.localNames !== undefined && defaults.localNames.length > 0) {
                localNamesSeedRef.current = defaults.localNames;
              }

              // Record provenance only for fields we actually seeded.
              const provenance: LangtagsProvenance = {
                source: "langtags",
                caption: "Suggested from langtags — edit if needed",
              };
              provenanceRef.current = new Map([
                ...(scriptSeedRef.current !== undefined
                  ? [["il_target_script", provenance] as [string, LangtagsProvenance]]
                  : []),
                ...(englishNameSeedRef.current !== undefined
                  ? [["il_language_english", provenance] as [string, LangtagsProvenance]]
                  : []),
                ...(autonymSeedRef.current !== undefined
                  ? [["il_language_autonym", provenance] as [string, LangtagsProvenance]]
                  : []),
              ]);
            }
          }).catch(() => {
            // Degrade silently on import failure — seeds stay undefined, fields
            // remain free-text (FR-009). No unhandled rejection.
          });
        }
      }
    },
    [],
  );

  // Pre-fill the english / autonym / script confirmations from the langtags
  // entry resolved by il_language_code (spec 030).
  //
  // "Default once, then user owns it" contract is upheld by SurveyRunner:
  // the seed only fires on forward push; Back discards unsaved edits (stack pop),
  // so re-arriving re-seeds from the current ref values — correct behavior.
  //
  // FR-008: the seed value is only returned when the ref is non-empty. Since
  // SurveyRunner only calls getSeedValue when pushing a *new* stack entry
  // (never when restoring a saved entry via Back), a previously user-edited
  // value that was saved on the stack is restored directly and getSeedValue is
  // NOT called for that entry — preserving author override.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => {
      if (questionId === "il_language_english") {
        // English-name confirmation, seeded from the langtags entry resolved by
        // il_language_code (spec 030). Undefined when the language was blank /
        // unmatched — the author types it.
        return englishNameSeedRef.current;
      }
      if (questionId === "il_language_autonym") {
        // Own-script name, seeded from the resolved entry's autonym; frequently
        // undefined (~60% of languages have no local name) — then free text.
        return autonymSeedRef.current;
      }
      if (questionId === "il_target_script") {
        return scriptSeedRef.current;
      }
      return undefined;
    },
    [],
  );

  // Return a LangtagsProvenance for a question if it has a langtags-derived
  // seed, or undefined when no provenance applies.
  const getSeedProvenance = useCallback(
    (questionId: string): LangtagsProvenance | undefined => {
      return provenanceRef.current.get(questionId);
    },
    [],
  );

  // Dynamic datalist options (spec 030 US2): the resolved entry's local names
  // are offered as choices for il_language_autonym. Undefined when the language
  // has no recorded local name — the field is then plain free text.
  const getSeedOptions = useCallback(
    (questionId: string): FlowOption[] | undefined => {
      if (questionId === "il_language_autonym") {
        const names = localNamesSeedRef.current;
        if (names !== undefined && names.length > 0) {
          return names.map((n) => ({ value: n, label: n }));
        }
      }
      return undefined;
    },
    [],
  );

  function handleComplete(result: SurveyPhaseResult) {
    onComplete(result, extractIdentityLite(result));
  }

  return (
    <div
      data-testid="identity-panel"
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
        Let's identify your language
      </h2>
      <SurveyRunner
        key={flow.flow_id}
        flow={flow}
        context={context}
        onComplete={handleComplete}
        onAnswerCommit={handleAnswerCommit}
        getSeedValue={getSeedValue}
        getSeedProvenance={getSeedProvenance}
        getSeedOptions={getSeedOptions}
        {...(onBack !== undefined ? { onBack } : {})}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}
