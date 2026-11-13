# T016: rules newly recognised by the recognizer rules (spec 116)

`isBody` (s02-deadkey-single-tap.ts) and `isParallelIndexFanOut` (parallel-index-fanout.ts) now read the context
through the rule-shape accessors, so a rule whose context carries an inline `+` is matched (the separator is
never counted, per kmcmplib). Before, any `+` made them reject the rule.

Measured over the keyboards corpus (release + experimental, 476973 rules):

- newly recognised by isBody: 45
- newly recognised by isParallelIndexFanOut: 113
- rules no longer recognised by either: 0

## Per keyboard file

| File | isBody | isParallelIndexFanOut |
|---|---|---|
| release/e/ekwtamil99uni/extra/eKwTamil99UniUpdt.kmn | 2 | 2 |
| release/el/el_pan_sahelian/source/el_pan_sahelian.kmn | 1 | 1 |
| release/g/galaxie_hebrew_mnemonic/source/galaxie_hebrew_mnemonic.kmn | 2 | 2 |
| release/g/gandhari/source/gandhari.kmn | 11 | 11 |
| release/g/ghana/source/ghana.kmn | 1 | 1 |
| release/g/gondi_dev/source/gondi_dev.kmn | 2 | 2 |
| release/g/gondi_tel/source/gondi_tel.kmn | 2 | 2 |
| release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn | 6 | 74 |
| release/m/maltese/source/maltese.kmn | 4 | 4 |
| release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn | 1 | 1 |
| release/sil/sil_dzongkha/source/sil_dzongkha.kmn | 1 | 1 |
| release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn | 5 | 5 |
| release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn | 5 | 5 |
| release/t/taigi_viet_telex/source/taigi_viet_telex.kmn | 2 | 2 |

## Every newly recognised rule

