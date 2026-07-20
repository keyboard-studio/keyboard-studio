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
// Flat this cycle — no type-grouping (deferred; see the task's Part B scope).

import { useState } from 'react';
import type { RecommendedRemovalChar } from '../../../lib/irToCarveNodes.ts';
import { displayChar, invisibleCharLabel } from '../../../lib/irToCarveNodes.ts';
import { ChevronIcon, CheckIcon } from './carveShared.tsx';

interface RemovalBannerProps {
  recommended: RecommendedRemovalChar[];
  /** Human-facing target-language label for the banner copy (bcp47 tag, or a neutral fallback when unresolved). */
  languageLabel: string;
  /** Called with the still-checked subset when "Remove all selected" is clicked. */
  onRemoveSelected: (selected: RecommendedRemovalChar[]) => void;
}

/** Author-facing label for a checklist row: an invisible/combining-mark name, else its codepoint. */
function charCodepointLabel(ch: string): string {
  const inv = invisibleCharLabel(ch);
  if (inv !== null) return inv;
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function RemovalBanner({ recommended, languageLabel, onRemoveSelected }: RemovalBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  // Tracks characters the author has explicitly UNCHECKED. Every character in
  // `recommended` starts checked (pre-checked, per the design) without any
  // sync effect needed — a char not in this set is checked by construction,
  // and a char that drops out of `recommended` (e.g. already removed) simply
  // stops being rendered; its stale entry here is harmless.
  const [uncheckedChs, setUncheckedChs] = useState<Set<string>>(() => new Set());

  if (dismissed || recommended.length === 0) return null;

  const toggle = (ch: string) => {
    setUncheckedChs((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  const selected = recommended.filter((r) => !uncheckedChs.has(r.ch));

  return (
    <div
      role="region"
      aria-label="Removal recommendation"
      style={{
        flexShrink: 0,
        borderBottom: '1px solid color-mix(in srgb, var(--sil-green) 35%, transparent)',
        background: 'color-mix(in srgb, var(--sil-green) 10%, var(--app-bg))',
      }}
    >
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
            We recommend removing {recommended.length} character{recommended.length !== 1 ? 's' : ''} not needed for {languageLabel}. Feel free to look around — but our recommendation is to remove these.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss removal recommendation"
          style={{
            flexShrink: 0, font: '600 12px var(--app-font)', cursor: 'pointer',
            color: 'var(--app-text-subtle)', background: 'transparent',
            border: '1px solid var(--app-border-strong)', borderRadius: 7, padding: '4px 9px',
          }}
        >
          Dismiss
        </button>
      </div>

      {open && (
        <div id="removal-banner-checklist" style={{ padding: '0 22px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ul
            aria-label="Recommended characters to remove"
            style={{
              margin: 0, padding: 0, listStyle: 'none',
              display: 'flex', flexWrap: 'wrap', gap: 8,
            }}
          >
            {recommended.map(({ ch }) => {
              const codepoint = charCodepointLabel(ch);
              const isChecked = !uncheckedChs.has(ch);
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
                      aria-label={`Remove ${codepoint}`}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ font: "400 16px/1 'Lora', serif", color: 'var(--app-text)' }}>
                      {displayChar(ch)}
                    </span>
                    <span style={{ font: '600 10px/1 var(--app-font-mono)', color: 'var(--app-text-subtle)', letterSpacing: '.03em' }}>
                      {codepoint}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
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
              Remove all selected ({selected.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
