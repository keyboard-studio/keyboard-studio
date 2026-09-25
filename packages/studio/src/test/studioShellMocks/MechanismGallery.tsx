// Stub for editors/assignLoop/MechanismGallery.tsx.

export function MechanismGallery({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  return (
    <div data-testid="stage-mechanisms">
      <button type="button" data-testid="mechanisms-complete" onClick={onComplete}>
        mechanisms-complete
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="mechanisms-back" onClick={onBack}>
          mechanisms-back
        </button>
      )}
    </div>
  );
}
