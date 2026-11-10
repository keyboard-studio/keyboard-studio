// emitKmnWriter -- the studio side of the single .kmn emit stage (spec 118).
//
// Builds the engine `EmitState` for one file as the working copy holds it and
// writes the result back. Every projection step that changes a `.kmn` goes
// through here, so Open mode (splice, consent for a reformat) and the other
// modes are decided in one place. Kept free of the projection's own imports so
// the projection can use it without a cycle.

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { emitStage } from "@keyboard-studio/engine";

export interface KmnWriterContext {
  vfs: VirtualFS;
  /** Present when the working copy was opened for update (Open mode). */
  openMode: { consentedReemit?: boolean } | undefined;
  warnings: string[];
  reformatRequired: string[];
}

/** Writes a changed `.kmn`; `currentText`/`currentIr` are the file as the VFS holds it right now. */
export function writeKmnThroughEmit(
  ctx: KmnWriterContext,
  path: string,
  currentText: string,
  currentIr: KeyboardIR,
  nextIr: KeyboardIR,
): void {
  const state = { currentText, currentIr, ir: nextIr };
  const result =
    ctx.openMode === undefined
      ? emitStage(state, { kind: "copy" })
      : emitStage(state, {
          kind: "open",
          ...(ctx.openMode.consentedReemit !== undefined
            ? { consentedReemit: ctx.openMode.consentedReemit }
            : {}),
        });
  if (result.ok) {
    ctx.vfs.set(path, result.text, false);
    if (result.reformatted !== undefined) {
      ctx.warnings.push(
        `[open] ${path} was reformatted with the author's agreement (${result.reformatted.reason})`,
      );
    }
    return;
  }
  ctx.reformatRequired.push(path);
  ctx.warnings.push(
    `[open] ${path} cannot be updated in place (${result.needsConsent.reason}); it needs the author's agreement to be reformatted and was left unchanged`,
  );
}
