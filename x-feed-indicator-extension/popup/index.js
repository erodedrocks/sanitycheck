// Popup logic: send prompt to background to call Anthropic

const els = {
  prompt: /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt')),
  model: /** @type {HTMLSelectElement} */ (document.getElementById('model')),
  send: /** @type {HTMLButtonElement} */ (document.getElementById('send')),
  output: /** @type {HTMLPreElement} */ (document.getElementById('output')),
};

function setBusy(busy) {
  els.send.disabled = busy;
  els.send.textContent = busy ? 'Sending…' : 'Send';
}

async function sendPrompt() {
  const prompt = els.prompt.value.trim();
  const model = els.model.value;
  els.output.textContent = '';
  if (!prompt) {
    els.output.textContent = 'Enter a prompt first.';
    return;
  }
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ANTHROPIC_COMPLETE',
      payload: { prompt, model },
    });
    if (response?.error) {
      els.output.textContent = `Error: ${response.error}`;
      return;
    }
    els.output.textContent = response?.text ?? '[No text in response]';
  } catch (e) {
    els.output.textContent = `Error: ${e?.message || e}`;
  } finally {
    setBusy(false);
  }
}

els.send.addEventListener('click', sendPrompt);

