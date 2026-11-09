import { makeGalleryStepHost } from "../makeGalleryStepHost.tsx";
import languageListModule from "../questions/gallery/languageList.ts";

export const LanguageListHost = makeGalleryStepHost(languageListModule, "language-list", "open_languages");
