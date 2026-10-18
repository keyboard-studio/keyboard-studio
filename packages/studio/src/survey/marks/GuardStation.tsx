// GuardStation — the marks series' guard question (spec 104 FR-013).
//
// Asked ONCE per keyboard, in the author-language form contracts
// §6 fixes: what happens when a tone mark is tapped with no letter before
// it. The answer is the keyboard's guard specification — it decides
// whether every mark key on the touch layout is minted guarded `T_`
// (swallow) or plain `U_` (emit). The station's only output is the
// chosen behaviour; MarksSeriesStep records it as the GuardSpecification
// decision (the registry entry — Constitution Art. IX).
//
// Presentation follows ContextToleranceStation: a decision already on
// record is shown read-only with a "change" control instead of being
// asked again. On Track 2 the specification is seeded from the imported
// keyboard (guardSpecification.ts) and presented here for confirmation —
// the seed is pre-selected and named as the keyboard's existing
// behaviour, never silently adopted.
//
// GuardQuestionPrompt is the same question in compact form for the one
// place outside the marks step that can need it: the touch editor, when
// a mark is placed on a keyboard whose specification does not exist yet
// (FR-013's tail — the marks step was skipped).

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { GuardSpecification } from "@keyboard-studio/contracts";

import { mutedParaFlush } from "../surveyStyles.ts";
import type { GuardBehaviour } from "./guardSpecification.ts";

export interface GuardStationProps {
  /** The currently selected behaviour (the author's pick, the prior answer, or the seed). */
  value?: GuardBehaviour;
  /** The specification already on record, if any. */
  prior?: GuardSpecification;
  /** The Track 2 seed's behaviour, when the spec was derived from the imported keyboard. */
  seededBehaviour?: GuardBehaviour;
  onChange: (behaviour: GuardBehaviour) => void;
}

function GuardOptions({
  value,
  name,
  onChange,
}: {
  value: GuardBehaviour | undefined;
  name: string;
  onChange: (behaviour: GuardBehaviour) => void;
}) {
  const { t } = useLingui();
  const options: { behaviour: GuardBehaviour; label: string }[] = [
    {
      behaviour: "emit",
      label: t({ id: "marks.guard.option.emit", message: "The mark appears anyway" }),
    },
    {
      behaviour: "swallow",
      label: t({
        id: "marks.guard.option.swallow",
        message: "Nothing happens — there is no letter for it to sit on",
      }),
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((option) => (
        <label
          key={option.behaviour}
          style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, lineHeight: 1.5, cursor: "pointer" }}
        >
          <input
            type="radio"
            name={name}
            data-testid={`guard-option-${option.behaviour}`}
            checked={value === option.behaviour}
            onChange={() => onChange(option.behaviour)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export function GuardStation({ value, prior, seededBehaviour, onChange }: GuardStationProps) {
  const { t } = useLingui();
  const [changing, setChanging] = useState(false);
  const priorConfirmed = prior !== undefined && prior.confirmed;

  if (priorConfirmed && !changing) {
    return (
      <div data-testid="guard-station" data-prior={prior.behaviour} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          <Trans id="marks.guard.station.heading">A mark with no letter before it</Trans>
        </h3>
        <p style={mutedParaFlush}>
          {prior.behaviour === "emit"
            ? t({
                id: "marks.guard.station.prior.emit",
                message: "You chose: a mark tapped with no letter before it appears anyway.",
              })
            : t({
                id: "marks.guard.station.prior.swallow",
                message: "You chose: a mark tapped with no letter before it types nothing.",
              })}
        </p>
        <button type="button" data-testid="guard-change" onClick={() => setChanging(true)} style={{ alignSelf: "flex-start" }}>
          <Trans id="marks.guard.station.change">Change this answer</Trans>
        </button>
      </div>
    );
  }

  return (
    <div data-testid="guard-station" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0 }}>
        <Trans id="marks.guard.station.heading">A mark with no letter before it</Trans>
      </h3>
      <p style={mutedParaFlush}>
        <Trans id="marks.guard.station.question">
          What should happen when someone taps a tone mark at the start of a word, or right after a space, a number, or
          punctuation — the mark appears anyway, or nothing happens because there is no letter for it to sit on?
        </Trans>
      </p>
      {seededBehaviour !== undefined && !(prior?.confirmed ?? false) && (
        <p data-testid="guard-seeded-note" style={mutedParaFlush}>
          <Trans id="marks.guard.station.seededNote">
            Your imported keyboard already behaves this way. Confirm it here, or choose the other behaviour.
          </Trans>
        </p>
      )}
      <GuardOptions value={value} name="marks-guard-behaviour" onChange={onChange} />
    </div>
  );
}

export interface GuardQuestionPromptProps {
  onAnswer: (behaviour: GuardBehaviour) => void;
}

/**
 * The guard question where the touch editor needs it (FR-013's tail): a
 * mark is being placed and no specification exists. Two buttons — the
 * tap IS the answer, recorded by the caller as the keyboard's
 * GuardSpecification before the mark's proposal is computed.
 */
export function GuardQuestionPrompt({ onAnswer }: GuardQuestionPromptProps) {
  const { t } = useLingui();
  return (
    <div data-testid="guard-question-prompt" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        <Trans id="marks.guard.prompt.heading">One question for this whole keyboard</Trans>
      </span>
      <p style={{ ...mutedParaFlush, fontSize: 13 }}>
        <Trans id="marks.guard.station.question">
          What should happen when someone taps a tone mark at the start of a word, or right after a space, a number, or
          punctuation — the mark appears anyway, or nothing happens because there is no letter for it to sit on?
        </Trans>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button type="button" data-testid="guard-prompt-emit" onClick={() => onAnswer("emit")} style={{ alignSelf: "flex-start" }}>
          {t({ id: "marks.guard.option.emit", message: "The mark appears anyway" })}
        </button>
        <button type="button" data-testid="guard-prompt-swallow" onClick={() => onAnswer("swallow")} style={{ alignSelf: "flex-start" }}>
          {t({
            id: "marks.guard.option.swallow",
            message: "Nothing happens — there is no letter for it to sit on",
          })}
        </button>
      </div>
    </div>
  );
}
