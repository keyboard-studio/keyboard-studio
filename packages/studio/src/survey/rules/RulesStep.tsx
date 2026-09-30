// RulesStep — the "Rules" survey step (spec 082, Track A).
//
// Sits on the spine between `carve` and `mechanisms`: after the author has
// shaped which keys exist, this step shows what the working copy's RULES do
// with them — a universal before/after demo ("type here, watch what happens"),
// the rule list, and the rule builder.
//
// Three regions compose here; two are sibling-owned mount points that render
// honest placeholders until workstreams 3 (rule list) and 4 (rule builder)
// register their components:
//   - DemoPane (this workstream, Track A) — per-keystroke simulation against
//     the already-compiled artifact; reads rulesDemoArtifactStore, never
//     compiles.
//   - RuleListMount — workstream 3's KmRuleView + classifier, or an IR-text
//     placeholder.
//   - GuardSuggestions (this workstream, FR-020/FR-022) — intent-gated
//     guard-suggestion cards (missing guards + over-broad guards), rendered
//     only after the author signals intent; never on step entry.
//   - RuleBuilderMount — workstream 4's builder panel, or a placeholder.
//
// The step itself persists nothing (the demo is a read-only view of the
// compiled working copy; the sibling builder owns its own answers), so
// Continue reports `undefined` — the galleries' convention for a step whose
// result lives in the working copy rather than the answer store. Manifest
// persistence is declared `working-copy`.
//
// Excluded scripts (Hans/Hant/Hani/Bopo/Hang/Ethi) render the shared
// UnsupportedScriptStub instead of the step body — same routing as the other
// working-copy steps.

import { useRef, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isExcludedScript } from "../../lib/excludedScriptFamilies.ts";
import { UnsupportedScriptStub } from "../../components/UnsupportedScriptStub.tsx";
import { DemoPane } from "../../components/rules/DemoPane.tsx";
import { RuleListMount } from "../../components/rules/RuleListMount.tsx";
import { GuardSuggestions } from "../../components/rules/GuardSuggestions.tsx";
import { RuleBuilderMount } from "../../components/rules/RuleBuilderMount.tsx";
import { FullStepPage } from "../../components/FullStepPage.tsx";
import { rulesSection, rulesSectionHeading } from "../../components/rules/rulesStyles.ts";
import { phaseHeading, leadParagraph } from "../surveyStyles.ts";

const RulesStep: ComponentType<EditorStepProps> = ({ onComplete, onBack }: EditorStepProps) => {
  const { t } = useLingui();
  const script = useWorkingCopyStore((s) => s.baseKeyboard?.script);

  // Galleries' convention: the step's result lives in the working copy, so
  // completion carries no answer payload. Guarded against double-clicks.
  const completedRef = useRef(false);
  const complete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(undefined);
  };

  // Unconditional — before any early return (step-nav contract §2).
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "survey.rules.backButton", message: "Back" }),
            onClick: onBack,
            testId: "rules-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "survey.rules.continueButton", message: "Continue" }),
      onClick: complete,
      testId: "rules-continue",
    },
  });

  if (script !== undefined && isExcludedScript(script)) {
    return (
      <FullStepPage>
        <UnsupportedScriptStub script={script} />
      </FullStepPage>
    );
  }

  // `layout: "full"` — StepHost clips overflow, so FullStepPage is the
  // step's own scroll container.
  return (
    <FullStepPage testId="rules-step">
      <h2 style={phaseHeading}>
        <Trans id="survey.rules.heading">Rules</Trans>
      </h2>
      <p style={leadParagraph}>
        <Trans id="survey.rules.lede">
          Your keyboard&apos;s rules decide what each keypress produces — which character it
          types, which combinations change it, and which keys stay silent. Try them below,
          review the rule list, and add rules of your own.
        </Trans>
      </p>
      <DemoPane />
      <section style={rulesSection} aria-labelledby="rules-list-heading">
        <h3 id="rules-list-heading" style={rulesSectionHeading}>
          <Trans id="survey.rules.listHeading">Rules in this keyboard</Trans>
        </h3>
        <RuleListMount />
        <GuardSuggestions />
      </section>
      <RuleBuilderMount />
    </FullStepPage>
  );
};

export default RulesStep;
