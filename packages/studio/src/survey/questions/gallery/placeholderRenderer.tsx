// placeholderRenderer — the renderer every gallery module stub starts with
// (spec 090 T008). It renders nothing: until a story migrates a step onto
// its module, the module is registered for coverage/ordering only and no
// runtime path renders it (the gallery host becomes a step's renderer only
// in that step's story change, which also replaces this placeholder with
// the real component). Rendering nothing — rather than a "not migrated"
// banner — keeps the stub incapable of changing any visible behaviour if
// it were ever mounted by mistake.

import type { DecisionRendererProps } from "../../../decisions/decisionTypes.ts";

/** Stub renderer for unmigrated gallery modules; replaced per story. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UnmigratedGalleryRenderer(_props: DecisionRendererProps<any>): null {
  return null;
}
