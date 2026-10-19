# Changelog

Version history for FS PBX Click to Dial. These entries describe each version
at release time; use the [README](README.md) for current setup and behavior.

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
