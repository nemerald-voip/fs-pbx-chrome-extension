import {DEFAULTS, validateSettings, hostPattern, apiPath, dialPayload, responseError, checkDialResult} from './core.js';
import {createWebsiteLinks} from './website-links.js';

// Content scripts may request the toolbar dialer, but cannot read credentials
// or call the dial endpoint. Only our extension pages can submit a call.
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}),
  chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'})
]);
const websiteLinks = createWebsiteLinks(ready);
websiteLinks.restore(false).catch(() => {});
let dialing = false;
let opening = false;
let settingsWrite = Promise.resolve();
let pendingWrite = Promise.resolve();

function withPending(action) {
  const operation = pendingWrite.then(action);
  pendingWrite = operation.catch(() => {});
  return operation;
}

async function getSettings() {
  await ready;
  return {...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings};
}

async function request(settings, resource, payload) {
  if (!await chrome.permissions.contains({origins: [hostPattern(settings.server)]})) throw new Error('Server access is not granted. Save your settings again.');
  const url = new URL(apiPath(settings, resource));
  if (!payload) url.searchParams.set('extension', settings.extension);
  let response;
  try {
    response = await fetch(url.href, {
      method: payload ? 'POST' : 'GET',
      headers: {'Authorization': `Bearer ${settings.token}`, 'Accept': 'application/json', ...(payload ? {'Content-Type': 'application/json'} : {})},
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new Error(payload ? 'No confirmation received. The call may have started. Check your phone before retrying.' : 'Cannot reach FS PBX. Check its address, HTTPS certificate, network and any VPN requirements.');
  }
  if (!response.ok) {
    // Read the structured error before choosing a message. A 403 may be a
    // missing permission, a denied tenant, or a proxy response, not one cause.
    let errorData = null;
    try { errorData = await response.json(); } catch { /* HTML/proxy errors use the status fallback. */ }
    throw new Error(responseError(response.status, errorData));
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(payload ? 'The response was not valid JSON. Check your phone before retrying.' : 'The server did not return JSON. Check the API address and proxy configuration.'); }
  return data;
}

async function listTargets(settings) {
  const data = await request(settings, 'phone-control/targets');
  if (!Array.isArray(data.data)) throw new Error('The PBX returned an unexpected phone list.');
  return data.data.filter(t => t && typeof t.agent === 'string' && t.vendor !== 'ringotel').map(t => ({
    agent: t.agent, vendor: String(t.vendor || ''), lan_ip: String(t.lan_ip || '')
  }));
}

async function dial(raw, requestId) {
  if (!/^[\w-]{16,80}$/.test(String(requestId))) throw new Error('Invalid call request. Reopen the dialer.');
  if (dialing) throw new Error('Another dial request is being sent. Check your phone before starting another.');
  dialing = true;
  try {
    const settings = await getSettings();
    const payload = dialPayload(settings, raw);
    const {attempts = []} = await chrome.storage.session.get('attempts');
    const now = Date.now();
    const recent = attempts.filter(a => now - a.time < 120000);
    if (recent.some(a => a.id === requestId || (a.key === JSON.stringify(payload) && now - a.time < 5000))) throw new Error('This call was already submitted. Check your desk phone.');
    // Reserve before sending. A timeout or service-worker restart must not resend.
    await chrome.storage.session.set({attempts: [...recent.slice(-39), {id: requestId, key: JSON.stringify(payload), time: now}]});
    const data = await request(settings, 'click-to-dial', payload);
    return {message: checkDialResult(data)};
  } finally { dialing = false; }
}

async function openDial(raw, tab) {
  if (opening) return;
  opening = true;
  try {
    await ready;
    const number = String(raw || '').slice(0,160);
    const windowId = Number.isInteger(tab?.windowId) && tab.windowId >= 0
      ? tab.windowId : (await chrome.windows.getLastFocused({windowTypes: ['normal']})).id;
    const badgeTarget = Number.isInteger(tab?.id) && tab.id >= 0 ? {tabId: tab.id} : {};
    // Transfer the selection privately, scoped to its browser window. Never
    // put the destination in a popup URL or send a call from this action.
    await withPending(() => chrome.storage.session.set({['pendingDial:' + windowId]: {number, time: Date.now(), badgeTarget}}));
    await chrome.action.setBadgeText({...badgeTarget, text: '1'}).catch(() => {});
    await chrome.action.setTitle({...badgeTarget, title: 'Number ready — click FS PBX to dial'}).catch(() => {});
    try { await chrome.action.openPopup({windowId}); }
    catch { throw new Error('Chrome could not open the dialer automatically. Click the FS PBX toolbar icon; your selected number is ready.'); }
  } finally { opening = false; }
}

async function takePendingDial(windowId) {
  if (!Number.isInteger(windowId) || windowId < 0) throw new Error('Reopen the dialer from the Chrome toolbar.');
  return withPending(async () => {
    const key = 'pendingDial:' + windowId;
    const pending = (await chrome.storage.session.get(key))[key];
    if (!pending) return {number: ''};
    await chrome.storage.session.remove(key);
    await chrome.action.setBadgeText({...pending.badgeTarget, text: ''}).catch(() => {});
    await chrome.action.setTitle({...pending.badgeTarget, title: 'FS PBX Click to Dial'}).catch(() => {});
    return {number: Date.now() - pending.time < 300000 ? pending.number : ''};
  });
}

async function menus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id: 'selection', title: 'Call with FS PBX: %s', contexts: ['selection']});
  // tel: is not a supported Chrome match-pattern scheme. Keep a link menu and
  // validate the actual URL before opening the confirmation window.
  chrome.contextMenus.create({id: 'phone-link', title: 'Call phone link with FS PBX', contexts: ['link']});
}
chrome.runtime.onInstalled.addListener(() => Promise.all([menus(), websiteLinks.restore()]).catch(() => {}));
chrome.runtime.onStartup.addListener(() => websiteLinks.restore().catch(() => {}));
chrome.permissions.onAdded.addListener(() => websiteLinks.restore().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => websiteLinks.restore().catch(() => {}));
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'selection') return openDial(info.selectionText, tab).catch(() => {});
  if (info.menuItemId === 'phone-link') return openDial(info.linkUrl, tab).catch(() => {});
});

