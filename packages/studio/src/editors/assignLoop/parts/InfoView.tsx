import type React from 'react';
import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import type { RemovalCapability } from '@keyboard-studio/contracts';
import type { CarveNode } from '../../../lib/irToCarveNodes.ts';
import { displayChar } from '../../../lib/irToCarveNodes.ts';
import { InfoIcon, resolveMessage } from './carveShared.tsx';
import { KeySeq } from './KeySeq.tsx';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

export interface InfoContent {
  title: string;
  body: string;
}

// keyHint/capabilityHint/infoFor/infoForNode are pure (non-component)
// functions called BOTH from real components (which pass `i18n` from
// useLingui(), below) AND directly from unit tests (which call them with no
// `i18n` argument, asserting on the English source text) — see
// resolveMessage's doc comment in carveShared.tsx for why the optional
// `i18n` param + msg()/resolveMessage() pattern is used here rather than
// plain string literals.

export function keyHint(off: boolean, i18n?: I18n): string {
  if (off === false) {
    return resolveMessage(
      i18n,
      msg({
        id: 'editor.assignLoop.infoView.keyHint.active',
        message: 'Click to remove. These keys will no longer type this character.',
      }),
    );
  }
  return resolveMessage(
    i18n,
    msg({
      id: 'editor.assignLoop.infoView.keyHint.removed',
      message: 'Click to restore. These keys will type this character again.',
    }),
  );
}

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

/**
 * #525 FOUNDATION slice — the single suggestion-reason sentence appended to a
 * node's info body when recommendation === 'high'. Slice-1 has exactly one
 * signal (absence from the confirmed inventory), so the text is written out
 * directly rather than dispatched through a reason-code switch.
 * TODO(#525): once the Unicode-block and Phase-C mechanism-not-enabled
 * signals land, this needs to become a per-reason lookup (mirroring
 * capabilityHint above) rather than a single fixed sentence.
 */
const SUGGESTED_REMOVAL_HINT = msg({
  id: 'editor.assignLoop.infoView.suggestedRemovalHint',
  message: 'Suggested to remove — none of the characters it produces are in your confirmed inventory.',
});

export function infoFor(node: CarveNode | undefined, i18n?: I18n): InfoContent {
  if (node === undefined) {
    return {
      title: resolveMessage(
        i18n,
        msg({ id: 'editor.assignLoop.infoView.overview.title', message: "Carving your keyboard's rules" }),
      ),
      body: resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.overview.body',
          message:
            "This keyboard came with rules for typing many different characters. Carving lets you keep only the ones your language needs. Pick an item on the left to see what it does and whether it's safe to remove.",
        }),
      ),
    };
  }

  const content = infoForNode(node, i18n);
  if (node.recommendation === 'high') {
    return { ...content, body: `${content.body} ${resolveMessage(i18n, SUGGESTED_REMOVAL_HINT)}` };
  }
  return content;
}

function infoForNode(node: CarveNode, i18n?: I18n): InfoContent {
  if (node.kind === 'pattern') {
    return {
      title: resolveMessage(
        i18n,
        msg({ id: 'editor.assignLoop.infoView.pattern.title', message: `Pattern: ${{ name: node.name }}` }),
      ),
      body: resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.pattern.body',
          message:
            'A pattern is a set of related rules the tool recognized and grouped together, like the rules for typing accented letters. Each tile below pairs the keys you press with the character they produce. Remove the whole pattern, or click one tile to drop just that mapping.',
        }),
      ),
    };
  }

  if (node.kind === 'group') {
    return {
      title: resolveMessage(
        i18n,
        msg({ id: 'editor.assignLoop.infoView.group.title', message: `Rule group: ${{ name: node.name }}` }),
      ),
      body: resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.group.body',
          message:
            "A group is a batch of rules from the original keyboard that didn't match any recognized pattern. Each tile below pairs the keys you press with the character they produce. Remove the whole group, or click one tile to drop just that mapping.",
        }),
      ),
    };
  }

  if (node.kind === 'store') {
    const u = node.storeUsage;
    if (u !== undefined && u.asSource && u.asOutput) {
      return {
        title: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.inputOutput.title',
            message: `Store: ${{ name: node.name }} (input + output)`,
          }),
        ),
        body: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.inputOutput.body',
            message:
              'A set of characters that some rules depend on as you type and others use to produce output. Removing it affects rules on both sides, so drop it only if your language needs neither.',
          }),
        ),
      };
    }
    if (u !== undefined && u.asSource) {
      return {
        title: resolveMessage(
          i18n,
          msg({ id: 'editor.assignLoop.infoView.store.input.title', message: `Store: ${{ name: node.name }} (input)` }),
        ),
        body: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.input.body',
            message:
              "A set of characters that some of this keyboard's rules depend on as you type. Removing it stops those rules from working. Safe to drop only if your language never uses these characters.",
          }),
        ),
      };
    }
    if (u !== undefined && u.asOutput) {
      return {
        title: resolveMessage(
          i18n,
          msg({ id: 'editor.assignLoop.infoView.store.output.title', message: `Store: ${node.name} (output)` }),
        ),
        body: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.output.body',
            message:
              "A set of characters the keyboard can produce as output. Remove it and the rules that insert these characters stop producing them. Safe to drop if your language doesn't need that output.",
          }),
        ),
      };
    }
    if (u !== undefined) {
      return {
        title: resolveMessage(
          i18n,
          msg({ id: 'editor.assignLoop.infoView.store.referenced.title', message: `Store: ${node.name}` }),
        ),
        body: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.referenced.body',
            message: "These characters are used by some of the keyboard's rules. Removing them may change how those rules behave.",
          }),
        ),
      };
    }
    if (u === undefined && node.referencedByLabel !== undefined) {
      return {
        title: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.patternOwned.title',
            message: `Store: ${node.name} (pattern-owned)`,
          }),
        ),
        body: resolveMessage(
          i18n,
          msg({
            id: 'editor.assignLoop.infoView.store.patternOwned.body',
            message: `These characters belong to the "${{ patternLabel: node.referencedByLabel }}" pattern. To change or remove them, work through that pattern rather than editing this list directly.`,
          }),
        ),
      };
    }
    // !storeUsage, no referencedByLabel → unused
    return {
      title: resolveMessage(
        i18n,
        msg({ id: 'editor.assignLoop.infoView.store.unused.title', message: `Store: ${{ name: node.name }} (unused)` }),
      ),
      body: resolveMessage(
        i18n,
        msg({
          id: 'editor.assignLoop.infoView.store.unused.body',
          message: "These characters aren't used by any rule in the keyboard. Removing them is safe and won't change how it behaves.",
        }),
      ),
    };
  }

  // kind === 'raw'
  return {
    title: resolveMessage(
      i18n,
      msg({ id: 'editor.assignLoop.infoView.raw.title', message: `Advanced rule: ${{ name: node.name }}` }),
    ),
    body: resolveMessage(
      i18n,
      msg({
        id: 'editor.assignLoop.infoView.raw.body',
        message:
          "A rule too complex for the editor to show or rewrite. These often look like junk but usually do real work. Leave it unless you're certain this behaviour is unused by your language.",
      }),
    ),
  };
}

