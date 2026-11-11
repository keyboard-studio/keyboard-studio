// The symbols layer of the owner's Template Cleanup scripts (`symbols.json`,
// MattGyverLee/KeymanValidation): a `symbol` layer of digits, punctuation and
// currency signs whose `*abc*` key returns to `default`. Embedded as data so
// the touch upgrade can add it to a layout that has none (spec 111 T059c).
// Plain JSON-compatible data: `addTouchSymbolsLayerRaw` deep-copies it per use.
//
// Every character key is a `U_xxxx` key, which types its own code point with
// no rule. The upgrade edits only the touch layout, so a `T_` key here would
// type nothing (symbols.json's `T_` digits and punctuation relied on rules the
// .kmn never got). Multi-code-point `U_xxxx_yyyy` ids need Keyman 15.0
// (KM07002), so symbols.json's Cameroon-specific `T_FCFA` key is left out
// rather than reworked for keyboards on older `&VERSION`s.

export const SYMBOLS_LAYER: { id: string; row: Array<{ id: number | string; key: Array<Record<string, unknown>> }> } = {
  "id": "symbol",
  "row": [
    {
      "id": 1,
      "key": [
        {
          "id": "U_0031",
          "text": "1"
        },
        {
          "id": "U_0032",
          "text": "2"
        },
        {
          "id": "U_0033",
          "text": "3"
        },
        {
          "id": "U_0034",
          "text": "4"
        },
        {
          "id": "U_0035",
          "text": "5"
        },
        {
          "id": "U_0036",
          "text": "6"
        },
        {
          "id": "U_0037",
          "text": "7"
        },
        {
          "id": "U_0038",
          "text": "8"
        },
        {
          "id": "U_0039",
          "text": "9"
        },
        {
          "id": "U_0030",
          "text": "0"
        },
        {
          "id": "K_BKSP",
          "text": "*BkSp*",
          "sp": 1
        }
      ]
    },
    {
      "id": 2,
      "key": [
        {
          "id": "U_002A",
          "text": "*"
        },
        {
          "id": "U_0023",
          "text": "#"
        },
        {
          "id": "U_0025",
          "text": "%"
        },
        {
          "id": "U_005F",
          "text": "_",
          "nextlayer": "default"
        },
        {
          "id": "U_0026",
          "text": "&",
          "nextlayer": "default"
        },
        {
          "id": "U_002D",
          "text": "-"
        },
        {
          "id": "U_002B",
          "text": "+"
        },
        {
          "id": "U_0028",
          "text": "(",
          "sk": [
            {
              "text": "[",
              "id": "U_005B",
              "nextlayer": "default"
            },
            {
              "text": "{",
              "id": "U_007B",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_0029",
          "text": ")",
          "sk": [
            {
              "text": "]",
              "id": "U_005D",
              "nextlayer": "default"
            },
            {
              "text": "}",
              "id": "U_007D",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_003C",
          "text": "<"
        },
        {
          "id": "U_003E",
          "text": ">"
        }
      ]
    },
    {
      "id": 3,
      "key": [
        {
          "id": "U_0040",
          "text": "@",
          "nextlayer": "default"
        },
        {
          "id": "U_0022",
          "text": "\"",
          "nextlayer": "default",
          "sk": [
            {
              "text": "“",
              "id": "U_201C",
              "nextlayer": "default"
            },
            {
              "text": "”",
              "id": "U_201D",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_0027",
          "text": "'",
          "nextlayer": "default",
          "sk": [
            {
              "text": "‘",
              "id": "U_2018",
              "nextlayer": "default"
            },
            {
              "text": "’",
              "id": "U_2019",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_003A",
          "text": ":",
          "layer": "default"
        },
        {
          "id": "U_003B",
          "text": ";",
          "layer": "default"
        },
        {
          "id": "U_0021",
          "text": "!",
          "nextlayer": "default",
          "layer": "default",
          "sk": [
            {
              "text": "¡",
              "id": "U_00A1",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_003F",
          "text": "?",
          "nextlayer": "default",
          "layer": "default",
          "sk": [
            {
              "text": "¿",
              "id": "U_00BF",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_00AB",
          "text": "«",
          "nextlayer": "default",
          "sk": [
            {
              "text": "‹",
              "id": "U_2039",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_00BB",
          "text": "»",
          "nextlayer": "default",
          "sk": [
            {
              "text": "›",
              "id": "U_203A",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_003D",
          "text": "="
        },
        {
          "id": "U_007C",
          "text": "|",
          "nextlayer": "default"
        }
      ]
    },
    {
      "id": 4,
      "key": [
        {
          "id": "U_007E",
          "text": "~"
        },
        {
          "id": "U_00A9",
          "text": "©",
          "nextlayer": "default",
          "sk": [
            {
              "text": "®",
              "id": "U_00AE",
              "nextlayer": "default"
            },
            {
              "text": "™",
              "id": "U_2122",
              "nextlayer": "default"
            }
          ]
        },
        {
          "id": "U_002F",
          "text": "/",
          "nextlayer": "default"
        },
        {
          "id": "U_005C",
          "text": "\\",
          "nextlayer": "default"
        },
        {
          "id": "U_002C",
          "text": ",",
          "layer": "default"
        },
        {
          "id": "U_0024",
          "text": "$"
        },
        {
          "id": "U_20AC",
          "text": "€"
        },
        {
          "id": "U_00A3",
          "text": "£"
        },
        {
          "id": "U_00A5",
          "text": "¥"
        }
      ]
    },
    {
      "id": 5,
      "key": [
        {
          "id": "K_LOWER",
          "text": "*abc*",
          "sp": 2,
          "nextlayer": "default"
        },
        {
          "id": "K_LOPT",
          "text": "*Menu*",
          "width": 100,
          "sp": 1
        },
        {
          "id": "K_SPACE",
          "text": "",
          "width": 625,
          "sp": 0,
          "layer": "default"
        },
        {
          "id": "U_002E",
          "text": ".",
          "width": 150,
          "layer": "default"
        },
        {
          "id": "K_ENTER",
          "text": "*Enter*",
          "width": 155,
          "sp": 1
        }
      ]
    }
  ]
};
