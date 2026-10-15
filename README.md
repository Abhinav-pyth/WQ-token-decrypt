# Base64 Order Token Decoder — Repository

This repository contains **Order Token Base64 Decoder**, a tiny, fully-offline Chrome
extension (Manifest V3) that decodes base64-encoded `ordertoken` strings into readable
fields (FacilityId, PatientId, VisitId, WQ order number, Year, Week, Order type).

## Repository layout

```
.
├── base64-order-token-decoder/   # The Chrome extension (load this folder unpacked)
│   ├── manifest.json             # MV3 manifest (popup + background service worker + contextMenus)
│   ├── background.js             # Registers the right-click menu, grabs selection, opens decode.html
│   ├── shared.js                 # Base64 decode + ordertoken parser (shared by popup & decoder tab)
│   ├── decoder-ui.js             # UI logic shared by popup.html and decode.html
│   ├── popup.html / popup.css    # Toolbar popup (dark theme)
│   ├── decode.html               # Full-tab decoder opened from the context menu
│   ├── dom.js, tokens.js         # Popup helper modules
│   ├── icons/                    # 16/32/48/128 px toolbar icons
│   └── README.md                 # Full documentation: install, usage, token format, privacy
├── test-popup.js                 # Headless jsdom test harness for the popup (not part of the extension)
├── test-contextmenu.js           # Headless jsdom test harness for the right-click decode flow
├── package.json                  # Dev dependency: jsdom
└── package-lock.json
```

## Quick start

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `base64-order-token-decoder/` folder.
3. Pin the extension, then either paste a token in the popup or select a token on any
   web page and right-click → **“Decode Base64 / ordertoken”**.

Full installation, usage, troubleshooting, and privacy details are in
[`base64-order-token-decoder/README.md`](base64-order-token-decoder/README.md).

## Running the tests

Both test scripts drive the real extension files headlessly with jsdom:

```bash
npm install            # installs jsdom
node test-popup.js         # popup: fields, edge cases, persistence (26 assertions)
node test-contextmenu.js   # right-click flow: menu registration, selection hand-off, auto-decode (24 assertions)
```

## Example

```
ordertoken:
MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==

decoded:
3389#2025#34#1$$3862180#86219489#DME#27556$$3389#3862180#27556#1
```

Privacy: all decoding runs locally — no network calls, no analytics.
