// CarveDecisionRenderer — the carved-layout module's renderer
// (spec 090 T032): the carve gallery under the decision host. The
// gallery edits the working copy's carve overlay directly (its own
// write path — editors/carve, ratified record-from-working-copy
// precedent, D-090-31); on completion the overlay's value leaves
// through onChange as the decision value. Lives in the survey
// feature home because gallery modules may import only survey/**
// and packages (the DeadkeyDecisionRenderer precedent).

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { CarvedLayoutValue } from "./carveValue.ts";
import { currentCarvedLayoutValue } from "./carveValue.ts";
import { CarveGalleryV2 } from "../../editors/carve/CarveGalleryV2.tsx";

export function CarveDecisionRenderer({
  onChange,
}: DecisionRendererProps<CarvedLayoutValue>) {
  return (
    <CarveGalleryV2 onComplete={() => onChange(currentCarvedLayoutValue())} />
  );
}
