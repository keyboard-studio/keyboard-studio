// Base-derived prefill confirmation step (spec §5 "Base-derived pre-fill", §8
// "Workflow ordering"). After identity-lite resolves the (language, script)
// target and the author picks a base, this step shows the routing group, A2
// script class, and BCP47 script subtag as CONFIRMATIONS the author accepts or
// goes back to change — never blank asks. A7 (spare keys) and the full BCP47
// tag are resolved later (from the base IR diff / langtags / docs stage), so they
// are shown as deferred rather than guessed here. refs #369.

import type { KeyboardEvent } from "react";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { RemapPosture, StartKeyboard } from "@keyboard-studio/contracts";
import type { IdentityLiteResult } from "./IdentityLite.tsx";
import type { FiredQuestion } from "../adaptation/firing.ts";
import {
  surveyCard,
  surveyPageColumn,
  phaseHeading,
  leadParagraph,
  TEXT_DIM,
  TEXT_MAIN,
} from "./surveyStyles.ts";
import { CSS_TEXT_SUBTLE } from "../ui/theme.ts";
import { handleEnterToAdvance } from "./enterToAdvance.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { resolveContentString } from "../lib/contentI18n.ts";
import { usePublishStepNav } from "../hooks/usePublishStepNav.ts";

/** One labelled confirmation row in the prefill summary. */
export interface PrefillRow {
  label: string;
  value: string;
  /** Provenance hint shown beside the value (where the confirmation came from). */
  note?: string;
}

/** Human labels for the script-alignment confirmation rows (spec 038 US1). */
const SCRIPT_ALIGNMENT_LABELS: Record<string, MessageDescriptor> = {
  q_sa1_target_script_spread: msg({ id: "survey.prefill.scriptAlignment.scriptCommunity", message: "Script community" }),
  q_sa2_base_script_mismatch: msg({ id: "survey.prefill.scriptAlignment.startingScript", message: "Starting script" }),
  q_sa3_latin_flavor: msg({ id: "survey.prefill.scriptAlignment.latinSubProfile", message: "Latin sub-profile" }),
};

const NO_DEFAULT_PLEASE_CHOOSE = msg({
  id: "survey.prefill.scriptAlignment.noDefault",
  message: "(no default — please choose)",
});

/**
 * Build §3c confirmation rows for the script-alignment questions that fired
 * (spec 038 US1). Each row carries the derived value and a provenance chip that
 * NAMES the corpus evidence AND its tier — never a silent default. A fired
 * question with a null prefill (fallback tier disallowed) shows the no-default
 * ask form. Pure (no React) so it is unit-testable; `i18n` is optional so a
 * direct unit-test call (no live i18n instance) still resolves the English
 * source text.
 */
export function buildScriptAlignmentRows(fired: FiredQuestion[], i18n?: I18n): PrefillRow[] {
  return fired.map((q) => {
    const descriptor = SCRIPT_ALIGNMENT_LABELS[q.id];
    const provenanceLabel = resolveContentString(
      "adaptationQuestions",
      q.id,
      "provenanceLabel",
      q.provenanceLabel,
      i18n,
    );
    return {
      label: descriptor !== undefined ? resolveMessage(i18n, descriptor) : q.id,
      value: q.prefilledValue ?? resolveMessage(i18n, NO_DEFAULT_PLEASE_CHOOSE),
      note: `${provenanceLabel} (${q.provenanceTier})`,
    };
  });
}

