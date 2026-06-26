# Keyboard phonebook

A lookup table of the Keyman keyboards this project **references** — in [spec.md](../spec.md), the content scan reports, test fixtures, and tooling. Use it to find a keyboard by name, language, author, or where its source lives on disk.

The keyboards themselves are **not** in this repo. They live in a sibling checkout of [keymanapp/keyboards](https://github.com/keymanapp/keyboards) at `../keyboards` (i.e. `<parent>/keyboards`). Every `Path` below is written relative to the keyboard-studio repo root.

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
| akan | `akan` | `ak` | dcshci lab | `../keyboards/release/a/akan` |
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
| Canadian French Basic | `basic_kbdca` | `fr-CA` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdca` |
| French Basic | `basic_kbdfr` | `fr` | (c) 2009-2019 SIL International | `../keyboards/release/basic/basic_kbdfr` |
| Khmer (NIDA) Basic | `basic_kbdkni` | `km` | © SIL Global | `../keyboards/release/basic/basic_kbdkni` |
| US Basic | `basic_kbdus` | `en`, `bg-Latn`, `id`, `io-Latn`, `ia-Latn`, `zlm-Latn`, `ms`, `bi-Latn`, `gil-Latn`, `ht`, `mwl-Latn`, `blc-Latn`, `roo-Latn`, `so`, `sw` … (+6 more) | © 2008-2020 SIL International | `../keyboards/release/basic/basic_kbdus` |
| BU Phonetic | `bu_phonetic` | `fr`, `de`, `und-Latn`, `es` | J. Albert Bickford | `../keyboards/release/b/bu_phonetic` |
| Clavier du Burkina | `clavbur9` | `bm`, `bbo`, `beh`, `bfo`, `bib`, `bmq`, `bof`, `box`, `bwj`, `bwq`, `bwy`, `bxl`, `cme`, `dgd`, `dgs` … (+18 more) | © SIL Burkina Faso | `../keyboards/release/c/clavbur9` |
| Simplified Chinese | `cs_pinyin` | `zh` | SIL International | `../keyboards/release/c/cs_pinyin` |
| Common Devanagari | `common_devanagari` | `hi` | © 2021 WIn Publishing Trust | `../keyboards/release/c/common_devanagari` |
| Naija NFD | `el_naija` | `abn-Latn`, `bky-Latn`, `bwr-Latn`, `deg-Latn`, `igb-Latn`, `bin-Latn`, `efi-Latn`, `eka-Latn`, `ekp-Latn`, `elm-Latn`, `enn-Latn`, `ish-Latn`, `gbr-Latn`, `aaa-Latn`, `gkn-Latn` … (+37 more) | Andrew Cunningham and Chinedu Uchechukwu | `../keyboards/release/el/el_naija` |
| Pasifika | `el_pasifika` | `mi-Latn`, `rar-Latn`, `fj`, `haw-Latn`, `niu`, `sm`, `ty-Latn`, `to` | © 2018 Enabling Languages | `../keyboards/release/el/el_pasifika` |
| Övdalsk | `elfdalian` | `ovd` | Craig Cornelius | `../keyboards/experimental/e/elfdalian` |
| தமிழ்99 \| Tamil99 | `ekwtamil99uni` | `ta` | Mugunth, Umar, K. Sethu | `../keyboards/release/e/ekwtamil99uni` |
| Enggano | `enggano` | `eno` | Mary Dalrymple | `../keyboards/release/e/enggano` |
| ᓀᐦᐃᔭᐍᐏᐣ (Plains Cree) | `fv_plains_cree` | `crk` | (c) 2015-2025 FirstVoices, SIL Global, 2015 First Peoples' Cultural Foundation | `../keyboards/release/fv/fv_plains_cree` |
| Gautami Bangla/Bengali | `gautami_bangla_bengali` | `bn-IN` | Gautam Sengupta | `../keyboards/release/gautami/gautami_bangla_bengali` |
| Gautami Devanagari | `gautami_devanagari` | `hi`, `sa` | Gautam Sengupta | `../keyboards/release/gautami/gautami_devanagari` |
| Gautami IndiTran | `gautami_inditran` | `la` | Gautam Sengupta | `../keyboards/release/gautami/gautami_inditran` |
| Gautami Thamizh/Tamil | `gautami_thamizh_tamil` | `ta` | Gautam Sengupta | `../keyboards/release/gautami/gautami_thamizh_tamil` |
| Geba Karen (Myanmar) | `geba_karen_mymr` | `kvq` | Copyright © SIL Global | `../keyboards/release/g/geba_karen_mymr` |
| GFF Amharic | `gff_amharic` | `am` | The Geʾez Frontier Foundation | `../keyboards/release/gff/gff_amharic` |
| GFF Geʾez Manuscript | `gff_geez_emufi` | `gez` | The Geʾez Frontier Foundation | `../keyboards/experimental/gff/gff_geez_emufi` |
| Hausa Kano | `hausa_kano` | `ha-Latn` | Hamza Sulayman | `../keyboards/release/h/hausa_kano` |
| Bengali Phonetic (ITRANS) | `itrans_bengali` | `bn`, `as` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_bengali` |
| Hindi Devanagari Phonetic (ITRANS) | `itrans_devanagari_hindi` | `hi`, `mr`, `sa`, `bho`, `mai`, `awa`, `bra`, `mag`, `raj`, `kok`, `gom`, `knn-Deva`, `hne`, `bgc`, `sck` … (+2 more) | Shree Devi Kumar | `../keyboards/release/itrans/itrans_devanagari_hindi` |
| Vedic Sanskrit Devanagari Phonetic (ITRANS) | `itrans_devanagari_sanskrit_vedic` | `sa`, `hi`, `mr` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_devanagari_sanskrit_vedic` |
| Gujarati Phonetic (ITRANS) | `itrans_gujarati` | `gu`, `ae-Gujr` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_gujarati` |
| Gurmukhi Phonetic (ITRANS) | `itrans_gurmukhi` | `pa`, `sd-Guru` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_gurmukhi` |
| Odia/Oriya Phonetic (ITRANS) | `itrans_odia` | `or`, `bdv`, `bfw`, `dso`, `gbj`, `gdb`, `hoc-Orya`, `jun`, `kff-Orya`, `kxv-Orya`, `kyw-Orya`, `pci-Orya`, `peg`, `sat-Orya`, `spv`, `srb-Orya` | Shree Devi Kumar | `../keyboards/release/itrans/itrans_odia` |
| Ibọnọ Chwerty | `ibono_chwerty` | `ibn` | Rogers Katelem Edeh | `../keyboards/release/i/ibono_chwerty` |
| Kayah [Myanmar] (SIL) | `sil_kayah_mymr` | `kyu-Mymr` | © SIL Global | `../keyboards/release/sil/sil_kayah_mymr` |
| Khmer Angkor | `khmer_angkor` | `km` | Makara Sok | `../keyboards/release/k/khmer_angkor` |
| Komono (Côte d'Ivoire) | `komono_ci` | `kqg` | Kirk Rogers | `../keyboards/release/k/komono_ci` |
| Lao 2008 Basic | `lao_2008_basic` | `lo` | © John Durdin | `../keyboards/release/l/lao_2008_basic` |
| Malayalam Mozhi | `mozhi_malayalam` | `ml` | Cibu C. J. | `../keyboards/release/m/mozhi_malayalam` |
| Nulisa Aksara Jawa | `jawa` | `id-Java`, `jv-Java`, `kaw-Java`, `mad-Java`, `sas-Java`, `su-Java`, `osi`, `tes` | Benny Lin | `../keyboards/release/j/jawa` |
| Masaram Gondi (ITRANS) | `masaram_gondi` | `gon-Gonm` | Rajesh Kumar Dhuriya | `../keyboards/release/m/masaram_gondi` |
| Pak Urdu Phonetic | `pak_urdu_phonetic` | `ur` | Nashit Ahmed Barq | `../keyboards/release/p/pak_urdu_phonetic` |
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
| Tchad QWERTY | `sil_tchad_qwerty` | `amj`, `sjg`, `bmi`, `bva`, `bjv`, `bxv`, `bes`, `bid`, `btf`, `bvo`, `glc`, `bvf`, `bub`, `bdm`, `bso` … (+116 more) | Jeff Heath & Roger Nadoumngar | `../keyboards/release/sil/sil_tchad_qwerty` |
| Uganda-Tanzania Bantu (SIL) | `sil_uganda_tanzania` | `sw`, `lg-Latn`, `swh-Latn`, `asa-Latn`, `bdp-Latn`, `bez-Latn`, `bou-Latn`, `cgg-Latn`, `cwa-Latn`, `cwe-Latn`, `dhs-Latn`, `dne-Latn`, `doe-Latn`, `fip-Latn`, `gmx-Latn` … (+96 more) | 2004-2020 SIL International | `../keyboards/release/sil/sil_uganda_tanzania` |
| SIL Yi | `sil_yi` | `ii` | Andy Eatough, Dennis Walters, David Rowe | `../keyboards/release/sil/sil_yi` |
| Yorùbá with Dot | `sil_yoruba_dot` | `yo-Latn` | P. Baehr | `../keyboards/release/sil/sil_yoruba_dot` |
| Yorùbá 8 | `sil_yoruba8` | `yo-Latn` | P. Baehr | `../keyboards/release/sil/sil_yoruba8` |
| Sorani Behdini (Qwerty) | `sorani_behdini_arab_qwerty` | `ku-Arab`, `kmr-Arab`, `ku-Arab-TR`, `ckb` | © SIL Global | `../keyboards/release/s/sorani_behdini_arab_qwerty` |
| Tamil 99 | `tamil99` | `ta` | Muthu Nedumaran | `../keyboards/release/tamil/tamil99` |
| த99-விரிவு \| ta99 Extended | `thamizha_tamil99_ext` | `ta` | Umar(csd_one@yahoo.com), Mugunth (mugunth@gmail.com) and K. Sethu (skhome@gmail.com) | `../keyboards/release/t/thamizha_tamil99_ext` |
| சுரதா-பாமுனி \| Suratha Bamini | `thamizha_bamini` | `ta` | © thamizha.com and SIL Global | `../keyboards/release/t/thamizha_bamini` |
| புதிய தட்டெழுதி \| New Typewriter | `thamizha_new_typewriter` | `ta` | Mugunth (mugunth@gmail.com), Umar (csd_one@yahoo.com) and K. Sethu (skhome@gmail.com) | `../keyboards/release/t/thamizha_new_typewriter` |
| Triqui Itunyoso | `triqui_itunyoso` | `trq` | Kayla Shames | `../keyboards/release/t/triqui_itunyoso` |
| Vietnamese Telex | `vietnamese_telex` | `vi` | Mike Vo | `../keyboards/release/v/vietnamese_telex` |
| Wancho | `wancho` | `nnp-Wcho` | Banwang Losu | `../keyboards/experimental/w/wancho` |
| Winchus | `winchus` | `qu` | Alex Castille Larkin (SIL) | `../keyboards/release/w/winchus` |
