# Creating a Simplified Template 

## Create a new Project from a Windows Keyboard
In Keyman Developer:
- Project>New Project>Import Windows Keyboard>OK.
- Choose a base keyboard.
- Set up Metadata, choose an ID in lowercase, add something to description to enable OK.

## KMN Caps Rules
- Open the .kmn in code view.
- Replace "NCAPS " with nothing.
- Delete all lines with "[CAPS".
- Add &Capskeys for the keyboard after &KEYBOARDVERSION if the language has casing. See [Capsifesto](https://docs.google.com/document/d/1UjXSIhvM7-UoSaz53V3upyz8sI53y1SsLa-FWmfFQnQ/edit?tab=t.0). 
    - QWERTY/QWERTZ: `store(&CasedKeys) [K_A]..[K_Z]`
    - AZERTY: `store(&CasedKeys) [K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]`

## Touch Layout Tab, Code View
- Carefully delete "phone".
- Duplicate shifted layers and call them caps.
- For all non-modifier keys on layers that are not "default" and don't include caps in the layer name, set "nextlayer": "default".
