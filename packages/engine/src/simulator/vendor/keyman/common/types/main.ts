// Vendored re-exports from @keymanapp/common-types
// Only exports used by the simulator vendor stack are included.
// See PROVENANCE.md for source SHA.

export { USVirtualKeyCodes } from './consts/virtual-key-constants.js';
export { ModifierKeyConstants } from './consts/modifier-key-constants.js';
export * as KeymanWebKeyboard from './keyboard-object.js';
export * as TouchLayout from './keyman-touch-layout/keyman-touch-layout-file.js';

// Minimal inline stubs for Uni_IsSurrogate functions (avoids pulling in the full
// util.ts which requires relaxed strictNullChecks incompatible with our tsconfig).
export function Uni_IsSurrogate1(ch: number): boolean {
  return ch >= 0xD800 && ch <= 0xDBFF;
}
export function Uni_IsSurrogate2(ch: number): boolean {
  return ch >= 0xDC00 && ch <= 0xDFFF;
}
export function Uni_IsSurrogate(ch: number): boolean {
  return ch >= 0xD800 && ch <= 0xDFFF;
}

// Minimal LexicalModelTypes namespace stub — only the types consumed by the
// engine/keyboard vendor stack (Transform, Suggestion, ProbabilityMass).
export namespace LexicalModelTypes {
  export interface Transform {
    insert: string;
    deleteLeft: number;
    deleteRight?: number;
    id?: number;
  }
  export interface Suggestion {
    transform: Transform;
    displayAs: string;
    tag?: string;
  }
  export interface ProbabilityMass<T> {
    p: number;
    sample: T;
  }
}
