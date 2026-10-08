# Keyboard phonebook

A lookup table of the Keyman keyboards this project **references** — in [spec.md](../spec.md), the content scan reports, test fixtures, and tooling. Use it to find a keyboard by name, language, author, or where its source lives on disk.

The keyboards themselves are **not** in this repo. They live in a sibling checkout at `../keyboards` (i.e. `<parent>/keyboards`), which tracks the [keyboard-studio/keyboards](https://github.com/keyboard-studio/keyboards) fork — a stable mirror of [keymanapp/keyboards](https://github.com/keymanapp/keyboards) and the project's canonical corpus for deterministic tests and facet-index builds. Point `../keyboards` at that fork's `master` (not upstream), or corpus-calibrated tests will drift. Every `Path` below is written relative to the keyboard-studio repo root.

## Keep this current

**This index covers only keyboards the project has already acknowledged, so it must be updated as we reference more.** Whenever you introduce, cite, or otherwise reference a keyboard that is not yet listed, **add its row in the same change — before moving on.** A stale phonebook is treated as a defect: an index that silently omits a referenced keyboard is worse than no index, because it reads as complete when it isn't.

To add a row:

1. Locate the keyboard folder: `../keyboards/release/<vendor>/<id>/` and open its package file `source/<id>.kps` (a few keyboards keep the `.kps` at the folder root).
2. From the `<Info>` block read `<Name>` (→ Keyboard), `<Author>` (→ Author; fall back to `<Copyright>` when `<Author>` is empty/absent).
3. Collect the `ID` attributes of every `<Language ID="…">` entry (→ Languages, BCP47 tags only — drop the display names).
4. Insert the row in alphabetical order by `id`. If a list exceeds 15 tags, show the first 15 then `… (+N more)`.

Fields and parsing mirror [packages/engine/src/base-browser/kps-parser.ts](../packages/engine/src/base-browser/kps-parser.ts).

## Index

| Keyboard | id | Languages (BCP47) | Author | Path |
| --- | --- | --- | --- | --- |
| Ahom Star | `ahom_star` | `aho-Ahom` | Dr Hemanta Kumar Gogoi | `../keyboards/release/a/ahom_star` |
| akan | `akan` | `ak` | dcshci lab | `../keyboards/release/a/akan` |
| Akha/Lahu | `akha_lahu` | `ahk`, `lhu` | Copyright © SIL Global | `../keyboards/release/a/akha_lahu` |
| Alkelang | `alkelang` | `bfd`, `aal`, `agq`, `muc`, `bss`, `aku`, `ael`, `ato`, `azo`, `bbk`, `bfj`, `bwt`, `ksf`, `bkc`, `bqz` … (+263 more) | SOSA Developments | `../keyboards/experimental/a/alkelang` |
| Amazigh Latin (SIL) | `amazigh_latin` | `auj-Latn`, `swn-Latn`, `siz-Latn`, `cnu-Latn`, `jbe-Latn`, `shi-Latn`, `tzm`, `zgh-Latn`, `kab`, `gha-Latn`, `jbn-Latn`, `sds-Latn`, `gho-Latn`, `oua-Latn`, `tjo-Latn` … (+12 more) | SIL Global | `../keyboards/release/a/amazigh_latin` |
| Anii | `anii` | `blo-Latn` | Martin Zaske | `../keyboards/release/a/anii` |
| Arabic Izza | `arabic_izza` | `ar-DZ` | Prof. Abdelmalek Bouhadjera | `../keyboards/release/a/arabic_izza` |
| Arbore | `arbore` | `arv-Latn`, `amf` | Sophia Ku | `../keyboards/release/a/arbore` |
| Armenian Mnemonic R | `armenian_mnemonic_r` | `hy` | Tigran Sarukhanyan | `../keyboards/release/a/armenian_mnemonic_r` |
| Vai (Athinkra) | `athinkra_vai` | `vai` | Jason Glavy | `../keyboards/release/athinkra/athinkra_vai` |
| Vai Typewriter (Athinkra) | `athinkra_vai_typewriter` | `vai` | Jason Glavy | `../keyboards/release/athinkra/athinkra_vai_typewriter` |
| Balochi Scientific | `balochi_scientific` | `bal-Latn` | © 2017-2023 SIL International | `../keyboards/release/b/balochi_scientific` |
| Balochi Urdu | `balochi_urdu` | `bal` | © SIL Global | `../keyboards/release/b/balochi_urdu` |
| Bambara | `bambara` | `bm` | Sekou Goro | `../keyboards/release/b/bambara` |
| Bamum | `bamum` | `bax` | Lorna Evans | `../keyboards/release/b/bamum` |
| Western Cree (TH-Woods) | `bj_cree_woods` | `cr` | Bill Jancewicz | `../keyboards/release/bj/bj_cree_woods` |
| BU Phonetic | `bu_phonetic` | `fr`, `de`, `und-Latn`, `es` | J. Albert Bickford | `../keyboards/release/b/bu_phonetic` |
| Bukawa | `bukawa` | `buk` | William Eckermann | `../keyboards/release/b/bukawa` |
| Clavier du Burkina | `clavbur9` | `bm`, `bbo`, `beh`, `bfo`, `bib`, `bmq`, `bof`, `box`, `bwj`, `bwq`, `bwy`, `bxl`, `cme`, `dgd`, `dgs` … (+18 more) | © SIL Burkina Faso | `../keyboards/release/c/clavbur9` |
| Simplified Chinese | `cs_pinyin` | `zh` | SIL International | `../keyboards/release/c/cs_pinyin` |
| Common Devanagari | `common_devanagari` | `hi` | © 2021 WIn Publishing Trust | `../keyboards/release/c/common_devanagari` |
| Easy Chakma | `easy_chakma` | `ccp` | Bivuti Chakma | `../keyboards/release/e/easy_chakma` |
| Thuɔŋjäŋ | `el_dinka` | `din-Latn`, `dip-Latn`, `diw-Latn`, `dib-Latn`, `dks-Latn`, `dik-Latn` | © 2015-2018 Enabling Languages | `../keyboards/release/el/el_dinka` |
| Naija NFD | `el_naija` | `abn-Latn`, `bky-Latn`, `bwr-Latn`, `deg-Latn`, `igb-Latn`, `bin-Latn`, `efi-Latn`, `eka-Latn`, `ekp-Latn`, `elm-Latn`, `enn-Latn`, `ish-Latn`, `gbr-Latn`, `aaa-Latn`, `gkn-Latn` … (+37 more) | Andrew Cunningham and Chinedu Uchechukwu | `../keyboards/release/el/el_naija` |
| pan-Sahelian | `el_pan_sahelian` | `fub` | © Enabling Languages | `../keyboards/release/el/el_pan_sahelian` |
| Pasifika | `el_pasifika` | `mi-Latn`, `rar-Latn`, `fj`, `haw-Latn`, `niu`, `sm`, `ty-Latn`, `to` | © 2018 Enabling Languages | `../keyboards/release/el/el_pasifika` |
| Övdalsk | `elfdalian` | `ovd` | Craig Cornelius | `../keyboards/experimental/e/elfdalian` |
| தமிழ்99 \| Tamil99 | `ekwtamil99uni` | `ta` | Mugunth, Umar, K. Sethu | `../keyboards/release/e/ekwtamil99uni` |
| Enggano | `enggano` | `eno` | Mary Dalrymple | `../keyboards/release/e/enggano` |
| Dane-Z̲aa Z̲áágéʔ | `fv_dane_zaa_zaage` | `bea` | Clarissa Forbes | `../keyboards/release/fv/fv_dane_zaa_zaage` |
| X̱aayda-X̱aad Kil | `fv_hlgaagilda_xaayda_kil` | `hax` | (c) 2008-2024 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey | `../keyboards/release/fv/fv_hlgaagilda_xaayda_kil` |
| Northern Tutchone | `fv_northern_tutchone` | `ttm-Latn` | (c) 2008-2019 FirstVoices, SIL International. Portions (c) 2006 Chris Harvey | `../keyboards/release/fv/fv_northern_tutchone` |
| ᓀᐦᐃᔭᐍᐏᐣ (Plains Cree) | `fv_plains_cree` | `crk` | (c) 2015-2025 FirstVoices, SIL Global, 2015 First Peoples' Cultural Foundation | `../keyboards/release/fv/fv_plains_cree` |
| ᑐᑊᘁᗕᑋᗸ (Southern Carrier) | `fv_southern_carrier` | `caf-Cans` | (c) 2015-2024 FirstVoices, SIL International, 2015 First Peoples' Cultural Foundation | `../keyboards/release/fv/fv_southern_carrier` |
| Łingít | `fv_tlingit` | `tli` | © 2015-2024 FirstVoices, SIL International, 2015 First Peoples' Cultural Foundation, parts 2007 Chris Harvey | `../keyboards/release/fv/fv_tlingit` |
| Galaxie Greek (Mnemonic) | `galaxie_greek_mnemonic` | `grc-Grek`, `el` | Hampton Keathley | `../keyboards/release/g/galaxie_greek_mnemonic` |
| Gautami Bangla/Bengali | `gautami_bangla_bengali` | `bn-IN` | Gautam Sengupta | `../keyboards/release/gautami/gautami_bangla_bengali` |
| Gautami Devanagari | `gautami_devanagari` | `hi`, `sa` | Gautam Sengupta | `../keyboards/release/gautami/gautami_devanagari` |
| Gautami IndiTran | `gautami_inditran` | `la` | Gautam Sengupta | `../keyboards/release/gautami/gautami_inditran` |
| Gautami Thamizh/Tamil | `gautami_thamizh_tamil` | `ta` | Gautam Sengupta | `../keyboards/release/gautami/gautami_thamizh_tamil` |
| Geba Karen (Myanmar) | `geba_karen_mymr` | `kvq` | Copyright © SIL Global | `../keyboards/release/g/geba_karen_mymr` |
| GFF Amharic | `gff_amharic` | `am` | The Geʾez Frontier Foundation | `../keyboards/release/gff/gff_amharic` |
| GFF Geʾez Manuscript | `gff_geez_emufi` | `gez` | The Geʾez Frontier Foundation | `../keyboards/experimental/gff/gff_geez_emufi` |
| Ghana | `ghana` | `ak-Latn`, `ee-Latn`, `ada-Latn`, `dga-Latn`, `hag-Latn`, `nzi-Latn`, `xsm-Latn` | © 2017-2020 SIL International | `../keyboards/release/g/ghana` |
| Haroi | `haroi` | `hro`, `vi` | © SIL Global | `../keyboards/release/h/haroi` |
| Hausa Kano | `hausa_kano` | `ha-Latn` | Hamza Sulayman | `../keyboards/release/h/hausa_kano` |
| Bengali Phonetic (ITRANS) | `itrans_bengali` | `bn`, `as` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_bengali` |
| Hindi Devanagari Phonetic (ITRANS) | `itrans_devanagari_hindi` | `hi`, `mr`, `sa`, `bho`, `mai`, `awa`, `bra`, `mag`, `raj`, `kok`, `gom`, `knn-Deva`, `hne`, `bgc`, `sck` … (+2 more) | Shree Devi Kumar | `../keyboards/release/itrans/itrans_devanagari_hindi` |
| Vedic Sanskrit Devanagari Phonetic (ITRANS) | `itrans_devanagari_sanskrit_vedic` | `sa`, `hi`, `mr` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_devanagari_sanskrit_vedic` |
| Gujarati Phonetic (ITRANS) | `itrans_gujarati` | `gu`, `ae-Gujr` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_gujarati` |
| Gurmukhi Phonetic (ITRANS) | `itrans_gurmukhi` | `pa`, `sd-Guru` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_gurmukhi` |
| Odia/Oriya Phonetic (ITRANS) | `itrans_odia` | `or`, `bdv`, `bfw`, `dso`, `gbj`, `gdb`, `hoc-Orya`, `jun`, `kff-Orya`, `kxv-Orya`, `kyw-Orya`, `pci-Orya`, `peg`, `sat-Orya`, `spv`, `srb-Orya` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_odia` |
| Ibọnọ Chwerty | `ibono_chwerty` | `ibn` | Rogers Katelem Edeh | `../keyboards/release/i/ibono_chwerty` |
| Korean RR | `korean_rr` | `ko` | © 2010-2023 SIL International | `../keyboards/release/k/korean_rr` |
| Kayah [Myanmar] (SIL) | `sil_kayah_mymr` | `kyu-Mymr` | © SIL Global | `../keyboards/release/sil/sil_kayah_mymr` |
| Kcho (SIL) | `sil_kcho` | `mwq`, `dao` | SIL Global | `../keyboards/release/sil/sil_kcho` |
| Khmer Angkor | `khmer_angkor` | `km` | Makara Sok | `../keyboards/release/k/khmer_angkor` |
| Komono (Côte d'Ivoire) | `komono_ci` | `kqg` | Kirk Rogers | `../keyboards/release/k/komono_ci` |
| Lao 2008 Basic | `lao_2008_basic` | `lo` | © John Durdin | `../keyboards/release/l/lao_2008_basic` |
| Malayalam Mozhi | `mozhi_malayalam` | `ml` | Cibu C. J. | `../keyboards/release/m/mozhi_malayalam` |
| Nulisa Aksara Jawa | `jawa` | `id-Java`, `jv-Java`, `kaw-Java`, `mad-Java`, `sas-Java`, `su-Java`, `osi`, `tes` | Benny Lin | `../keyboards/release/j/jawa` |
| Masaram Gondi (ITRANS) | `masaram_gondi` | `gon-Gonm` | Rajesh Kumar Dhuriya | `../keyboards/release/m/masaram_gondi` |
| Pak Urdu Phonetic | `pak_urdu_phonetic` | `ur` | Nashit Ahmed Barq | `../keyboards/release/p/pak_urdu_phonetic` |
| Piaroa | `pid_piaroa` | `pid-Latn` | Eddie Antonio Santos | `../keyboards/release/p/pid_piaroa` |
| Remington GAIL (SIL) | `remington_gail` | `hi` | © SIL Global | `../keyboards/release/r/remington_gail` |
| Russian Mnemonic R | `russian_mnemonic_r` | `ru` | Tigran Sarukhanyan | `../keyboards/release/r/russian_mnemonic_r` |
| Umatilla Sahaptin/Ičiškíin | `sahaptin_umatilla` | `uma` | Jonathan A. Geary | `../keyboards/release/s/sahaptin_umatilla` |
| Saraiki | `saraiki` | `skr` | Parvez Qadir | `../keyboards/release/s/saraiki` |
| Bengali National/Jatiya (SIL) | `sil_bengali_national_jatiya` | `bn` | © SIL Global | `../keyboards/release/sil/sil_bengali_national_jatiya` |
| Cameroon AZERTY | `sil_cameroon_azerty` | `aal`, `agq`, `muc`, `bss`, `aku`, `ael`, `ato`, `azo`, `bbk`, `bfj`, `bwt`, `ksf`, `bfd`, `bkc`, `bqz` … (+263 more) | Matthew Lee | `../keyboards/release/sil/sil_cameroon_azerty` |
| Cameroon QWERTY | `sil_cameroon_qwerty` | `aal`, `agq`, `muc`, `bss`, `aku`, `ael`, `ato`, `azo`, `bbk`, `bfj`, `bwt`, `ksf`, `bfd`, `bkc`, `bqz` … (+263 more) | Matthew Lee | `../keyboards/release/sil/sil_cameroon_qwerty` |
| Devanagari Phonetic (SIL) | `sil_devanagari_phonetic` | `hi`, `mai`, `lif-Deva`, `cdm-Deva` | 2002-2020 SIL International | `../keyboards/release/sil/sil_devanagari_phonetic` |
| Eastern Congo | `sil_eastern_congo` | `ln`, `alz`, `rwm`, `asv`, `avu`, `bbm`, `bdh`, `bcp`, `bxg`, `bbe`, `bnx`, `brm`, `bkf`, `bmb`, `bct` … (+86 more) | © SIL Global | `../keyboards/release/sil/sil_eastern_congo` |
| SIL Ethiopic Power-G | `sil_ethiopic_power_g` | `am`, `bst`, `bcq`, `gdl-Ethi`, `mdx`, `gez`, `guk-Ethi`, `kxc-Ethi`, `suq-Ethi`, `tig`, `zay-Ethi`, `mul-Ethi` | SIL Ethiopia | `../keyboards/release/sil/sil_ethiopic_power_g` |
| EuroLatin (SIL) | `sil_euro_latin` | `aae`, `acf`, `act`, `af`, `aig`, `ale`, `aln`, `an`, `ang`, `ast`, `azd`, `azn`, `azz`, `bah`, `bar` … (+341 more) | Copyright (c) SIL Global | `../keyboards/release/sil/sil_euro_latin` |
| Hebrew (SIL) | `sil_hebrew` | `hbo` | © SIL Global | `../keyboards/release/sil/sil_hebrew` |
| IPA (SIL) | `sil_ipa` | `und-Latn` | Martin Hosken, Lorna Evans | `../keyboards/release/sil/sil_ipa` |
| Khmer (SIL) | `sil_khmer` | `km`, `brb`, `cmo-Khmr`, `jra-Khmr`, `kdt-Khmr`, `krr`, `krv`, `kxm-Khmr`, `tpu` | D. Kanjahn | `../keyboards/release/sil/sil_khmer` |
| Myanmar3 (SIL) | `sil_myanmar_my3` | `my` | © SIL Global | `../keyboards/release/sil/sil_myanmar_my3` |
| Pan Africa Mnemonic (SIL) | `sil_pan_africa_mnemonic` | `bjt`, `bin`, `efi`, `ee`, `fon`, `ff`, `fub-Latn`, `fue`, `fuh`, `ha`, `idu`, `ig`, `dyu`, `kbp`, `kr` … (+12 more) | Lorna Evans | `../keyboards/release/sil/sil_pan_africa_mnemonic` |
| Kannada WinScript (NLCI) | `nlci_kannada_winscript` | `kn`, `kfi-Knda`, `tcy`, `sa-Knda` | Binila Sanki, SG NLCI | `../keyboards/release/nlci/nlci_kannada_winscript` |
| Telugu Winscript (NLCI) | `nlci_telugu_winscript` | `te` | Binila Sanki, SG NLCI | `../keyboards/release/nlci/nlci_telugu_winscript` |
| Philippines (SIL) | `sil_philippines` | `tl`, `abc-Latn`, `abp-Latn`, `abx-Latn`, `agn-Latn`, `agt-Latn`, `agy-Latn`, `akl-Latn`, `alj-Latn`, `apf-Latn`, `atd-Latn`, `att-Latn`, `bcl-Latn`, `bgs-Latn`, `bhk-Latn` … (+110 more) | Kåre J. Strømme | `../keyboards/release/sil/sil_philippines` |
| Senegal Bayot AZERTY | `sil_senegal_bda_azerty` | `bda` | SIL Senegal | `../keyboards/release/sil/sil_senegal_bda_azerty` |
| Tchad | `sil_tchad` | `shu-Latn`, `sjg`, `bmi`, `bva`, `bjv`, `bxv`, `bes`, `bid`, `btf`, `bvo`, `glc`, `bvf`, `bub`, `bdm`, `bso` … (+115 more) | Jeff Heath | `../keyboards/release/sil/sil_tchad` |
| Tchad QWERTY | `sil_tchad_qwerty` | `amj`, `sjg`, `bmi`, `bva`, `bjv`, `bxv`, `bes`, `bid`, `btf`, `bvo`, `glc`, `bvf`, `bub`, `bdm`, `bso` … (+116 more) | Jeff Heath & Roger Nadoumngar | `../keyboards/release/sil/sil_tchad_qwerty` |
| Uganda-Tanzania Bantu (SIL) | `sil_uganda_tanzania` | `sw`, `lg-Latn`, `swh-Latn`, `asa-Latn`, `bdp-Latn`, `bez-Latn`, `bou-Latn`, `cgg-Latn`, `cwa-Latn`, `cwe-Latn`, `dhs-Latn`, `dne-Latn`, `doe-Latn`, `fip-Latn`, `gmx-Latn` … (+96 more) | 2004-2020 SIL International | `../keyboards/release/sil/sil_uganda_tanzania` |
| SIL Yi | `sil_yi` | `ii` | Andy Eatough, Dennis Walters, David Rowe | `../keyboards/release/sil/sil_yi` |
| Yorùbá with Dot | `sil_yoruba_dot` | `yo-Latn` | P. Baehr | `../keyboards/release/sil/sil_yoruba_dot` |
| Yorùbá 8 | `sil_yoruba8` | `yo-Latn` | P. Baehr | `../keyboards/release/sil/sil_yoruba8` |
| Sorani Behdini (Qwerty) | `sorani_behdini_arab_qwerty` | `ku-Arab`, `kmr-Arab`, `ku-Arab-TR`, `ckb` | © SIL Global | `../keyboards/release/s/sorani_behdini_arab_qwerty` |
| Takri | `takri` | `xnr-Takr` | (c) manik | `../keyboards/release/t/takri` |
| Tamil 99 | `tamil99` | `ta` | Muthu Nedumaran | `../keyboards/release/tamil/tamil99` |
| த99-விரிவு \| ta99 Extended | `thamizha_tamil99_ext` | `ta` | Umar(csd_one@yahoo.com), Mugunth (mugunth@gmail.com) and K. Sethu (skhome@gmail.com) | `../keyboards/release/t/thamizha_tamil99_ext` |
| சுரதா-பாமுனி \| Suratha Bamini | `thamizha_bamini` | `ta` | © thamizha.com and SIL Global | `../keyboards/release/t/thamizha_bamini` |
| புதிய தட்டெழுதி \| New Typewriter | `thamizha_new_typewriter` | `ta` | Mugunth (mugunth@gmail.com), Umar (csd_one@yahoo.com) and K. Sethu (skhome@gmail.com) | `../keyboards/release/t/thamizha_new_typewriter` |
| Todhri | `todhri` | `sq-Todr`, `als-Todr` | © SIL Global | `../keyboards/release/t/todhri` |
| Triqui Itunyoso | `triqui_itunyoso` | `trq` | Kayla Shames | `../keyboards/release/t/triqui_itunyoso` |
| Unifon | `unifon` | `en` | SIL International | `../keyboards/experimental/u/unifon` |
| Vietnamese Telex | `vietnamese_telex` | `vi` | Mike Vo | `../keyboards/release/v/vietnamese_telex` |
| Wancho | `wancho` | `nnp-Wcho` | Banwang Losu | `../keyboards/experimental/w/wancho` |
| Winchus | `winchus` | `qu` | Alex Castille Larkin (SIL) | `../keyboards/release/w/winchus` |

<!-- BEGIN WINDOWS-LAYOUTS (generated by scripts/codegen-windows-layouts.mjs; do not edit) -->

### Windows-layout Basic keyboards

Every `basic_kbd*` keyboard (the Windows-layout catalog behind the community-layout picker). Regenerate with `node scripts/codegen-windows-layouts.mjs`.

| Keyboard | id | Languages (BCP47) | Author | Path |
| --- | --- | --- | --- | --- |
| Arabic (101) Basic | `basic_kbda1` | `ar` | (c) 2009-2025 SIL Global | `../keyboards/release/basic/basic_kbda1` |
| Arabic (102) Basic | `basic_kbda2` | `ar` | (c) 2009-2025 SIL Global | `../keyboards/release/basic/basic_kbda2` |
| Arabic (102) AZERTY Basic | `basic_kbda3` | `ar` | (c) 2009-2025 SIL Global | `../keyboards/release/basic/basic_kbda3` |
| ADLaM Basic | `basic_kbdadlm` | `ff-Adlm`, `fuf-Adlm` | © 2021 SIL International | `../keyboards/release/basic/basic_kbdadlm` |
| Albanian Basic | `basic_kbdal` | `sq`, `als-Latn` | © 2008-2019 SIL International | `../keyboards/release/basic/basic_kbdal` |
| Armenian Eastern Basic | `basic_kbdarme` | `hy` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdarme` |
| Armenian Phonetic Basic | `basic_kbdarmph` | `hy` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdarmph` |
| Armenian Typewriter Basic | `basic_kbdarmty` | `hy` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdarmty` |
| Armenian Western Basic | `basic_kbdarmw` | `hy` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdarmw` |
| Azeri Cyrillic Basic | `basic_kbdaze` | `azj-Cyrl`, `az-Cyrl`, `azb-Cyrl` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdaze` |
| Azeri Latin Basic | `basic_kbdazel` | `azj-Latn-AZ` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdazel` |
| Azerbaijani (Standard) Basic | `basic_kbdazst` | `azj-Latn` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdazst` |
| Bashkir Basic | `basic_kbdbash` | `ba-Cyrl` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbash` |
| Belgian French Basic | `basic_kbdbe` | `fr` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbe` |
| Belgian (Comma) Basic | `basic_kbdbene` | `fr` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdbene` |
| Bulgarian (Phonetic) Basic | `basic_kbdbgph` | `bg` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbgph` |
| Bulgarian (Phonetic Traditional) Basic | `basic_kbdbgph1` | `bg` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdbgph1` |
| Bosnian (Cyrillic) Basic | `basic_kbdbhc` | `bs-Cyrl` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbhc` |
| Belarusian Basic | `basic_kbdblr` | `be` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdblr` |
| Portuguese (Brazilian) Basic | `basic_kbdbr` | `pt-BR`, `pt` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdbr` |
| Bulgarian (Typewriter) Basic | `basic_kbdbu` | `bg` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbu` |
| Buginese Basic | `basic_kbdbug` | `bug-Bugi`, `mak-Bugi`, `mdr-Bugi` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdbug` |
| Bulgarian Basic | `basic_kbdbulg` | `bg` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdbulg` |
| Canadian French Basic | `basic_kbdca` | `fr-CA` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdca` |
| Canadian Multilingual Standard Basic | `basic_kbdcan` | `fr-CA`, `fr` | © 2014-2022 SIL International | `../keyboards/release/basic/basic_kbdcan` |
| Cherokee Nation Basic | `basic_kbdcher` | `chr-Cher` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdcher` |
| Cherokee Nation Phonetic Basic | `basic_kbdcherp` | `chr` | (c) SIL International | `../keyboards/release/basic/basic_kbdcherp` |
| Croatian/Slovenian Basic | `basic_kbdcr` | `sl`, `hr`, `bs` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdcr` |
| Czech Basic | `basic_kbdcz` | `cs` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdcz` |
| Czech (QWERTY) Basic | `basic_kbdcz1` | `cs` | (c) 2009-2022 SIL International | `../keyboards/release/basic/basic_kbdcz1` |
| Czech Programmers Basic | `basic_kbdcz2` | `cs` | (c) 2009-2022 SIL International | `../keyboards/release/basic/basic_kbdcz2` |
| Danish Basic | `basic_kbdda` | `da` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdda` |
| Divehi Phonetic Basic | `basic_kbddiv1` | `dv` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbddiv1` |
| Divehi Typewriter Basic | `basic_kbddiv2` | `dv` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbddiv2` |
| United States-Dvorak Basic | `basic_kbddv` | `en` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbddv` |
| Dzongkha Basic | `basic_kbddzo` | `dz` | © 2019-2023 SIL International | `../keyboards/release/basic/basic_kbddzo` |
| Spanish Variation Basic | `basic_kbdes` | `es` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdes` |
| Estonian Basic | `basic_kbdest` | `et` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdest` |
| Persian Basic | `basic_kbdfa` | `fa` | (c) SIL Global | `../keyboards/release/basic/basic_kbdfa` |
| Persian (Standard) Basic | `basic_kbdfar` | `fa` | Makara SOK | `../keyboards/release/basic/basic_kbdfar` |
| Finnish Basic | `basic_kbdfi` | `fi` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdfi` |
| Finnish-Swedish with Sami Basic | `basic_kbdfi1` | `se-Latn`, `fi`, `sv` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdfi1` |
| Faeroese Basic | `basic_kbdfo` | `fo` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdfo` |
| French Basic | `basic_kbdfr` | `fr` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdfr` |
| Futhark Basic | `basic_kbdfthrk` | `de-Runr`, `non-Runr` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdfthrk` |
| Gaelic Basic | `basic_kbdgae` | `gd-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgae` |
| Georgian Basic | `basic_kbdgeo` | `ka` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdgeo` |
| Georgian (Ergonomic) Basic | `basic_kbdgeoer` | `ka` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgeoer` |
| Georgian Ministry of Education and Science Schools Basic | `basic_kbdgeome` | `ka` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdgeome` |
| Georgian (Old Alphabets) Basic | `basic_kbdgeooa` | `ka` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdgeooa` |
| Georgian (QWERTY) Basic | `basic_kbdgeoqw` | `ka` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgeoqw` |
| Greek Latin Basic | `basic_kbdgkl` | `el-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgkl` |
| Guarani Basic | `basic_kbdgn` | `gn` | © SIL Global | `../keyboards/release/basic/basic_kbdgn` |
| German Basic | `basic_kbdgr` | `de` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdgr` |
| German (IBM) Basic | `basic_kbdgr1` | `de` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgr1` |
| Greenlandic Basic | `basic_kbdgrlnd` | `kl` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdgrlnd` |
| Gothic Basic | `basic_kbdgthc` | `got-Goth` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdgthc` |
| Hausa Basic | `basic_kbdhau` | `ha-Latn` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdhau` |
| Hawaiian Basic | `basic_kbdhaw` | `haw-Latn-US` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdhaw` |
| Greek Basic | `basic_kbdhe` | `el` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdhe` |
| Greek (220) Basic | `basic_kbdhe220` | `el` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdhe220` |
| Greek (319) Basic | `basic_kbdhe319` | `el` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdhe319` |
| Hebrew Basic | `basic_kbdheb` | `he` | (c) SIL Global | `../keyboards/release/basic/basic_kbdheb` |
| Hebrew (Standard) Basic | `basic_kbdhebl3` | `he` | © SIL Global | `../keyboards/release/basic/basic_kbdhebl3` |
| Greek (220) Latin Basic | `basic_kbdhela2` | `el-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdhela2` |
| Greek (319) Latin Basic | `basic_kbdhela3` | `el-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdhela3` |
| Greek Polytonic Basic | `basic_kbdhept` | `el` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdhept` |
| Hungarian Basic | `basic_kbdhu` | `hu` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdhu` |
| Hungarian 101-key Basic | `basic_kbdhu1` | `hu` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdhu1` |
| Igbo Basic | `basic_kbdibo` | `ig-Latn` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdibo` |
| Icelandic Basic | `basic_kbdic` | `is` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdic` |
| Assamese - INSCRIPT Basic | `basic_kbdinasa` | `as` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdinasa` |
| Bengali - INSCRIPT Basic | `basic_kbdinbe2` | `bn` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdinbe2` |
| Bengali Basic | `basic_kbdinben` | `bn` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdinben` |
| Devanagari - INSCRIPT Basic | `basic_kbdindev` | `hi` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdindev` |
| India Basic | `basic_kbdinen` | `en`, `hi-Latn` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdinen` |
| Gujarati Basic | `basic_kbdinguj` | `gu` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinguj` |
| Hindi Traditional Basic | `basic_kbdinhin` | `hi` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinhin` |
| Kannada Basic | `basic_kbdinkan` | `kn` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinkan` |
| Malayalam Basic | `basic_kbdinmal` | `ml` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinmal` |
| Marathi Basic | `basic_kbdinmar` | `mr` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdinmar` |
| Oriya Basic | `basic_kbdinori` | `or` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinori` |
| Punjabi Basic | `basic_kbdinpun` | `pa` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdinpun` |
| Tamil Basic | `basic_kbdintam` | `ta` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdintam` |
| Telugu Basic | `basic_kbdintel` | `te` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdintel` |
| Inuktitut - Naqittaut Basic | `basic_kbdinuk2` | `iu-Latn`, `iu` | (c) SIL International | `../keyboards/release/basic/basic_kbdinuk2` |
| Irish Basic | `basic_kbdir` | `en` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdir` |
| Italian Basic | `basic_kbdit` | `it` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdit` |
| Italian (142) Basic | `basic_kbdit142` | `it` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdit142` |
| Inuktitut - Latin Basic | `basic_kbdiulat` | `iu-Latn`, `iu` | (c) SIL Global | `../keyboards/release/basic/basic_kbdiulat` |
| Javanese Basic | `basic_kbdjav` | `jv-Java` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdjav` |
| Kazakh Basic | `basic_kbdkaz` | `kk` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdkaz` |
| Khmer Basic | `basic_kbdkhmr` | `km` | (c) SIL Global | `../keyboards/release/basic/basic_kbdkhmr` |
| Khmer (NIDA) Basic | `basic_kbdkni` | `km` | © SIL Global | `../keyboards/release/basic/basic_kbdkni` |
| Central Kurdish Basic | `basic_kbdkurd` | `ckb` | © SIL Global | `../keyboards/release/basic/basic_kbdkurd` |
| Kyrgyz Cyrillic Basic | `basic_kbdkyr` | `ky-Cyrl` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdkyr` |
| Latin American Basic | `basic_kbdla` | `es` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdla` |
| Lao Basic | `basic_kbdlao` | `lo` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdlao` |
| Lisu (Basic) Basic | `basic_kbdlisub` | `atb-Lisu`, `lis`, `lpo-Lisu`, `nxq-Lisu` | © SIL Global | `../keyboards/release/basic/basic_kbdlisub` |
| Lisu (Standard) Basic | `basic_kbdlisus` | `atb-Lisu`, `lis`, `lpo-Lisu`, `nxq-Lisu` | (c) SIL Global | `../keyboards/release/basic/basic_kbdlisus` |
| Lithuanian IBM Basic | `basic_kbdlt` | `lt` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdlt` |
| Lithuanian Basic | `basic_kbdlt1` | `lt` | © 2008-2019 SIL International | `../keyboards/release/basic/basic_kbdlt1` |
| Lithuanian Standard Basic | `basic_kbdlt2` | `lt` | (c) SIL International | `../keyboards/release/basic/basic_kbdlt2` |
| Latvian Basic | `basic_kbdlv` | `lv` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdlv` |
| Latvian (QWERTY) Basic | `basic_kbdlv1` | `lv` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdlv1` |
| Latvian (Standard) Basic | `basic_kbdlvst` | `lv` | © 2019-2022 SIL International | `../keyboards/release/basic/basic_kbdlvst` |
| Macedonian (FYROM) Basic | `basic_kbdmac` | `mk` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdmac` |
| Macedonian (FYROM) - Standard Basic | `basic_kbdmacst` | `mk` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdmacst` |
| Maori Basic | `basic_kbdmaori` | `mi-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdmaori` |
| Maltese 47-Key Basic | `basic_kbdmlt47` | `mt` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdmlt47` |
| Maltese 48-Key Basic | `basic_kbdmlt48` | `mt` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdmlt48` |
| Mongolian Cyrillic Basic | `basic_kbdmon` | `khk-Cyrl` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdmon` |
| Mongolian (Mongolian Script) Basic | `basic_kbdmonmo` | `khk-Mong`, `mn-Mong` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdmonmo` |
| Traditional Mongolian (Standard) Basic | `basic_kbdmonst` | `khk-Mong` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdmonst` |
| Myanmar (Phonetic order) Basic | `basic_kbdmyan` | `my` | © SIL Global | `../keyboards/release/basic/basic_kbdmyan` |
| Dutch Basic | `basic_kbdne` | `nl` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdne` |
| Nepali Basic | `basic_kbdnepr` | `ne` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdnepr` |
| N’Ko Basic | `basic_kbdnko` | `bm-Nkoo`, `dyu-Nkoo`, `emk-Nkoo`, `man-Nkoo`, `nqo` | (c) 2018-2023 SIL International | `../keyboards/release/basic/basic_kbdnko` |
| Norwegian Basic | `basic_kbdno` | `nb` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdno` |
| Norwegian with Sami Basic | `basic_kbdno1` | `se-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdno1` |
| Setswana Basic | `basic_kbdnso` | `tn` | Makara SOK | `../keyboards/release/basic/basic_kbdnso` |
| New Tai Lue Basic | `basic_kbdntl` | `khb-Talu` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdntl` |
| Ogham Basic | `basic_kbdogham` | `pgl-Ogam` | Makara SOK | `../keyboards/release/basic/basic_kbdogham` |
| Ol Chiki Basic | `basic_kbdolch` | `sat-Olck` | Makara SOK | `../keyboards/release/basic/basic_kbdolch` |
| Old Italic Basic | `basic_kbdoldit` | `ett`, `osc`, `pgn`, `umc`, `xhr`, `xum-Ital`, `xve` | Makara SOK | `../keyboards/release/basic/basic_kbdoldit` |
| Osage Basic | `basic_kbdosa` | `osa-Osge` | © 2021 SIL International | `../keyboards/release/basic/basic_kbdosa` |
| Osmanya Basic | `basic_kbdosm` | `so-Osma` | Makara SOK | `../keyboards/release/basic/basic_kbdosm` |
| Pashto (Afghanistan) Basic | `basic_kbdpash` | `ps` | (c) SIL Global | `../keyboards/release/basic/basic_kbdpash` |
| Phags-pa Basic | `basic_kbdphags` | `zh-Phag-CN`, `khk-Phag-MN`, `mvf-Phag-CN`, `bo-Phag-CN` | Makara SOK | `../keyboards/release/basic/basic_kbdphags` |
| Polish (214) Basic | `basic_kbdpl` | `pl` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdpl` |
| Polish (Programmers) Basic | `basic_kbdpl1` | `pl` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdpl1` |
| Portuguese Basic | `basic_kbdpo` | `pt` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdpo` |
| Romanian (Programmers) Basic | `basic_kbdropr` | `ro` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdropr` |
| Romanian (Standard) Basic | `basic_kbdrost` | `ro` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdrost` |
| Russian Basic | `basic_kbdru` | `ru` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdru` |
| Russian (Typewriter) Basic | `basic_kbdru1` | `ru` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdru1` |
| Russian - Mnemonic Basic | `basic_kbdrum` | `ru` | Makara SOK | `../keyboards/release/basic/basic_kbdrum` |
| Swiss French Basic | `basic_kbdsf` | `fr`, `fr-CH`, `lb` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdsf` |
| Swiss German Basic | `basic_kbdsg` | `de` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsg` |
| Slovak Basic | `basic_kbdsl` | `sk` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsl` |
| Slovak (QWERTY) Basic | `basic_kbdsl1` | `sk` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsl1` |
| Sami Extended Finland-Sweden Basic | `basic_kbdsmsfi` | `se-Latn`, `sma-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsmsfi` |
| Sami Extended Norway Basic | `basic_kbdsmsno` | `se-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsmsno` |
| Sinhala Basic | `basic_kbdsn1` | `si` | (c) SIL International | `../keyboards/release/basic/basic_kbdsn1` |
| Sora Basic | `basic_kbdsora` | `srb-Sora` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdsora` |
| Sorbian Extended Basic | `basic_kbdsorex` | `hsb` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsorex` |
| Sorbian Standard Basic | `basic_kbdsors1` | `hsb` | © SIL International | `../keyboards/release/basic/basic_kbdsors1` |
| Spanish Basic | `basic_kbdsp` | `es` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsp` |
| Swedish Basic | `basic_kbdsw` | `sv` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdsw` |
| Sinhala - Wij 9 Basic | `basic_kbdsw09` | `si` | (c) SIL International | `../keyboards/release/basic/basic_kbdsw09` |
| Syriac Basic | `basic_kbdsyr1` | `cld-Syrc`, `syc-Syrc` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdsyr1` |
| Syriac Phonetic Basic | `basic_kbdsyr2` | `cld-Syrc-IQ` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdsyr2` |
| Tai Le Basic | `basic_kbdtaile` | `blr-Tale`, `shn-Tale`, `tdd-Tale` | (c) 2018-2019 SIL International | `../keyboards/release/basic/basic_kbdtaile` |
| Tajik Basic | `basic_kbdtajik` | `tg-Cyrl` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdtajik` |
| Tamil 99 Basic | `basic_kbdtam99` | `ta` | © 2019 SIL International | `../keyboards/release/basic/basic_kbdtam99` |
| Thai Kedmanee Basic | `basic_kbdth0` | `th` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdth0` |
| Thai Pattachote Basic | `basic_kbdth1` | `th` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdth1` |
| Thai Kedmanee (non-ShiftLock) Basic | `basic_kbdth2` | `th` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdth2` |
| Thai Pattachote (non-ShiftLock) Basic | `basic_kbdth3` | `th` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdth3` |
| Tifinagh (Basic) Basic | `basic_kbdtifi` | `tzm-Tfng` | (c) SIL Global | `../keyboards/release/basic/basic_kbdtifi` |
| Tifinagh (Full) Basic | `basic_kbdtifi2` | `tzm-Tfng`, `thz-Tfng`, `tda`, `thv-Tfng`, `kab-Tfng`, `mzb-Tfng`, `shi`, `shy-Tfng`, `rif-Tfng`, `tmh-Tfng`, `zen`, `zgh` | (c) SIL Global | `../keyboards/release/basic/basic_kbdtifi2` |
| Tibetan (PRC) - Updated Basic | `basic_kbdtiprd` | `bo-Tibt-CN` | (c) 2008-2019 SIL International | `../keyboards/release/basic/basic_kbdtiprd` |
| Tatar Basic | `basic_kbdtt102` | `tt-Cyrl` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdtt102` |
| Turkish F Basic | `basic_kbdtuf` | `tr` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdtuf` |
| Turkish Q Basic | `basic_kbdtuq` | `tr` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdtuq` |
| Turkmen Basic | `basic_kbdturme` | `tk-Latn` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdturme` |
| Central Atlas Tamazight Basic | `basic_kbdtzm` | `tzm` | (c) 2018-2022 SIL International | `../keyboards/release/basic/basic_kbdtzm` |
| Uyghur (Legacy) Basic | `basic_kbdughr` | `ug-Arab` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdughr` |
| Uyghur Basic | `basic_kbdughr1` | `ug` | (c) SIL Global | `../keyboards/release/basic/basic_kbdughr1` |
| United Kingdom Basic | `basic_kbduk` | `en` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbduk` |
| United Kingdom Extended Basic | `basic_kbdukx` | `cy` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdukx` |
| Ukrainian Basic | `basic_kbdur` | `uk` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdur` |
| Ukrainian (Enhanced) Basic | `basic_kbdur1` | `uk` | © 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdur1` |
| Urdu Basic | `basic_kbdurdu` | `ur`, `hno`, `hnd` | © SIL Global | `../keyboards/release/basic/basic_kbdurdu` |
| US Basic | `basic_kbdus` | `en`, `bg-Latn`, `id`, `io-Latn`, `ia-Latn`, `zlm-Latn`, `ms`, `bi-Latn`, `gil-Latn`, `ht`, `mwl-Latn`, `blc-Latn`, `roo-Latn`, `so`, `sw` … (+6 more) | © 2008-2020 SIL International | `../keyboards/release/basic/basic_kbdus` |
| US English Table for IBM Arabic 238_L Basic | `basic_kbdusa` | `en` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdusa` |
| United States-Dvorak for left hand Basic | `basic_kbdusl` | `en` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdusl` |
| United States-Dvorak for right hand Basic | `basic_kbdusr` | `en` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdusr` |
| United States-International Basic | `basic_kbdusx` | `en` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdusx` |
| Uzbek Cyrillic Basic | `basic_kbduzb` | `uzn-Cyrl` | © 2009-2019 SIL International | `../keyboards/release/basic/basic_kbduzb` |
| Vietnamese Basic | `basic_kbdvntc` | `vi` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdvntc` |
| Wolof Basic | `basic_kbdwol` | `wo-Latn` | (c) SIL International | `../keyboards/release/basic/basic_kbdwol` |
| Sakha Basic | `basic_kbdyak` | `sah-Cyrl-RU` | (c) 2018 SIL International | `../keyboards/release/basic/basic_kbdyak` |
| Yoruba Basic | `basic_kbdyba` | `yo-Latn` | (c) 2018-2022 SIL International | `../keyboards/release/basic/basic_kbdyba` |
| Serbian (Cyrillic) Basic | `basic_kbdycc` | `sr` | © 2009-2022 SIL International | `../keyboards/release/basic/basic_kbdycc` |
| Serbian (Latin) Basic | `basic_kbdycl` | `sr-Latn` | (c) 2009-2020 SIL International | `../keyboards/release/basic/basic_kbdycl` |

<!-- END WINDOWS-LAYOUTS -->
