# Contract: Constitution amendment (lands with Phase 1, v2.2.0 → 2.3.0)

Per Governance, the amendment lands **in the same PR** as the change that prompts it, edits the existing text (not append-only), and bumps the version footer. Owner approval is required: this changes Articles II and III.

## Article II — replace the first sentence

> All scaffolding, import, validation, and mutation operate on the typed
> `KeyboardIR`, never on raw `.kmn` text (`scaffold()` is `parse → scaffoldIR →
> emit`).

**with**

> All scaffolding, import, validation, and mutation operate on the typed
> `KeyboardIR` (`scaffold()` is `parse → scaffoldIR → emit`). Projecting the IR
> back to text is a full emit for a new keyboard. For a keyboard opened for
> update (spec 111) it is a splice of the changed nodes into the starting text,
> as carve already does. A full re-emit of an opened keyboard needs the
> author's consent. An author's code edit is not a mutation: it is parsed into
> a new starting point (Article III).

## Article III — add a row and one sentence

After "Within a session it is **recalculated from the project's decisions**…", insert:

> On a keyboard opened for update, the starting point is the current file text
> and its parse: an applied code edit or accepted text-level fix replaces the
> starting point, and decisions replay on top of it (the starting-point switch
> of Article X). File text, including review notes, is never stored as a
> decision.

Table row change:

| Question | Source of truth |
|---|---|
| What renders / emits | The KeyboardIR working copy; **on Open, the starting text plus spliced changes** |

## Footer

`**Version**: 2.3.0 | … | **Last amended**: <date> (Art II/III: text-sourced starting point for keyboards opened for update, spec 111)`
