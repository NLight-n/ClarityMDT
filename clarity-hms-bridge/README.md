# ClarityMDT - InstaHMS Bridge Extension

Manifest V3 browser extension (Firefox & Chrome/Edge) that bridges `mrn`, `patientName`, `age`, and `gender` from InstaHMS (`#patientDetailsTab`) into ClarityMDT (`/cases/new`).

## Files
- `manifest.json` — Extension manifest (MV3)
- `parser.js` — Parses `#patientDetailsTab` from live DOM or fetched HTML
- `background.js` — Fetches `EMRMainDisplay.do` using the user's existing InstaHMS session cookies and handles `storage.session` handoff
- `hms-content.js` — Injects **Send to ClarityMDT** above `#patientDetailsTab`
- `clarity-content.js` — Injects **Fetch from HMS** below `#mrn` on ClarityMDT

## Before Deploying to Hospital PCs
1. In `manifest.json`:
   - Add your production ClarityMDT URL (e.g. `http://192.168.10.50/*` or `https://mdt.hospital.local/*`) to `host_permissions` and `content_scripts[1].matches`.
2. In `background.js`:
   - Update `DEFAULT_CLARITY_BASE_URL` to your production ClarityMDT URL.

## Quick Local Testing
### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...** and select `clarity-hms-bridge/manifest.json`.
3. Note: If using an older Firefox ESR that doesn't support `background.service_worker`, change `"service_worker": "background.js"` in `manifest.json` to `"scripts": ["background.js"]`.

### Chrome / Edge
1. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
2. Click **Load unpacked** and select the `clarity-hms-bridge/` folder.
