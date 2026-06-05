# DISCUS Keyboard Design Principles

From the EMDC Online 2023 presentation: *Introducing Keyboard Development: Goodbye Awkward Keyboard. Hello Keyman\!* By Marc Durdin (SIL International).

—

The DISCUS Principles are a framework for designing effective keyboard layouts. Each letter stands for a core principle:

- \- **D** \- Discoverability  
- \- **I** \- Intuition  
- \- **S** \- Simplicity  
- \- **C** \- Consistency  
- \- **U** \- Usability  
- \- **S** \- Standards

—

## D \- Discoverability

- Make it easy to find all letters, even rare ones.  
- \- Reduce experimentation: experimentation is the typical user experience today.  
-   \- Most English users never try typing accents.  
- \- Keyboards for languages with more characters than keys are rarely obvious to a first-time user.

—

## I \- Intuition

- When the iPhone was released, it felt ‘magic’ and ‘intuitive’ compared to other devices at the time.  
- \- Hard to quantify; you know it when you have it.

**Examples of intuitive design:**

- Holding a key to show related characters.  
- \- Double-tap shift key to engage Caps Lock.  
- \- Double-space signifies end of sentence and inserts a full stop automatically.  
- \- Consider what Backspace should do.

—

## S \- Simplicity

### KISS (Keep It Simple)

- Resist the temptation to include lots of extra characters.  
- \- Carefully consider every extra character you add to your keyboard.  
- \- Don’t overload keys with too many variants.

### Consider Target Users

- Users have a key to switch keyboards.  
- \- One keyboard per language.  
- \- Specialized keyboards for specialized uses.

### Separate Input from Encoding

- Consider which technical details can be hidden from users.  
-   \- Control characters (ZWJ, ZWNJ, etc.)  
-   \- Composed vs. decomposed characters (NFC vs. NFD)  
- \- Consider input order vs. encoding order:  
-   \- Thai \- encoded ‘visually’  
-   \- Khmer \- encoded ‘phonetically’

### Consider Fixing Invalid Sequences

- It may be possible to type sequences which are technically invalid in the encoding.  
- \- Consider correcting these automatically.

—

## C \- Consistency

- How closely does your keyboard correspond to orthographic conventions or phonetic (spoken word) representations?  
- \- How well do you understand the rules for writing the language?

### Understanding Script Structure

- Understanding the structure of the script is foundational to a good design (linguistic analysis).  
- \- Well-researched layouts are more successful.  
-   \- Many users will not have the level of understanding of the script required to design a good keyboard layout.  
-   \- But they will intuitively feel that the keyboard works better for them.

### Questions to Consider

- Is alphabetic order sensible, or grouped by sound?  
- \- Which letters are rare?  
- \- What are common sequences and pairs?  
- \- Frequency analysis (Dvorak, Colemak)? Note: small touch devices reduce the benefit.

—

## U \- Usability

- Keyboard design may look amazing on paper; great concepts often feel awkward in practice.  
- \- Testing is the only way to be sure.  
- \- Consider who your target users are:  
-   \- Experienced users vs. novice users  
-   \- Native speakers vs. foreigners

### Usability Rules of Thumb (Mobile)

- Number of rows: phone: 4-5 rows; tablet: 5 rows.  
- \- Number of keys per row: phone: 10; tablet: 13\.  
- \- Backspace, Enter, etc.: don’t move or resize across layers.  
- \- Layer switch keys: toggle back to the previous layer.  
- \- Long-press: 3-4 options (no more than 8-10).

—

## S \- Standards

- Unicode compliance.  
- \- Legislated and societal requirements.  
- \- Accessibility laws.  
- \- Mandated characters (e.g. currency symbols).  
- \- Consistency with majority languages or layouts (e.g. INSCRIPT).

—

## Summary

| Letter | Principle | Core Idea |  
|--------|-----------|-----------|  
| D | Discoverability | Make all characters easy to find |  
| I | Intuition | Design so the keyboard feels natural without explanation |  
| S | Simplicity | Keep it focused; separate input from encoding |  
| C | Consistency | Align with script structure and linguistic conventions |  
| U | Usability | Test with real users; good on paper does not equal good in practice |  
| S | Standards | Follow Unicode, accessibility laws, and locale conventions |