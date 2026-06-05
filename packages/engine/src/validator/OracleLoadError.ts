// Typed error class for kmcmplib WASM load failure.
// Thrown by wasmLoader.loadWasmOracle(); caught exactly once inside
// validateWithOracle() at lazy init. Never re-thrown from validateWithOracle.
//
// The `.reason` discriminator lets the SPA distinguish a module-load
// failure ("kmc-kmn could not be initialised") from an ABI mismatch
// ("update your browser") without string-matching the message.
//
// See packages/engine/src/validator/oracle.ts for the catch site and
// degraded-mode policy (KM_WARN_ORACLE_UNAVAILABLE appended once per call).

export type OracleLoadReason =
  | "wasm-load-failed"
  | "wasm-instantiate-failed"
  | "abi-mismatch";

export class OracleLoadError extends Error {
  override readonly name = "OracleLoadError";
  readonly reason: OracleLoadReason;

  constructor(
    message: string,
    reason: OracleLoadReason,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.reason = reason;
    // Re-establish prototype chain across the ES5 transpile target so
    // `instanceof OracleLoadError` works in CJS consumers.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
