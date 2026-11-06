import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import missingLettersModule from "../questions/gallery/missingLetters.ts";
import { MissingLettersRenderer } from "./MissingLettersStep.tsx";

export const MissingLettersHost = makeGalleryStepHost(
  missingLettersModule,
  "missing-letters-review",
  "open_missing_letters",
  MissingLettersRenderer,
);
