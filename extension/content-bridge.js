'use strict';

const REQUEST_CHANNEL = 'grasp-rat-extension-bridge-request';
const RESPONSE_CHANNEL = 'grasp-rat-extension-bridge-response';

chrome.runtime.sendMessage({
  type: 'contentReady',
  payload: { url: location.href }
}).catch(() => {});

window.addEventListener('message', event => {
  if (event.source !== window) return;
  const message = event.data || {};
  if (message.channel !== REQUEST_CHANNEL || !message.id || !message.type) return;
  chrome.runtime.sendMessage({
    type: String(message.type),
    payload: message.payload || {}
  }).then(response => {
    window.postMessage({
      channel: RESPONSE_CHANNEL,
      id: message.id,
      response
    }, '*');
  }).catch(err => {
    window.postMessage({
      channel: RESPONSE_CHANNEL,
      id: message.id,
      response: { ok: false, error: err?.message || String(err) }
    }, '*');
  });
});
