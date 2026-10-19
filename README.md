# FS PBX Click to Dial — 1.0.8

A Chrome Manifest V3 extension that sends a selected number to an FS PBX desk phone through the existing click-to-dial API. Browser audio, Ringotel and a softphone are not required.

**Distribution:** this is an unpacked extension for manual installation and live testing. It has not been published to or approved by the Chrome Web Store. See `STORE_SUBMISSION.md` for the publication path.

**Source hosting and automatic releases:** see [RELEASING.md](RELEASING.md) for
the `nemerald-voip/fs-pbx-chrome-extension` GitHub release setup, automated
tests and ZIP builds, and optional Chrome Web Store submission. Store automation
is inactive until Google authentication and repository variables are configured.

## Install in desktop Chrome

1. Extract this ZIP to a permanent folder on your computer. Keep that folder after installation.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
5. Pin **FS PBX Click to Dial** using Chrome's Extensions menu.
6. Open the extension and click the settings gear.

No build, npm install, or command line is required to use the extension. Intended for desktop Chrome 127 or newer, on Windows, macOS and Linux. Chrome on iPhone/iPad does not load desktop Chrome extensions. Enterprise browser policies may prohibit unpacked installations.

## Connect FS PBX

Enter these settings:

| Setting | What to enter |
| --- | --- |
| Server address | Your HTTPS portal origin, such as `https://pbx.example.com`. Do not include `/api`, `/login`, or a tenant path. |
| Domain UUID | The FS PBX tenant/account UUID, not the tenant hostname. An administrator can obtain it from the domain record. |
| Your extension | The numeric extension registered on your desk phone. |
| API token | A dedicated token for the relevant FS PBX user. Manage API tokens under **FS PBX → Users**. |

The API user must have access to the tenant and these permissions:

- `phone_control_view` to find registered phones.
- `phone_control_call` to initiate a call.

Leave **Enable phone links on all websites** checked, click **Save connection & find phones**, and approve Chrome's website-access request. The same grant covers the PBX connection and website phone links, so no separate enable button is needed. Discovery performs a GET only; it never places a test call. Select a returned desk phone, then click **Save settings**. If only one desk phone is returned, it is selected in the form; you still need to save it.

Both Save buttons request the selected access directly from your click. To use manual/right-click dialing or individual websites instead, uncheck **Enable phone links on all websites** before saving; Chrome then requests only the PBX hostname if needed. An explicit opt-out stays saved. If you deny the permission request, the extension explains that the save did not complete and does not enable website handling.

If you cannot use phone discovery, enter a known model/user-agent selector (for example `SIP-T53W`) or vendor manually. A selector is required to avoid silently targeting a newly registered Ringotel client or another device. Ringotel registrations are excluded from the discovery list.

Number formatting is unchanged by default, except spaces, parentheses, dots and dashes are removed. Optional settings add a country code to exactly 10-digit national numbers, or remove a leading `+` for routes requiring digits only. Short extensions are unchanged.

## Use it

- **Selected text:** highlight a single phone number, right-click, choose **Call with FS PBX**, review the destination, then click **Call on desk phone**.
- **Phone links:** right-click a `tel:` or `callto:` link and choose **Call phone link with FS PBX**. The link menu also appears on ordinary links, but ordinary web addresses are rejected by number validation.
- **Normal left-click on phone links:** save Settings with **Enable phone links on all websites** checked and approve Chrome's website access request. Alternatively, enter an individual website address under **Phone links on websites** and click **Enable this website**. Existing `tel:`/`callto:` links on enabled sites then open a dial confirmation. Accessible open tabs are updated automatically; use **Refresh phone links in open tabs** or reload the webpage if needed.
- **Manual dialing:** click the toolbar icon, type/paste a number or use the dial pad, then click **Call on desk phone**.

There is always a confirmation screen for numbers coming from webpages. The extension does not turn every plain-text number into a link: use selected-text dialing for those numbers. It does not register a system-wide `tel:` handler for Outlook or other native desktop applications.

## What happens on the phone

FS PBX selects its existing vendor driver. Yealink/Snom and supported Poly devices can receive a remote dial instruction. Grandstream, legacy Polycom and generic devices use the PBX's auto-answer originate path. Firmware and provisioning determine whether that request auto-answers or rings first.

The extension reports **Dial command sent**, not **Call connected**: API acceptance does not prove the handset acted on the request or that the recipient answered. Calls use existing PBX routing. Verify outbound caller ID and CDR behavior on your own deployment. FS PBX v2.0.5 release notes include originating caller-ID fixes for click-to-dial.

## Compatibility and boundaries

