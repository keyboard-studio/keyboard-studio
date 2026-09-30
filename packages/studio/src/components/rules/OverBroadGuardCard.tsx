// OverBroadGuardCard — direction B of the guard-suggestion cards
// (spec 082 FR-022).
//
// Rendered as a QUESTION, never an error: the guard may be exactly what the
// author wants (some workflows intentionally block combinations the
// orthography attests). Two actions:
//   - Keep — dismisses the card and records the author's intent for that
//     guard rule, so the question is never asked again;
//   - Narrow this guard — inserts a precise exception rule immediately
//     BEFORE the over-broad guard rule (same group): the exception matches
//     the same key chord — blocked character + the guard's exact
//     vkey/modifiers — and emits the blocked character + the mark, so that
//     one mark/key pair is allowed while the guard still blocks everything
//     else. The shared guard store is never mutated. An Undo button reverses
//     the Narrow (removes the exception rule, lifts the narrowed
//     disposition so the question may surface again).

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { OverBroadGuard } from "./guardAnalysis.ts";
import { narrowOverBroadGuard, undoNarrow } from "./narrowGuard.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { Button } from "../../ui/Button.tsx";
import { rulesActions, rulesBody, rulesCode, rulesInsetCard, rulesNote } from "./rulesStyles.ts";
import { secondaryButton } from "../../survey/surveyStyles.ts";

export function OverBroadGuardCard({ guard }: { guard: OverBroadGuard }) {
  const keepOverBroadGuard = useGuardIntentStore((s) => s.keepOverBroadGuard);
  const [narrowedRuleId, setNarrowedRuleId] = useState<string | null>(null);
  const [narrowStale, setNarrowStale] = useState(false);
  const [undone, setUndone] = useState(false);

  const narrow = () => {
    const outcome = narrowOverBroadGuard(guard);
    if (outcome !== null) {
      setNarrowedRuleId(outcome.ruleId);
      setNarrowStale(false);
      setUndone(false);
    } else {
      // The guard rule is gone or has an unrecognized shape (stale
      // analysis) — say so rather than guessing.
      setNarrowedRuleId(null);
      setNarrowStale(true);
    }
  };

  const undo = () => {
    const undoneRuleId = undoNarrow();
    if (undoneRuleId !== null) {
      setNarrowedRuleId(null);
      setUndone(true);
    }
  };

  return (
    <section
      data-testid={`overbroad-guard-${guard.guardRuleId}`}
      aria-label="Guard question"
      style={rulesInsetCard}
    >
      <p style={rulesBody}>
        <strong>{guard.question}</strong>
      </p>
      <p style={rulesBody}>
        <small>
          <Trans id="rules.guard.overbroad.detail">
            Guard rule <code style={rulesCode}>{guard.guardRuleId}</code> blocks {guard.markChar} (key{" "}
            {guard.markKey}) after “{guard.blockedChar}”.
          </Trans>
        </small>
      </p>
      <div style={rulesActions}>
        <Button
          style={secondaryButton}
          data-testid={`overbroad-guard-keep-${guard.guardRuleId}`}
          onClick={() => keepOverBroadGuard(guard.guardRuleId)}
        >
          <Trans id="rules.guard.overbroad.keep">Keep as is</Trans>
        </Button>
        {narrowedRuleId === null ? (
          <Button
            style={secondaryButton}
            data-testid={`overbroad-guard-narrow-${guard.guardRuleId}`}
            onClick={narrow}
          >
            <Trans id="rules.guard.overbroad.narrow">Narrow this guard</Trans>
          </Button>
        ) : (
          <Button
            style={secondaryButton}
            data-testid={`overbroad-guard-undo-${guard.guardRuleId}`}
            onClick={undo}
          >
            <Trans id="rules.guard.overbroad.undo">Undo narrow</Trans>
          </Button>
        )}
      </div>
      {narrowedRuleId !== null && (
        <p style={rulesNote} data-testid={`overbroad-guard-narrowed-${guard.guardRuleId}`}>
          <small>
            <Trans id="rules.guard.overbroad.narrowedNote">
              Narrowed: {guard.markChar} (key {guard.markKey}) is now allowed after
              “{guard.blockedChar}” — the guard still blocks it after everything
              else. This won&apos;t be asked again.
            </Trans>
          </small>
        </p>
      )}
      {undone && narrowedRuleId === null && (
        <p style={rulesNote} data-testid={`overbroad-guard-undone-${guard.guardRuleId}`}>
          <small>
            <Trans id="rules.guard.overbroad.undoneNote">
              Narrow undone — the exception rule was removed.
            </Trans>
          </small>
        </p>
      )}
      {narrowStale && (
        <p style={rulesNote} data-testid={`overbroad-guard-stale-${guard.guardRuleId}`}>
          <small>
            <Trans id="rules.guard.overbroad.staleNote">
              That guard rule isn&apos;t in the current rules — this suggestion may
              be stale.
            </Trans>
          </small>
        </p>
      )}
    </section>
  );
}
