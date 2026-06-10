import { useState, useEffect } from "react";

/** Spec Decision D3: single 300 ms debounce cycle for TS-check + WASM oracle. */
export const DEBOUNCE_MS = 300;

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
