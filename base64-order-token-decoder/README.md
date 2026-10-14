# Order Token Base64 Decoder — Chrome Extension

A tiny, fully-offline Chrome extension that shows a decoded **base64 `ordertoken`** in normal, readable form.

**New in v1.1 — right-click decode:** select an ordertoken anywhere on any web page, right-click → **“Decode Base64 / ordertoken”** → the decoded fields open in a tab. Or paste/click **Sample** in the popup as before.

```
ordertoken:
MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==

decoded ordertoken:
3389#2025#34#1$$3862180#86219489#DME#27556$$3389#3862180#27556#1
```

| Field             | Value     |
|-------------------|-----------|
| FacilityId        | 3389      |
| PatientId         | 3862180   |
| VisitId           | 86219489  |
| WQ order number   | 27556     |
| Year              | 2025      |
| Week              | 34        |
| Order type        | DME       |

## Token format

Segments are separated by `$$`, fields inside a segment by `#`:

```
facilityId # year # week # flag $$ patientId # visitId # type # wqOrderNo $$ facilityId # patientId # wqOrderNo # flag
```

* Segment 1 → FacilityId, Year, Week, Flag
* Segment 2 → PatientId, VisitId, Order type, WQ order number
* Segment 3 → cross-check block (shown under “All segments”)

The parser is tolerant: it locates the year by pattern (`20xx`) instead of a fixed index, works with unpadded or URL-safe base64, strips whitespace/wrapped lines, ignores an `ordertoken:` prefix, decodes UTF-8, and still displays plain base64 text that isn't a token at all. Anything it can't map stays visible under “Extra / unparsed fields”.

## Install on Windows (unpacked / developer mode)

1. **Copy the folder to your PC** — e.g. put `base64-order-token-decoder` at
   `C:\Users\<you>\Documents\base64-order-token-decoder`.
   Keep the folder name unchanged (Chrome reads the extension name from `manifest.json`, not the folder).
   ⚠️ Do **not** load it straight from a ZIP — extract it first; the folder must contain `manifest.json` directly.
2. **Open Chrome's extensions page**: press `Ctrl+L`, type `chrome://extensions`, hit Enter.
3. **Enable Developer mode**: toggle switch at the top-right of that page.
4. Click **Load unpacked** (top-left) → in the file picker choose the
   `base64-order-token-decoder` folder → **Select Folder**.
5. The card "Order Token Base64 Decoder" now appears. Click the **puzzle-piece icon** in the toolbar
   (right side of the address bar) → pin 📌 **Order Token Base64 Decoder**.
6. Click the pinned icon to open the popup. Done.

Troubleshooting:
- *"Manifest file is missing or unreadable"* → you picked the parent folder or a ZIP. Pick the folder that
  itself contains `manifest.json` + `popup.html` + `icons\`.
- Extension shows an error badge → open **Errors** on its card, fix/reload with `Ctrl+R` on the card.
- Moved/deleted the folder later → the extension breaks; reload it from the new path via **Load unpacked**.
- Windows Defender/OneDrive: if the folder sits in a roaming OneDrive folder, keep it there but don't
  let a sync-in-progress lock files; `Documents` is the safest place.

## Usage

| Action                        | How                                             |
|-------------------------------|-------------------------------------------------|
| **Right-click decode**        | Select the token on any web page → right-click → **Decode Base64 / ordertoken** (opens a tab with the result). Works on selections and inside text inputs/textareas. |
| Decode in popup               | Paste into the box (auto-decodes) or press **Decode** / `Ctrl+Enter` |
| Paste from clipboard          | **📋 Paste** button (falls back to `Ctrl+V`)    |
| Try the example               | **Sample** button                               |
| Copy a value                  | Click any field card / chip, or ⧉ next to the decoded string |
| Reset                         | **Clear** button                                |
| History                       | The last token is remembered between popup opens |

Privacy: decoding runs locally — no network calls, no analytics. The `http/https` host permission exists only so the right-click menu can read your selection on ordinary web pages; it never sends anything anywhere. Chrome's built-in pages (`chrome://…`), the Web Store, and `file://` pages (unless you enable “Allow access to file URLs”) can't be scripted — there the decoder tab simply opens for manual paste.

## Files

```
base64-order-token-decoder/
├── manifest.json    # MV3 manifest (popup + background service worker + contextMenus)
├── background.js    # registers the right-click menu, grabs the selection, opens decode.html
├── shared.js        # base64 decode + ordertoken parser (used by popup & decoder tab)
├── decoder-ui.js    # UI logic shared by popup.html and decode.html
├── popup.html       # toolbar popup markup
├── decode.html      # full-tab decoder opened from the context menu
├── popup.css        # styles (dark theme)
└── icons/           # 16/32/48/128 px toolbar icons
```

## Tests

Repo root (not part of the extension); both drive the real files headlessly with jsdom:

```bash
npm install jsdom
node test-popup.js         # popup: fields, edge cases, persistence (26 assertions)
node test-contextmenu.js   # right-click flow: menu registration, selection hand-off, auto-decode (24 assertions)
```
