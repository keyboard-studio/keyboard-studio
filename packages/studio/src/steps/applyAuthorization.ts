// applyAuthorization — the channel authorization shared by 089's runner and
// 090's gallery host (spec 089 contracts/apply-contract.md A3).
//
// Extracted from steps/reducer.ts (spec 090 T012): the gallery host imports
// this module, and gallery renderers import the host (for its step
// context). reducer.ts imports the question registry, so hosting the check
// there put the registry in every gallery module's import graph and closed
// a cycle (registry → gallery module → renderer → host → reducer →
// registry) that left `flowModules` uninitialized when the step layer
// loaded through it. This module is a leaf: types only, no registry, no
// stores.

import type { IRPath } from "@keyboard-studio/contracts";
import type { Decision } from "../decisions/decisionTypes.ts";
import type { WorkingCopyPatch } from "../survey/types.ts";

/**
 * Thrown when a module's `apply()` returns a channel it is not authorized
 * to write (A3). Carries the question id and the offending channel; nothing
 * from the patch is applied — authorization is checked for the whole patch
 * before the sink is called.
 */
export class ApplyChannelError extends Error {
  /** The question whose apply returned the unauthorized channel. */
  readonly questionId: string;
  /** The unauthorized channel name. */
  readonly channel: keyof WorkingCopyPatch;

  constructor(questionId: string, channel: keyof WorkingCopyPatch) {
    super(
      `apply() for question "${questionId}" returned unauthorized channel "${channel}". ` +
        `No part of the patch was applied (spec 089, apply-contract A3).`,
    );
    this.name = "ApplyChannelError";
    this.questionId = questionId;
    this.channel = channel;
  }
}

/**
 * The channel authorization table (A3): an overlay channel may be returned
 * only by a module providing the named decision. The `ir` channel is not
 * listed — it is authorized for any module with an `apply` and non-empty
 * declared `writes`, and contained by the checked merge (A4).
 */
const APPLY_CHANNEL_AUTHORIZATION: ReadonlyArray<{
  channel: keyof WorkingCopyPatch;
  decisionId: Decision["id"];
}> = [
  { channel: "identity", decisionId: "project-keyboard-id" },
  { channel: "attribution", decisionId: "copyright-holder" },
  { channel: "helpDocs", decisionId: "help-welcome-paragraph" },
  { channel: "historyEntryState", decisionId: "help-welcome-paragraph" },
];

/**
 * Verify a patch's channels against the A3 authorization table. Returns
 * true when the patch carries at least one channel (the sink should be
 * called); an unauthorized channel throws {@link ApplyChannelError} before
 * anything is applied — no partial patch (A3).
 *
 * Shared by `applyDecisionEffects` (steps/reducer.ts) and by the gallery
 * host (steps/galleryHost.tsx, spec 090 T005), which runs gallery modules'
 * applies through exactly the same authorization as question modules'.
 */
export function assertPatchChannelsAuthorized(
  questionId: string,
  mod: { provides?: readonly Decision["id"][]; writes?: readonly IRPath[] },
  patch: WorkingCopyPatch,
): boolean {
  const writes = mod.writes ?? [];
  const channels = (Object.keys(patch) as Array<keyof WorkingCopyPatch>).filter(
    (channel) => patch[channel] !== undefined,
  );
  if (channels.length === 0) return false;
  for (const channel of channels) {
    if (channel === "ir") {
      if (writes.length === 0) throw new ApplyChannelError(questionId, channel);
      continue;
    }
    const rule = APPLY_CHANNEL_AUTHORIZATION.find((r) => r.channel === channel);
    if (rule === undefined || !(mod.provides ?? []).includes(rule.decisionId)) {
      throw new ApplyChannelError(questionId, channel);
    }
  }
  return true;
}
