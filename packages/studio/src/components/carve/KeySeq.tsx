import { Fragment } from 'react';
import { KeyCap } from './KeyCap.tsx';

interface KeySeqProps { keys: string[]; dim?: boolean | undefined }

export function KeySeq({ keys, dim }: KeySeqProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center', opacity: dim ? 0.5 : 1 }}>
      {(keys || []).map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span style={{ fontSize: 8.5, color: 'var(--app-text-subtle)' }}>+</span>}
          <KeyCap>{k}</KeyCap>
        </Fragment>
      ))}
    </span>
  );
}
