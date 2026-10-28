// TouchSeedSourceHost — the manifest step component for the
// `touch_seed_source` step (spec 090 T012): the gallery-host wrapper
// around TouchSeedSourceRenderer.
//
// The step is a side trail (declared screen gate, registry.ts): it is
// asked only while no `touch-seed-source` decision is recorded — that
// gating lives in the registry declaration and is unchanged by the
// gallery migration. The
// wrapper hands the host the recorded decision and the step navigation
// (via GalleryStepContext — the renderer publishes its own Back/Confirm).

import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import touchSeedSourceModule from "../questions/gallery/touchSeedSource.ts";

const TouchSeedSourceHost = makeGalleryStepHost(
  touchSeedSourceModule,
  "touch-seed-source",
  "touch_seed_source",
);

export { TouchSeedSourceHost };
