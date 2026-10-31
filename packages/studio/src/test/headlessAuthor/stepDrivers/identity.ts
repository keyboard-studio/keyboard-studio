// Identity, attribution and project name: the identity prefill (defaultsFor, deriveScriptPrefill); case fields are overrides.
//
// identity: the identity_lite flow, walked as IdentityLite's runner walks it. The
// product's own resolution (survey/identityResolution.ts) turns the typed
// English name into a langtags entry and records its seeds (own-script name,
// ISO 639-3 code, script) as decision records, which the runner then reads as
// each question's pre-filled value. The case's english / autonym / code / script
// are overrides; a value the product pre-fills that the case does not name is
// the top suggestion. The seeds come from the langtags entry through the
// picker's own path (the loaded module's getLanguageDefaults and
// scriptToTargetOption), the functions the component calls; `defaultsFor` is
// not on that path.
//
// attribution, project_name: flows hosted by makeFlowStepComponent, completed
// with the product's options records (completeFlowStep).

import { loadLangtags } from "../../../lib/langtagsDefaults.ts";
import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { deriveSurveyContext } from "../../../decisions/identitySelectors.ts";
import { flowSources, loadFlowSourceDef } from "../../../steps/flowSources.ts";
import { createIdentityResolution } from "../../../survey/identityResolution.ts";
import { languageResultsFor, resolveTypedLanguage } from "../../../survey/resolveTypedLanguage.ts";
import { attributionOptions, projectNameOptions } from "../../../editors/adapters/flowStepOptionRecords.ts";
import { completeFlow, completeFlowStep, type FlowChoices } from "./flowStep.ts";
import type { StepDrivers } from "./types.ts";

/** Typed where the product offers nothing and the case supplies nothing for a required name. */
const PLACEHOLDER_TEXT = "zzq";

export const identityDrivers: StepDrivers = {
  identity: async (ctx) => {
    const flow = loadFlowSourceDef(flowSources["identity_lite"]!);
    const resolution = createIdentityResolution();
    // The name picker cannot offer a row before langtags is loaded.
    const langtags = await loadLangtags();

    const c = ctx.case;
    const overrides: Record<string, string> = {
      il_language_english: c.english,
      il_language_autonym: c.autonym,
      il_language_code: c.code,
      ...(c.script !== undefined ? { il_target_script: c.script } : {}),
    };
    const choices: FlowChoices = {
      overrides,
      typed: (question, text) => {
        // The language-name picker resolves what is typed to one entry (or none).
        if (question.options_source !== "@langtags_names" || typeof text !== "string") return;
        const results = languageResultsFor(langtags, text);
        resolution.onEntryResolved(
          question.id,
          resolveTypedLanguage(text, results, (code) => langtags.getLanguageDefaults(code)?.englishNames),
        );
      },
    };

    return completeFlow(
      flow,
      {
        context: () => deriveSurveyContext(getDecisionSnapshot()),
        getNextOverride: (questionId) => resolution.nextOverride(questionId),
        onAnswerCommit: (questionId, value) => resolution.onAnswerCommit(questionId, value),
      },
      choices,
      ctx,
    );
  },

  attribution: (ctx) =>
    completeFlowStep(
      attributionOptions,
      { placeholders: { il_author_name: () => PLACEHOLDER_TEXT } },
      ctx,
    ),

  project_name: (ctx) => completeFlowStep(projectNameOptions, {}, ctx),
};
