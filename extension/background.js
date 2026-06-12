'use strict';

const GAME_URL = 'https://grasp-rat-game.h-e.top/';
const GAME_PATTERN = 'https://grasp-rat-game.h-e.top/*';
const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top';
const AUTH_ORIGIN = 'https://connect.linux.do';
const TRACKED_TAB_KEY = 'gameTabId';
const LAST_TAB_URL_KEY = 'gameTabLastUrl';
const LAST_TAB_RECORDED_AT_KEY = 'gameTabRecordedAt';

function isGameUrl(url) {
  try {
    return new URL(url || '').origin === GAME_ORIGIN;
  } catch (_) {
    return false;
  }
}

function isAuthorizeUrl(url) {
  try {
    const parsed = new URL(url || '');
    return parsed.origin === AUTH_ORIGIN && parsed.pathname.startsWith('/oauth2/authorize');
  } catch (_) {
    return false;
  }
}

function isTrackedRuntimeUrl(url) {
  return isGameUrl(url) || isAuthorizeUrl(url);
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(items) {
  return chrome.storage.local.set(items);
}

async function getTrackedTab() {
  const stored = await storageGet([TRACKED_TAB_KEY, LAST_TAB_URL_KEY, LAST_TAB_RECORDED_AT_KEY]);
  const tabId = Number(stored[TRACKED_TAB_KEY] || 0);
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url || stored[LAST_TAB_URL_KEY] || '',
      title: tab.title || '',
      recordedAt: Number(stored[LAST_TAB_RECORDED_AT_KEY] || 0) || 0
    };
  } catch (_) {
    await storageSet({ [TRACKED_TAB_KEY]: 0, [LAST_TAB_URL_KEY]: '', [LAST_TAB_RECORDED_AT_KEY]: 0 });
    return null;
  }
}

async function recordRuntimeTab(tabId, url) {
  const id = Number(tabId || 0);
  if (!id || !isTrackedRuntimeUrl(url)) return null;
  await storageSet({
    [TRACKED_TAB_KEY]: id,
    [LAST_TAB_URL_KEY]: String(url || ''),
    [LAST_TAB_RECORDED_AT_KEY]: Date.now()
  });
  return getTrackedTab();
}

async function detectGameTabs() {
  const gameTabs = await chrome.tabs.query({ url: GAME_PATTERN });
  if (gameTabs.length > 1) {
    return {
      ok: false,
      status: 'multiple',
      message: `检测到 ${gameTabs.length} 个游戏标签页，请只保留一个。`,
      tabs: gameTabs.map(tab => ({ id: tab.id, windowId: tab.windowId, url: tab.url || '', title: tab.title || '' })),
      trackedTab: await getTrackedTab()
    };
  }
  if (gameTabs.length === 1) {
    const tab = gameTabs[0];
    const trackedTab = await recordRuntimeTab(tab.id, tab.url || GAME_URL);
    return {
      ok: true,
      status: 'found',
      message: `已记录游戏标签页 #${tab.id}。`,
      tab: trackedTab
    };
  }
  const trackedTab = await getTrackedTab();
  if (trackedTab && isAuthorizeUrl(trackedTab.url)) {
    return {
      ok: true,
      status: 'auth-tracked',
      message: `已记录标签页 #${trackedTab.id}，当前在 LinuxDO 授权页。`,
      tab: trackedTab
    };
  }
  return {
    ok: false,
    status: 'missing',
    message: '未找到游戏标签页。',
    trackedTab
  };
}

async function openGameTab() {
  const detected = await detectGameTabs();
  if (detected.status === 'multiple') return detected;
  if (detected.status === 'found' || detected.status === 'auth-tracked') {
    const tab = detected.tab;
    if (tab?.id) {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    }
    return detected;
  }
  const tab = await chrome.tabs.create({ url: GAME_URL, active: true });
  const trackedTab = await recordRuntimeTab(tab.id, tab.url || GAME_URL);
  return {
    ok: true,
    status: 'opened',
    message: `已打开并记录游戏标签页 #${tab.id}。`,
    tab: trackedTab
  };
}

async function focusTrackedTab() {
  const trackedTab = await getTrackedTab();
  if (!trackedTab?.id) {
    return { ok: false, status: 'missing', message: '没有已记录的游戏标签页。' };
  }
  await chrome.tabs.update(trackedTab.id, { active: true });
  if (trackedTab.windowId) await chrome.windows.update(trackedTab.windowId, { focused: true });
  return { ok: true, status: 'focused', message: `已切换到标签页 #${trackedTab.id}。`, tab: trackedTab };
}

async function fetchText(payload = {}) {
  const method = String(payload.method || 'GET').toUpperCase();
  const url = String(payload.url || '');
  if (!url) throw new Error('fetch url missing');
  const timeoutMs = Math.max(1000, Number(payload.timeoutMs || 7000) || 7000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: payload.headers || {},
      body: payload.body ?? undefined,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${method} ${url} failed: ${res.status}`);
    }
    return { text, status: res.status, url: res.url || url };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`${method} ${url} timed out`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    const type = String(message?.type || '');
    const payload = message?.payload || {};
    if (type === 'contentReady') {
      const tabId = sender?.tab?.id || payload.tabId || 0;
      const url = sender?.tab?.url || payload.url || '';
      return { ok: true, tab: await recordRuntimeTab(tabId, url) };
    }
    if (type === 'storageGet') {
      const defaults = payload.defaults && typeof payload.defaults === 'object' ? payload.defaults : {};
      const values = await storageGet(null);
      return { ok: true, values: { ...defaults, ...values }, keys: Object.keys(values || {}) };
    }
    if (type === 'storageSet') {
      await storageSet(payload.items || {});
      return { ok: true };
    }
    if (type === 'fetchText') {
      const result = await fetchText(payload);
      return { ok: true, ...result };
    }
    if (type === 'detectGameTabs') {
      return detectGameTabs();
    }
    if (type === 'openGameTab') {
      return openGameTab();
    }
    if (type === 'focusTrackedTab') {
      return focusTrackedTab();
    }
    if (type === 'getTrackedTab') {
      return { ok: true, tab: await getTrackedTab() };
    }
    throw new Error(`unknown message type: ${type}`);
  };
  run()
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url || '';
  if (!isTrackedRuntimeUrl(url)) return;
  recordRuntimeTab(tabId, url).catch(() => {});
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const stored = await storageGet([TRACKED_TAB_KEY]);
  if (Number(stored[TRACKED_TAB_KEY] || 0) === Number(tabId || 0)) {
    await storageSet({ [TRACKED_TAB_KEY]: 0, [LAST_TAB_URL_KEY]: '', [LAST_TAB_RECORDED_AT_KEY]: 0 });
  }
});