const LABEL_LANGUAGE = msg({ id: "survey.prefill.row.language.label", message: "Language" });
const LABEL_SCRIPT = msg({ id: "survey.prefill.row.script.label", message: "Script" });
const NOTE_BCP47_SCRIPT_SUBTAG = msg({ id: "survey.prefill.row.script.note", message: "BCP47 script subtag (§5)" });
const LABEL_SCRIPT_CLASS = msg({ id: "survey.prefill.row.scriptClass.label", message: "Script class (A2)" });
const LABEL_ROUTING_GROUP = msg({ id: "survey.prefill.row.routingGroup.label", message: "Routing group (§9)" });
const NOTE_DERIVED_FROM_SCRIPT = msg({ id: "survey.prefill.row.derivedFromScript.note", message: "derived from script" });
const LABEL_STARTING_KEYBOARD = msg({ id: "survey.prefill.row.startingKeyboard.label", message: "Starting keyboard" });
const NOTE_YOUR_CHOSEN_BASE = msg({ id: "survey.prefill.row.startingKeyboard.note", message: "your chosen starting keyboard" });

/**
 * Build the prefill confirmation rows from the identity-lite result and the
 * chosen base. Pure (no React) so it is unit-testable; `i18n` is optional so a
 * direct unit-test call (no live i18n instance) still resolves the English
 * source text. Routing/A2/script follow the chosen TARGET script, never the
 * language's default (spec §8/§9).
 */
export function buildPrefillRows(
  identity: IdentityLiteResult,
  base: StartKeyboard,
  i18n?: I18n,
): PrefillRow[] {
  const { prefill } = identity;
  const scriptDisplay =
    prefill.variant !== undefined ? `${prefill.script} (${prefill.variant})` : prefill.script;
  return [
    { label: resolveMessage(i18n, LABEL_LANGUAGE), value: identity.english || identity.autonym },
    { label: resolveMessage(i18n, LABEL_SCRIPT), value: scriptDisplay, note: resolveMessage(i18n, NOTE_BCP47_SCRIPT_SUBTAG) },
    { label: resolveMessage(i18n, LABEL_SCRIPT_CLASS), value: prefill.scriptClass, note: resolveMessage(i18n, NOTE_DERIVED_FROM_SCRIPT) },
    { label: resolveMessage(i18n, LABEL_ROUTING_GROUP), value: prefill.routingGroup, note: resolveMessage(i18n, NOTE_DERIVED_FROM_SCRIPT) },
    {
      label: resolveMessage(i18n, LABEL_STARTING_KEYBOARD),
      value: `${base.displayName} (${base.id})`,
      note: resolveMessage(i18n, NOTE_YOUR_CHOSEN_BASE),
    },
  ];
}

/**
 * The A7a remap-posture confirmation (spec §7.2 rule 8): present only when
 * the derived producer fired — the target is an alphabetic non-Latin script
 * and the chosen base types Latin letters on its letter keys. The derived
 * "full-remap" is the pre-filled value; the author may change it to
 * "addition" here, and the recorded choice is what the characters step
 * emits as its tier-1 axis. This is the confirmation channel for the
 * derived fill (the A3a station-prefill pattern), not a new elicited
 * question: nothing renders when the derivation did not fire.
 */
export interface RemapPostureConfirmation {
  /** The author's current choice (the derived prefill until changed). */
  value: RemapPosture;
  onChange: (next: RemapPosture) => void;
}

export interface PrefillProps {
  identity: IdentityLiteResult;
  base: StartKeyboard;
  onConfirm: () => void;
  onBack?: () => void;
  remapConfirmation?: RemapPostureConfirmation;
}

const REMAP_OPTIONS: ReadonlyArray<{
  value: RemapPosture;
  label: MessageDescriptor;
  testId: string;
}> = [
  {
    value: "full-remap",
    label: msg({
      id: "survey.prefill.remap.option.fullRemap",
      message: "Reuse the letter keys for my script’s letters",
    }),
    testId: "prefill-remap-full-remap",
  },
  {
    value: "addition",
    label: msg({
      id: "survey.prefill.remap.option.addition",
      message: "Keep the Latin letters and add my script’s letters on other keys",
    }),
    testId: "prefill-remap-addition",
  },
];

