import { WarnIcon } from './carveShared.tsx';

interface DepBannerProps {
  orphanedNames: string[];
  unusedStoreNames: string[];
}

export function DepBanner({ orphanedNames, unusedStoreNames }: DepBannerProps) {
  if (orphanedNames.length === 0 && unusedStoreNames.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 22px',
      background: 'color-mix(in srgb, var(--sil-orange) 7%, var(--app-bg))',
      borderBottom: '1px solid color-mix(in srgb, var(--sil-orange) 35%, transparent)',
    }}>
      {orphanedNames.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--app-text)' }}>
          <span style={{ color: 'var(--sil-orange-dark)', display: 'inline-flex' }}><WarnIcon size={15} /></span>
          <span>
            <b>{orphanedNames.join(', ')}</b>{' '}
            {orphanedNames.length === 1 ? 'produces' : 'produce'} nothing now — every output was dropped, but the trigger key still fires.
          </span>
        </div>
      )}
      {unusedStoreNames.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--app-text)' }}>
          <span style={{ color: 'var(--sil-orange-dark)', display: 'inline-flex' }}><WarnIcon size={15} /></span>
          <span>
            <b>{unusedStoreNames.join(', ')}</b>{' '}
            {unusedStoreNames.length === 1 ? 'is' : 'are'} no longer referenced and can be removed too.
          </span>
        </div>
      )}
    </div>
  );
}
