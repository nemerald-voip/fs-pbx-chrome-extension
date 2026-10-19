import {hostPattern} from './core.js';
import {ALL_SITE_PATTERNS} from './site-access.js';

const ALL_ID = 'phone-links-all-sites';
const STORAGE_KEY = 'phoneLinkSites';
const registered = async () => (await chrome.scripting.getRegisteredContentScripts()).filter(s => s.id.startsWith('phone-links-'));
const matches = (site, url) => site.matches.includes(hostPattern(url)) || site.matches.includes(new URL(url).protocol + '//*/*');

export function createWebsiteLinks(ready) {
  let queue = Promise.resolve();
  function run(action) {
    const result = queue.then(() => ready).then(action);
    queue = result.catch(() => {});
    return result;
  }

  async function preferences() {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    if (Array.isArray(stored)) return stored;
    // Migrate registrations that still exist. Permission grants alone do not
    // prove opt-in: a user may have deliberately disabled phone-link handling.
    const sites = (await registered()).map(({id, matches}) => ({id, matches}));
    await chrome.storage.local.set({[STORAGE_KEY]: sites});
    return sites;
  }

  async function sync(sites) {
    const active = [];
    for (const site of sites) {
      if (await chrome.permissions.contains({origins: site.matches})) active.push(site);
    }
    const current = await registered();
    const remove = current.filter(s => !active.some(a => a.id === s.id)).map(s => s.id);
    if (remove.length) await chrome.scripting.unregisterContentScripts({ids: remove});
    const missing = active.filter(s => !current.some(c => c.id === s.id));
    if (missing.length) await chrome.scripting.registerContentScripts(missing.map(site => ({
      ...site, js: ['content.js'], runAt: 'document_start', allFrames: true, persistAcrossSessions: true
    })));
    return active;
  }

  async function applyToOpenTabs(active, previous = []) {
    const patterns = [...new Set([...active, ...previous].flatMap(s => s.matches))];
    const granted = [];
    for (const pattern of patterns) if (await chrome.permissions.contains({origins: [pattern]})) granted.push(pattern);
    if (!granted.length) return {updatedTabs: 0, skippedTabs: 0};
    const allowed = [...new Set(active.flatMap(s => s.matches))];
    const tabs = await chrome.tabs.query({url: granted});
    const results = await Promise.allSettled(tabs.filter(t => Number.isInteger(t.id)).map(async tab => {
      async function apply(allFrames) {
        const target = {tabId: tab.id, allFrames};
        await chrome.scripting.executeScript({target, args: [allowed], func: patterns => {
          const url = new URL(location.href);
          const enabled = patterns.includes(`${url.protocol}//${url.hostname}/*`) || patterns.includes(`${url.protocol}//*/*`);
          globalThis.__fsPbxLinkAllowed = enabled;
          const state = globalThis.__fsPbxLinks;
          if (state && !enabled) {
            state.enabled = false;
            if (typeof state.dispose === 'function') state.dispose();
          }
        }});
        // content.js checks the per-frame choice above before adding a handler.
        if (allowed.length) await chrome.scripting.executeScript({target, files: ['content.js']});
      }
      try { await apply(true); }
      catch { await apply(false); } // An inaccessible child frame must not block the top frame.
    }));
    return {updatedTabs: results.filter(r => r.status === 'fulfilled').length, skippedTabs: results.filter(r => r.status === 'rejected').length};
  }

  async function state(sites, active) {
    const {phoneLinkChoiceMade} = await chrome.storage.local.get('phoneLinkChoiceMade');
    return {
      hasSavedChoice: phoneLinkChoiceMade === true || sites.length > 0,
      allSitesEnabled: active.some(s => s.id === ALL_ID),
      allSitesRequested: sites.some(s => s.id === ALL_ID),
      sites: sites.filter(s => s.id !== ALL_ID).map(s => ({id: s.id, pattern: s.matches[0], granted: active.some(a => a.id === s.id)}))
    };
  }

  async function commit(sites) {
    const previous = await registered();
    // Persist intent before registration: Chrome may clear registrations at the
    // next update. Explicitly disabled choices are persisted as well.
    await chrome.storage.local.set({[STORAGE_KEY]: sites, phoneLinkChoiceMade: true});
    const active = await sync(sites);
    return {...await state(sites, active), ...await applyToOpenTabs(active, previous)};
  }

  return {
    restore: (inject = true) => run(async () => {
      const sites = await preferences();
      const previous = await registered();
      const active = await sync(sites);
      return {...await state(sites, active), ...(inject ? await applyToOpenTabs(active, previous) : {})};
    }),
    state: () => run(async () => {
      const sites = await preferences();
      return state(sites, await sync(sites));
    }),
    enabled: url => run(async () => {
      hostPattern(url); // Reject internal pages and other unsupported schemes.
      const sites = await preferences();
      return sites.some(s => matches(s, url)) && await chrome.permissions.contains({origins: [hostPattern(url)]});
    }),
    setAll: enabled => run(async () => {
      if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable phone links.');
      if (enabled && !await chrome.permissions.contains({origins: ALL_SITE_PATTERNS})) throw new Error('Allow access to all websites to enable this option.');
      const sites = (await preferences()).filter(s => s.id !== ALL_ID);
      if (enabled) sites.push({id: ALL_ID, matches: ALL_SITE_PATTERNS});
      return commit(sites);
    }),
    setSite: (url, enableOnly = true) => run(async () => {
      const pattern = hostPattern(url);
      const sites = await preferences();
      if (sites.some(s => s.id === ALL_ID) && await chrome.permissions.contains({origins: ALL_SITE_PATTERNS})) throw new Error('Disable the all-sites option before changing individual sites.');
      const existing = sites.find(s => s.matches.includes(pattern));
      if (existing && !enableOnly) return {...await commit(sites.filter(s => s.id !== existing.id)), enabled: false};
      if (!await chrome.permissions.contains({origins: [pattern]})) throw new Error('Website access was not granted.');
      if (!existing) sites.push({id: 'phone-links-' + crypto.randomUUID(), matches: [pattern]});
      return {...await commit(sites), enabled: true};
    }),
    remove: id => run(async () => {
      const sites = await preferences();
      if (!sites.some(s => s.id === id)) throw new Error('Website not found.');
      return commit(sites.filter(s => s.id !== id));
    }),
    clear: () => run(async () => {
      const result = await commit([]);
      await chrome.storage.local.remove('phoneLinkChoiceMade');
      return {...result, hasSavedChoice: false};
    })
  };
}
