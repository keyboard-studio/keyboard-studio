# Keyboard vocabulary — glossary

The project glossary for the keyboards the studio works with, settled in the
issue #1810 terminology review. This is a glossary, not a spec: it fixes what
each word *means* so specs, code, and UI copy all use them the same way. It
follows Keyman's own vocabulary wherever Keyman has one — in one case our old
usage was the opposite of Keyman's, which is what forced this review.

Sub-glossary: [touch-editor-glossary.md](touch-editor-glossary.md) covers the
key-level touch editor's terms.

---

## The keyboards

**Base keyboard** — Keyman's term, and the only sense this project uses: the
OS layout Keyman Desktop runs on top of, set in Keyman Desktop's
configuration. It supplies the fallback character for every keystroke a
Keyman keyboard doesn't handle, and ideally matches the physical keyboard
that came with the machine. Never use "base keyboard" for the keyboard a
track starts from — that collision with Keyman's meaning is retired.

**Copied keyboard** — the existing keyboard a Track 1 author starts from
(`instantiateFromBase`). The author *copies* it (Keyman's "copy a project")
to create a new keyboard. In copy: "the keyboard you copied", "copied from
`sil_cameroon_qwerty`". Code identifiers for this concept are the
starting-point family (see below), never `base*`.

**Your keyboard** — the keyboard being designed: the author's output. In
Track 1 it is a **new keyboard**; in Track 2 it is a **new version** of an
existing keyboard. Internally it is the *working copy* — that name is code
only and never appears in the UI.

**Starting point** — the state the working copy was instantiated from. It is
not a fourth keyboard: in Track 1 it is the copied keyboard; in Track 2 it
is the current released version of the same keyboard. Diffs, "what changed"
summaries, and the decision trail are measured against the starting point —
in Track 2 the trail therefore reads "changes since version X", and no
Track 2 surface ever says "base".

## The two tracks

| | Track 1 — **copy** | Track 2 — **update** |
|---|---|---|
| What the author does | Creates a new keyboard from an existing one used as a starting point | Modifies an existing keyboard to update, extend, or improve it |
| Keyboard ID | New, different ID | Same ID |
| What gets submitted | A new keyboard in a new project folder — "Submit new keyboard" | A new version of the existing keyboard, in its existing folder — "Submit new version" |
| Closest Keyman action | Copy a project | Edit the project and bump its version |

Track 2 is **not** "import": in Keyman, import brings an *external* keyboard
in as a new project, which is not what Track 2 does. Output and delivery
copy must state which of the two the author is delivering.

## Keyman's other terms, as we use them

**Keyboard** — one keyboard with its documentation plus its desktop, touch,
and OSK parts. Not a loose synonym for the project.

**Project** — a bundle (`.kpj`) of one or more keyboards and possibly
language models. The `keymanapp/keyboards` folder layout the studio mirrors
is a project.

**Template** — *no such Keyman concept.* Never used for the copied keyboard.
It survives only for pattern/scaffold templates
([making-a-template.md](../archive/making-a-template.md)).

## Layouts of your keyboard

**Desktop layout** — the non-touch layout of the keyboard being designed.
Never "physical layout": that phrase used to name both this and the base
keyboard's layout, which is the ambiguity this glossary removes.

**Touch layout** — the `.keyman-touch-layout` structure; see the
[touch editor glossary](touch-editor-glossary.md).

**OSK** — the on-screen keyboard rendering of a layout (KeymanWeb).

## Retired and restricted terms

| Term | Status |
|---|---|
| "physical keyboard / physical layout" (user-facing) | Retired. Say **base keyboard** for the OS layout, **desktop layout** for your keyboard's non-touch layout. |
| "host layout", "underlying keyboard/layout", "hardware layout" | Retired user-facing synonyms for the base keyboard. |
| "base layout" | Retired; it appeared beside "base keyboard" for two different concepts. |
| "source keyboard" | Retired in UI copy; the copied keyboard / starting point names above apply. |
| "template" (for a keyboard) | Retired — see **Template** above. |
| "working copy" | Code only, never user-facing. The UI says "your keyboard". |
| `baseIr` / `baseVfs` / `baseKeyboard`, `host*` (code) | Legacy spellings of the starting-point and base-keyboard concepts; renamed to the starting-point / base families in the #1810 identifier pass. The concepts they name are the ones defined here. |
| "chained deadkeys" (unqualified, for a mechanism) | Restricted. It is the name of strategy slot **S-06** only. For a mechanism, use the sense names in spec 007 §7.3: **family selection** (rule 6), **pending-letter** (rule 8), **two-trigger chain** (library pattern). Never infer chaining from the S-06 label. |

## Rules that follow from the glossary

- A spec draft must pass a terminology check against this glossary before
  `/speckit-plan`.
- A message id is a permanent handle (spec 046): rewording a catalog string
  to these terms keeps its id; only a change of *meaning* — such as "base
  keyboard" changing referent — justifies a new id, and then it is required.
- The decision trail and carve/mechanism summaries are worded against the
  **starting point**, so Track 2 never says "base".