- Requires the native FS PBX v1 phone-control and click-to-dial endpoints. It does not use the separate legacy `ctc.php`/Lua integrations.
- FS PBX must be reachable from the computer with a valid HTTPS certificate, directly or over the required VPN. Browser extension host permissions allow cross-origin requests; no broad CORS wildcard or exposed FreeSWITCH ESL port is needed.
- The current click-to-dial endpoint accepts `agent` and `vendor`, not a stable device UUID. Two identical registered phones sharing an extension may not be distinguishable. Give them separate extensions or add precise server-side selection before deploying that configuration. A firmware change may alter the full user-agent string; find and select the phone again.
- Phone numbers must contain 1–15 digits, with optional leading `+`. Postdial extensions, pauses, letters, feature codes, SIP addresses and multiple numbers are rejected instead of guessed.
- Chrome restricts content scripts on internal pages, the Chrome Web Store, and some embedded/PDF surfaces. Use selected text when available or paste into the toolbar dialer. Embedded frames require access to their own hostname.
- Optional website permissions apply to a hostname/scheme across ports, as defined by Chrome match patterns.

### Authorization for a client rollout

Use a dedicated, least-privileged FS PBX user/token, never a superadmin token. The extension's configured source extension is a UI preference; authorization is enforced by FS PBX. Servers with the extension-access hardening can return `forbidden_extension` when the token owner cannot access the configured extension. Verify the user's tenant access, phone-control permissions, and extension access before rollout. Older server versions may not enforce the extension-specific restriction.

## Updating

For an unpacked installation, replace the files in the same installed folder,
click **Reload** at `chrome://extensions`, and refresh open website tabs. Keep the
extension installed to retain its settings.

See [CHANGELOG.md](CHANGELOG.md) for version history and
[RELEASING.md](RELEASING.md) for the release workflow.

## Errors and retries

| Symptom | Check |
| --- | --- |
| Website opens FaceTime or another phone app | Enable phone links in Settings, then refresh the open-tab handlers or reload the website. The toolbar's phone configuration is separate from website handling. |
| 401 / invalid token | Replace the token in Settings. |
| 403 / missing access | Tenant access, `phone_control_view` / `phone_control_call`, and access to the configured extension. |
| 403 / forbidden_extension | The configured extension must be authorized for the API token's user in FS PBX. |
| 404 | Correct portal address, tenant UUID, extension and installed API version. |
| No phones found / 409 | Registration, model detection and supported phone configuration. |
| Cannot reach server | HTTPS certificate, DNS, connectivity, VPN and proxy redirects. |
| Command sent but nothing happens | Phone firmware/provisioning and FS PBX/FreeSWITCH logs. |
| No confirmation received | The call may already have started. Check the desk phone before explicitly starting another call. |

The extension does not automatically retry a call. It reserves request IDs before sending, blocks immediate duplicate submissions, and retains recent reservations for the current browser session. This is local duplicate prevention, not server-side idempotency and not a global lock across computers.

To change the server, supply a new token. Blank tokens preserve the existing token only on the same server. **Forget connection** removes the saved token, settings, website choices, registered website scripts, optional hostname permissions and transient request state; it does not revoke the token at the PBX. Revoke it under Users if needed. Accessible open tabs are updated when integration is disabled or removed; reload a webpage if Chrome could not update it.

## Source and verification

The extension uses plain HTML/CSS/JavaScript with no runtime dependencies, remote code, analytics or external calling backend.

- `manifest.json`: Manifest V3 configuration and optional hostname permissions.
- `background.js`: API calls, trusted-message boundary and duplicate prevention.
- `core.js`: validation, number formatting and API payloads.
- `popup.*`: dialer and confirmation window.
- `options.*`: connection and desk-phone settings.
- `content.js`: opted-in phone-link handler.
- `website-links.js`: saved website choices, registration recovery and open-tab handler refresh.
- `tests/`: Node tests for formatting, API behavior, message authorization and UI behavior using test doubles.

Run `npm test` with Node 20+; no dependency installation is needed. See `TEST_REPORT.md` for the exact validation completed and the live tests still required.

## Reference API

```http
GET /api/v1/domains/{domain_uuid}/phone-control/targets?extension=101
Authorization: Bearer <token>

POST /api/v1/domains/{domain_uuid}/click-to-dial
Authorization: Bearer <token>
Content-Type: application/json

{"extension":"101","destination":"18005551212","agent":"SIP-T53W","vendor":"yealink"}
```

Sources checked on 2026-10-19:

- https://www.fspbx.com/docs/api/v1/fs-pbx-api/
- https://www.fspbx.com/docs/api/v1/create-a-click-to-dial-call/
- https://github.com/nemerald-voip/fspbx/blob/main/app/Http/Controllers/Api/V1/PhoneControlController.php
- https://github.com/nemerald-voip/fspbx/blob/main/app/Services/ClickToDialService.php
- https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world
