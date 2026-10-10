// Service worker: relays AI requests from pages to an offscreen document,
// which is where the WebAssembly models run (service workers can't host them).

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run the Arabic AI models (WebAssembly) locally on this device.',
    });
  } catch (e) {
    if (!String(e).includes('single offscreen')) throw e; // created by a parallel request
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ ...msg, target: 'offscreen' }))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});
