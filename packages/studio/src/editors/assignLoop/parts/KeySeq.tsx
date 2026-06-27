import { Fragment } from 'react';
import { KeyCap } from './KeyCap.tsx';

interface KeySeqProps { keys: string[]; dim?: boolean | undefined; prefix?: string | undefined }

export function KeySeq({ keys, dim, prefix }: KeySeqProps) {
  const hasPrefix = prefix !== undefined && prefix !== '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%', opacity: dim ? 0.5 : 1 }}>
      {hasPrefix && (
        <Fragment>
          <KeyCap>
            <span style={{ fontStyle: 'italic', opacity: 0.75 }}>{prefix}</span>
          </KeyCap>
          <span style={{ fontSize: 8.5, color: 'var(--app-text-subtle)' }}>+</span>
        </Fragment>
      )}
      {(keys || []).map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span style={{ fontSize: 8.5, color: 'var(--app-text-subtle)' }}>+</span>}
          <KeyCap>{k}</KeyCap>
        </Fragment>
      ))}
    </span>
  );
}
