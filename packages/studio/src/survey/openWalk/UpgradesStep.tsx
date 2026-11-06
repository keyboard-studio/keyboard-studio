// UpgradesStep: the Open walk's Upgrades page (spec 111 FR-034).
//
// Shown only when the baseline recorded a failing upgrade criterion (open-issues,
// FR-032). Each failing criterion with a registered fixer (criteria/upgradePairs)
// becomes one offer with a before/after preview. Apply writes the previewed file
// text into the working copy the way the Code tabs' Apply does (text is the
// source of truth, then reparse); Skip records the decline so the offer does not
// come back this session. Nothing is applied until the author presses Apply.

import { useEffect, useMemo, useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { SuggestedFixes } from "../../components/SuggestedFixes.tsx";
import { useOpenWalkCriteria } from "../../hooks/useOpenWalkCriteria.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { useDecisionLogStore } from "../../decisions/decisionLogStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { collectFailing } from "../../criteria/openRatchet.ts";
import { addToInventory } from "../../lib/openInventory.ts";
import { offerUpgrades, type UpgradeOffer } from "../../criteria/upgradePairs.ts";
import { loadCapsEngine } from "../../lib/capsEngine.ts";
import { findKmnPath } from "../../lib/findKmnPath.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { replaceStartingPointAndReplay } from "../../lib/replaceStartingPoint.ts";
import { decidedSuggestions, recordSuggestionDisposition } from "../../lib/suggestionDispositions.ts";
import type { SuggestedFix } from "../../lib/consistencySuggestions.ts";
import { TEXT_DIM } from "../../ui/theme.ts";
import {
  phaseHeading,
  surveyCard,
  surveyPageColumn,
} from "../surveyStyles.ts";
import { WalkNav } from "./WalkNav.tsx";

/** The lint rule ids of the failing findings, sorted, joined into a stable effect key. */
function failingRuleKey(ruleIds: readonly string[]): string {
  return [...new Set(ruleIds)].sort().join(",");
}

export function UpgradesRenderer({ onChange }: DecisionRendererProps<boolean>) {
  const { onComplete } = useGalleryStepContext();
  const { result } = useOpenWalkCriteria();
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const record = useDecisionLogStore((s) => s.record);
  const [offers, setOffers] = useState<UpgradeOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const failingKey = useMemo(
    () =>
      result === null
        ? null
        : failingRuleKey(
            collectFailing(result).map((f) => {
              const colon = f.key.indexOf(":");
              return colon === -1 ? f.key : f.key.slice(0, colon);
            }),
          ),
    [result],
  );
  const bcp47 = identity?.languages?.[0]?.tag;

  useEffect(() => {
    if (failingKey === null || startVfs === null || startKeyboard === null) return undefined;
    const kmnPath = findKmnPath(startVfs);
    const kmnText = kmnPath === undefined ? undefined : readVfsText(startVfs, kmnPath);
    if (kmnPath === undefined || kmnText === undefined) {
      setOffers([]);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const caps = await loadCapsEngine();
        const built = await offerUpgrades(failingKey === "" ? [] : failingKey.split(","), {
          file: kmnPath,
          kmnText,
          keyboardId: startKeyboard.id,
          ...(bcp47 !== undefined ? { bcp47 } : {}),
          caps,
          readText: (path) => readVfsText(startVfs, path),
          paths: startVfs.list(),
        });
        if (!cancelled) setOffers(built);
      } catch (err: unknown) {
        // eslint-disable-next-line no-console -- developers want this; not actionable on screen
        console.warn("[WARN] upgrade offers could not be built", err);
        if (!cancelled) setOffers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [failingKey, startVfs, startKeyboard, bcp47]);

  const decided = decidedSuggestions(record);
  const pending = (offers ?? []).filter((o) => !decided.has(o.fix.id));

  const apply = (fix: SuggestedFix): void => {
    const offer = pending.find((o) => o.fix.id === fix.id);
    if (offer === undefined) return;
    const outcome = replaceStartingPointAndReplay(offer.file, offer.afterText);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setError(null);
    if (offer.inventoryAdditions !== undefined) addToInventory(offer.inventoryAdditions);
    recordSuggestionDisposition(fix, "accepted");
  };

  // Same composition as the survey steps (Prefill): left-aligned column,
  // display title above the accent-topped card — not the old centred card
  // with a plain 18px title this page used to render.
  return (
    <div style={surveyPageColumn}>
      <h2 id="open-upgrades-heading" style={phaseHeading}>
        <Trans id="open.upgrades.title">Upgrades</Trans>
      </h2>
      <section aria-labelledby="open-upgrades-heading" style={surveyCard}>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: TEXT_DIM }}>
          <Trans id="open.upgrades.intro">
            These bring the keyboard up to the current Keyman way of doing things. Each one changes only what it
            concerns, and nothing changes until you apply it. Preview it first, or skip it.
          </Trans>
        </p>
        {offers === null ? (
          <p role="status" style={{ fontSize: 13, color: TEXT_DIM }}>
            <Trans id="open.upgrades.preparing">Preparing the upgrades...</Trans>
          </p>
        ) : pending.length === 0 ? (
          <p role="status" style={{ fontSize: 13, color: TEXT_DIM }} data-testid="upgrades-none">
            <Trans id="open.upgrades.none">No upgrades are waiting.</Trans>
          </p>
        ) : (
          <SuggestedFixes
            fixes={pending.map((o) => o.fix)}
            testId="upgrade-offers"
            mode="apply"
            onAccept={apply}
            onSkip={(fix) => recordSuggestionDisposition(fix, "declined")}
          />
        )}
        {error !== null && (
          <p role="alert" style={{ fontSize: 13 }}>
            {error}
          </p>
        )}
        <WalkNav
          onContinue={() => {
            onChange(true);
            onComplete(undefined);
          }}
        />
      </section>
    </div>
  );
}
