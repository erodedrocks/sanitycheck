//Logic for the extension enabled/disabled and API key input

(async function init() {
  try {
    const enabledEl = /** @type {HTMLInputElement} */ (document.getElementById('enabled'));
    const keyEl = /** @type {HTMLInputElement} */ (document.getElementById('key'));
    const numberEl = /** @type {HTMLInputElement} */ (document.getElementById('numberbound'));
    const scoreEl = /** @type {HTMLInputElement} */ (document.getElementById('scorebound'));

    const { xfiEnabled = true, anthropicApiKey = '', numberbound = 40, scorebound = 3.5 } = await chrome.storage.local.get([
      'xfiEnabled',
      'anthropicApiKey',
      'numberbound',
      'scorebound',
    ]);
    enabledEl.checked = !!xfiEnabled;
    keyEl.value = anthropicApiKey || '';
    numberEl.value = numberbound;
    scoreEl.value = scorebound;

    enabledEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ xfiEnabled: enabledEl.checked });
    });

    keyEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ anthropicApiKey: keyEl.value });
    });

    numberEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ numberbound: numberEl.value });
    });

    scoreEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ scorebound: scoreEl.value });
    });
  } catch (e) {
    console.warn('[XFI] Options init error', e);
  }
})();