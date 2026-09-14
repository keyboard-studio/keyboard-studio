// docLevelBadge — the ONE label + tone mapping for the base documentation
// classification badge (spec 076 FR-008), shared by the choose-base
// suggestion cards (editors/panels/BaseResolution.tsx) and the selected-base
// MetadataCard (components/MetadataCard.tsx) so the two surfaces can never
// disagree about the wording or colour of the same level.
//
// `unknown` is deliberately not a case: callers render NO badge for a base
// whose profile has not been computed, so an author never reads "No
// documentation" when the truth is merely "not classified yet" (FR-008).

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { BaseDocLevel } from "@keyboard-studio/contracts";
import { resolveMessage } from "./i18nResolve.ts";
import type { BadgeTone } from "../ui/Badge.tsx";

export type KnownDocLevel = Exclude<BaseDocLevel, "unknown">;

export function buildDocLevelLabel(level: KnownDocLevel, i18n?: I18n): string {
  switch (level) {
    case "none":
      return resolveMessage(i18n, msg({ id: "base.docs.level.none", message: "No documentation" }));
    case "minimal":
      return resolveMessage(i18n, msg({ id: "base.docs.level.minimal", message: "Minimal documentation" }));
    case "full":
      return resolveMessage(i18n, msg({ id: "base.docs.level.full", message: "Full documentation" }));
  }
}

export const DOC_LEVEL_TONE: Record<KnownDocLevel, BadgeTone> = {
  none: "subtle",
  minimal: "default",
  full: "success",
};
