import { useWorkingCopyStore } from '../stores/workingCopyStore.ts';
import { PatternCard } from './carve/PatternCard.tsx';
import { GroupCard } from './carve/GroupCard.tsx';
import { StoreCard } from './carve/StoreCard.tsx';
import { RawFragmentCard } from './carve/RawFragmentCard.tsx';
import { navigateTo } from '../lib/navigate.ts';

export function CarveGallery() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const undoStack = useWorkingCopyStore((s) => s.undoStack);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);
  const undoDelete = useWorkingCopyStore((s) => s.undoDelete);

  if (!ir) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <p>Loading keyboard...</p>
        <p>
          <a href="#pick-base">Go back to keyboard selection</a>
        </p>
      </div>
    );
  }

  const recognizedPatterns = ir.recognizedPatterns.filter((p) => p.origin === 'recognized');
  const nonSystemStores = ir.stores.filter((s) => !s.isSystem);
  const hasNothingToCarve =
    recognizedPatterns.length === 0 &&
    ir.groups.every((g) => g.rules.every((r) => r.ownedByPattern !== undefined)) &&
    nonSystemStores.length === 0 &&
    ir.raw.length === 0;

  const handleSkip = () => {
    keepAll();
    navigateTo('survey');
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem', overflowY: 'auto' }}>
      <h1>Review your keyboard</h1>
      <p>
        Remove any parts you don&apos;t need before starting the survey. You can always
        undo a deletion.
      </p>
      <button onClick={handleSkip} style={{ marginBottom: '1.5rem' }}>
        Keep everything &mdash; continue to survey
      </button>

      {hasNothingToCarve && (
        <div style={{ padding: '1rem', background: '#f0f4f8', borderRadius: '6px', marginBottom: '1rem' }}>
          Nothing needs to be removed &mdash; these are standard keys. Click Continue when ready.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {recognizedPatterns.map((p) => (
          <PatternCard
            key={p.id}
            pattern={p}
          />
        ))}
        {ir.groups.map((g) => (
          <GroupCard key={g.nodeId} group={g} />
        ))}
        {nonSystemStores.map((s) => (
          <StoreCard key={s.nodeId} store={s} />
        ))}
        {ir.raw.map((f) => (
          <RawFragmentCard key={f.nodeId} fragment={f} />
        ))}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button onClick={handleSkip}>Continue to survey &rarr;</button>
      </div>

      {undoStack.length > 0 && (
        <button
          onClick={undoDelete}
          style={{ position: 'fixed', bottom: '1rem', right: '1rem', padding: '0.5rem 1rem' }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
