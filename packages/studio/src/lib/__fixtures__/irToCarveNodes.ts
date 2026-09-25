// Shared IR builders for the irToCarveNodes.*.test.ts suites.

import type { IRRule, IRGroup, IRStore, KeyboardIR } from '@keyboard-studio/contracts';
import { charRule, charStore, irGroup, makeTestIR, vkeyRule } from '@keyboard-studio/contracts/fixtures';
import type { TestIROptions } from '@keyboard-studio/contracts/fixtures';

export function makeVkeyRule(modifiers: string[], nodeId = 'n1'): IRRule {
  return vkeyRule({ nodeId, modifiers, output: 'a' });
}

export function makeCharOnlyRule(nodeId = 'n2'): IRRule {
  return charRule({ nodeId, context: 'x', output: 'y' });
}

export function makeGroup(rules: IRRule[]): IRGroup {
  return irGroup({ nodeId: 'g1', rules });
}

export function makeStore(name: string, nodeId: string, overrides: Partial<IRStore> = {}): IRStore {
  return charStore({ nodeId, name, ...overrides });
}

/**
 * The one IR builder for the irToCarveNodes suites: an empty scaffolded IR
 * (the same shape as irToCarveNodes' own EMPTY_IR) carrying the given
 * groups/stores/patterns.
 * irToCarveNodes never reads `origin` or `header`, so every suite shares it.
 */
export function makeIR(parts: TestIROptions = {}): KeyboardIR {
  return makeTestIR({ origin: 'scaffolded', header: { keyboardId: '', name: '', version: '' }, ...parts });
}
