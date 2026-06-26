import type { RemovalCapability } from '@keyboard-studio/contracts';
import type { CarveNode } from '../../lib/irToCarveNodes.ts';
import { displayChar } from '../../lib/irToCarveNodes.ts';
import { InfoIcon } from './carveShared.tsx';
import { KeySeq } from './KeySeq.tsx';
import { useHoverInfoStore } from '../../stores/hoverInfoStore.ts';

export interface InfoContent {
  title: string;
  body: string;
}

export function keyHint(off: boolean): string {
  if (off === false) {
    return "Click to remove. These keys will no longer type this character.";
  }
  return "Click to restore. These keys will type this character again.";
}

export function capabilityHint(capability: RemovalCapability): string {
  switch (capability) {
    case 'removable:simple':
      return "Direct key-to-character rule — safe to remove on its own.";
    case 'removable:slot-fill':
      return "Part of a deadkey character set. Removing this one leaves the rest working.";
    case 'not-removable:opaque':
      return "Uses advanced syntax the editor can't rewrite, so removing it here won't take effect.";
    case 'not-removable:context-sensitive':
      return "Only produces this character after certain keys are pressed, so removing it on its own isn't supported yet.";
    case 'not-removable:unknown':
      return "The editor couldn't determine whether this is safe to remove.";
  }
}

export function infoFor(node: CarveNode | undefined): InfoContent {
  if (node === undefined) {
    return {
      title: "Carving your keyboard's rules",
      body: "This keyboard came with rules for typing many different characters. Carving lets you keep only the ones your language needs. Pick an item on the left to see what it does and whether it's safe to remove.",
    };
  }

  if (node.kind === 'pattern') {
    return {
      title: `Pattern: ${node.name}`,
      body: "A pattern is a set of related rules the tool recognized and grouped together, like the rules for typing accented letters. Each tile below pairs the keys you press with the character they produce. Remove the whole pattern, or click one tile to drop just that mapping.",
    };
  }

  if (node.kind === 'group') {
    return {
      title: `Rule group: ${node.name}`,
      body: "A group is a batch of rules from the original keyboard that didn't match any recognized pattern. Each tile below pairs the keys you press with the character they produce. Remove the whole group, or click one tile to drop just that mapping.",
    };
  }

  if (node.kind === 'store') {
    const u = node.storeUsage;
    if (u !== undefined && u.asSource && u.asOutput) {
      return {
        title: `Store: ${node.name} (input + output)`,
        body: "A set of characters that some rules depend on as you type and others use to produce output. Removing it affects rules on both sides, so drop it only if your language needs neither.",
      };
    }
    if (u !== undefined && u.asSource) {
      return {
        title: `Store: ${node.name} (input)`,
        body: "A set of characters that some of this keyboard's rules depend on as you type. Removing it stops those rules from working. Safe to drop only if your language never uses these characters.",
      };
    }
    if (u !== undefined && u.asOutput) {
      return {
        title: `Store: ${node.name} (output)`,
        body: "A set of characters the keyboard can produce as output. Remove it and the rules that insert these characters stop producing them. Safe to drop if your language doesn't need that output.",
      };
    }
    if (u !== undefined) {
      return {
        title: `Store: ${node.name}`,
        body: "These characters are used by some of the keyboard's rules. Removing them may change how those rules behave.",
      };
    }
    if (u === undefined && node.referencedByLabel !== undefined) {
      return {
        title: `Store: ${node.name} (pattern-owned)`,
        body: `These characters belong to the "${node.referencedByLabel}" pattern. To change or remove them, work through that pattern rather than editing this list directly.`,
      };
    }
    // !storeUsage, no referencedByLabel → unused
    return {
      title: `Store: ${node.name} (unused)`,
      body: "These characters aren't used by any rule in the keyboard. Removing them is safe and won't change how it behaves.",
    };
  }

  // kind === 'raw'
  return {
    title: `Advanced rule: ${node.name}`,
    body: "A rule too complex for the editor to show or rewrite. These often look like junk but usually do real work. Leave it unless you're certain this behaviour is unused by your language.",
  };
}

const stripShell = {
  flexShrink: 0,
  borderTop: '1px solid var(--app-border)',
  padding: '14px 24px',
  background: 'var(--app-surface)',
  color: 'var(--app-text)',
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  minHeight: 56,
} as const;

// InfoView — no props. Sole subscriber of the hoverInfoStore `info` slice.
// The shell is always mounted with a stable minHeight so the layout never shifts.
export function InfoView() {
  const info = useHoverInfoStore((s) => s.info);

  if (info == null) {
    return <div role="note" aria-label="Item info" style={stripShell} />;
  }

  if (info.kind === 'key') {
    return (
      <div role="note" aria-label="Item info" style={stripShell}>
        <span style={{ flexShrink: 0, marginTop: 2, color: 'var(--app-text-subtle)' }}>
          <InfoIcon size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '600 13.5px/1.3 var(--app-font)', color: 'var(--app-text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--app-text-subtle)', fontWeight: 400 }}>Key</span>
            <KeySeq keys={info.keys} />
            <span style={{ color: 'var(--app-text-subtle)', fontSize: 11 }}>types</span>
            <span style={{ font: "400 18px/1 'Lora', Georgia, serif", color: 'var(--app-text)' }}>
              {displayChar(info.ch)}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--app-text-muted)' }}>
            {keyHint(info.off)}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--app-text-subtle)' }}>
            {capabilityHint(info.capability)}
          </div>
        </div>
      </div>
    );
  }

  if (info.kind === 'node') {
    const c = infoFor(info.node);
    return (
      <div role="note" aria-label="Item info" style={stripShell}>
        <span style={{ flexShrink: 0, marginTop: 2, color: 'var(--app-text-subtle)' }}>
          <InfoIcon size={16} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '600 13.5px/1.3 var(--app-font)', color: 'var(--app-text)', marginBottom: 4 }}>
            {c.title}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--app-text-muted)' }}>
            {c.body}
          </div>
        </div>
      </div>
    );
  }

  // kind === 'text'
  return (
    <div role="note" aria-label="Item info" style={stripShell}>
      <span style={{ flexShrink: 0, marginTop: 2, color: 'var(--app-text-subtle)' }}>
        <InfoIcon size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: '600 13.5px/1.3 var(--app-font)', color: 'var(--app-text)', marginBottom: 4 }}>
          {info.title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--app-text-muted)' }}>
          {info.body}
        </div>
      </div>
    </div>
  );
}
