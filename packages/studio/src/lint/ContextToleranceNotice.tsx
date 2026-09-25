// ContextToleranceNotice — the author-facing finding for the context-tolerance
// analysis (spec 078 US1, contracts/studio-tolerance-state.md § Notice).
//
// Two parts, both advisory (no C4 shippability entry, so nothing here can
// block preview, download or submission — FR-002):
//   - the finding: one line counting the rules that only work when the accent
//     is already joined to the letter, expandable to one plain-words case per
//     rule with every character shown as `U+XXXX NAME` (FR-003);
//   - a separate could-not-check notice, so a partly analysed keyboard never
//     reads as clean (FR-004).
// It renders inside StudioShell's existing `role="status"` live region; it
// adds no announcer of its own (FR-014). The case text is built from the
// report's structured fields, never from the English lint message.

import { useEffect, useId, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { RuleToleranceFinding, SimKeyInput } from "@keyboard-studio/contracts";

import type { ContextToleranceState } from "../stores/workingCopyStore.ts";
import { loadContextToleranceEngine } from "../lib/contextToleranceEngine.ts";
import { vkeyLabel } from "../lib/irToCarveNodes.ts";
import { codepointLabel } from "../survey/codepointLabel.ts";
import { TEXT_DIM, TEXT_MAIN } from "../ui/theme.ts";

type CharNames = ReadonlyMap<number, string>;

/** Outcome of applying an accepted fix, reported by the apply effect (US2). */
export interface ContextToleranceApplyNotes {
  /** Accepted rules whose text changed after the decision, so were not fixed. */
  staleRuleIds: string[];
  /** Why the verified write was refused, when it was. */
  refusal?: string;
}

export interface ContextToleranceNoticeProps {
  state: ContextToleranceState;
  applyNotes?: ContextToleranceApplyNotes | null;
  /** Injected in tests; defaults to the engine's lazy Unicode-name table. */
  loadNames?: () => Promise<CharNames>;
}

const defaultLoadNames = async (): Promise<CharNames> => (await loadContextToleranceEngine()).loadCharNames();

/** `U+006F LATIN SMALL LETTER O`, or the bare codepoint when no name is known. */
export function describeChar(ch: string, names: CharNames | null): string {
  const cp = ch.codePointAt(0);
  const name = cp === undefined ? undefined : names?.get(cp);
  const label = codepointLabel(ch).base;
  return name === undefined ? label : `${label} ${name}`;
}

function keyName(key: SimKeyInput): string {
  const base = vkeyLabel(key.vkey) ?? key.vkey;
  const mods = key.modifiers.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
  return [...mods, base].join(" + ");
}

/** A combining mark shown on its own sits on a dotted circle (U+25CC), the usual carrier. */
function glyph(ch: string): string {
  return /^\p{M}$/u.test(ch) ? `◌${ch}` : ch;
}

function CharList({ text, names }: { text: string; names: CharNames | null }) {
  return (
    <ul style={{ margin: "2px 0 0 0", paddingLeft: 18 }}>
      {[...text].map((ch, i) => (
        <li key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
          <span aria-hidden="true">{glyph(ch)}</span> {describeChar(ch, names)}
        </li>
      ))}
    </ul>
  );
}

function GapCase({ finding, names }: { finding: RuleToleranceFinding; names: CharNames | null }) {
  const line = finding.location.line;
  const key = finding.failingKeystrokes?.[0];
  const keyText = key === undefined ? "" : keyName(key);
  const preceding = finding.precedingText;
  return (
    <li style={{ marginBottom: 8 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
        <Trans id="lint.contextTolerance.case.heading">
          Rule on line {line}: pressing the {keyText} key
        </Trans>
      </p>
      {preceding !== undefined && (
        <>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
            <Trans id="lint.contextTolerance.case.typedJoined">After this text, with the accent joined to the letter:</Trans>
          </p>
          <CharList text={preceding} names={names} />
        </>
      )}
      <p style={{ margin: "4px 0 0 0", fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
        <Trans id="lint.contextTolerance.case.joined">the key gives:</Trans>
      </p>
      <CharList text={finding.precomposedOutput ?? ""} names={names} />
      {preceding !== undefined && (
        <>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
            <Trans id="lint.contextTolerance.case.typedSeparate">
              After the same text stored as separate characters:
            </Trans>
          </p>
          <CharList text={preceding.normalize("NFD")} names={names} />
        </>
      )}
      <p style={{ margin: "4px 0 0 0", fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
        <Trans id="lint.contextTolerance.case.separate">the same key gives:</Trans>
      </p>
      <CharList text={finding.decomposedOutput ?? ""} names={names} />
    </li>
  );
}

export function ContextToleranceNotice({ state, applyNotes = null, loadNames = defaultLoadNames }: ContextToleranceNoticeProps) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState<CharNames | null>(null);
  const detailsId = useId();

  // The name table is ~1.4 MB, so it loads only once the author asks for the
  // cases. Until it arrives (or if it fails) characters show by codepoint.
  useEffect(() => {
    if (!expanded || names !== null) return;
    let live = true;
    loadNames().then(
      (loaded) => {
        if (live) setNames(loaded);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [expanded, names, loadNames]);

  if (state.status === "idle" || state.status === "analysing") return null;

  if (state.status === "failed") {
    const reason = state.reason;
    return (
      <div data-testid="context-tolerance-not-checked" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
          <Trans id="lint.contextTolerance.notChecked.failed">
            The check for accents typed as separate characters could not run, so this keyboard has not been
            checked for that problem.
          </Trans>
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
          <Trans id="lint.contextTolerance.notChecked.reason">Reason: {reason}</Trans>
        </p>
      </div>
    );
  }

  const { report, classification } = state;
  const gaps = report.findings.filter((f) => classification[f.ruleId] === "gap");
  const notChecked = report.findings.filter((f) => classification[f.ruleId] === "not-analysed");
  const madeTolerant = report.findings.filter((f) => classification[f.ruleId] === "made-tolerant").length;
  const notCheckedCount = notChecked.length + report.notAnalysedCount;

  const reasons = new Map<string, number>();
  for (const f of notChecked) {
    const reason = f.notAnalysedReason ?? "";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  if (report.notAnalysedCount > 0) {
    const opaque = t({
      id: "lint.contextTolerance.notChecked.opaqueReason",
      message: "the rule uses a construct this tool cannot read",
    });
    reasons.set(opaque, (reasons.get(opaque) ?? 0) + report.notAnalysedCount);
  }

  const gapCount = gaps.length;
  const stale = applyNotes?.staleRuleIds.length ?? 0;
  const refusal = applyNotes?.refusal;

  if (gapCount === 0 && notCheckedCount === 0 && madeTolerant === 0 && stale === 0 && refusal === undefined) {
    return null;
  }

  return (
    <div data-testid="context-tolerance-notice" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {gapCount > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
            <span aria-hidden="true">⚠</span>{" "}
            <Trans id="common.warningLabel">Warning:</Trans>{" "}
            {t({
              id: "lint.contextTolerance.summary",
              message: plural(gapCount, {
                one: "# rule only works when the accent is already joined to the letter.",
                other: "# rules only work when the accent is already joined to the letter.",
              }),
            })}
          </p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
            <Trans id="lint.contextTolerance.gloss">
              Some programs, such as FieldWorks, store a letter and its accent as two separate characters instead
              of one. In text like that, pressing these keys adds a floating accent next to the letter instead of
              on top of it.
            </Trans>
          </p>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((e) => !e)}
            style={{ alignSelf: "flex-start", fontSize: 12, padding: "2px 8px" }}
          >
            {expanded ? (
              <Trans id="lint.contextTolerance.toggle.hide">Hide the affected rules</Trans>
            ) : (
              <Trans id="lint.contextTolerance.toggle.show">Show the affected rules</Trans>
            )}
          </button>
          {expanded && (
            <ul id={detailsId} style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
              {gaps.map((f) => (
                <GapCase key={f.ruleId} finding={f} names={names} />
              ))}
            </ul>
          )}
        </div>
      )}

      {madeTolerant > 0 && (
        <p data-testid="context-tolerance-made-tolerant" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
          {t({
            id: "lint.contextTolerance.madeTolerant",
            message: plural(madeTolerant, {
              one: "# rule now works whether or not the accent is joined to the letter.",
              other: "# rules now work whether or not the accent is joined to the letter.",
            }),
          })}
        </p>
      )}

      {stale > 0 && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
          {t({
            id: "lint.contextTolerance.stale",
            message: plural(stale, {
              one: "# accepted rule was changed after you decided, so it was not fixed. Review the proposal again.",
              other: "# accepted rules were changed after you decided, so they were not fixed. Review the proposal again.",
            }),
          })}
        </p>
      )}

      {refusal !== undefined && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
          <Trans id="lint.contextTolerance.applyRefused">
            The accepted fix was not applied because it could not be verified: {refusal}
          </Trans>
        </p>
      )}

      {notCheckedCount > 0 && (
        <div data-testid="context-tolerance-not-checked" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_MAIN }}>
            {t({
              id: "lint.contextTolerance.notChecked.summary",
              message: plural(notCheckedCount, {
                one: "# rule could not be checked for accents typed as separate characters.",
                other: "# rules could not be checked for accents typed as separate characters.",
              }),
            })}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {[...reasons].map(([reason, count]) => (
              <li key={reason} style={{ fontSize: 12, lineHeight: 1.5, color: TEXT_DIM }}>
                <Trans id="lint.contextTolerance.notChecked.reasonCount">
                  {reason} ({count})
                </Trans>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