function isOwnPage(sender) {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  const base = chrome.runtime.getURL('');
  return ['popup.html', 'options.html'].some(page => sender.url === base + page || sender.url.startsWith(base + page + '?'));
}

async function handle(message, sender) {
  await ready;
  if (sender.id !== chrome.runtime.id) throw new Error('Untrusted caller.');
  if (!isOwnPage(sender)) {
    if (message?.type !== 'requestDial' || !sender.tab || !sender.url) throw new Error('This action is unavailable to webpages.');
    if (!await websiteLinks.enabled(sender.url)) throw new Error('Phone links are not enabled for this website.');
    await openDial(message.number, sender.tab);
    return {};
  }
  switch (message?.type) {
    case 'getPendingDial': return takePendingDial(message.windowId);
    case 'getSettings': {
      const {token, ...settings} = await getSettings();
      return {settings, hasToken: Boolean(token)};
    }
    case 'saveSettings': {
      // Serialize saves to prevent a blank-token save racing a new-token save.
      const operation = settingsWrite.then(async () => {
        const settings = validateSettings(message.settings, await getSettings());
        if (!await chrome.permissions.contains({origins: [hostPattern(settings.server)]})) throw new Error('Server access was not granted.');
        await chrome.storage.local.set({settings});
        return {};
      });
      settingsWrite = operation.catch(() => {});
      return operation;
    }
    case 'targets': return {targets: await listTargets(await getSettings())};
    case 'dial': return dial(message.number, message.requestId);
    case 'siteState': return {...await websiteLinks.state(), enabled: message.url ? await websiteLinks.enabled(message.url) : false};
    case 'setAllSites': return websiteLinks.setAll(message.enabled);
    case 'toggleSite': return websiteLinks.setSite(message.url, false);
    case 'enableSite': return websiteLinks.setSite(message.url);
    case 'sites': return websiteLinks.state();
    case 'refreshLinks': return websiteLinks.restore();
    case 'removeSite': return websiteLinks.remove(message.id);
    case 'forget': {
      await websiteLinks.clear();
      await chrome.storage.local.remove('settings');
      await chrome.storage.session.clear();
      const permissions = await chrome.permissions.getAll();
      if (permissions.origins?.length) await chrome.permissions.remove({origins: permissions.origins});
      return {};
    }
    default: throw new Error('Unknown extension action.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(data => respond({ok: true, ...data})).catch(error => respond({ok: false, error: error.message || 'Unable to complete this action.'}));
  return true;
});
