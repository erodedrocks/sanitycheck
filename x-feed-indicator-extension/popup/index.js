// Popup logic: send prompt to background to call Anthropic

const els = {
  prompt: /** @type {HTMLTextAreaElement} */ (document.getElementById('prompt')),
  model: /** @type {HTMLSelectElement} */ (document.getElementById('model')),
  send: /** @type {HTMLButtonElement} */ (document.getElementById('send')),
  output: /** @type {HTMLPreElement} */ (document.getElementById('output')),
};

