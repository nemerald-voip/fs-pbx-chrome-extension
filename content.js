(() => {
  const previous = globalThis.__fsPbxLinks;
  if (previous) {
    previous.enabled = false;
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (globalThis.__fsPbxLinkAllowed === false) return;
  const state = {enabled: true};
  globalThis.__fsPbxLinks = state;
  const onClick = event => {
    if (!state.enabled || !event.isTrusted || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.composedPath().find(el => el instanceof HTMLAnchorElement);
    const href = (anchor?.getAttribute('href') || '').trim();
    if (!/^(tel|callto):/i.test(href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { chrome.runtime.sendMessage({type: 'requestDial', number: href}).then(result => {
      if (!result?.ok) alert('FS PBX: ' + (result?.error || 'Open the extension to dial this number.'));
    }).catch(() => alert('FS PBX was updated or disabled. Reload this page, or open the extension to dial.')); }
    catch { alert('FS PBX was updated or disabled. Reload this page, or open the extension to dial.'); }
  };
  // Window capture runs before older document-level handlers left in an open
  // page by an unpacked-extension update. Reinjection replaces this listener.
  window.addEventListener('click', onClick, true);
  state.dispose = () => { state.enabled = false; window.removeEventListener('click', onClick, true); };
})();
