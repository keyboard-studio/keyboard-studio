import type { RawKmnFragment } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { makeCardStyle, makeHeadingStyle } from '../../lib/carveStyles.ts';

interface RawFragmentCardProps {
  fragment: RawKmnFragment;
}

export function RawFragmentCard({ fragment }: RawFragmentCardProps) {
  const isDeleted = useIRStore((s) => s.isDeleted(fragment.nodeId));

  const cardStyle = makeCardStyle(isDeleted, '#3d2b00');
  const headingStyle = makeHeadingStyle(isDeleted);

  return (
    <div style={cardStyle}>
      <h3 style={headingStyle}>Advanced rule (cannot be edited)</h3>
      {/* Show reason via tooltip only — do not expose sourceText in the UI. */}
      <button
        title={fragment.reason}
        style={{ fontSize: '0.85rem', cursor: 'help', background: 'none', border: 'none', color: '#8b949e', padding: 0 }}
        aria-label={`Info: ${fragment.reason}`}
      >
        [i] {fragment.reason}
      </button>
      <CarveActions nodeId={fragment.nodeId} />
    </div>
  );
}
