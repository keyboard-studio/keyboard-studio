// debugPinsStore — dev-only store for pinning survey answers as defaults.
//
// Architecture contract:
//   - Only active when VITE_KM_DEBUG=1 OR ?debug=1 in the URL.
//   - In all other modes (including production builds) every method is a no-op;
//     writes are silently ignored, reads return undefined, isPinned returns false.
//   - Persists to sessionStorage under "km-debug-pins" as JSON:
//     Record<questionId, string | string[]>
//   - SSR/Node-CI safe: all methods guard against `typeof window === "undefined"`.
//   - Never imported by production code paths; used only by SurveyRunner when
//     isDebugEnabled() is true.

const STORAGE_KEY = "km-debug-pins";

function readStorage(): Record<string, string | string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return parsed as Record<string, string | string[]>;
  } catch {
    // Malformed JSON — clear and recover
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return {};
  }
}

function writeStorage(data: Record<string, string | string[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

export interface DebugPinsStore {
  isDebugEnabled(): boolean;
  isPinned(questionId: string): boolean;
  getPinned(questionId: string): string | string[] | undefined;
  pin(questionId: string, value: string | string[] | undefined): void;
  unpin(questionId: string): void;
  clearAll(): void;
}

function checkDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // Check VITE env var (set at build/dev time)
  try {
    if (import.meta.env.VITE_KM_DEBUG === "1") return true;
  } catch { /* not in a Vite context */ }
  // Check URL query param (runtime override)
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export const debugPinsStore: DebugPinsStore = {
  isDebugEnabled(): boolean {
    return checkDebugEnabled();
  },

  isPinned(questionId: string): boolean {
    if (!checkDebugEnabled()) return false;
    const data = readStorage();
    return Object.prototype.hasOwnProperty.call(data, questionId);
  },

  getPinned(questionId: string): string | string[] | undefined {
    if (!checkDebugEnabled()) return undefined;
    const data = readStorage();
    return Object.prototype.hasOwnProperty.call(data, questionId)
      ? data[questionId]
      : undefined;
  },

  pin(questionId: string, value: string | string[] | undefined): void {
    if (!checkDebugEnabled()) return;
    if (value === undefined) {
      // Treat pin(id, undefined) as unpin
      this.unpin(questionId);
      return;
    }
    const data = readStorage();
    data[questionId] = value;
    writeStorage(data);
  },

  unpin(questionId: string): void {
    if (!checkDebugEnabled()) return;
    const data = readStorage();
    delete data[questionId];
    writeStorage(data);
  },

  clearAll(): void {
    if (!checkDebugEnabled()) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  },
};
