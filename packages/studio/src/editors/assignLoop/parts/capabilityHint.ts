// capabilityHint — the one-sentence explanation of a RemovalCapability, shown
// as the reason text on a mechanism the author cannot (or can safely) remove.
//
// A pure (non-component) function: real components pass `i18n` from
// useLingui(); unit tests call it with no `i18n` argument and assert on the
// English source text — see resolveMessage's doc comment for why the optional
// `i18n` param + msg()/resolveMessage() pattern is used rather than plain
// string literals. The message ids keep their original `infoView` prefix so
// existing translations stay linked.

import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import { resolveMessage } from '../../../lib/i18nResolve.ts';

export function capabilityHint(capability: RemovalCapability, i18n?: I18n): string {
  switch (capability) {
    case 'removable:simple':
      return resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.capabilityHint.removableSimple',
          message: 'Direct key-to-character rule — safe to remove on its own.',
        }),
      );
    case 'removable:slot-fill':
      return resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.capabilityHint.removableSlotFill',
          message: 'Part of a deadkey character set. Removing this one leaves the rest working.',
        }),
      );
    case 'not-removable:opaque':
      return resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.capabilityHint.notRemovableOpaque',
          message: "Uses advanced syntax the editor can't rewrite, so removing it here won't take effect.",
        }),
      );
    case 'not-removable:context-sensitive':
      return resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.capabilityHint.notRemovableContextSensitive',
          message: "Only produces this character after certain keys are pressed, so removing it on its own isn't supported yet.",
        }),
      );
    case 'not-removable:unknown':
      return resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.capabilityHint.notRemovableUnknown',
          message: "The editor couldn't determine whether this is safe to remove.",
        }),
      );
  }
}
