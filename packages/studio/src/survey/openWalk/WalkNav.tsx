// WalkNav: the Back and Continue buttons an Open-walk page ends with (spec 111
// FR-031: every step offers Continue). Reads the step's navigation from the
// gallery step context, as the Languages page does.

import { Trans } from "@lingui/react/macro";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { Button } from "../../ui/Button.tsx";

export function WalkNav({ onContinue }: { onContinue: () => void }): React.JSX.Element {
  const { onBack } = useGalleryStepContext();
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
      {onBack !== undefined && (
        <Button onClick={onBack}>
          <Trans id="openWalk.back">Back</Trans>
        </Button>
      )}
      <Button variant="primary" onClick={onContinue}>
        <Trans id="openWalk.continue">Continue</Trans>
      </Button>
    </div>
  );
}
