// The authoring-track decision's provider, now that the track question is
// gone. No flow question asks it any more: the start screen records it
// (New = copy, Open = adapt), or StudioShell defaults it to copy at
// instantiation. But the decision still exists, and modules still order
// on it (il_author_name and project_display_name screen-require it, the
// character-inventory gallery module requires it) — and orderDecisions
// throws on a requires edge with no provider in the module list. So the
// decision keeps a module, just not a question: this module provides
// authoring-track and renders nothing. It joins decisionModules grouped
// under "choose_base", whose custom singleton screen it is intra-step to
// (deriveScreens: a question module whose group names a singleton forms
// no top-level screen, wherever the sort places it) — the track is in
// force from the base choice onward, so the choose_base screen is its
// home. It is deliberately NOT in questionRegistry (no flow renders it,
// the content extractor never sees it) and NOT a flow module. It also
// lives at the questions/ root, not in a phase folder, so the on-disk
// question-module glob (survey/questions/*/*.ts) does not sweep it into
// the question contract suite — it is a system provider, not a question.
//
// Its one requires — "base-keyboard" — is the edge the deleted
// track_choice module carried (settled by the choose_base gallery
// module). It is what keeps the walk order: without it, the sort's
// lowest-index tie-break would emit the attribution modules (which only
// need target-script + this provider) ahead of the layout/base-picker
// gallery modules, and the frozen screen sequence would reorder. The
// track is settled once the base is known — on Copy at instantiation,
// on Open at the open entry — so the edge is true, not just ordering
// ballast. Subset decision flows that include this module must also
// include a base-keyboard provider (see test/baseKeyboardProvider.ts).

import type { QuestionModule } from "../types.ts";

export const authoringTrackProviderModule: QuestionModule = {
  definition: {
    id: "authoring-track",
    type: "notice",
    prompt: "Authoring track (recorded by the start screen, not asked here)",
    next: null,
  },
  provides: ["authoring-track"],
  requires: ["base-keyboard"],
  inputs: [],
  writes: [],
  fixtures: {
    valid: [
      { value: "copy", note: "start screen New entry" },
      { value: "adapt", note: "start screen Open entry" },
    ],
    invalid: [],
  },
};
