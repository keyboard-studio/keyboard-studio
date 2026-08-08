// RemovalBanner — #525 BANNER slice. Replaces the per-node "Suggested
// removal" badge (Rail.tsx) as the SINGLE surface for the character-level
// removal-recommendation signal (recommendedRemovalChars, irToCarveNodes.ts).
//
// Collapsed: a green summary strip naming the count + target language.
// Expanded (click the strip): a flat checklist — one row per recommended
// character, pre-checked — plus a "Remove all selected" button that
// cascade-deletes every still-checked character (reusing the same
// contributor info the store-chip/glyph-chip cascade already computed).
//
// Flat this cycle — no type-grouping (deferred; see the task's Part B scope)
// among the PRIMARY recommendations. Post-#526 follow-on product decision:
// `recommended` rows tagged `reason: 'cross-script-latin'` (base ASCII Latin
// surviving only via desktop base-layout fall-through on a non-Latin target,
// see irToCarveNodes.ts) are split OUT of the primary group and rendered as
// their own secondary, optional, low-priority "Latin alphabet (optional)"
// section below — they no longer drive the primary count/copy/"Remove all
// selected", and they no longer silently disappear either.

import { useState } from 'react';
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { RecommendedRemovalChar } from '../../../lib/irToCarveNodes.ts';
import { displayChar, invisibleCharLabel } from '../../../lib/irToCarveNodes.ts';
import { ChevronIcon, CheckIcon } from './carveShared.tsx';

interface RemovalBannerProps {
  recommended: RecommendedRemovalChar[];
  /** Human-facing target-language label for the banner copy (bcp47 tag, or a neutral fallback when unresolved). */
  languageLabel: string;
  /**
   * Target-language DISPLAY name (e.g. "Russian"), used only for the optional
   * cross-script-Latin group's copy ("...for a {name}-only keyboard").
   * Deliberately separate from `languageLabel` above (which existing callers
   * already pass as a raw bcp47 tag / generic fallback) — omit when no
   * display name is available yet; the section falls back to the neutral
   * "single-script" phrasing rather than showing a raw tag or nothing.
   */
  languageDisplayName?: string | undefined;
  /** Called with the still-checked subset when "Remove all selected" (primary group) is clicked. */
  onRemoveSelected: (selected: RecommendedRemovalChar[]) => void;
}

