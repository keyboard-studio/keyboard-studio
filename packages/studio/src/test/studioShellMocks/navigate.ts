// Spy for lib/navigate.ts: records navigateTo calls without touching
// window.location. Suites that need a real hashchange leave navigate.ts unmocked.

import { vi, type Mock } from "vitest";

export const navigateTo: Mock = vi.fn();