export function Prefill({ identity, base, onConfirm, onBack, remapConfirmation }: PrefillProps) {
  const { t, i18n } = useLingui();
  const rows = buildPrefillRows(identity, base, i18n);

  // Back / Confirm render in the footer (spec 081).
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "survey.prefill.backButton", message: "← Back" }),
            onClick: onBack,
            testId: "prefill-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "survey.prefill.confirmButton", message: "Confirm and continue" }),
      onClick: onConfirm,
      testId: "prefill-continue",
    },
  });

  // Enter-to-advance (issue #536): this step is a pure confirmation screen
  // (no free-text field to disambiguate against), so plain Enter anywhere in
  // the panel confirms — matching Next/Finish behavior in SurveyRunner. Uses
  // the shared helper with its default BUTTON skip so Back/Confirm don't
  // double-fire; no multiline / combobox concerns on this screen.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    handleEnterToAdvance(e, { advance: onConfirm });
  }

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions --
       the bubbled keydown only ADDS a keyboard capability (Enter-to-advance,
       see the comment on handleKeyDown); the container is not made
       pointer-interactive and every control inside stays independently
       keyboard-operable. Attached at this outer level (rather than only
       around the card) so Enter still confirms from anywhere in the panel,
       including the nav row below the card — unchanged behavior, epic #533
       moved the nav row outside the card visually only. */
    <div onKeyDown={handleKeyDown} style={surveyPageColumn}>
      <h2 style={phaseHeading}>
        <Trans id="survey.prefill.heading">Confirm the basics</Trans>
      </h2>
      <p style={leadParagraph}>
        <Trans id="survey.prefill.intro">
          Based on your script and chosen keyboard, here is what we will assume.
          Confirm to continue, or go back to change a choice.
        </Trans>
      </p>

      <div style={surveyCard}>
        <dl
          style={{
            margin: "0 0 20px 0",
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "10px 16px",
            alignItems: "baseline",
          }}
        >
          {rows.map((row) => (
            <div key={row.label} style={{ display: "contents" }}>
              <dt style={{ fontSize: 13, color: TEXT_DIM, whiteSpace: "nowrap" }}>{row.label}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: TEXT_MAIN }}>
                <strong>{row.value}</strong>
                {row.note !== undefined && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: CSS_TEXT_SUBTLE }}>{row.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: CSS_TEXT_SUBTLE,
            lineHeight: 1.5,
          }}
        >
          <Trans id="survey.prefill.deferredStartingNote">
            Spare keys (A7), the full BCP47 tag, display name, and copyright are
            confirmed later from your starting keyboard and the documentation step.
          </Trans>
        </p>
      </div>

      {remapConfirmation !== undefined && (
        <div style={{ ...surveyCard, marginTop: 16 }}>
          <h3 style={{ fontSize: 14, color: TEXT_MAIN, margin: "0 0 8px" }}>
            <Trans id="survey.prefill.remap.heading">How your letters will be typed</Trans>
          </h3>
          <p style={{ ...leadParagraph, margin: "0 0 12px" }}>
            <Trans id="survey.prefill.remap.intro">
              Your starting keyboard types Latin letters on the letter keys, and your
              language uses a different script. We suggest reusing those letter keys
              for your script’s letters, in the same positions — the way mnemonic
              keyboards for Armenian or Russian work.
            </Trans>
          </p>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {REMAP_OPTIONS.map((option) => (
              <label
                key={option.value}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  fontSize: 14,
                  color: TEXT_MAIN,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="prefill-remap-posture"
                  data-testid={option.testId}
                  checked={remapConfirmation.value === option.value}
                  onChange={() => remapConfirmation.onChange(option.value)}
                />
                <span>{resolveMessage(i18n, option.label)}</span>
              </label>
            ))}
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 12, color: CSS_TEXT_SUBTLE, lineHeight: 1.5 }}>
            <Trans id="survey.prefill.remap.note">
              Suggested from your starting keyboard and your script. You can change this.
            </Trans>
          </p>
        </div>
      )}
    </div>
  );
}
