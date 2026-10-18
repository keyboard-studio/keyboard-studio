# Spec 104 touch-id idiom fixtures (T001, FR-028)

Minimal `.kmn` + `.keyman-touch-layout` pairs, one per touch key-id idiom
the criteria in `specs/104-touch-key-id-criteria/` turn on. Each pair is
reduced to the smallest layout that still exhibits its idiom. The
tap-simulation harness (`packages/engine/src/simulator/tapSimulation.ts`)
compiles these and drives every key; `tapSimulation.test.ts` pins the
research.md §1 verdicts on them.

| Fixture | Idiom | Source |
|---|---|---|
| `sil_cameroon_qwerty/` | Guarded T_ marks: `diablock` store + `any(diablock) + [T_0300] > context` swallow rule + bare producer; T_030D additionally carries the SHIFT guard/producer pair. Bare-rule T_ punctuation producer (T_002E). Unruled K_ keys ride the US fallback. | **Reduced from the real keyboard** (`release/sil/sil_cameroon_qwerty`, v6.1.2, this repo's corpus checkout): diablock store and the T_0300/T_030D/T_002E rules are verbatim; all other rules/stores/layers omitted. Layout reduced to default/shift/rightalt with the row-0 T_ keys where K_1..K_0 physically sit. |
| `hindi_flick/` | Ruled U_: the layout key keeps its U_ id and the .kmn rules it — `+ [U_0905] > 'ा' use(checkMatra)`. U_0906 is the unruled decode control. | **Hand-constructed** — hindi_flick is not in this machine's partial corpus checkout. The ruled-U_ line and the checkMatra group are the forms attested in the spec 104 corpus census (touch-id-research/corpus-census.md). |
| `gff_mesobe_fidelat/` | One T_ key in three roles at once: producer (`+ [T_1280] > 'ኀ'`), layer switch (`nextlayer`), longpress host with a U_ subkey family. | **Hand-constructed** — no gff_* keyboard is in this machine's partial corpus checkout. Shape attested in the census for gff_mesobe_fidelat / the gff_* family; reduced to one fidel base (ኀ U+1280, subkeys U_1281/U_1282). |
| `fv_southern_carrier/` | Store-grouped T_ fan: T_ mnemonics (T_H, T_HI, T_HU) whose outputs live in a .kmn store (`store(fanH)`) and are produced via `index()`; the base key also navigates (`nextlayer`). | **Hand-constructed** — no fv_* keyboard is in this machine's partial corpus checkout. Shape attested in the census for fv_southern_carrier; reduced to the H fan (ᐸ ᐱ ᐲ). |
| `basic_kbdus/` | Dead keys: rule-free T_<HEX> keys (T_0031, T_0021, T_003F) with keycap text + nextlayer only. A T_ key has no fallback, so these type nothing (research.md §1). | **Reduced from the real keyboard** (`release/basic/basic_kbdus`, v1.2): header + two verbatim K_ rules kept; the source .kmn's 97 rules are all K_ rules — none references a T_ id. Layout reduced to default + symbol layers. |

Construction notes:

- Every fixture declares `store(&LAYOUTFILE)` naming its own layout file,
  as the sources do, so kmc embeds the touch layout (KVKL) in the
  compiled .js — that is what lets the harness drive real layout keys
  through ActiveLayout instead of synthesising key events.
- Cameroon/basic reductions keep rule text byte-identical to the source
  for the rules they keep; the .kmn header comments record what was
  dropped.
