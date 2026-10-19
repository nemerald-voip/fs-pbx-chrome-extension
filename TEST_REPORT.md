# Validation report — 1.0.8

Date: 2026-10-19

## Completed

- 28 automated tests passed using Node's built-in test runner.
- All JavaScript files passed `node --check` syntax validation.
- Manifest V3 structure and referenced local assets checked.
- Four icon sizes generated from the included SVG.
- API routes, bearer authentication, request fields and response semantics compared with current FS PBX source/documentation.
- Chrome API compatibility checked; Chrome 127 is the minimum because the extension opens its toolbar popup through `chrome.action.openPopup()`.

Tests cover:

- Phone-number cleanup, encoded links, country-code handling and preserving short extensions.
- Rejecting unsafe/unsupported dial strings and invalid server addresses.
- Token retention and requiring a replacement when switching servers.
- Authenticated GET discovery and POST dialing with the expected payload.
- Distinguishing `sent: false` from success, HTTP permission errors and uncertain network failures.
- The supplied `forbidden_extension` response produces the specific extension-access message for both discovery and dialing.
- No automatic redial, duplicate request prevention and reservations across a simulated worker restart.
- Rejecting webpage requests to read settings, mutate configuration or call the dial endpoint.
- Content scripts only opening a confirmation for trusted clicks on opted-in sites.
- Website links and context-menu selections use the toolbar popup without creating another browser window or placing a call.
- Pending numbers stay scoped to the originating browser window, are consumed once, and expire for prefill after five minutes.
- If Chrome rejects automatic opening, the pending number remains available through the toolbar icon.
- Popup display strips valid phone-link schemes, including encoded pasted links, while retaining invalid links for correction.
- Popup preview, explicit confirmation and preventing repeated submits.
- Settings discovery and saving the selected phone without placing a call.
- All-sites opt-in requires the Chrome grant; denial does not enable it.
- HTTP/HTTPS matching, revoked-access checks, and preserving individual sites when all-sites mode is disabled.
- Website-access controls live in Settings; enabling/disabling phone links never places calls.
- Cleared registrations are restored from saved all-site and individual choices after a simulated extension update; explicitly disabled choices stay disabled.
- Revoking host access removes registrations and blocks content-script requests; existing preferences resume only after Chrome access is granted again.
- Open-tab refresh targets allowed websites, falls back to the top frame when an inaccessible child frame blocks injection, and respects per-frame choices.
- Reinjection removes the previous click listener so a phone link is intercepted once.
- Legacy registrations are migrated when available; host grants alone never imply website opt-in.
- Both Save actions request the selected host permissions before asynchronous messages. An accepted request saves the connection and enables handlers; denial does neither and shows a visible error. Saving with an explicit opt-out requests only the PBX hostname and keeps all-sites handling disabled.

## Not yet verified

Chrome/DOM/fetch dependencies are test doubles in the automated tests. A Chrome/Chromium executable was unavailable in the build environment, so the extension has **not been loaded into a real browser or visually inspected there**. No real API token, PBX or handset was used. These tests do not certify actual phone compatibility or Chrome Web Store approval.

## Live acceptance test

1. Load the unpacked extension in desktop Chrome and check for manifest/service-worker errors on `chrome://extensions`.
2. Open Settings and enter a dedicated restricted test user's connection. Leave **Enable phone links on all websites** checked. Click **Save connection & find phones** and verify the Chrome permission request appears directly from that click, without using the separate website controls.
3. Use **Save connection & find phones**. Confirm the right tenant, extension and desk phone appear, with no call initiated.
4. Select the phone, save, then place one internal test call using the toolbar. Confirm the intended handset originates/answers and both sides have audio.
5. Highlight a formatted telephone number on a normal webpage. Right-click to call; verify the toolbar dropdown shows the intended destination and makes no call until confirmed.
6. Uncheck **Enable phone links on all websites** and save, then add one individual test website. Click a `tel:` link and verify the toolbar dropdown opens with the number filled in, with no separate window and no call until confirmed. Confirm one dial request. Disable it and confirm the normal website behavior returns, refreshing the webpage if needed.
7. In Settings, enable phone links on all sites. Approve the Chrome prompt once, then visit a second HTTP/HTTPS site and confirm phone links work without another site grant. Disable it, reload tabs, and verify individual-site settings still work. Deny the permission on a fresh install and verify the option stays off.
8. Make a permitted external test call. Confirm outbound caller ID, routing and CDR records. Do not use emergency or premium-rate destinations for testing.
9. Double-click the Call button. Confirm only one call starts. Simulate a failed request and confirm it does not retry automatically.
10. Test coexistence with any softphone registration. If two identical desk phones share an extension, resolve device selection on the server before rollout.
11. Restart Chrome and verify saved settings and enabled sites persist. Confirm the API token is never shown in page URLs or website content-script storage.

12. In Settings, trigger a rejected phone-discovery request while near the top of the form and a failed save while scrolled down. Confirm the error notification is immediately visible, wraps on a narrow window, and can be dismissed without changing the form or scroll position.
13. Enable all-site phone links, keep a website open, then reload the extension at `chrome://extensions`. Confirm the saved choice remains enabled and a phone-link click opens the toolbar dropdown without invoking FaceTime or another system app. Repeat with one individual website. Test **Refresh phone links in open tabs** without manually refreshing the page.
14. Disable website handling, reload the extension, and verify it stays disabled. Revoke a saved site's access in Chrome and verify the extension does not re-grant it. Restore access explicitly and confirm the saved handler resumes. Test a page with an inaccessible cross-origin child frame and verify the permitted top-frame link still works.
15. On a fresh install, deny the website permission requested by Save. Verify no connection is saved and no website handler is enabled. Then uncheck the website option, save with only PBX access, and verify toolbar dialing is available while all-sites handling stays off. Save again and confirm it stays off. Verify both Save buttons work with already granted permissions without showing another prompt.

Complete these checks before client rollout or store submission, and record the Chrome version, FS PBX version, handset model and firmware.
