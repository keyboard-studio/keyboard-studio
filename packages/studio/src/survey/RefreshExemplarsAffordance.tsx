// RefreshExemplarsAffordance — the opt-in live exemplar refresh (#1367).
//
// The Phase B fill affordances' fourth surface, beside the exemplar offer
// and the text sample. It exists because the built-in exemplar index is
// pinned (spec 044): a language whose CLDR entry was just added or fixed
// upstream would otherwise wait for a maintainer pin bump. This is the
// R3 follow-up's escape hatch, under its two stated conditions — its own
// provenance UI, and feeding FR-015's single sourcing path (the engine
// installs the refresh INSIDE sourceExemplars' resolution; nothing here
// reads a side channel).
//
// Hard rules this component keeps:
//  - Author-initiated only. The fetch fires from the button click below —
//    never on mount, never from an effect, never on a timer.
//  - Propose-then-confirm (FR-016/017, Art. X): a successful check shows a
//    preview proposal; the draft is touched only when the author confirms,
//    via the same seedFromProposal path as every other proposal source.
//  - Additions only. Characters a newer release dropped are REPORTED, never
//    removed — an author's accepted characters are theirs.
//  - Every outcome is spoken: already-current, not-covered, network error,
//    and unreadable data each get their own sentence. A silent no-op after
//    an explicit click would read as "checked, nothing new" even when the
//    check never happened.
//  - Session-only, disclosed at the choice point: the refreshed dataset is
//    not persisted; what persists is the per-character "cldr-live"
//    provenance (with its release) recorded by seedFromProposal.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { ExemplarInventory } from "@keyboard-studio/engine";
import { charactersInTier, refreshExemplars } from "../lib/services.ts";
import { useInventoryDraft } from "./useInventoryDraft.ts";
import { useSourcedExemplars } from "./useSourcedExemplars.ts";
import { codepointLabel } from "./codepointLabel.ts";
import { collateInventory } from "./collation.ts";
import { displayChar } from "../lib/irToCarveNodes.ts";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { CpLabel } from "./CpLabel.tsx";
import {
  TEXT_DIM,
  ERROR_RED,
  mutedParaFlush,
  sectionHeading,
  primaryButton,
  secondaryButton,
  charChip,
  chipGlyph,
} from "./surveyStyles.ts";

// Parameterized outcome wordings as extractable descriptors. Rendering
// goes through i18n._(descriptor.id, values): the macro t() accepts a
// descriptor but no values, while the I18n instance's id overload does.
// The msg() calls here are what the extractor registers in the catalogs.
const MSG_REFRESH_ALREADY_CURRENT = msg({
  id: "survey.phaseB.buildList.refreshAlreadyCurrent",
  message: "Already current — the built-in copy is CLDR {version}, the newest release.",
});
const MSG_REFRESH_NOT_COVERED = msg({
  id: "survey.phaseB.buildList.refreshNotCovered",
  message: "CLDR {version} does not cover this language yet. Your built-in data is unchanged.",
});
const MSG_REFRESH_NO_NEWER = msg({
  id: "survey.phaseB.buildList.refreshNoNewer",
  message:
    "No newer characters — CLDR {version} has the same characters for this language as the built-in copy.",
});
const MSG_REFRESH_SOURCE_FLIP = msg({
  id: "survey.phaseB.buildList.refreshSourceFlipNote",
  message:
    "Your built-in data for this language comes from SLDR. The characters above come from CLDR {version} instead.",
});
const MSG_REFRESH_REMOVED_NOTE = msg({
  id: "survey.phaseB.buildList.refreshRemovedNote",
  message:
    "No longer in CLDR {version}: {chars}. These stay in your alphabet unless you remove them yourself.",
});

type RefreshOutcome =
  | { kind: "already-current"; version: string }
  | { kind: "not-covered"; version: string }
  | { kind: "network-error" }
  | { kind: "unreadable"; version: string }
  | { kind: "no-newer"; version: string };

interface RefreshProposal {
  inventory: ExemplarInventory;
  added: string[];
  removed: string[];
  sourceFlip: boolean;
}

