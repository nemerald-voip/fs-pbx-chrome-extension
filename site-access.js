export const ALL_SITE_PATTERNS = ['https://*/*', 'http://*/*'];

// Call directly from a user click, before other asynchronous work, so Chrome
// can show its native permission prompt. No grant is assumed or bypassed.
export async function requestAllSites(enabled) {
  if (enabled && !await chrome.permissions.request({origins: ALL_SITE_PATTERNS})) {
    throw new Error('All-sites access was not granted. Right-click dialing is still available.');
  }
}
