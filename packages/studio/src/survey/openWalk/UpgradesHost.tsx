import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import upgradesModule from "../questions/gallery/upgrades.ts";
import { UpgradesRenderer } from "./UpgradesStep.tsx";

export const UpgradesHost = makeGalleryStepHost(upgradesModule, "upgrades-review", "open_upgrades", UpgradesRenderer);
