// Options page logic (MV3 CSP-safe)
(async function init() {
  try {
    const enabledEl = /** @type {HTMLInputElement} */ (document.getElementById('enabled'));
    const keyEl = /** @type {HTMLInputElement} */ (document.getElementById('key'));
    const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save'));
    const promptEl = /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt'));
    const savePromptBtn = /** @type {HTMLButtonElement} */ (document.getElementById('savePrompt'));
    const resetPromptBtn = /** @type {HTMLButtonElement} */ (document.getElementById('resetPrompt'));

    const { xfiEnabled = true, anthropicApiKey = '', classificationPrompt } = await chrome.storage.local.get([
      'xfiEnabled',
      'anthropicApiKey',
      'classificationPrompt',
    ]);
    enabledEl.checked = !!xfiEnabled;
    keyEl.value = anthropicApiKey || '';
    if (classificationPrompt) {
      promptEl.value = classificationPrompt;
    } else {
      // Fill with default if none set (just UX; real default is enforced in background)
      promptEl.value = defaultPrompt();
    }

    enabledEl.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ xfiEnabled: enabledEl.checked });
    });

    saveBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ anthropicApiKey: keyEl.value.trim() });
      saveBtn.textContent = 'Saved';
      setTimeout(() => (saveBtn.textContent = 'Save'), 1000);
    });

    savePromptBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ classificationPrompt: promptEl.value });
      savePromptBtn.textContent = 'Saved';
      setTimeout(() => (savePromptBtn.textContent = 'Save Prompt'), 1000);
    });

    resetPromptBtn.addEventListener('click', async () => {
      const d = defaultPrompt();
      promptEl.value = d;
      await chrome.storage.local.set({ classificationPrompt: d });
    });
  } catch (e) {
    console.warn('[XFI] Options init error', e);
  }
})();

function defaultPrompt() {
  return `You are a strict classifier.
Rate how inflammatory the following tweet is on a scale of 1-5:

Definition:
- 1: Not inflammatory. Neutral or polite.
- 2: Slightly inflammatory. Minor negativity or sarcasm.
- 3: Moderately inflammatory. Clear negativity, dismissiveness, or provocation.
- 4: Very inflammatory. Personal attacks, insults, or aggressive tone.
- 5: Highly inflammatory. Harassment, hateful or severe attacks.

Rules:
- Output ONLY a single digit 1,2,3,4, or 5.
- No extra words, punctuation, or explanation.

Examples:
Tweet: "I disagree with this policy but let's discuss."
Label: 2

Tweet: "You're clueless and your take is garbage."
Label: 4

Tweet: "We should fire anyone who thinks this."
Label: 3

Now classify the tweet.`;
}
