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

## Update 1.0.8: enable phone links on Save and preserve them after updates

Both Save buttons now request website access and activate phone links when **Enable phone links on all websites** is checked. This option is selected by default when there is no saved website choice; existing individual-site choices and explicit opt-outs are respected. The request runs immediately from the user's Save gesture, and the all-sites grant also covers the HTTPS PBX. No separate trip to the website-access controls is needed to finish setup.

Earlier versions kept website choices only in Chrome's dynamic script registrations, which Chrome clears when an extension updates or reloads. The toolbar could still show a configured phone while website links reached the operating system's phone app, such as FaceTime.

Website choices are now saved separately in local extension storage. The extension restores handlers after updates, browser startup and permission changes, while respecting Chrome's current host permissions. Enabling a site also refreshes its accessible open tabs. Settings shows whether phone links are enabled and includes **Refresh phone links in open tabs**. Refreshing replaces the existing handler without adding duplicate click listeners or placing a call.

To recover from an older version:

1. Replace the files in the **same installed folder** and click **Reload** at `chrome://extensions`. Do not uninstall the extension.
2. Close/reopen Settings. Leave **Enable phone links on all websites** checked and click **Save settings**. Approve Chrome's request if shown. An older choice already erased by Chrome cannot be recovered from permission grants alone, so this one-time save may be required. If you prefer individual sites, leave the checkbox off and add your website again.
3. Cancel any FaceTime prompt, then click the website phone link again. Saving refreshes accessible open tabs; refresh the webpage if Chrome could not update that tab. The separate **Refresh phone links in open tabs** control is available for recovery without saving settings.

Future updates preserve these saved choices. A configured phone in the toolbar does not by itself enable website-link handling. Explicitly disabled choices stay disabled, and revoked Chrome access is never silently re-granted.

## Update 1.0.7: visible Settings feedback

Settings errors and status messages now appear in a fixed notification at the top of the visible browser area. No scrolling is needed to see a failed action, and the form keeps its current scroll position. Errors remain visible until dismissed with the × button or replaced by the next status message. Screen readers receive errors as alerts.

## Update 1.0.6: extension-access errors

Recognizes HTTP 403 with `error.code: forbidden_extension` from the hardened FS PBX API. Both phone discovery and dialing now explain that the API token's user lacks access to the configured extension and point to the extension number and user access settings. This replaces the generic proxy/firewall diagnostic for that code. Other unknown 403 responses retain the fallback message.

## Update 1.0.5: open the toolbar dropdown

Clicking an enabled website phone link or using either right-click dialing action now opens the FS PBX toolbar dropdown with the number filled in. It no longer creates a separate browser window. You still click **Call on desk phone** to place the call.

Requires Chrome 127 or newer for `chrome.action.openPopup()`. Pin the extension to make the dialer easy to find. The selected number is passed through temporary extension session storage for the originating browser window, consumed once, and ignored after five minutes. If Chrome cannot open the dropdown automatically, the icon shows a badge; click it in the same browser window to load the pending number. There is no fallback that opens a separate window.

After updating, reload the extension and refresh website tabs so they use the updated phone-link handler.

## Update 1.0.4: simpler main view

Website names, site-access status and permission buttons have moved out of the dialer. Use the Settings gear → **Phone links on websites** to enable all websites or add/remove individual websites. Existing website choices remain saved. The extension no longer requests the `activeTab` permission.

## Update 1.0.3: display the phone number

Clicked or pasted valid `tel:`/`callto:` links now show only the number in the dialer field. The **Will dial** preview still applies your country-code and leading-plus preferences. Invalid links remain visible for correction; unsupported parameters are not silently dropped.

## Update 1.0.2: one approval for all websites

Settings offers **Enable phone links on all sites**. This requests optional access to HTTP and HTTPS websites together through Chrome. Once approved, new websites do not need separate grants. Chrome still controls access; users or administrators can restrict it, and internal pages and the Chrome Web Store remain restricted.

The all-sites option is off until explicitly enabled. Switching it off preserves individually enabled sites. Reload existing website tabs after changing it. Switching handling off does not revoke previously granted Chrome permissions; use Chrome’s extension Site access controls to change permission grants, or **Forget connection** to remove all optional grants and saved connection data.

## Update 1.0.1: brand color and clearer authorization errors

The extension icon now uses the FS PBX gold sampled from the supplied reference (sRGB `#FFB801`), with white phone and arrow symbols.

The extension now reads FS PBX's structured error response instead of replacing every HTTP 403 with the same message:

- `forbidden_permission` identifies `phone_control_view` (discovery) or `phone_control_call` (dialing).
- `forbidden_domain` identifies a tenant-access rejection.
- Unrecognized or non-JSON 403 responses remain explicitly unclassified, including possible proxy/firewall responses.

To update an unpacked installation, overwrite the files in the **same installed folder**, click **Reload** on its card at `chrome://extensions`, close/reopen the Settings tab, and retry. Saved settings are retained. Do not remove the extension first.

In FS PBX, open **Group Manager**, choose **Permissions** for the group assigned to the user who owns the API token, and enable the required phone-control permissions. Verify that user's allowed accounts include the tenant selected in the extension. Permissions are evaluated for the token owner, not whichever administrator happens to be logged into the portal. Permission checks can be cached for up to ten minutes; creating another token for the same user does not change that user's permissions.

This update improves diagnosis; it does not change permissions on your PBX.

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
