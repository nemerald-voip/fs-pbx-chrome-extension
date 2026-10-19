# Publishing as an FS PBX Chrome Web Store extension

This package is currently a manual-install development release. No developer account has been registered, no submission has been made and Google approval is not implied.

## Publication steps

1. Complete the live Chrome/PBX/handset checks in `TEST_REPORT.md`.
2. Use the FS PBX owner's Chrome Web Store developer account. Complete Google's registration and account requirements.
3. Add your actual publisher/support details and host the privacy policy at an FS PBX-controlled public URL.
4. Capture real screenshots of the finished extension in Chrome and prepare the listing artwork required by the dashboard. Do not show production tokens or client numbers.
5. Create a ZIP with `manifest.json` at the root. Include the runtime HTML/JS/CSS, icons and privacy document. Tests and developer documentation can be excluded from the store upload.
6. In the developer dashboard, upload it as a new item, complete Store Listing, Privacy, Distribution and Test instructions, then submit for review.
7. Provide a restricted demo PBX account and test phone workflow if Google needs authenticated access to review the feature. Do not provide a production administrator token.
8. After approval, publish it using your selected distribution mode. For subsequent releases, increment the manifest version and upload the update to the same listing.

The source is Manifest V3 and does not depend on manually installed native software. Store publication enables the normal Chrome installation/update flow. Manual unpacked installations are updated by replacing their local files and reloading the extension.

## Suggested listing information

Name: **FS PBX Click to Dial**

Short description: **Send selected phone numbers and phone links to your FS PBX desk phone.**

Single purpose: **Initiate calls from a user's registered FS PBX desk phone using phone numbers selected or entered in Chrome.**

Description:

Select a phone number on a webpage and send it to your desk phone. FS PBX Click to Dial connects directly to your FS PBX server using its click-to-dial API.

- Right-click selected numbers to open a dial confirmation.
- Dial from the toolbar using a number field and keypad.
- Optionally handle phone links on individual websites or all websites with one approval.
- Find registered desk phones and select the device to use.
- Keep conversation audio on the desk phone.

Requires a compatible FS PBX server, a registered desk phone, and an API token with the appropriate access. Phone behavior depends on model, firmware and provisioning.

## Permission explanations

| Permission | Purpose |
| --- | --- |
| storage | Store connection preferences/token locally and temporary duplicate-request state in session storage. |
| contextMenus | Offer selected-number and phone-link dialing from Chrome's right-click menu. |
| scripting | Install and restore a local phone-link click handler on opted-in websites, including accessible open tabs after updates or settings changes. |
| Optional HTTPS hosts | Connect to the user's chosen HTTPS PBX and optionally handle phone links on HTTPS websites. |
| Optional HTTP hosts | Optionally handle phone links on HTTP websites, including internal legacy CRMs. PBX tokens are never sent over HTTP. |

All JavaScript is packaged locally. There is no remotely hosted code or evaluation of downloaded scripts. Declare authentication information and phone-number handling accurately in Google's Privacy questionnaire; transmission to the user's PBX must be disclosed even though the publisher does not operate a collection backend.

Official publication instructions, checked 2026-10-19:

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
