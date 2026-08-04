import { Fragment } from 'react';
import { KeyCap } from './KeyCap.tsx';

interface KeySeqProps {
  keys: string[];
  dim?: boolean | undefined;
  prefix?: string | undefined;
  /**
   * Separator rendered between successive `keys` entries. Default 'plus'
   * preserves the original behavior exactly (simultaneous-chord display,
   * used by the rule/node Rail view — CarveGallery.tsx et al). 'then' is
   * additive (#1399): CarveGalleryV2's faithful multi-step "how it's typed"
   * sequences (e.g. a deadkey trigger THEN a base letter) are typed one
   * after another, not simultaneously, and must read that way.
   */
  joiner?: 'plus' | 'then' | undefined;
}

export function KeySeq({ keys, dim, prefix, joiner = 'plus' }: KeySeqProps) {
  const hasPrefix = prefix !== undefined && prefix !== '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%', opacity: dim ? 0.5 : 1 }}>
      {hasPrefix && (
        <>
          <KeyCap>
            <span style={{ fontStyle: 'italic', opacity: 0.75 }}>{prefix}</span>
          </KeyCap>
          <span style={{ fontSize: 8.5, color: 'var(--app-text-subtle)' }}>+</span>
        </>
      )}
      {(keys || []).map((k, i) => (
        <Fragment key={i}>
          {i > 0 && (
            joiner === 'then'
              ? <span style={{ fontSize: 9, fontStyle: 'italic', color: 'var(--app-text-subtle)' }}>then</span>
              : <span style={{ fontSize: 8.5, color: 'var(--app-text-subtle)' }}>+</span>
          )}
          <KeyCap>{k}</KeyCap>
        </Fragment>
      ))}
    </span>
  );
}
