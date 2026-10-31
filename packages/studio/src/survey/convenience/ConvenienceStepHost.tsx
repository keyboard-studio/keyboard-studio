// ConvenienceStepHost — the manifest step component for the `convenience`
// step (spec 090 T024): the gallery-host wrapper around
// ConvenienceCharsStep, the `retained-convenience-chars` module's
// renderer. The wrapper owns nothing but the hosting: it reads the
// recorded decision, composes the live host deps, and hands the manifest
// step's navigation to the renderer through GalleryStepContext.

import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import retainedConvenienceCharsModule from "../questions/gallery/retainedConvenienceChars.ts";

const ConvenienceStepHost = makeGalleryStepHost(
  retainedConvenienceCharsModule,
  "retained-convenience-chars",
  "convenience",
);

export { ConvenienceStepHost };
