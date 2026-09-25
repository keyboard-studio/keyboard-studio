// Stub for editors/carve/CarveGalleryV2.tsx, the carve gallery carveAdapter.tsx renders.

export function CarveGalleryV2({ onComplete, onBack }: { onComplete: () => void; onBack?: () => void }) {
  return (
    <div data-testid="stage-carve">
      <button type="button" data-testid="carve-complete" onClick={onComplete}>
        carve-complete
      </button>
      {onBack !== undefined && (
        <button type="button" data-testid="carve-back" onClick={onBack}>
          carve-back
        </button>
      )}
    </div>
  );
}
