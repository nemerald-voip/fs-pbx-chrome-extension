export const $ = id => document.getElementById(id);
export async function send(type, data = {}) {
  const result = await chrome.runtime.sendMessage({type, ...data});
  if (!result?.ok) throw new Error(result?.error || 'The extension is unavailable. Reload it and try again.');
  return result;
}
export function status(message, error = false) {
  const element = $('status');
  element.role = error ? 'alert' : 'status';
  element.ariaLive = error ? 'assertive' : 'polite';
  element.classList.toggle('error', error);
  const notice = $('status-notice');
  if (notice) {
    notice.hidden = !message;
    notice.classList.toggle('error', error);
  }
  element.textContent = message;
}
