import {normalizeNumber} from './core.js';
import {$, send, status} from './ui.js';
let config;
let configured = false;
let submitted = false;
let requestId = crypto.randomUUID();
function cleanPhoneLink() {
  const input = $('number');
  if (!/^(tel|callto):/i.test(input.value.trim())) return;
  // Display the number, not the link scheme. Apply dialing preferences later
  // in preview/background so country-code rules are not applied twice.
  try { input.value = normalizeNumber(input.value); }
  catch { /* Keep invalid links intact so validation can explain the problem. */ }
}

function preview() {
  try {
    const number = normalizeNumber($('number').value, config);
    $('normalized').textContent = 'Will dial: ' + number;
    $('call').disabled = !configured || submitted;
  } catch (e) {
    $('normalized').textContent = $('number').value ? e.message : 'The call will use your desk phone.';
    $('call').disabled = true;
  }
}
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('number').addEventListener('input', () => { cleanPhoneLink(); preview(); });
document.querySelectorAll('[data-digit]').forEach(button => button.addEventListener('click', () => {
  const input = $('number');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(button.dataset.digit, start, end, 'end'); input.focus(); preview();
}));
$('backspace').addEventListener('click', () => { $('number').value = $('number').value.slice(0,-1); $('number').focus(); preview(); });
$('dial-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!configured || submitted) return;
  try {
    normalizeNumber($('number').value, config);
    submitted = true;
    $('call').disabled = true;
    $('call').textContent = 'Sending…';
    $('number').readOnly = true;
    status('Sending the dial command to FS PBX…');
    const result = await send('dial', {number: $('number').value, requestId});
    status(result.message);
    $('call').textContent = 'Command sent';
  } catch (e) {
    status(e.message, true);
    $('call').textContent = 'Request finished';
  } finally {
    // A retry is explicit; a timeout never causes automatic redial.
    $('new-call').hidden = false;
  }
});
$('new-call').addEventListener('click', () => {
  submitted = false; requestId = crypto.randomUUID();
  $('number').readOnly = false; $('call').textContent = 'Call on desk phone';
  $('new-call').hidden = true; status(''); preview(); $('number').focus();
});
async function init() {
  const params = new URLSearchParams(location.search);
  if (params.has('number')) $('number').value = params.get('number').slice(0,160);
  else {
    const currentWindow = await chrome.windows.getCurrent();
    const pending = await send('getPendingDial', {windowId: currentWindow.id});
    $('number').value = pending.number || '';
  }
  cleanPhoneLink();
  const result = await send('getSettings');
  config = result.settings;
  configured = Boolean(config.server && config.extension && result.hasToken && (config.agent || config.vendor));
  if (configured) {
    $('identity').textContent = 'Extension ' + config.extension;
    $('target').textContent = config.agent || config.vendor;
  } else status('Open Settings to connect your FS PBX server and choose a desk phone.');
  preview();
  $('number').focus();
}
init().catch(e => status(e.message, true));
