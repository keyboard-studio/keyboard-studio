/**
 * Classification of how a KMN rule node can be removed by the Carve Gallery.
 *
 * Produced once at keyboard import by the engine's `classifyRemovalCapabilities`
 * function and stored in working-copy state.  The studio reads it to show
 * per-tile badges and tooltips without re-classifying on every render.
 *
 * @see packages/engine/src/recognizer/classifyRemovalCapabilities.ts
 * @see spec.md §7.3 (S-01, S-02 strategy cards)
 */
export type RemovalCapability =
  /**
   * S-01 direct key→character rule.
   * The carve gallery can remove it independently with a simple rule deletion.
   */
  | "removable:simple"

  /**
   * S-02 parallel-store deadkey rule.
   * The carve mechanism is `index()` parallel-store fan-out with `nul`-fill:
   * the character's slot in the output store is replaced with a `nul` item,
   * leaving the rest of the deadkey set intact.
   */
  | "removable:slot-fill"

  /**
   * The node is a `RawKmnFragment` — the codec could not map it to a typed IR
   * node, so the editor cannot safely rewrite it.  Removing it here would have
   * no effect on the compiled keyboard.
   *
   * Also the GUARDED posture for typed rules containing a name-carrying
   * deadkey element (#2238): those rules were fragments (hence this value)
   * until the codec typed `dk(name)`, and `classifyRemovalCapabilities`
   * keeps them at this posture — Decision 1b — until a separate consumer
   * ruling reclassifies them. Do not "fix" the guard away on the grounds
   * that the node is now typed; the extension is deliberate.
   */
  | "not-removable:opaque"

  /**
   * The rule depends on surrounding context (prior context length > 1, or a
   * `context(N)` element on the LHS).  Removing it individually could break
   * dependent rules; out of scope for v1 carving.
   */
  | "not-removable:context-sensitive"

  /**
   * The engine could not classify this rule into any known removal category.
   * Covers unrecognized shapes such as S-05/S-06/S-07/S-09 and large AltGr
   * planes that exceed the S-01 five-key guard.
   */
  | "not-removable:unknown";
