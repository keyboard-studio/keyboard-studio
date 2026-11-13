/**
 * Exhaustiveness guard for a `switch` over a discriminated union. Pass the
 * value left in the `default:` branch: while every member has an explicit case
 * its type is `never` and this compiles; a new union member makes the call a
 * compile error. At runtime it throws, so an IR node of a kind this build does
 * not know fails loudly instead of being silently skipped.
 */
export function assertNever(value: never, context?: string): never {
  const where = context === undefined ? "" : ` in ${context}`;
  throw new Error(`Unhandled variant${where}: ${JSON.stringify(value)}`);
}
