import {serverOrigin, hostPattern} from './core.js';
import {$, send, status} from './ui.js';
import {ALL_SITE_PATTERNS, requestAllSites} from './site-access.js';
const fields = ['server', 'domain', 'extension', 'agent', 'vendor', 'countryCode'];
let targets = [];
let allSitesEnabled = false;
$('dismiss-status').addEventListener('click', () => status(''));

function values() {
  return {...Object.fromEntries(fields.map(id => [id, $(id).value])), token: $('token').value, stripPlus: $('stripPlus').checked};
}
async function save() {
  const settings = values();
  const server = serverOrigin(settings.server);
  const enableLinks = $('enable-phone-links').checked;
  // One permission request runs directly from either Save gesture, before
  // storage or messaging awaits. All-sites access also covers the HTTPS PBX.
  const origins = enableLinks ? ALL_SITE_PATTERNS : [hostPattern(server)];
  if (!await chrome.permissions.request({origins})) throw new Error(enableLinks
    ? 'Website access was not granted. Settings were not saved. Approve access when saving, or uncheck “Enable phone links on all websites” to save only the PBX connection.'
    : 'Allow access to your PBX server to continue.');
  await send('saveSettings', {settings});
  $('server').value = server;
  $('token').value = '';
  $('token').placeholder = 'Saved — leave blank to keep';
  $('token-hint').textContent = 'Token saved in this browser profile. Leave blank to keep it, or paste a replacement.';
  try {
    const links = await send('setAllSites', {enabled: enableLinks});
    await loadSites();
    return links;
  } catch(e) { throw new Error('Connection saved, but phone links could not be updated: ' + e.message); }
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('save').disabled = true;
  try {
    if (!$('agent').value.trim() && !$('vendor').value) throw new Error('Choose a registered phone or enter its model/vendor before saving.');
    const links = await save();
    status('Settings saved.' + (links.allSitesEnabled ? ' Website phone links are enabled.' : '')
      + (links.skippedTabs ? ' Some open tabs could not be updated; refresh those webpages.' : ' Pin the extension in Chrome to start dialing.'));
  } catch(e) { status(e.message, true); }
  finally { $('save').disabled = false; }
});
$('test').addEventListener('click', async () => {
  $('test').disabled = true;
  try {
    await save();
    status('Checking FS PBX and finding registered desk phones…');
    targets = (await send('targets')).targets;
    $('phone-list').replaceChildren(new Option('Select your desk phone', ''));
    targets.forEach((phone,i) => $('phone-list').append(new Option(`${phone.agent}${phone.lan_ip ? ' · ' + phone.lan_ip : ''}`, String(i))));
    if (targets.length === 1) { $('phone-list').value = '0'; selectPhone(); }
    status(targets.length ? `Connected. Found ${targets.length} phone${targets.length === 1 ? '' : 's'}. Select your phone and save settings.` : 'Connected, but no desk phones were returned. Check registration and firmware.');
  } catch(e) { status(e.message, true); }
  finally { $('test').disabled = false; }
});
function selectPhone() {
  if ($('phone-list').value === '') return;
  const target = targets[Number($('phone-list').value)];
  if (target) { $('agent').value = target.agent; $('vendor').value = target.vendor; }
}
$('phone-list').addEventListener('change', selectPhone);
$('forget').addEventListener('click', async () => {
  if (!confirm('Remove the saved token, connection and enabled websites from this browser?')) return;
  try { await send('forget'); location.reload(); } catch(e) { status(e.message, true); }
});
async function loadSites() {
  const {sites, allSitesEnabled: enabled, allSitesRequested, hasSavedChoice} = await send('sites');
  allSitesEnabled = Boolean(enabled);
  $('enable-phone-links').checked = Boolean(enabled || allSitesRequested || !hasSavedChoice);
  $('toggle-all-sites').textContent = allSitesEnabled ? 'Disable phone links on all sites' : 'Enable phone links on all sites';
  $('website-url').disabled = allSitesEnabled;
  $('add-site').disabled = allSitesEnabled;
  $('link-state').textContent = allSitesEnabled ? 'Phone links are enabled on all websites.'
    : allSitesRequested ? 'All-sites access needs approval. Click Enable phone links on all sites to restore access.'
    : sites.some(s => s.granted) ? 'Phone links are enabled on your saved websites.'
    : 'Phone links are off. Enable all websites or add a website below.';
  $('sites').replaceChildren();
  if (!sites.length) { const li = document.createElement('li'); li.textContent = allSitesEnabled ? 'All websites enabled.' : 'No individual websites enabled.'; $('sites').append(li); }
  for (const site of sites) {
    const li = document.createElement('li'); const label = document.createElement('span'); label.textContent = site.pattern + (site.granted === false ? ' — Chrome access not granted' : '');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = 'Remove';
    button.addEventListener('click', async () => { try { await send('removeSite', {id: site.id}); await loadSites(); status('Website removed. Phone-link handling has been updated in accessible open tabs.'); } catch(e) { status(e.message, true); } });
    li.append(label, button); $('sites').append(li);
  }
}
$('toggle-all-sites').addEventListener('click', async () => {
  $('toggle-all-sites').disabled = true;
  try {
    const enabled = !allSitesEnabled;
    await requestAllSites(enabled);
    await send('setAllSites', {enabled});
    await loadSites();
    status(enabled ? 'Phone links enabled on all websites and refreshed in accessible open tabs.' : 'All-sites phone links disabled. Individually enabled sites remain active.');
  } catch(e) { status(e.message, true); }
  finally { $('toggle-all-sites').disabled = false; }
});
$('add-site').addEventListener('click', async () => {
  $('add-site').disabled = true;
  try {
    const url = $('website-url').value.trim();
    const pattern = hostPattern(url);
    if (!await chrome.permissions.request({origins: [pattern]})) throw new Error('Website access was not granted.');
    await send('enableSite', {url});
    $('website-url').value = '';
    await loadSites();
    status('Phone links enabled for this website and refreshed in accessible open tabs.');
  } catch(e) { status(e.message, true); }
  finally { $('add-site').disabled = allSitesEnabled; }
});
$('refresh-links').addEventListener('click', async () => {
  $('refresh-links').disabled = true;
  try {
    const result = await send('refreshLinks');
    await loadSites();
    if (!result.allSitesEnabled && !result.sites.some(s => s.granted)) throw new Error('Phone links are not enabled. Enable all websites or add a website first.');
    const count = result.updatedTabs || 0;
    status(`Phone links refreshed in ${count} open tab${count === 1 ? '' : 's'}.` + (result.skippedTabs ? ' Some tabs could not be updated. Refresh those webpages and check Chrome site access.' : ' Click a phone link to open the FS PBX dialer.'), Boolean(result.skippedTabs));
  } catch(e) { status(e.message, true); }
  finally { $('refresh-links').disabled = false; }
});
async function init() {
  const {settings, hasToken} = await send('getSettings');
  fields.forEach(id => { $(id).value = settings[id] || ''; });
  $('stripPlus').checked = settings.stripPlus;
  if (hasToken) { $('token').placeholder = 'Saved — leave blank to keep'; $('token-hint').textContent = 'Token saved in this browser profile. Leave blank to keep it, or paste a replacement.'; }
  await loadSites();
}
init().catch(e => status(e.message, true));
