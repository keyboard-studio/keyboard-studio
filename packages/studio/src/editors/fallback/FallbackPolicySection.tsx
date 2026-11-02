// FallbackPolicySection — fallback to the base keyboard (spec 109, building on
// spec 076's keyboard-wide policy).
//
// A key-and-modifier position the keyboard does not handle falls through to the
// computer's own layout (the typists' base keyboard). This section lists, for
// each picked base keyboard, every such position and what that base keyboard
// types there, grouped by character class, and lets the author decide each
// class separately: "Do nothing" or "Use the computer's layout". The defaults
// are proposals with their evidence; nothing applies until the author confirms
// (FR-020, FR-021).
//
// Everything is derived on render from the working copy and the base-keyboard
// picks (FR-007): no effect-driven recompute, no timer.
//
// Copy rules (A2, binding): each option states its OWN risk; neither is framed
// as better. Host output is a best guess from reference layouts, never sight of
// the typists' machines ("unknown" where the data has no cell). Deadkey
// suppression is stated as a rule, not offered as a choice.

import { useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { resolveEffectiveScript } from "@keyboard-studio/contracts";
import type { Disposition, KeyboardIR, LeakClass } from "@keyboard-studio/contracts";
import {
  anyClassSwallows,
  deriveCarvedIr,
  enumerateUnhandledPositions,
  proposeFallbackPolicy,
  type Leak,
  type Proposal,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { humanizeChord } from "../../lib/carvedCombo.ts";
import { baseKeyboardsForFallback, buildFallbackLeaks, usePickedLayoutIdsKey } from "../../lib/fallbackLeaks.ts";
import { getLoadedLangtags, onLangtagsLoaded } from "../../lib/langtagsDefaults.ts";
import { BASE_LAYOUTS, type ReferenceHostId } from "../../lib/referenceBaseLayouts.ts";
import { windowsLayoutById } from "../../lib/windowsLayouts.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";

const CLASSES: readonly LeakClass[] = ["letters", "digits", "punctuation"];
const EMPTY_SET: ReadonlySet<string> = new Set();

/** A picked catalog layout's name, or a reference host's label (no-pick guess). */
function baseLabel(id: string): string {
  return windowsLayoutById(id)?.name ?? BASE_LAYOUTS[id as ReferenceHostId]?.label ?? id;
}

function modifierTokens(modifiers: string): string[] {
  return modifiers.split(/\s+/).filter((t) => t.length > 0);
}

function useLangtagsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onLangtagsLoaded(() => setVersion((v) => v + 1)), []);
  return version;
}

/** The keyboard's script, or "" when it cannot be resolved (the proposer then treats letters as same-script). */
function scriptOf(bcp47: string | undefined): string {
  return (
    resolveEffectiveScript(bcp47, (subtag) => getLoadedLangtags()?.getLanguageDefaults(subtag) ?? null) ?? ""
  );
}

export interface FallbackPolicySectionProps {
  /** Start with the disclosure open. Default closed (the section sits under the gallery). */
  defaultOpen?: boolean;
}

interface BaseList {
  id: string;
  label: string;
  letters: Leak[];
  digits: Leak[];
  punctuation: Leak[];
  deadkey: Leak[];
  unknown: Leak[];
}

function groupLeaks(id: string, leaks: readonly Leak[]): BaseList {
  const list: BaseList = { id, label: baseLabel(id), letters: [], digits: [], punctuation: [], deadkey: [], unknown: [] };
  for (const leak of leaks) {
    if (leak.baseKeyboard !== id) continue;
    const o = leak.outcome;
    if (o.kind === "char") list[o.leakClass].push(leak);
    else if (o.kind === "deadkey") list.deadkey.push(leak);
    else list.unknown.push(leak);
  }
  return list;
}