| Predicate | File:line | Context | Output |
|---|---|---|---|
| isBody | release/e/ekwtamil99uni/extra/eKwTamil99UniUpdt.kmn:189 | dk(0) raw(+) any(uyirE2) | index:2 |
| isParallelIndexFanOut | release/e/ekwtamil99uni/extra/eKwTamil99UniUpdt.kmn:189 | dk(0) raw(+) any(uyirE2) | index:2 |
| isBody | release/e/ekwtamil99uni/extra/eKwTamil99UniUpdt.kmn:195 | dk(0) raw(+) any(dkothersE) | index:2 |
| isParallelIndexFanOut | release/e/ekwtamil99uni/extra/eKwTamil99UniUpdt.kmn:195 | dk(0) raw(+) any(dkothersE) | index:2 |
| isBody | release/el/el_pan_sahelian/source/el_pan_sahelian.kmn:75 | dk(0) raw(+) any(char_in) | index:2 |
| isParallelIndexFanOut | release/el/el_pan_sahelian/source/el_pan_sahelian.kmn:75 | dk(0) raw(+) any(char_in) | index:2 |
| isBody | release/g/galaxie_hebrew_mnemonic/source/galaxie_hebrew_mnemonic.kmn:40 | dk(1) raw(+) any(key) | index:2 |
| isParallelIndexFanOut | release/g/galaxie_hebrew_mnemonic/source/galaxie_hebrew_mnemonic.kmn:40 | dk(1) raw(+) any(key) | index:2 |
| isBody | release/g/galaxie_hebrew_mnemonic/source/galaxie_hebrew_mnemonic.kmn:54 | dk(1) raw(+) any(key_dag) | index:2 |
| isParallelIndexFanOut | release/g/galaxie_hebrew_mnemonic/source/galaxie_hebrew_mnemonic.kmn:54 | dk(1) raw(+) any(key_dag) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:60 | dk(1) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:60 | dk(1) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:61 | dk(34) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:61 | dk(34) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:62 | dk(2) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:62 | dk(2) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:63 | dk(36) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:63 | dk(36) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:64 | dk(3) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:64 | dk(3) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:65 | dk(4) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:65 | dk(4) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:66 | dk(5) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:66 | dk(5) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:67 | dk(33) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:67 | dk(33) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:68 | dk(6) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:68 | dk(6) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:69 | dk(7) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:69 | dk(7) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/gandhari/source/gandhari.kmn:70 | dk(35) raw(+) any(BaseVowels) | index:2 |
| isParallelIndexFanOut | release/g/gandhari/source/gandhari.kmn:70 | dk(35) raw(+) any(BaseVowels) | index:2 |
| isBody | release/g/ghana/source/ghana.kmn:76 | dk(59) raw(+) any(dkf003b) | index:2 |
| isParallelIndexFanOut | release/g/ghana/source/ghana.kmn:76 | dk(59) raw(+) any(dkf003b) | index:2 |
| isBody | release/g/gondi_dev/source/gondi_dev.kmn:55 | dk(1) raw(+) any(specialcons) | index:2 |
| isParallelIndexFanOut | release/g/gondi_dev/source/gondi_dev.kmn:55 | dk(1) raw(+) any(specialcons) | index:2 |
| isBody | release/g/gondi_dev/source/gondi_dev.kmn:58 | dk(4) raw(+) any(number) | index:2 |
| isParallelIndexFanOut | release/g/gondi_dev/source/gondi_dev.kmn:58 | dk(4) raw(+) any(number) | index:2 |
| isBody | release/g/gondi_tel/source/gondi_tel.kmn:48 | dk(1) raw(+) any(specialcons) | index:2 |
| isParallelIndexFanOut | release/g/gondi_tel/source/gondi_tel.kmn:48 | dk(1) raw(+) any(specialcons) | index:2 |
| isBody | release/g/gondi_tel/source/gondi_tel.kmn:51 | dk(4) raw(+) any(number) | index:2 |
| isParallelIndexFanOut | release/g/gondi_tel/source/gondi_tel.kmn:51 | dk(4) raw(+) any(number) | index:2 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:88 | dk(1) raw(+) any(TypedVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:88 | dk(1) raw(+) any(TypedVowels) | index:2 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:91 | dk(2) raw(+) any(TypedVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:91 | dk(2) raw(+) any(TypedVowels) | index:2 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:97 | dk(18) raw(+) any(TypedVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:97 | dk(18) raw(+) any(TypedVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:136 | dk(2) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:137 | dk(6) dk(2) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:138 | dk(1) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:139 | dk(6) dk(1) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:141 | dk(3) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:142 | dk(6) dk(3) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:143 | dk(18) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:144 | dk(6) dk(18) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:146 | dk(4) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:147 | dk(6) dk(4) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:148 | dk(5) dk(6) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:149 | dk(6) dk(5) raw(+) any(CircumflexVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:154 | dk(4) dk(2) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:155 | dk(2) dk(4) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:156 | dk(5) dk(2) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:157 | dk(2) dk(5) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:158 | dk(4) dk(1) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:159 | dk(1) dk(4) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:160 | dk(5) dk(1) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:161 | dk(1) dk(5) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:162 | dk(4) dk(3) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:163 | dk(3) dk(4) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:164 | dk(5) dk(3) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:165 | dk(3) dk(5) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:166 | dk(4) dk(18) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:167 | dk(18) dk(4) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:168 | dk(5) dk(18) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:169 | dk(18) dk(5) dk(6) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:173 | dk(4) dk(6) dk(2) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:174 | dk(2) dk(6) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:175 | dk(5) dk(6) dk(2) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:176 | dk(2) dk(6) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:177 | dk(4) dk(6) dk(1) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:178 | dk(1) dk(6) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:179 | dk(5) dk(6) dk(1) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:180 | dk(1) dk(6) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:181 | dk(4) dk(6) dk(3) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:182 | dk(3) dk(6) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:183 | dk(5) dk(6) dk(3) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:184 | dk(3) dk(6) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:185 | dk(4) dk(6) dk(18) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:186 | dk(18) dk(6) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:187 | dk(5) dk(6) dk(18) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:188 | dk(18) dk(6) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:191 | dk(6) dk(4) dk(2) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:192 | dk(6) dk(2) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:193 | dk(6) dk(5) dk(2) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:194 | dk(6) dk(2) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:195 | dk(6) dk(4) dk(1) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:196 | dk(6) dk(1) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:197 | dk(6) dk(5) dk(1) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:198 | dk(6) dk(1) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:199 | dk(6) dk(4) dk(3) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:200 | dk(6) dk(3) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:201 | dk(6) dk(5) dk(3) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:202 | dk(6) dk(3) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:203 | dk(6) dk(4) dk(18) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:204 | dk(6) dk(18) dk(4) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:205 | dk(6) dk(5) dk(18) raw(+) any(CircumflexVowels) | index:4 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:206 | dk(6) dk(18) dk(5) raw(+) any(CircumflexVowels) | index:4 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:211 | dk(9) raw(+) any(TypedVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:211 | dk(9) raw(+) any(TypedVowels) | index:2 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:214 | dk(16) raw(+) any(DiaeresisVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:214 | dk(16) raw(+) any(DiaeresisVowels) | index:2 |
| isBody | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:217 | dk(17) raw(+) any(DiaeresisVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:217 | dk(17) raw(+) any(DiaeresisVowels) | index:2 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:221 | dk(2) dk(16) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:222 | dk(16) dk(2) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:223 | dk(1) dk(16) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:224 | dk(16) dk(1) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:225 | dk(3) dk(16) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:226 | dk(16) dk(3) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:227 | dk(18) dk(16) raw(+) any(DiaeresisVowels) | index:3 |
| isParallelIndexFanOut | release/g/greek_polytonic_plus/source/greek_polytonic_plus.kmn:228 | dk(16) dk(18) raw(+) any(DiaeresisVowels) | index:3 |
| isBody | release/m/maltese/source/maltese.kmn:34 | dk(1) raw(+) any(acutebase) | index:2 |
| isParallelIndexFanOut | release/m/maltese/source/maltese.kmn:34 | dk(1) raw(+) any(acutebase) | index:2 |
| isBody | release/m/maltese/source/maltese.kmn:35 | dk(2) raw(+) any(gravebase) | index:2 |
| isParallelIndexFanOut | release/m/maltese/source/maltese.kmn:35 | dk(2) raw(+) any(gravebase) | index:2 |
| isBody | release/m/maltese/source/maltese.kmn:36 | dk(3) raw(+) any(circumbase) | index:2 |
| isParallelIndexFanOut | release/m/maltese/source/maltese.kmn:36 | dk(3) raw(+) any(circumbase) | index:2 |
| isBody | release/m/maltese/source/maltese.kmn:37 | dk(4) raw(+) any(dierbase) | index:2 |
| isParallelIndexFanOut | release/m/maltese/source/maltese.kmn:37 | dk(4) raw(+) any(dierbase) | index:2 |
| isBody | release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn:109 | dk(2) raw(+) any(RomanCs) | index:2 |
| isParallelIndexFanOut | release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn:109 | dk(2) raw(+) any(RomanCs) | index:2 |
| isBody | release/sil/sil_dzongkha/source/sil_dzongkha.kmn:74 | dk(1) raw(+) any(key) | index:2 |
| isParallelIndexFanOut | release/sil/sil_dzongkha/source/sil_dzongkha.kmn:74 | dk(1) raw(+) any(key) | index:2 |
| isBody | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:288 | dk(2) raw(+) any(deadkeys_K) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:288 | dk(2) raw(+) any(deadkeys_K) | index:2 |
| isBody | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:299 | dk(1) raw(+) any(K_lc1) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:299 | dk(1) raw(+) any(K_lc1) | index:2 |
| isBody | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:300 | dk(2) raw(+) any(K_lc2) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:300 | dk(2) raw(+) any(K_lc2) | index:2 |
| isBody | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:301 | dk(1) raw(+) any(K_UC1) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:301 | dk(1) raw(+) any(K_UC1) | index:2 |
| isBody | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:302 | dk(2) raw(+) any(K_UC2) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn:302 | dk(2) raw(+) any(K_UC2) | index:2 |
| isBody | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:325 | dk(2) raw(+) any(deadkeys_K) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:325 | dk(2) raw(+) any(deadkeys_K) | index:2 |
| isBody | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:336 | dk(1) raw(+) any(K_lc1) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:336 | dk(1) raw(+) any(K_lc1) | index:2 |
| isBody | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:337 | dk(2) raw(+) any(K_lc2) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:337 | dk(2) raw(+) any(K_lc2) | index:2 |
| isBody | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:338 | dk(1) raw(+) any(K_UC1) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:338 | dk(1) raw(+) any(K_UC1) | index:2 |
| isBody | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:339 | dk(2) raw(+) any(K_UC2) | index:2 |
| isParallelIndexFanOut | release/sil/sil_pan_africa_positional/source/sil_pan_africa_positional.kmn:339 | dk(2) raw(+) any(K_UC2) | index:2 |
| isBody | release/t/taigi_viet_telex/source/taigi_viet_telex.kmn:3973 | dk(241) raw(+) any(all_letters) | index:2 |
| isParallelIndexFanOut | release/t/taigi_viet_telex/source/taigi_viet_telex.kmn:3973 | dk(241) raw(+) any(all_letters) | index:2 |
| isBody | release/t/taigi_viet_telex/source/taigi_viet_telex.kmn:3974 | dk(242) raw(+) any(all_letters) | index:2 |
| isParallelIndexFanOut | release/t/taigi_viet_telex/source/taigi_viet_telex.kmn:3974 | dk(242) raw(+) any(all_letters) | index:2 |
