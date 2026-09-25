// Stub for editors/assignLoop/TouchGallery.tsx. Continue completes with
// whatever a test put in `touchEAssignments.current` beforehand (default: no
// assignments).

/** The assignments the stub's Continue button emits. Tests set it before clicking `e-complete`. */
export const touchEAssignments = { current: [] as unknown[] };

export function TouchGallery({ onComplete, onBack }: { onComplete: (a: unknown[]) => void; onBack: () => void }) {
  return (
    <div data-testid="stage-E">
      <button type="button" data-testid="e-complete" onClick={() => onComplete(touchEAssignments.current)}>
        Continue
      </button>
      <button type="button" data-testid="e-back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
