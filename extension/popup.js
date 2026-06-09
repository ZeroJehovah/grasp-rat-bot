'use strict';

const els = {
  badge: document.getElementById('stateBadge'),
  message: document.getElementById('message'),
  tabInfo: document.getElementById('tabInfo'),
  detectBtn: document.getElementById('detectBtn'),
  openBtn: document.getElementById('openBtn'),
  focusBtn: document.getElementById('focusBtn')
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setBusy(text) {
  els.badge.textContent = '检测中';
  els.badge.className = '';
  els.message.textContent = text || '正在检测游戏标签页。';
  els.detectBtn.disabled = true;
  els.openBtn.disabled = true;
  els.focusBtn.disabled = true;
}

function render(result) {
  const ok = Boolean(result?.ok);
  const status = String(result?.status || '');
  const tab = result?.tab || result?.trackedTab || null;
  els.badge.textContent = ok ? '可用' : (status === 'multiple' ? '冲突' : '未找到');
  els.badge.className = ok ? 'ok' : 'error';
  els.message.textContent = result?.message || result?.error || '检测失败。';
  if (tab?.id) {
    els.tabInfo.innerHTML = `标签页 #${escapeHtml(tab.id)}<br>${escapeHtml(tab.url || '')}`;
  } else if (Array.isArray(result?.tabs) && result.tabs.length) {
    els.tabInfo.innerHTML = result.tabs.map(item => `#${escapeHtml(item.id)} ${escapeHtml(item.title || item.url || '')}`).join('<br>');
  } else {
    els.tabInfo.textContent = '';
  }
  els.detectBtn.disabled = false;
  els.openBtn.disabled = status === 'multiple' || status === 'found' || status === 'auth-tracked';
  els.focusBtn.disabled = !tab?.id || status === 'multiple';
}

async function send(type) {
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok && response?.error) return { ok: false, status: 'error', message: response.error };
  return response;
}

async function detect() {
  setBusy('正在检测游戏标签页。');
  render(await send('detectGameTabs'));
}

els.detectBtn.addEventListener('click', detect);
els.openBtn.addEventListener('click', async () => {
  setBusy('正在打开游戏标签页。');
  render(await send('openGameTab'));
});
els.focusBtn.addEventListener('click', async () => {
  setBusy('正在切换标签页。');
  render(await send('focusTrackedTab'));
});

detect().catch(err => render({ ok: false, status: 'error', message: err?.message || String(err) }));