export function FallbackPolicySection({ defaultOpen = false }: FallbackPolicySectionProps) {
  const { t } = useLingui();
  const policy = useWorkingCopyStore((s) => s.fallbackPolicy);
  const confirmed = useWorkingCopyStore((s) => s.fallbackPolicyConfirmed);
  const setFallbackPolicy = useWorkingCopyStore((s) => s.setFallbackPolicy);
  const setFallbackPolicyConfirmed = useWorkingCopyStore((s) => s.setFallbackPolicyConfirmed);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const pickedKey = usePickedLayoutIdsKey();
  const langtagsVersion = useLangtagsVersion();

  // A carved key IS an unhandled key afterwards, so the list derives from the
  // starting point with the carve overlay applied (no suppression rules yet).
  const carvedIr: KeyboardIR | null = useMemo(
    () => (startIr === null ? null : deriveCarvedIr(startIr, { deletedNodeIds, deletedItemIds }).ir),
    [startIr, deletedNodeIds, deletedItemIds],
  );

  const pickedIds = useMemo(() => (pickedKey === "" ? [] : pickedKey.split("\u0000")), [pickedKey]);
  const bases = useMemo(
    () => baseKeyboardsForFallback(pickedIds, carvedIr?.header.bcp47 ?? []),
    [pickedIds, carvedIr],
  );

  const { leaks, uncovered } = useMemo(() => {
    if (carvedIr === null) return { leaks: [] as Leak[], uncovered: EMPTY_SET };
    const unhandled = enumerateUnhandledPositions(carvedIr);
    const idOf = (key: string, modifiers: string) => `${modifiers}|${key}`;
    const unhandledIds = new Set(unhandled.map((p) => idOf(p.key, p.modifiers)));
    const notCovered = new Set(unhandled.filter((p) => !p.layerBound).map((p) => idOf(p.key, p.modifiers)));
    return {
      leaks: buildFallbackLeaks(carvedIr, bases).filter((l) => unhandledIds.has(idOf(l.position.key, l.position.modifiers))),
      uncovered: notCovered,
    };
  }, [carvedIr, bases]);

  const proposals: Record<LeakClass, Proposal> | null = useMemo(() => {
    if (carvedIr === null) return null;
    // The script lookup reads the lazily loaded langtags module; recompute when it lands.
    void langtagsVersion;
    const baseKeyboardScripts: Record<string, string> = {};
    for (const id of bases) {
      const tag = windowsLayoutById(id)?.languages[0]?.id;
      if (tag !== undefined) baseKeyboardScripts[id] = scriptOf(tag);
    }
    const list = proposeFallbackPolicy({
      ir: carvedIr,
      targetScript: scriptOf(bcp47 ?? carvedIr.header.bcp47[0]),
      leaks,
      baseKeyboardScripts,
    });
    return Object.fromEntries(list.map((p) => [p.class, p])) as Record<LeakClass, Proposal>;
  }, [carvedIr, bases, leaks, bcp47, langtagsVersion]);

  // The store value is a default until the author confirms; the surface shows
  // the proposal in its place (FR-021: nothing applies before confirmation).
  const shown: Record<LeakClass, Disposition> = {
    letters: confirmed ? policy.letters : (proposals?.letters.disposition ?? policy.letters),
    digits: confirmed ? policy.digits : (proposals?.digits.disposition ?? policy.digits),
    punctuation: confirmed ? policy.punctuation : (proposals?.punctuation.disposition ?? policy.punctuation),
  };

  // FR-005: the copy follows what the compiled keyboard does. Same predicate
  // the projection gates swallowUndefined on.
  const swallowActive = confirmed && anyClassSwallows(policy);

  const choose = (cls: LeakClass, next: Disposition) => () => {
    setFallbackPolicy({ ...shown, [cls]: next });
    setFallbackPolicyConfirmed(true);
  };
  const confirmProposals = () => {
    setFallbackPolicy({ ...shown });
    setFallbackPolicyConfirmed(true);
  };

  const lists = useMemo(() => bases.map((id) => groupLeaks(id, leaks)), [bases, leaks]);
  const primary = lists[0];

  const doNothingLabel = t({ id: "fallback.option.swallow.label", message: "Do nothing" });
  const passThroughLabel = t({ id: "fallback.option.passThrough.label", message: "Use the computer's layout" });
  const classLabels: Record<LeakClass, string> = {
    letters: t({ id: "fallback.class.letters", message: "Letters" }),
    digits: t({ id: "fallback.class.digits", message: "Digits" }),
    punctuation: t({ id: "fallback.class.punctuation", message: "Punctuation and symbols" }),
  };
  const choiceLabel = (d: Disposition) => (d === "swallow" ? doNothingLabel : passThroughLabel);
  const unknownText = t({ id: "fallback.hosts.unknown", message: "unknown" });
  const deadkeyText = t({ id: "fallback.hosts.deadkey", message: "starts a deadkey" });
  const notCoveredText = t({ id: "fallback.list.notCovered", message: "not covered" });

  const legendFor = (className: string) =>
    t({ id: "fallback.class.legend", message: `When a key isn't in your keyboard: ${className}` });
  const countOnPrimary = (cls: LeakClass): number => primary?.[cls].length ?? 0;
  const primaryName = primary?.label ?? "";
  const baseNames = bases.map(baseLabel).join(", ");

  const renderEntry = (leak: Leak) => {
    const { key, modifiers } = leak.position;
    const chord = humanizeChord(key, modifierTokens(modifiers));
    const o = leak.outcome;
    const isUncovered = uncovered.has(`${modifiers}|${key}`);
    return (
      <li key={`${modifiers}|${key}`} data-testid={`fallback-leak-${leak.baseKeyboard}-${modifiers.replace(/\s+/g, "+")}-${key}`}>
        <span>{chord}</span>
        {" → "}
        {o.kind === "char" ? (
          <span role="img" aria-label={codepointLabel(o.char).title} style={{ fontFamily: "var(--app-font-mono)" }}>
            {o.char}
          </span>
        ) : o.kind === "deadkey" ? (
          <span>{deadkeyText}</span>
        ) : (
          <span style={{ fontStyle: "italic" }}>{unknownText}</span>
        )}
        {isUncovered ? (
          <span style={{ color: "var(--app-text-subtle)" }}>{` (${notCoveredText})`}</span>
        ) : null}
      </li>
    );
  };

  const renderGroup = (testId: string, heading: string, entries: readonly Leak[]) =>
    entries.length === 0 ? null : (
      <div key={testId} data-testid={testId} style={{ marginTop: 6 }}>
        <h5 style={{ margin: "0 0 2px", font: "600 12px var(--app-font)", color: "var(--app-text-muted)" }}>
          {heading}
        </h5>
        <ul style={{ margin: 0, paddingLeft: 18, columns: 3, fontSize: 12.5, lineHeight: 1.5 }}>
          {entries.map(renderEntry)}
        </ul>
      </div>
    );

  const renderList = (list: BaseList) => (
    <div data-testid={`fallback-list-${list.id}`}>
      {leaks.length === 0 ? null : (
        <>
          {CLASSES.map((cls) => renderGroup(`fallback-group-${list.id}-${cls}`, classLabels[cls], list[cls]))}
          {renderGroup(
            `fallback-group-${list.id}-deadkey`,
            t({ id: "fallback.list.group.deadkey", message: "Starts a deadkey" }),
            list.deadkey,
          )}
          {renderGroup(
            `fallback-group-${list.id}-unknown`,
            t({ id: "fallback.list.group.unknown", message: "Unknown" }),
            list.unknown,
          )}
        </>
      )}
    </div>
  );

  const evidenceText = (cls: LeakClass): string => {
    const p = proposals?.[cls];
    if (p === undefined) return "";
    const ev = p.evidence;
    if (ev === null) {
      return t({ id: "fallback.proposal.noEvidence", message: "Nothing leaks in this class on the listed base keyboards." });
    }
    const name = baseLabel(ev.baseKeyboard);
    const count = ev.count;
    const evChar = ev.char;
    return evChar === ""
      ? t({
          id: "fallback.proposal.evidenceNoChars",
          message: plural(count, {
            one: `${name} has no character data and its language uses another script (# position).`,
            other: `${name} has no character data and its language uses another script (# positions).`,
          }),
        })
      : t({
          id: "fallback.proposal.evidence",
          message: plural(count, {
            one: `Based on ${evChar} on ${name} (# position in this class).`,
            other: `Based on ${evChar} on ${name} (# positions in this class).`,
          }),
        });
  };

  return (
    <details
      data-testid="fallback-policy-section"
      {...(defaultOpen ? { open: true } : {})}
      style={{
        borderTop: "1px solid var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        fontFamily: "var(--app-font)",
        padding: "8px 22px",
      }}
    >
      <summary className="ks-focus-ring" style={{ cursor: "pointer", font: "600 13px var(--app-font)" }}>
        <span data-testid="fallback-policy-title">
          <Trans id="fallback.section.title">Fallback to the base keyboard: {baseNames}</Trans>
        </span>
        <span
          data-testid="fallback-policy-current"
          style={{ display: "block", fontWeight: 400, color: "var(--app-text-muted)", marginTop: 2 }}
        >
          {CLASSES.map((cls, i) => (
            <span key={cls} data-testid={`fallback-summary-${cls}`}>
              {i > 0 ? "; " : ""}
              {classLabels[cls]}
              {": "}
              {t({
                id: "fallback.summary.count",
                message: plural(countOnPrimary(cls), {
                  one: `# position types something on ${primaryName}`,
                  other: `# positions type something on ${primaryName}`,
                }),
              })}
              {" ("}
              {confirmed ? "" : `${t({ id: "fallback.summary.proposed", message: "proposed" })}: `}
              {choiceLabel(shown[cls])}
              {")"}
            </span>
          ))}
        </span>
      </summary>

      <p data-testid="fallback-policy-intro" style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)", maxWidth: 640 }}>
        <Trans id="fallback.section.intro">
          When your keyboard does not handle a key, the typist's computer decides what it types, using its own base keyboard. Here is what each base keyboard types on the keys yours leaves unhandled.
        </Trans>
      </p>

      {pickedIds.length === 0 ? (
        <p data-testid="fallback-host-caption" style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--app-text-subtle)", fontStyle: "italic", lineHeight: 1.5 }}>
          <Trans id="fallback.hosts.caption">
            Shown layouts are the studio's best guess at your typists' machines, not sight of them.
          </Trans>
        </p>
      ) : null}

      <div data-testid="fallback-leak-lists" style={{ marginTop: 10 }}>
        {lists.map((list, i) =>
          i === 0 ? (
            <section key={list.id} aria-label={list.label} style={{ marginBottom: 8 }}>
              <h4 style={{ margin: "0 0 2px", font: "600 13px var(--app-font)" }}>{list.label}</h4>
              {renderList(list)}
            </section>
          ) : (
            <details key={list.id} data-testid={`fallback-extra-${list.id}`} style={{ marginBottom: 8 }}>
              <summary className="ks-focus-ring" style={{ cursor: "pointer", font: "600 13px var(--app-font)" }}>
                {list.label}
              </summary>
              {renderList(list)}
            </details>
          ),
        )}
        {leaks.length === 0 ? (
          <p data-testid="fallback-no-leaks" style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>
            <Trans id="fallback.list.none">Your keyboard handles every printable key, so nothing falls through.</Trans>
          </p>
        ) : null}
      </div>

      <p
        data-testid="fallback-policy-status"
        style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--app-text-muted)" }}
      >
        {confirmed ? (
          <Trans id="fallback.status.confirmed">You confirmed these choices.</Trans>
        ) : (
          <Trans id="fallback.status.proposed">
            These choices are proposals from your keyboard and the lists above. They apply once you confirm them.
          </Trans>
        )}
      </p>

      {CLASSES.map((cls) => (
        <fieldset
          key={cls}
          data-testid={`fallback-class-${cls}`}
          style={{ border: "none", margin: "10px 0 0", padding: 0 }}
        >
          <legend style={{ font: "600 13px var(--app-font)", padding: 0, marginBottom: 4 }}>
            {legendFor(classLabels[cls])}
          </legend>
          <p data-testid={`fallback-evidence-${cls}`} style={{ margin: "0 0 6px", fontSize: 12, color: "var(--app-text-muted)" }}>
            {evidenceText(cls)}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["swallow", "pass-through"] as const).map((d) => (
              <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <input
                  type="radio"
                  id={`fallback-policy-${cls}-${d}`}
                  className="ks-focus-ring"
                  name={`fallback-policy-${cls}`}
                  value={d}
                  checked={shown[cls] === d}
                  onChange={choose(cls, d)}
                  aria-describedby={`fallback-policy-${cls}-${d}-desc`}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <label htmlFor={`fallback-policy-${cls}-${d}`} style={{ font: "600 13px var(--app-font)", cursor: "pointer" }}>
                    {choiceLabel(d)}
                  </label>
                  <div
                    id={`fallback-policy-${cls}-${d}-desc`}
                    data-testid={`fallback-desc-${cls}-${d}`}
                    style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)", maxWidth: 640 }}
                  >
                    {d === "pass-through" ? (
                      <Trans id="fallback.option.passThrough.description">
                        Keys not in your keyboard fall through to the computer's own layout. The key types something — but what it types varies by computer.
                      </Trans>
                    ) : swallowActive ? (
                      <Trans id="fallback.option.swallow.description">
                        Keys not in your keyboard do nothing. Silent on every computer — but if your typists expect a character on a key, that key will feel dead.
                      </Trans>
                    ) : (
                      <Trans id="fallback.option.swallow.descriptionCarvedOnly">
                        Keys you removed from the copied keyboard do nothing. Keys your keyboard never defined are not covered yet: the characters listed above still come through.
                      </Trans>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      {confirmed ? null : (
        <button
          type="button"
          className="ks-focus-ring"
          data-testid="fallback-policy-confirm"
          onClick={confirmProposals}
          style={{ marginTop: 12 }}
        >
          <Trans id="fallback.confirm.button">Confirm these choices</Trans>
        </button>
      )}

      <p
        data-testid="fallback-policy-deadkey-rule"
        style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)" }}
      >
        <Trans id="fallback.deadkeyRule">
          Deadkey combinations always do nothing — allowing fallback would leave the deadkey armed.
        </Trans>
      </p>
    </details>
  );
}
