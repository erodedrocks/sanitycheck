// Options page logic (MV3 CSP-safe)
(async function init() {
  try {
    const enabledEl = /** @type {HTMLInputElement} */ (document.getElementById('enabled'));
    const keyEl = /** @type {HTMLInputElement} */ (document.getElementById('key'));

    const { xfiEnabled = true, anthropicApiKey = '', classificationPrompt } = await chrome.storage.local.get([
      'xfiEnabled',
      'anthropicApiKey',
      'classificationPrompt',
    ]);
    enabledEl.checked = !!xfiEnabled;
    keyEl.value = anthropicApiKey || '';

    enabledEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ xfiEnabled: enabledEl.checked });
    });

    enabledEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ anthropicApiKey: keyEl.value });
    });
  } catch (e) {
    console.warn('[XFI] Options init error', e);
  }
})();