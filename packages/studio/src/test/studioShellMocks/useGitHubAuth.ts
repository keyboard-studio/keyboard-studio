// Stub for hooks/useGitHubAuth.ts in the guest posture: signed out, so "My
// keyboards" and AccountControl never attempt a network call.

import { vi, type Mock } from "vitest";

export const useGitHubAuth: Mock = vi.fn(() => ({
  status: "idle",
  token: null,
  verify: null,
  login: null,
  canSubmit: false,
  missingScopes: [],
  error: null,
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(),
}));
