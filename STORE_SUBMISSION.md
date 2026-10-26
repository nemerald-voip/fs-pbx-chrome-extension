# Publishing as an FS PBX Chrome Web Store extension

The publisher confirmed that the first extension release is approved and published.
Keep using the same store item for updates. See [RELEASING.md](RELEASING.md) for
automatic submission on main pushes and the one-time Google connection.
The first-listing checklist below is retained for reference.

## Publication steps

1. Complete the live Chrome/PBX/handset checks in `TEST_REPORT.md`.
2. Use the FS PBX owner's Chrome Web Store developer account. Complete Google's registration and account requirements.
3. Complete the publisher details and use the public privacy-policy and support URLs below.
4. Capture at least one real screenshot of the finished extension in Chrome, at 1280×800 or 640×400 pixels. Upload the 128×128 icon from `icons/128.png`. The 440×280 small promo tile and 1400×560 marquee are optional. Do not show production tokens or client numbers.
5. Run `python3 scripts/package.py` and upload `dist/fs-pbx-click-to-dial-1.0.8.zip`. It contains `manifest.json` at the root and the runtime assets. If downloading a GitHub Actions artifact, extract its outer ZIP and upload the extension ZIP inside it. Do not upload the repository source bundle.
6. In the developer dashboard, upload it as a new item, complete Store Listing, Privacy, Distribution and Test instructions, then submit for review.
7. Provide a restricted demo PBX account and test phone workflow if Google needs authenticated access to review the feature. Do not provide a production administrator token.
8. After approval, publish it using your selected distribution mode. For subsequent releases, increment the manifest version and upload the update to the same listing.

The source is Manifest V3 and does not depend on manually installed native software. Store publication enables the normal Chrome installation/update flow. Manual unpacked installations are updated by replacing their local files and reloading the extension.

## Listing URLs

- Homepage: https://github.com/nemerald-voip/fs-pbx-chrome-extension
- Support: https://github.com/nemerald-voip/fs-pbx-chrome-extension/issues
- Privacy policy: https://github.com/nemerald-voip/fs-pbx-chrome-extension/blob/main/PRIVACY.md

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

## Reviewer test access

Provide a dedicated demo tenant, HTTPS server address, domain UUID, source extension,
restricted API token and approved test destination in Google's private **Test
instructions** tab. The demo token needs tenant and source-extension access plus
`phone_control_view` and `phone_control_call`. Keep the test phone registered and
explain how reviewers can observe the dialing result. Enter the details directly
in the dashboard; do not commit them to GitHub.

Test steps: open Settings, save the supplied connection and approve the selected
website access, discover/select the demo phone, save settings, then use the toolbar
to dial the supplied test destination. Also test selecting a number on a webpage
and using **Call with FS PBX** to open the confirmation dropdown.

After the item is created, retain its extension ID and publisher ID for the
GitHub publishing setup in `RELEASING.md`.

Official publication instructions, checked 2026-10-24:

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
