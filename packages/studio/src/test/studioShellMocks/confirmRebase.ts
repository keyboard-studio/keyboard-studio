// Stub for lib/confirmRebase.ts. BaseResolutionAdapter's onConfirm calls
// confirmRebaseTo synchronously (F1 fix) before advancing; every shell suite
// starts from an uninstantiated working copy, where the real predicate would
// allow anyway, so it is mocked to always allow.

import { vi, type Mock } from "vitest";

export const instantiateFromBaseIfConfirmed: Mock = vi.fn();
export const confirmRebaseTo: Mock<() => boolean> = vi.fn(() => true);