const panelShell: React.CSSProperties = {
  flexShrink: 0,
  borderTop: '1px solid var(--app-border)',
  display: 'flex',
  flexDirection: 'column',
  height: 116,
};

const titleBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 16px',
  height: 36,
  flexShrink: 0,
  background: 'color-mix(in srgb, var(--app-surface) 70%, var(--app-bg) 30%)',
  borderBottom: '1px solid var(--app-border)',
};

const iconWrap: React.CSSProperties = {
  flexShrink: 0,
  color: 'var(--app-text-subtle)',
  display: 'flex',
  alignItems: 'center',
};

const titleText: React.CSSProperties = {
  font: '600 13px/1.3 var(--app-font)',
  color: 'var(--app-text)',
};

const bodyArea: React.CSSProperties = {
  padding: '8px 16px 10px',
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--app-text-muted)',
  overflowY: 'auto',
  flex: 1,
};

function InfoPanel({ title, body }: { title: React.ReactNode; body: React.ReactNode }) {
  const { t } = useLingui();
  return (
    <div role="note" aria-label={t({ id: 'editor.assignLoop.infoView.itemInfoAriaLabel', message: 'Item info' })} style={panelShell}>
      <div style={titleBar}>
        <span style={iconWrap}><InfoIcon size={16} /></span>
        {typeof title === 'string' ? <span style={titleText}>{title}</span> : title}
      </div>
      <div style={bodyArea}>{body}</div>
    </div>
  );
}

// InfoView — no props. Sole subscriber of the hoverInfoStore `info` slice.
// Fixed height so the layout never shifts regardless of content state.
export function InfoView() {
  const { i18n } = useLingui();
  const info = useHoverInfoStore((s) => s.info);

  if (info == null) {
    const c = infoFor(undefined, i18n);
    return <InfoPanel title={c.title} body={c.body} />;
  }

  if (info.kind === 'key') {
    const isNotRemovable = info.capability.startsWith('not-removable:');
    const owningPattern = info.owners?.find((o) => o.kind === 'pattern');
    const keyTitle = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', font: '600 13px/1.3 var(--app-font)', color: 'var(--app-text)' }}>
        <span style={{ fontSize: 11, color: 'var(--app-text-subtle)', fontWeight: 400 }}>
          <Trans id="editor.assignLoop.infoView.keyEyebrow">Key</Trans>
        </span>
        <KeySeq keys={info.keys} />
        <span style={{ color: 'var(--app-text-subtle)', fontSize: 11 }}>
          <Trans id="editor.assignLoop.infoView.typesEyebrow">types</Trans>
        </span>
        <span style={{ font: "400 18px/1 'Lora', Georgia, serif", color: 'var(--app-text)' }}>
          {displayChar(info.ch)}
        </span>
      </div>
    );
    const keyBody = (
      <>
        <div style={{ marginBottom: 3 }}>{keyHint(info.off, i18n)}</div>
        {isNotRemovable && owningPattern !== undefined && (
          <div style={{ marginBottom: 3, fontSize: 12, lineHeight: 1.5, color: 'var(--app-text-subtle)' }}>
            <Trans id="editor.assignLoop.infoView.managedByPattern">
              Managed by the {owningPattern.label} pattern.
            </Trans>
          </div>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--app-text-subtle)' }}>
          {capabilityHint(info.capability, i18n)}
        </div>
      </>
    );
    return <InfoPanel title={keyTitle} body={keyBody} />;
  }

  if (info.kind === 'node') {
    const c = infoFor(info.node, i18n);
    return <InfoPanel title={c.title} body={c.body} />;
  }

  // kind === 'text'
  return <InfoPanel title={info.title} body={info.body} />;
}
