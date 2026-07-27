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
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { IdentityLiteResult } from "./IdentityLite.tsx";
import type { FiredQuestion } from "../adaptation/firing.ts";
import { secondaryButton, primaryButton } from "./surveyStyles.ts";
import { handleEnterToAdvance } from "./enterToAdvance.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { resolveContentString } from "../lib/contentI18n.ts";

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
  q_sa2_base_script_mismatch: msg({ id: "survey.prefill.scriptAlignment.baseScript", message: "Base script" }),
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
const NOTE_YOUR_CHOSEN_BASE = msg({ id: "survey.prefill.row.startingKeyboard.note", message: "your chosen base" });

/**
 * Build the prefill confirmation rows from the identity-lite result and the
 * chosen base. Pure (no React) so it is unit-testable; `i18n` is optional so a
 * direct unit-test call (no live i18n instance) still resolves the English
 * source text. Routing/A2/script follow the chosen TARGET script, never the
 * language's default (spec §8/§9).
 */
export function buildPrefillRows(
  identity: IdentityLiteResult,
  base: BaseKeyboard,
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

export interface PrefillProps {
  identity: IdentityLiteResult;
  base: BaseKeyboard;
  onConfirm: () => void;
  onBack?: () => void;
}

export function Prefill({ identity, base, onConfirm, onBack }: PrefillProps) {
  const { i18n } = useLingui();
  const rows = buildPrefillRows(identity, base, i18n);

  // Enter-to-advance (issue #536): this step is a pure confirmation screen
  // (no free-text field to disambiguate against), so plain Enter anywhere in
  // the panel confirms — matching Next/Finish behavior in SurveyRunner. Uses
  // the shared helper with its default BUTTON skip so Back/Confirm don't
  // double-fire; no multiline / combobox concerns on this screen.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    handleEnterToAdvance(e, { advance: onConfirm });
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        <Trans id="survey.prefill.heading">Confirm the basics</Trans>
      </h2>
      <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#8b949e" }}>
        <Trans id="survey.prefill.intro">
          Based on your script and chosen keyboard, here is what we will assume.
          Confirm to continue, or go back to change a choice.
        </Trans>
      </p>

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
            <dt style={{ fontSize: 13, color: "#8b949e", whiteSpace: "nowrap" }}>{row.label}</dt>
            <dd style={{ margin: 0, fontSize: 14, color: "#e6edf3" }}>
              <strong>{row.value}</strong>
              {row.note !== undefined && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#6e7681" }}>{row.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p
        style={{
          margin: "0 0 20px 0",
          fontSize: 12,
          color: "#6e7681",
          lineHeight: 1.5,
        }}
      >
        <Trans id="survey.prefill.deferredNote">
          Spare keys (A7), the full BCP47 tag, display name, and copyright are
          confirmed later from your base keyboard and the documentation step.
        </Trans>
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            data-testid="prefill-back"
            onClick={onBack}
            className="ks-focus-ring ks-hit-target"
            style={secondaryButton}
          >
            <Trans id="survey.prefill.backButton">← Back</Trans>
          </button>
        )}
        <button
          type="button"
          data-testid="prefill-confirm"
          onClick={onConfirm}
          className="ks-focus-ring ks-hit-target"
          style={primaryButton(false)}
        >
          <Trans id="survey.prefill.confirmButton">Confirm and continue</Trans>
        </button>
      </div>
    </div>
  );
}
