// ---------------------------------------------------------------------------
// Compile-time drift-guard helpers shared by every module that binds a zod
// schema to its hand-written contract interface (schemas.ts, rulePack.ts).
// Type-only — nothing here exists at runtime.
//
// DeepStripUndefined bridges zod's `.optional()` (which infers `T | undefined`)
// to the contract's exactOptionalPropertyTypes `?:` form, so a guard reacts to
// real drift rather than to that representational difference.
// ---------------------------------------------------------------------------

export type DeepStripUndefined<T> =
  T extends (infer U)[]
    ? DeepStripUndefined<U>[]
    : T extends object
      ? { [K in keyof T]: DeepStripUndefined<Exclude<T[K], undefined>> }
      : T;

export type Expect<T extends true> = T;

/** True when the schema-inferred `S` (undefined-stripped) is assignable to `T`. */
export type AssignableTo<S, T> = [DeepStripUndefined<S>] extends [T] ? true : false;
