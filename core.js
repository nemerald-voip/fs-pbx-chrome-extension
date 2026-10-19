export const DEFAULTS = Object.freeze({server: '', domain: '', extension: '', token: '', agent: '', vendor: '', countryCode: '', stripPlus: false});
export const VENDORS = ['yealink', 'poly', 'polycom', 'snom', 'grandstream', 'generic'];

export function serverOrigin(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('Enter the complete HTTPS address of your FS PBX server.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Use only the HTTPS server address, such as https://pbx.example.com, without a path or login details.');
  }
  return url.origin;
}

export function hostPattern(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Open a regular website to enable phone links.');
  // Chrome match patterns cover every port on a hostname.
  return `${url.protocol}//${url.hostname}/*`;
}

export function validateSettings(input, existing = DEFAULTS) {
  const result = {...DEFAULTS};
  result.server = serverOrigin(input.server);
  result.domain = String(input.domain || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.domain)) throw new Error('Enter the tenant domain UUID, not its hostname.');
  result.extension = String(input.extension || '').trim();
  if (!/^\d{1,20}$/.test(result.extension)) throw new Error('Enter your numeric desk-phone extension.');
  const suppliedToken = String(input.token || '').trim().replace(/^Bearer\s+/i, '');
  if (!suppliedToken && existing.server && existing.server !== result.server) throw new Error('Enter a new API token when changing the server.');
  result.token = suppliedToken || existing.token;
  if (!result.token || /\s/.test(result.token)) throw new Error('Enter an API bearer token from FS PBX.');
  result.agent = String(input.agent || '').trim();
  result.vendor = String(input.vendor || '').trim();
  if (result.agent.length > 255 || (result.vendor && !VENDORS.includes(result.vendor))) throw new Error('Choose a supported desk phone.');
  result.countryCode = String(input.countryCode || '').trim().replace(/^\+/, '');
  if (result.countryCode && !/^[1-9]\d{0,2}$/.test(result.countryCode)) throw new Error('Country code must contain 1–3 digits, such as 1.');
  result.stripPlus = input.stripPlus === true;
  return result;
}

export function normalizeNumber(raw, settings = DEFAULTS) {
  let value = String(raw ?? '').trim();
  if (!value || value.length > 160) throw new Error('Select or enter one phone number.');
  if (/^(tel|callto):/i.test(value)) {
    try { value = decodeURIComponent(value.replace(/^(tel|callto):/i, '')); }
    catch { throw new Error('This phone link is not valid.'); }
  }
  if (/[\r\n]/.test(value)) throw new Error('Select only one phone number on one line.');
  if (/[;,?&=@]/.test(value) || /(?:\bext\b|\bx\s*\d|[a-z])/i.test(value)) {
    throw new Error('Use the phone number only. Extensions, pauses, letters and SIP addresses are not supported.');
  }
  // Reject other data rather than silently extracting digits from arbitrary text.
  value = value.replace(/[\s().\-\u2010-\u2014]/g, '');
  if (!/^\+?\d{1,15}$/.test(value)) throw new Error('Enter one phone number using up to 15 digits and an optional leading +.');
  if (settings.countryCode && /^\d{10}$/.test(value)) value = '+' + settings.countryCode + value;
  if (settings.stripPlus) value = value.replace(/^\+/, '');
  return value;
}

export function apiPath(settings, resource) {
  if (!['phone-control/targets', 'click-to-dial'].includes(resource)) throw new Error('Unsupported API request.');
  return `${serverOrigin(settings.server)}/api/v1/domains/${encodeURIComponent(settings.domain)}/${resource}`;
}

export function dialPayload(settings, raw) {
  if (!settings.agent && !settings.vendor) throw new Error('Choose your desk phone in Settings first.');
  const payload = {extension: settings.extension, destination: normalizeNumber(raw, settings)};
  if (settings.agent) payload.agent = settings.agent;
  if (settings.vendor) payload.vendor = settings.vendor;
  return payload;
}

export function responseError(status, data) {
  if (status === 403 && data?.error?.code === 'forbidden_extension') {
    return 'HTTP 403: The API token\'s user does not have access to the configured extension (forbidden_extension). Check the extension number in Settings and the user\'s extension access in FS PBX.';
  }
  if (status === 403 && data?.error?.code === 'forbidden_domain') {
    return 'HTTP 403: This token\'s user cannot access the selected tenant (forbidden_domain). Check the Domain UUID and the user\'s allowed accounts in FS PBX.';
  }
  if (status === 403 && data?.error?.code === 'forbidden_permission') {
    const permission = data.error.permission;
    if (['phone_control_view', 'phone_control_call'].includes(permission)) {
      return `HTTP 403: The token's user is missing ${permission}. Enable it for the user's group in FS PBX Group Manager, then retry.`;
    }
    return 'HTTP 403: FS PBX reports a missing user permission (forbidden_permission). Check the API user\'s group permissions.';
  }
  const messages = {
    400: 'The PBX rejected the number or phone selection.',
    401: 'The API token is invalid or expired. Update it in Settings.',
    403: 'HTTP 403: Access was denied without a recognized FS PBX permission error. Inspect the failed request\'s Response in Chrome DevTools; the denial may come from FS PBX, a reverse proxy, or a firewall.',
    404: 'API route or extension not found. Check the server, domain UUID, extension and FS PBX version.',
    409: 'No controllable phone is registered for this extension.',
    422: 'The PBX rejected the request fields.',
    429: 'Too many requests. Wait a moment before trying again.'
  };
  // Do not surface arbitrary remote HTML, stack traces, or echoed credentials.
  return messages[status] || (status >= 500 ? 'FS PBX reported a server error. Ask your administrator to check its logs.' : `The API returned HTTP ${status}.`);
}

export function checkDialResult(data) {
  if (!data || data.sent !== true) throw new Error('FS PBX did not confirm that the dial command was sent. Check the phone before trying again.');
  return 'Dial command sent. Check your desk phone; this does not confirm that the call connected.';
}
