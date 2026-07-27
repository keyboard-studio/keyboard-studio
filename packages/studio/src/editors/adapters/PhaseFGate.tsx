// PhaseFGate — the Phase F ("help") hard-gate wrapper (the Phase F hard gate).
//
// Unlike the gallery leave-warnings (MechanismGallery / TouchGallery),
// there is NO "come back later" escape at Phase F: the author must finish
// every inventory character in every modality actually engaged this session
// before advancing past "help" (advance.ts's "help" case reads
// AdvanceContext.allCharactersImplemented and refuses to advance while it is
// false — see StepHost's context build, which computes the SAME value this
// component derives independently for display).
//
// "No dead button" (contract requirement): rather than let the author fill
// out Phase F and hit an inert Done button, this wraps the normal Phase F
// content in a blocking ConfirmDialog (single action, no secondaryLabel) that
// explains WHY (which characters, which modality) and routes them back to the
// relevant gallery via the session store's `backToUnfinishedGallery` action — a
// BACK primitive (pops the "help" entry the touch-forward gate pushed), never
// the forward-push `advance` (see backToUnfinishedGallery's docstring for the P0
// history-corruption regression that fix replaced: routing back via `advance`
// left a stale "help" history entry that a LATER ordinary Back traversal
// would resurface, making Back from the gallery route back to Phase F).
//
// Coverage truth is the SAME shared helper (lib/unimplementedInventory.ts)
// both galleries use — do not fork the definition here.

import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useInventoryCoverageGate } from "../../hooks/useInventoryCoverageGate.ts";
import { formatCoverageBannerParts } from "../../lib/unimplementedInventory.ts";
import { ConfirmDialog } from "../assignLoop/parts/ConfirmDialog.tsx";
import { PhaseFStepFactoryComponent } from "./flowStepOptions.tsx";
import type { EditorStepProps } from "../../steps/types.ts";

export function PhaseFGate(props: EditorStepProps): React.ReactElement {
  const { t } = useLingui();

  const sessionBackToUnfinishedGallery = useSurveySessionStore((s) => s.backToUnfinishedGallery);

  // Single shared hook (hooks/useInventoryCoverageGate.ts) — do not re-derive
  // the desktop-always / touch-only-if-authored booleans locally; StepHost's
  // gate and OutputScreen's download gate use the same hook.
  const gate = useInventoryCoverageGate();
  const { unimplementedDesktop, unimplementedTouch, blockedOnDesktop, blockedOnTouch, blocked, touchLayoutCorrupted } =
    gate;

  const totalCount = unimplementedDesktop.length + (blockedOnTouch ? unimplementedTouch.length : 0);
  const countLabel = t({
    id: "editor.help.unimplementedGate.count",
    message: plural(totalCount, { one: "# character", other: "# characters" }),
  });

  // Named string locals computed BEFORE the JSX below — the message body
  // must not embed conditional (`&&`) JSX expressions as direct <Trans>
  // children (see the module comments in MechanismGallery/TouchGallery on
  // why that broke the fr catalog before).
  const desktopGalleryLabel = t({
    id: "editor.assignLoop.mechanismGalleryHeading",
    message: "Mechanism Gallery",
  });
  const touchGalleryLabel = t({ id: "editor.assignLoop.touchGalleryHeading", message: "Touch Gallery" });
  const { uncoveredCharsList, targetGalleryLabel } = formatCoverageBannerParts(gate, {
    desktopLabel: desktopGalleryLabel,
    touchLabel: touchGalleryLabel,
  });

  // Routes back to whichever gallery still has work — desktop first (it
  // gates touch's own completion too, so fixing it first is always correct)
  // — EXCEPT when the touch layout is corrupted: that can only be fixed by
  // re-deriving it in the touch gallery, so it takes priority over the
  // desktop-first ordering. A BACK action (backToUnfinishedGallery), not
  // `advance` — see the module comment and that action's docstring for why:
  // `advance` would push a stale "help" entry onto history that a later
  // ordinary Back traversal would resurface.
  const handleGoBack = () => {
    sessionBackToUnfinishedGallery(
      touchLayoutCorrupted ? "touch" : blockedOnDesktop ? "mechanisms" : "touch",
    );
  };

  return (
    <>
      <PhaseFStepFactoryComponent {...props} />
      <ConfirmDialog
        open={blocked}
        title={t({
          id: "editor.help.unimplementedGate.title",
          message: "Finish your keyboard before continuing",
        })}
        body={
          <div>
            <p style={{ margin: 0 }}>
              {touchLayoutCorrupted ? (
                <Trans id="editor.help.unimplementedGate.touchCorrupted">
                  Your touch layout couldn't be read and may be corrupted. Re-derive it
                  from the {targetGalleryLabel} to continue.
                </Trans>
              ) : (
                <Trans id="editor.help.unimplementedGate.message">
                  {countLabel} still need an implementation before you can finish:{" "}
                  {uncoveredCharsList}. Go back to the {targetGalleryLabel} to finish them.
                </Trans>
              )}
            </p>
          </div>
        }
        primaryLabel={t({ id: "editor.help.unimplementedGate.goBack", message: "Go back and finish" })}
        onPrimary={handleGoBack}
      />
    </>
  );
}