export function RefreshExemplarsAffordance({ bcp47 }: { bcp47: string | undefined }) {
  const { t, i18n } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const draft = useInventoryDraft("characters");
  const seedFromProposal = draft.ops.seedFromProposal;
  // Resolved once, before any refresh: this stays the PINNED inventory for
  // the diff even after a refresh installs its override in the engine.
  const { inventory: pinnedInventory } = useSourcedExemplars(bcp47);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<RefreshOutcome | null>(null);
  const [proposal, setProposal] = useState<RefreshProposal | null>(null);

  if (bcp47 === undefined || bcp47.trim() === "") return null;

  async function handleCheck(): Promise<void> {
    setOutcome(null);
    setProposal(null);
    setChecking(true);
    try {
      const result = await refreshExemplars(bcp47 as string);
      switch (result.kind) {
        case "updated": {
          const refreshedMain = charactersInTier(result.inventory, "main");
          const inDraft = new Set(draft.chars);
          const rejected = new Set(draft.rejected);
          const added = refreshedMain.filter((c) => !inDraft.has(c) && !rejected.has(c));
          const pinnedMain =
            pinnedInventory !== null ? charactersInTier(pinnedInventory, "main") : [];
          const refreshedSet = new Set(refreshedMain);
          const removed = pinnedMain.filter((c) => !refreshedSet.has(c));
          if (added.length === 0 && removed.length === 0) {
            setOutcome({ kind: "no-newer", version: result.version });
          } else {
            setProposal({
              inventory: result.inventory,
              added: collateInventory(added),
              removed,
              sourceFlip:
                pinnedInventory !== null &&
                pinnedInventory.source === "sldr" &&
                result.inventory.source === "cldr",
            });
          }
          break;
        }
        case "already-current":
          setOutcome({ kind: "already-current", version: result.version });
          break;
        case "not-covered":
          setOutcome({ kind: "not-covered", version: result.version });
          break;
        case "unreadable":
          setOutcome({ kind: "unreadable", version: result.version });
          break;
        case "network-error":
          setOutcome({ kind: "network-error" });
          break;
      }
    } catch {
      // A chunk-load or unexpected failure gets the same honest sentence as
      // a transport failure — never an unhandled rejection behind the click.
      setOutcome({ kind: "network-error" });
    } finally {
      setChecking(false);
    }
  }

  function handleConfirm(): void {
    if (proposal === null) return;
    seedFromProposal(proposal.inventory, bcp47 as string);
    setProposal(null);
  }

  function outcomeText(o: RefreshOutcome): string {
    switch (o.kind) {
      case "already-current":
        return i18n._(MSG_REFRESH_ALREADY_CURRENT.id, { version: o.version });
      case "not-covered":
        return i18n._(MSG_REFRESH_NOT_COVERED.id, { version: o.version });
      case "unreadable":
        return t({
          id: "survey.phaseB.buildList.refreshUnreadable",
          message:
            "The newer CLDR data couldn't be read (its format has changed). Your built-in data is unchanged.",
        });
      case "no-newer":
        return i18n._(MSG_REFRESH_NO_NEWER.id, { version: o.version });
      case "network-error":
        return t({
          id: "survey.phaseB.buildList.refreshNetworkError",
          message:
            "Couldn't check online — check your connection and try again. Your alphabet is unchanged.",
        });
    }
  }

  return (
    <section
      data-testid="refresh-exemplars-affordance"
      aria-label={t({
        id: "survey.phaseB.buildList.refreshAriaLabel",
        message: "Check for newer exemplar data",
      })}
    >
      <h3 style={sectionHeading}>
        <Trans id="survey.phaseB.buildList.refreshHeading">Newer exemplar data</Trans>
      </h3>
      <p style={mutedParaFlush}>
        <Trans id="survey.phaseB.buildList.refreshHelp">
          The characters proposed here come from built-in CLDR data. A newer
          CLDR release may cover your language better — check online to
          compare. Checked data is used for this session only, and nothing is
          added to your alphabet without your confirmation.
        </Trans>
      </p>
      {proposal === null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            data-testid="refresh-exemplars-button"
            disabled={checking}
            onClick={() => void handleCheck()}
            className="ks-focus-ring ks-hit-target"
            style={secondaryButton}
          >
            <Trans id="survey.phaseB.buildList.refreshButton">
              Check for newer exemplar data for this language
            </Trans>
          </button>
          {checking && (
            <span data-testid="refresh-exemplars-checking" style={{ fontSize: 13, color: TEXT_DIM }}>
              <Trans id="survey.phaseB.buildList.refreshChecking">Checking CLDR online…</Trans>
            </span>
          )}
        </div>
      ) : (
        <div data-testid="refresh-exemplars-proposal" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
            <Trans id="survey.phaseB.exemplars.fromCldrLive">
              from CLDR {{ version: proposal.inventory.release ?? "" }} (live refresh)
            </Trans>{" "}
            <Trans id="survey.phaseB.buildList.refreshProposalCount">
              {{ n: proposal.added.length }} new characters
            </Trans>
          </p>
          {proposal.sourceFlip && (
            <p data-testid="refresh-exemplars-source-flip" style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
              {i18n._(MSG_REFRESH_SOURCE_FLIP.id, {
                version: proposal.inventory.release ?? "",
              })}
            </p>
          )}
          {proposal.added.length > 0 && (
            <div
              data-testid="refresh-exemplars-proposal-preview"
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            >
              {proposal.added.map((c) => {
                const { title } = codepointLabel(c);
                return (
                  <span
                    key={c}
                    title={title}
                    aria-label={`${displayChar(c)} (${title})`}
                    style={{ ...charChip(false), cursor: "default" }}
                  >
                    <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
                    <CpLabel grapheme={c} />
                  </span>
                );
              })}
            </div>
          )}
          {proposal.removed.length > 0 && (
            <p data-testid="refresh-exemplars-removed-note" style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
              {i18n._(MSG_REFRESH_REMOVED_NOTE.id, {
                version: proposal.inventory.release ?? "",
                chars: proposal.removed.join(" "),
              })}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
            <Trans id="survey.phaseB.buildList.refreshSessionNote">
              Checked data is used for this session only; the built-in copy is
              the default again next time.
            </Trans>
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {proposal.added.length > 0 && (
              <button
                type="button"
                data-testid="refresh-exemplars-confirm"
                onClick={handleConfirm}
                className="ks-focus-ring ks-hit-target"
                style={primaryButton(false)}
              >
                <Trans id="survey.phaseB.buildList.refreshConfirmButton">
                  Add these to my alphabet
                </Trans>
              </button>
            )}
            <button
              type="button"
              data-testid="refresh-exemplars-cancel"
              onClick={() => setProposal(null)}
              className="ks-focus-ring ks-hit-target"
              style={secondaryButton}
            >
              <Trans id="survey.phaseB.buildList.refreshCancelButton">Cancel</Trans>
            </button>
          </div>
        </div>
      )}
      {outcome !== null && (
        <p
          data-testid="refresh-exemplars-outcome"
          role={outcome.kind === "network-error" || outcome.kind === "unreadable" ? "alert" : "status"}
          style={{
            fontSize: 12,
            marginTop: 8,
            color: outcome.kind === "network-error" || outcome.kind === "unreadable" ? ERROR_RED : TEXT_DIM,
          }}
        >
          {outcomeText(outcome)}
        </p>
      )}
    </section>
  );
}
