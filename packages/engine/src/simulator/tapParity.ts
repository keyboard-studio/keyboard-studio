/**
 * Tap-behaviour parity differ — spec 104 T014 (FR-014, SC-002).
 *
 * Compares two compiled keyboards by DRIVING both through the tap harness
 * ({@link TouchTapSession}) and diffing the observed behaviour, so a copy
 * is proven to type what its source typed — not merely to contain similar
 * files. Three probe classes, all over the union of both layouts' keys:
 *
 *  1. TABLE — every key × layer tapped on an empty buffer.
 *  2. SEEDED CONTEXT (SC-002) — every key tapped after a letter ("a"),
 *     after a space (" "), and after a digit ("5"): the contexts the
 *     corpus's context-bound keys (diablock-guarded marks above all)
 *     actually branch on.
 *  3. DEADKEY PAIRS — for every key whose tap leaves a deadkey pending,
 *     that key tapped before every other key on its layer, on one shared
 *     text store ({@link TouchTapSession.tapPair}): deadkey+key is the
 *     third SC-002 context class and is invisible to single taps.
 *
 * A key present on one side only is a diff, never a skip. The result is a
 * plain data report: `equal` plus one entry per observed difference,
 * naming the key, layer, and probe.
 */

import type { CompileResult } from '@keyboard-studio/contracts';
import { TouchTapSession, type TapOutcome } from './tapSimulation.js';

/** Which probe class observed the difference. */
export type TapProbeKind = 'table' | 'seed:letter' | 'seed:space' | 'seed:digit' | 'deadkey-pair';

export interface TapBehaviourDiff {
  readonly layerId: string;
  readonly keyId: string;
  /** Set when the differing key is a longpress subkey of this host key. */
  readonly hostKeyId?: string;
  readonly probe: TapProbeKind;
  /** For deadkey-pair diffs: the deadkey key tapped first. */
  readonly deadkeyKeyId?: string;
  /** The observed outcome on the source side ("<absent>" when missing). */
  readonly source: string;
  /** The observed outcome on the copy side ("<absent>" when missing). */
  readonly copy: string;
}

export interface TapParityReport {
  readonly equal: boolean;
  readonly diffs: readonly TapBehaviourDiff[];
  /** How many probes of each class ran (proof the classes are non-vacuous). */
  readonly probesRun: Readonly<Record<TapProbeKind, number>>;
}

/** Seed texts for the SC-002 context classes, by probe kind. */
const SEEDS: ReadonlyArray<{ probe: TapProbeKind; seed: string }> = [
  { probe: 'seed:letter', seed: 'a' },
  { probe: 'seed:space', seed: ' ' },
  { probe: 'seed:digit', seed: '5' },
];

const ABSENT = '<absent>';

interface KeyRef {
  layerId: string;
  keyId: string;
  hostKeyId?: string;
}

function refKey(ref: KeyRef): string {
  return [ref.layerId, ref.hostKeyId ?? '', ref.keyId].join('\u0001');
}

/** Buffer text plus the beep flag — a beep difference is a behaviour difference. */
function outcomeText(outcome: TapOutcome | undefined): string {
  if (outcome === undefined) return ABSENT;
  return outcome.beep ? `${outcome.buffer} [beep]` : outcome.buffer;
}

function tapRef(session: TouchTapSession, ref: KeyRef, seed = ''): TapOutcome {
  return ref.hostKeyId !== undefined
    ? session.tapSubkey(ref.layerId, ref.hostKeyId, ref.keyId, seed)
    : session.tap(ref.layerId, ref.keyId, seed);
}

/**
 * Diff the tap behaviour of two compiled keyboards. Both must carry a
 * touch layout for `formFactor` (the sessions throw otherwise).
 */
export function diffTapBehaviour(
  sourceCompiled: CompileResult,
  copyCompiled: CompileResult,
  formFactor: 'tablet' | 'phone' = 'tablet',
): TapParityReport {
  const source = TouchTapSession.fromCompiled(sourceCompiled, formFactor);
  const copy = TouchTapSession.fromCompiled(copyCompiled, formFactor);

  const diffs: TapBehaviourDiff[] = [];
  const probesRun: Record<TapProbeKind, number> = {
    table: 0,
    'seed:letter': 0,
    'seed:space': 0,
    'seed:digit': 0,
    'deadkey-pair': 0,
  };

  // Union of key refs from both sides, source order first.
  const refs = new Map<string, KeyRef>();
  const collect = (session: TouchTapSession): void => {
    for (const layerId of session.layerIds()) {
      for (const ref of session.keysOn(layerId)) {
        const key = refKey(ref);
        if (!refs.has(key)) {
          refs.set(key, {
            layerId: ref.layerId,
            keyId: ref.keyId,
            ...(ref.hostKeyId !== undefined ? { hostKeyId: ref.hostKeyId } : {}),
          });
        }
      }
    }
  };
  collect(source);
  collect(copy);

  const hasRef = (session: TouchTapSession, ref: KeyRef): boolean => {
    try {
      return session
        .keysOn(ref.layerId)
        .some((r) => r.keyId === ref.keyId && r.hostKeyId === ref.hostKeyId);
    } catch {
      return false;
    }
  };

  const compare = (
    ref: KeyRef,
    probe: TapProbeKind,
    run: (session: TouchTapSession) => TapOutcome,
    extra?: { deadkeyKeyId: string },
  ): void => {
    probesRun[probe]++;
    const sourceOutcome = hasRef(source, ref) ? run(source) : undefined;
    const copyOutcome = hasRef(copy, ref) ? run(copy) : undefined;
    const s = outcomeText(sourceOutcome);
    const c = outcomeText(copyOutcome);
    if (s !== c) {
      diffs.push({
        layerId: ref.layerId,
        keyId: ref.keyId,
        ...(ref.hostKeyId !== undefined ? { hostKeyId: ref.hostKeyId } : {}),
        probe,
        ...(extra !== undefined ? { deadkeyKeyId: extra.deadkeyKeyId } : {}),
        source: s,
        copy: c,
      });
    }
  };

  const allRefs = [...refs.values()];

  // 1 + 2: table and seeded context probes for every ref.
  for (const ref of allRefs) {
    compare(ref, 'table', (s) => tapRef(s, ref));
    for (const { probe, seed } of SEEDS) {
      compare(ref, probe, (s) => tapRef(s, ref, seed));
    }
  }

  // 3: deadkey pairs. A key is a deadkey source when its plain tap leaves
  // a deadkey pending on EITHER side; pairs run per layer over main keys.
  const layers = new Set(allRefs.map((r) => r.layerId));
  for (const layerId of layers) {
    const mainRefs = allRefs.filter((r) => r.layerId === layerId && r.hostKeyId === undefined);
    const deadkeyRefs = mainRefs.filter((ref) => {
      const pending = (session: TouchTapSession): boolean =>
        hasRef(session, ref) && session.tap(layerId, ref.keyId).pendingDeadkeys.length > 0;
      return pending(source) || pending(copy);
    });
    for (const dk of deadkeyRefs) {
      for (const target of mainRefs) {
        compare(target, 'deadkey-pair', (s) => s.tapPair(layerId, dk.keyId, target.keyId), {
          deadkeyKeyId: dk.keyId,
        });
      }
    }
  }

  return { equal: diffs.length === 0, diffs, probesRun };
}
