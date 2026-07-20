// Base-resolution step of the hybrid flow (spec §8 "Base resolution"). Given the
// (language, script) target from identity-lite, lists the available bases via
// BaseBrowserService, ranks them with suggestBases() (language+script >
// script > language-cross-script > US-QWERTY fallback), and lets the author
// accept a suggestion or pick any base.
// The chosen base then back-fills the prefill confirmations. refs #369.

import { useEffect, useMemo, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { getBaseBrowserService } from "../../lib/services.ts";
import { suggestBases, type SuggestTarget } from "../../lib/suggestBase.ts";
import {
  applyGenealogicalTier,
  makeResolveLanguage,
  type ResolvedReason,
  type ResolvedSuggestion,
} from "../../lib/genealogyTier.ts";
import { getLoadedLangtags, loadLangtags } from "../../lib/langtagsDefaults.ts";
import { BaseKeyboardPicker } from "../../components/BaseKeyboardPicker.tsx";
import { Badge, Button } from "../../ui/index.ts";
import type { BadgeTone } from "../../ui/Badge.tsx";

const REASON_LABEL: Record<ResolvedReason, string> = {
  "language-match-monolingual": "Dedicated to your language",
  "language-match-multilingual": "Already supports your language",
  genealogical: "Related language, same script",
  "script-match": "Matches your script",
  "language-cross-script": "Supports your language, different script",
  "us-qwerty-fallback": "Start blank (US QWERTY)",
};

// Token-mapped reason tones for Badge, in descending strength:
//   language-match-monolingual  → Badge "success" (var(--sil-green)) — dedicated
//   language-match-multilingual → Badge "success" (var(--sil-green)) — covers it too
//   genealogical                → Badge "accent"  (var(--app-accent))
//   script-match                → Badge "default" (neutral) — weaker than a relative
//   language-cross-script       → Badge "warn"    (var(--sil-orange-dark))
//   us-qwerty-fallback          → Badge "subtle"  (var(--app-text-subtle))
const REASON_TONE: Record<ResolvedReason, BadgeTone> = {
  "language-match-monolingual": "success",
  "language-match-multilingual": "success",
  genealogical: "accent",
  "script-match": "default",
  "language-cross-script": "warn",
  "us-qwerty-fallback": "subtle",
};

export interface BaseResolutionProps {
  /** The chosen (language, script) target from identity-lite. */
  target: SuggestTarget;
  /**
   * Fired on every search-result / suggestion-card click. Drives the LIVE
   * preview in the right pane WITHOUT advancing the wizard or instantiating
   * the working copy (preview-before-commit). `null` when the picker's
   * clear action (second Escape) fires.
   */
  onPreview: (base: BaseKeyboard | null) => void;
  /**
   * Fired by the single "Choose this keyboard" button — commits the
   * currently-previewed base and advances the wizard.
   */
  onConfirm: () => void;
  /** The base currently shown in the right-pane preview, or null before any pick. */
  previewedBase: BaseKeyboard | null;
  /** Coarse compile-pipeline status for `previewedBase` (see stores/basePreviewStatusStore.ts). */
  previewStatus: "idle" | "loading" | "ready" | "error";
  onBack?: () => void;
}

export function BaseResolution({
  target,
  onPreview,
  onConfirm,
  previewedBase,
  previewStatus,
  onBack,
}: BaseResolutionProps) {
  const [bases, setBases] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // What the top search bar looks through: the suggested bases (default) or
  // the full catalog. Widened via the toggle or the picker's zero-match action.
  const [searchScope, setSearchScope] = useState<"suggested" | "all">("suggested");
  // Langtags backs the genealogical tier's resolveLanguage. It loads lazily (a
  // separate chunk), so the genealogical tier is additive: until it resolves, we
  // rank with plain suggestBases and re-rank once it lands. `tick` re-renders
  // when the async load settles.
  const [langtagsTick, setLangtagsTick] = useState(0);

  useEffect(() => {
    let live = true;
    getBaseBrowserService()
      .listAll()
      .then(
        (kbs) => {
          if (!live) return;
          setBases(kbs);
          setLoading(false);
        },
        (err) => {
          if (!live) return;
          console.error("[BaseResolution] listAll() failed:", err);
          setError("Could not load base keyboards.");
          setLoading(false);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  // Kick off the lazy langtags load once; bump the tick when it resolves so the
  // genealogical tier re-ranks. Safe if already loaded (idempotent).
  useEffect(() => {
    let live = true;
    loadLangtags().then(
      () => {
        if (live) setLangtagsTick((t) => t + 1);
      },
      () => {
        /* langtags unavailable → genealogical tier stays off, ranking degrades
           gracefully to plain suggestBases. */
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // Build the phonebook from the loaded bases' .languages arrays so the caller
  // need not thread a separate map. Each base's languages field (populated from
  // its .kps <Languages> block) is used as-is; bases without languages degrade
  // to script-match ranking via the empty-array default in suggestBases().
  const languagesById = useMemo(
    () =>
      Object.fromEntries(
        bases.map((b) => [b.id, b.languages ?? []] as const),
      ),
    [bases],
  );

  const suggestions = useMemo<ResolvedSuggestion[]>(() => {
    const ranked = suggestBases(bases, target, { languagesById });
    // Promote same-script bases that also support a close relative of the target
    // language into the genealogical tier (spec 036 US2). Only when langtags has
    // loaded; otherwise the plain script/language ranking stands.
    const langtags = getLoadedLangtags();
    if (!langtags) {
      return ranked.map((s) => ({ base: s.base, reason: s.reason }));
    }
    return applyGenealogicalTier(ranked, target, {
      resolveLanguage: makeResolveLanguage(langtags.getLanguageDefaults),
      languagesById,
    });
    // langtagsTick forces a re-rank once the lazy langtags module resolves.
  }, [bases, target, languagesById, langtagsTick]);

  const suggestedIds = useMemo(
    () => new Set(suggestions.map((s) => s.base.id)),
    [suggestions],
  );

  const heading: React.CSSProperties = {
    margin: "0 0 8px 0",
    fontSize: "1.1rem",
    color: "var(--app-accent)",
    fontWeight: 600,
    fontFamily: "var(--app-font)",
  };
  const subtle: React.CSSProperties = {
    margin: "0 0 20px 0",
    fontSize: 13,
    color: "var(--app-text-muted)",
    fontFamily: "var(--app-font)",
  };

  if (loading) return <div role="status" style={{ color: "var(--app-text-muted)", fontFamily: "var(--app-font)" }}>Loading base keyboards...</div>;
  if (error !== null) return <div style={{ color: "var(--danger)", fontFamily: "var(--app-font)" }}>{error}</div>;
  if (bases.length === 0)
    return (
      <div role="status" style={{ color: "var(--app-text-muted)", fontSize: 13, fontFamily: "var(--app-font)" }}>
        No base keyboards found. Check your connection and try again.
      </div>
    );

  return (
    <div data-testid="base-picker" style={{ color: "var(--app-text)", fontFamily: "var(--app-font)" }}>
      {/* Back — at the top with the search bar, not below the suggestion cards. */}
      {onBack !== undefined && (
        <Button
          variant="back"
          data-testid="base-back"
          onClick={onBack}
          // marginTop:0 overrides the back variant's legacy bottom-of-panel
          // margin now that the button sits at the top with the search bar.
          style={{ marginTop: 0, marginBottom: 12 }}
        >
          &larr; Back
        </Button>
      )}
      <h2 style={heading}>Choose a starting keyboard</h2>
      <p style={subtle}>
        Based on your language and chosen script, here are the closest starting
        points. Search above or pick a suggestion below.
      </p>

      {/* Search — at the top, scoped to the suggestions by default with a
          toggle to widen to the full catalog. */}
      <div style={{ marginBottom: 20 }}>
        <div
          role="group"
          aria-label="Search scope"
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
        >
          <span style={{ fontSize: 12, color: "var(--app-text-muted)", fontFamily: "var(--app-font)" }}>
            Search in:
          </span>
          {(["suggested", "all"] as const).map((scope) => {
            const active = searchScope === scope;
            return (
              <Button
                key={scope}
                variant="secondary"
                data-testid={`search-scope-${scope}`}
                aria-pressed={active}
                onClick={() => setSearchScope(scope)}
                style={{
                  padding: "3px 10px",
                  background: active ? "var(--app-accent-subtle)" : "transparent",
                  border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
                  borderRadius: 999,
                  color: active ? "var(--app-text)" : "var(--app-text-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "var(--app-font)",
                }}
              >
                {scope === "suggested" ? "Suggested" : "All keyboards"}
              </Button>
            );
          })}
        </div>
        <BaseKeyboardPicker
          value={previewedBase}
          onChange={onPreview}
          target={target}
          label="Search keyboards"
          scopeIds={searchScope === "suggested" ? suggestedIds : undefined}
          onSearchAll={() => setSearchScope("all")}
        />
        {/*
          The single commit button for the step. Enabled ONLY once the
          preview has compiled successfully (previewStatus === "ready") —
          disabled while idle, loading, AND on error. This means an author can
          only commit a keyboard they have actually been able to preview/test,
          which makes the confirm-while-loading -> subsequent-compile-error
          race structurally unreachable: there is no path from "clicked
          confirm" to "advanced onto a base whose compile then fails".
        */}
        <Button
          variant="secondary"
          data-testid="base-confirm"
          disabled={previewedBase === null || previewStatus !== "ready"}
          onClick={onConfirm}
          style={{
            marginTop: 10,
            padding: "8px 18px",
            background: previewedBase === null ? "transparent" : "var(--app-accent)",
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            color: previewedBase === null ? "var(--app-text-subtle)" : "var(--app-text)",
            fontSize: 13,
            cursor: previewedBase === null || previewStatus !== "ready" ? "not-allowed" : "pointer",
            fontFamily: "var(--app-font)",
          }}
        >
          {previewStatus === "loading" ? "Preparing preview…" : "Choose this keyboard"}
        </Button>
      </div>

      <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 16 }}>
        <p style={{ ...subtle, marginBottom: 8 }}>Suggested for you:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.map(({ base, reason, relative }) => {
            const isSelected = base.id === previewedBase?.id;
            return (
            <Button
              key={base.id}
              variant="secondary"
              data-testid={`base-card-${base.id}`}
              // Preview only — does NOT advance the wizard or instantiate the
              // working copy. Committing happens exclusively via the single
              // "Choose this keyboard" button above.
              onClick={() => onPreview(base)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: isSelected ? "var(--app-accent-subtle)" : "var(--app-surface)",
                border: `1px solid ${isSelected ? "var(--app-accent)" : "var(--app-border)"}`,
                borderRadius: 8,
                color: "var(--app-text)",
                fontSize: 14,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--app-font)",
              }}
            >
              <span>
                <strong>{base.displayName}</strong>{" "}
                <span style={{ color: "var(--app-text-muted)", fontSize: 12 }}>({base.id})</span>
              </span>
              {/* Genealogical suggestions name their closest relative and expose
                  the numeric distance as a hover tooltip. Distance is the full
                  path length across both legs — levels up to the nearest common
                  ancestor plus levels back down to the relative; smaller = closer. */}
              {reason === "genealogical" && relative !== undefined ? (
                <Badge
                  tone={REASON_TONE[reason]}
                  title={`Genealogical distance ${relative.distance} — total steps to ${relative.name} across both branches (up to the nearest common ancestor, then down); smaller is closer`}
                >
                  Related: {relative.name}, same script
                </Badge>
              ) : (
                <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>
              )}
            </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
