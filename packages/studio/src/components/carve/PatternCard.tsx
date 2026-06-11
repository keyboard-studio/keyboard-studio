import type { Pattern } from '@keyboard-studio/contracts';
import { useIRStore } from '../../stores/irStore.ts';
import { CarveActions } from './CarveActions.tsx';
import { makeCardStyle, makeHeadingStyle } from '../../lib/carveStyles.ts';

interface PatternCardProps {
  pattern: Pattern;
}

export function PatternCard({ pattern }: PatternCardProps) {
  // A Pattern instance may not have a nodeId on the Pattern type itself;
  // we use pattern.id as the stable deletion key for recognized patterns.
  const isDeleted = useIRStore((s) => s.isDeleted(pattern.id));

  const cardStyle = makeCardStyle(isDeleted);
  const headingStyle = makeHeadingStyle(isDeleted);

  return (
    <div style={cardStyle}>
      <h3 style={headingStyle}>{pattern.title}</h3>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: '#8b949e' }}>
        {pattern.description ?? 'Recognized keyboard pattern'}
      </p>
      <CarveActions nodeId={pattern.id} />
    </div>
  );
}
