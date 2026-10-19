# FS PBX Click to Dial — privacy details

Version 1.0.8 — 2026-10-19

This extension sends phone numbers you choose to dial to the FS PBX server you configure. It does not use an external analytics or calling service.

## Information used

- **Connection details:** PBX HTTPS address, tenant UUID, extension number, selected phone model/vendor and number-formatting preferences.
- **Authentication:** your FS PBX bearer token.
- **Selected numbers:** text you submit through the context menu, phone links you click on opted-in websites, and numbers entered into the dialer.
- **Enabled websites:** hostname match patterns for individually enabled sites, or an all-websites setting when you choose that option.
- **Pending selection:** a clicked/selected number, its browser window and tab IDs, and a timestamp, used only to prefill the toolbar dialer.
- **Temporary requests:** request IDs, destination/source phone details and timestamps used to prevent immediate duplicate dial submissions.

Settings, token and enabled-website choices are stored in `chrome.storage.local` in this browser profile, not `chrome.storage.sync`. Website choices are retained separately from Chrome's script registrations so they can be restored after extension updates. The token is protected from this extension's content-script access and is never returned to a webpage or included in a URL. Local browser storage is not an encrypted credential vault and may be accessible to someone controlling the browser profile or computer.

Temporary duplicate-prevention state uses `chrome.storage.session`, which is not persisted across browser restarts. Expired entries are pruned on the next dial request; at most 40 recent reservations are retained. The extension does not retain a separate call history. Pending selections also use session storage: they are removed when the dialer reads them, are ignored if over five minutes old, and do not persist across browser restarts.

## Network use

The extension sends API requests directly to the configured HTTPS PBX. The bearer token is included in the Authorization header. Call requests contain the source extension, destination number and phone selector. Phone discovery requests contain the source extension. Browser cookies are not sent and redirects are rejected.

The PBX and its operator may store their normal API/call logs. Their retention and privacy practices are outside this extension's control.

## Website access

Selected-text context-menu dialing does not require reading the entire page. Optional phone-link integration listens for user clicks on `tel:` or `callto:` links on individual hostnames you enable or, after a one-time Chrome permission approval, on all HTTP/HTTPS websites. It does not collect page contents, browsing history, contacts or microphone audio. Individual website addresses entered in Settings are used locally to request access and save phone-link preferences. Chrome may describe the broad grant as permission to read and change data on all websites. The extension only listens for phone-link clicks; it does not scan or transmit whole pages. Disabling phone-link handling does not revoke Chrome permission grants; change them in Chrome Site access or choose Forget connection.

When restoring or changing website integration, the extension queries matching open tabs and replaces its local phone-link handler where Chrome allows access. This operation uses tab addresses locally; it does not retain or transmit those addresses or place calls.

The Settings form selects **Enable phone links on all websites** by default when no website choice has been saved. Either Save button requests that optional Chrome access and enables phone links after approval. Uncheck it before saving to request only the PBX hostname. Explicit opt-outs and individual-site preferences are retained.

## Removing information

Choose **Forget connection** in Settings to remove this extension's saved connection and token, optional website integration permissions, and temporary request state. Uninstalling the extension removes its local extension storage. Revoke the token separately in FS PBX if it should no longer be usable.

For a Chrome Web Store release, the publisher must host this policy at a public URL and supply its actual support/contact details. This document is not a claim that a store listing already exists.