/** Author-facing label for a checklist row: an invisible/combining-mark name, else its codepoint. */
function charCodepointLabel(ch: string): string {
  const inv = invisibleCharLabel(ch);
  if (inv !== null) return inv;
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

interface ChecklistProps {
  items: RecommendedRemovalChar[];
  uncheckedChs: Set<string>;
  toggle: (ch: string) => void;
  ariaLabel: string;
  hasPairedRow: boolean;
}

/**
 * Shared checkbox-row checklist, reused by both the primary and the optional
 * cross-script-Latin group. Calls `useLingui()` itself (rather than taking
 * `t` as a prop) — the `@lingui/babel-plugin-lingui-macro` transform tracks
 * `t`'s binding to the enclosing function's own `useLingui()` call, so a
 * `t` threaded in as a plain parameter from a sibling component does NOT get
 * macro-transformed and silently drops its interpolation `values`.
 */
function Checklist({ items, uncheckedChs, toggle, ariaLabel, hasPairedRow }: ChecklistProps) {
  const { t } = useLingui();
  return (
    <>
      <ul
        aria-label={ariaLabel}
        style={{
          margin: 0, padding: 0, listStyle: 'none',
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}
      >
        {items.map(({ ch, caseGroup }) => {
          const isChecked = !uncheckedChs.has(ch);
          // A paired row shows BOTH case-group members — accepting it trims both as one
          // action (handleRemoveSelectedRecommended), so the checklist must not imply a
          // single character is at stake. FR-014: still one checkbox for the whole pair;
          // no per-case checkbox inside the row (that would rebuild the two-row
          // reconciliation this requirement removes).
          const pairChars = caseGroup ?? [ch];
          const glyphLabel = pairChars.map(displayChar).join(' / ');
          const codepointLabel = pairChars.map(charCodepointLabel).join(' / ');
          const rowAriaLabel = caseGroup
            ? t({
                id: "editor.assignLoop.removalBanner.removeCheckboxAriaLabelPair",
                message: `Remove ${{ codepointLabel }} (both cases)`,
              })
            : t({ id: "editor.assignLoop.removalBanner.removeCheckboxAriaLabel", message: `Remove ${{ codepoint: codepointLabel }}` });
          return (
            <li key={ch}>
              <label
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--app-surface)', border: '1px solid var(--app-border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(ch)}
                  aria-label={rowAriaLabel}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ font: "400 16px/1 'Lora', serif", color: 'var(--app-text)' }}>
                  {glyphLabel}
                </span>
                <span style={{ font: '600 10px/1 var(--app-font-mono)', color: 'var(--app-text-subtle)', letterSpacing: '.03em' }}>
                  {codepointLabel}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {hasPairedRow && (
        <p style={{ margin: 0, font: '400 11.5px var(--app-font)', color: 'var(--app-text-subtle)' }}>
          <Trans id="editor.assignLoop.removalBanner.pairEscapeHatchHint">
            A paired row removes both cases together — to keep just one, uncheck it here and remove the single
            character you want from its card instead.
          </Trans>
        </p>
      )}
    </>
  );
}

export function RemovalBanner({ recommended, languageLabel, languageDisplayName, onRemoveSelected }: RemovalBannerProps) {
  const { t } = useLingui();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [latinOpen, setLatinOpen] = useState(false);
  // Tracks characters the author has explicitly UNCHECKED. Every character in
  // `recommended` starts checked (pre-checked, per the design) without any
  // sync effect needed — a char not in this set is checked by construction,
  // and a char that drops out of `recommended` (e.g. already removed) simply
  // stops being rendered; its stale entry here is harmless. Shared across both
  // groups below — `ch` is a member of exactly one group, so keys never collide.
  const [uncheckedChs, setUncheckedChs] = useState<Set<string>>(() => new Set());

  // Post-#526 follow-on split: cross-script-Latin rows (base ASCII Latin
  // surviving only via desktop base-layout fall-through on a non-Latin
  // target) never drive the primary count/copy/"Remove all selected" — they
  // get their own optional, low-priority section below instead of being
  // suppressed or silently mixed into the primary recommendation.
  const primary = recommended.filter((r) => r.reason !== 'cross-script-latin');
  const optionalLatin = recommended.filter((r) => r.reason === 'cross-script-latin');

  if (dismissed || (primary.length === 0 && optionalLatin.length === 0)) return null;

  const toggle = (ch: string) => {
    setUncheckedChs((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  const selected = primary.filter((r) => !uncheckedChs.has(r.ch));
  const hasPairedRow = primary.some((r) => r.caseGroup !== undefined);

  const selectedLatin = optionalLatin.filter((r) => !uncheckedChs.has(r.ch));
  const hasPairedLatinRow = optionalLatin.some((r) => r.caseGroup !== undefined);
  // Two complete catalog sentences rather than one sentence with an assembled
  // English fragment interpolated in — a translator needs to restructure the
  // whole "…-only keyboard"/"single-script keyboard" phrase per locale, not
  // just fill in a name (see issue #1561).
  const latinOptionalBody = languageDisplayName !== undefined && languageDisplayName.length > 0
    ? t({
        id: "editor.assignLoop.removalBanner.latinOptionalBodyNamed",
        message: `Keep these for URLs, code, and English words — or remove them for a ${{ language: languageDisplayName }}-only keyboard.`,
      })
    : t({
        id: "editor.assignLoop.removalBanner.latinOptionalBodyGeneric",
        message: `Keep these for URLs, code, and English words — or remove them for a single-script keyboard.`,
      });

  const dismissButton = (
    <button
      type="button"
      onClick={() => setDismissed(true)}
      aria-label={t({ id: "editor.assignLoop.removalBanner.dismissAriaLabel", message: "Dismiss removal recommendation" })}
      style={{
        flexShrink: 0, font: '600 12px var(--app-font)', cursor: 'pointer',
        color: 'var(--app-text-subtle)', background: 'transparent',
        border: '1px solid var(--app-border-strong)', borderRadius: 7, padding: '4px 9px',
      }}
    >
      <Trans id="editor.assignLoop.removalBanner.dismissButton">Dismiss</Trans>
    </button>
  );

  return (
    <div
      role="region"
      aria-label={t({ id: "editor.assignLoop.removalBanner.regionAriaLabel", message: "Removal recommendation" })}
      style={{
        flexShrink: 0,
        borderBottom: '1px solid color-mix(in srgb, var(--sil-green) 35%, transparent)',
        background: 'color-mix(in srgb, var(--sil-green) 10%, var(--app-bg))',
      }}
    >
      {primary.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px' }}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="removal-banner-checklist"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                font: '600 13px var(--app-font)', color: 'var(--sil-green)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <span style={{ display: 'inline-flex', flexShrink: 0 }}><ChevronIcon open={open} size={13} /></span>
              <span style={{ color: 'var(--app-text)', fontWeight: 500 }}>
                {t({
                  id: "editor.assignLoop.removalBanner.recommendText",
                  message: plural(primary.length, {
                    one: `We recommend removing # character not needed for ${languageLabel}. Feel free to look around — but our recommendation is to remove these.`,
                    other: `We recommend removing # characters not needed for ${languageLabel}. Feel free to look around — but our recommendation is to remove these.`,
                  }),
                })}
              </span>
            </button>
            {dismissButton}
          </div>

          {open && (
            <div id="removal-banner-checklist" style={{ padding: '0 22px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Checklist
                items={primary}
                uncheckedChs={uncheckedChs}
                toggle={toggle}
                ariaLabel={t({ id: "editor.assignLoop.removalBanner.checklistAriaLabel", message: "Recommended characters to remove" })}
                hasPairedRow={hasPairedRow}
              />
              <div>
                <button
                  type="button"
                  disabled={selected.length === 0}
                  onClick={() => onRemoveSelected(selected)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    font: '600 12.5px var(--app-font)', cursor: selected.length === 0 ? 'default' : 'pointer',
                    color: '#fff', background: selected.length === 0 ? 'var(--app-text-subtle)' : 'var(--sil-green)',
                    border: 'none', borderRadius: 8, padding: '8px 16px', opacity: selected.length === 0 ? 0.6 : 1,
                  }}
                >
                  <CheckIcon size={12} />
                  <Trans id="editor.assignLoop.removalBanner.removeAllSelected">
                    Remove all selected ({selected.length})
                  </Trans>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Primary group empty but the optional Latin group still has candidates — an
          uncommon case (the whole surplus signal is cross-script-Latin fall-through),
          but the banner must stay dismissible even without a primary strip. */}
      {primary.length === 0 && optionalLatin.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 22px 0' }}>
          {dismissButton}
        </div>
      )}

      {optionalLatin.length > 0 && (
        <div
          role="group"
          aria-label={t({ id: "editor.assignLoop.removalBanner.latinOptionalGroupAriaLabel", message: "Latin alphabet, optional removal" })}
          style={{
            borderTop: primary.length > 0 ? '1px solid var(--app-border)' : 'none',
            padding: '8px 22px',
          }}
        >
          <button
            type="button"
            onClick={() => setLatinOpen((v) => !v)}
            aria-expanded={latinOpen}
            aria-controls="removal-banner-latin-checklist"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', width: '100%',
              font: '600 12px var(--app-font)', color: 'var(--app-text-subtle)',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <span style={{ display: 'inline-flex', flexShrink: 0 }}><ChevronIcon open={latinOpen} size={11} /></span>
            <Trans id="editor.assignLoop.removalBanner.latinOptionalHeading">Latin alphabet (optional)</Trans>
          </button>

          {latinOpen && (
            <div id="removal-banner-latin-checklist" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, font: '400 12px var(--app-font)', color: 'var(--app-text-muted)' }}>
                {latinOptionalBody}
              </p>
              <Checklist
                items={optionalLatin}
                uncheckedChs={uncheckedChs}
                toggle={toggle}
                ariaLabel={t({ id: "editor.assignLoop.removalBanner.latinOptionalChecklistAriaLabel", message: "Optional Latin-alphabet characters to remove" })}
                hasPairedRow={hasPairedLatinRow}
              />
              <div>
                <button
                  type="button"
                  disabled={selectedLatin.length === 0}
                  onClick={() => onRemoveSelected(selectedLatin)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    font: '600 12px var(--app-font)', cursor: selectedLatin.length === 0 ? 'default' : 'pointer',
                    color: 'var(--app-text)', background: 'transparent',
                    border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 14px',
                    opacity: selectedLatin.length === 0 ? 0.6 : 1,
                  }}
                >
                  <Trans id="editor.assignLoop.removalBanner.removeLatinLetters">
                    Remove Latin letters ({selectedLatin.length})
                  </Trans>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
