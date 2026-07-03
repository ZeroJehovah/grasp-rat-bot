'use strict';

function pageNativeSnapshotSource() {
  return String.raw`
	  function pageNativeSnapshotUrl(input) {
	    try {
	      const raw = typeof input === 'string' ? input : String(input?.url || input || '');
	      if (!raw) return '';
	      const url = new URL(raw, location.href);
	      if (url.origin !== location.origin || url.pathname !== '/snapshot') return '';
	      return url.toString();
	    } catch (_) {
	      return '';
	    }
	  }

	  function pageNativeSnapshotPayload(payload, meta = {}) {
	    if (!payload || typeof payload !== 'object') return;
	    const entities = Array.isArray(payload?.entities) ? payload.entities : null;
	    if (!entities) {
	      pageNativeSnapshotError(new Error('/snapshot invalid payload'), meta);
	      return;
	    }
	    bot.globalState.tick = Number(payload?.tick || bot.globalState.tick || 0);
	    bot.globalState.entities = entities;
	    bot.globalState.bullets = Array.isArray(payload?.bullets) ? payload.bullets : [];
	    bot.globalState.coinDrops = Array.isArray(payload?.coin_drops) ? payload.coin_drops : [];
	    bot.globalState.messages = Array.isArray(payload?.messages) ? payload.messages : [];
	    bot.globalState.snapshotRefreshedAt = Date.now();
	    bot.globalState.passiveSnapshotRefreshedAt = bot.globalState.snapshotRefreshedAt;
	    bot.globalState.passiveSnapshotSource = String(meta.source || 'page-native-snapshot');
	    bot.globalState.error = String(bot.globalState.error || '').replace(/(^|; )snapshot: [^;]*/g, '').replace(/^;\s*/, '');
	    noteLoginSnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      entities: bot.globalState.entities,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    noteLeave403SnapshotProbe(true, {
	      tick: bot.globalState.tick,
	      source: bot.globalState.passiveSnapshotSource,
	      passive: true
	    });
	    recordRuntimeDiagnostics({
	      lastPassiveSnapshot: {
	        at: bot.globalState.snapshotRefreshedAt,
	        source: bot.globalState.passiveSnapshotSource,
	        url: String(meta.url || ''),
	        entities: arrayCount(bot.globalState.entities),
	        tick: bot.globalState.tick
	      }
	    });
	  }

	  function pageNativeSnapshotError(err, meta = {}) {
	    const message = err?.message || String(err || 'page native snapshot failed');
	    bot.globalState.passiveSnapshotError = message;
	    bot.globalState.passiveSnapshotErrorAt = Date.now();
	    noteLoginSnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	    noteLeave403SnapshotProbe(false, {
	      error: message,
	      source: String(meta.source || 'page-native-snapshot'),
	      passive: true
	    });
	  }

	  function installPageNativeSnapshotObserver() {
	    const key = '__graspRatPageNativeSnapshotObserver';
	    const state = readPageGlobal(key, null, pageGlobal) || {
	      installed: false,
	      originalResponseJson: null,
	      originalResponseText: null,
	      originalXhrOpen: null,
	      observedXhrs: null
	    };
	    installPageGlobal(key, state, pageGlobal);
	    state.handleSnapshotPayload = pageNativeSnapshotPayload;
	    state.handleSnapshotError = pageNativeSnapshotError;
	    if (state.installed) return;
	    state.installed = true;
	    const observeFetchResponse = (response, parsed, source) => {
	      const snapshotUrl = pageNativeSnapshotUrl(response?.url || '');
	      if (!snapshotUrl) return;
	      Promise.resolve(parsed)
	        .then(payload => {
	          if (!response?.ok) {
	            state.handleSnapshotError?.(new Error('/snapshot HTTP ' + (response?.status || 0)), { source, url: snapshotUrl });
	            return;
	          }
	          state.handleSnapshotPayload?.(payload, { source, url: snapshotUrl });
	        })
	        .catch(err => state.handleSnapshotError?.(err, { source, url: snapshotUrl }));
	    };
	    const ResponseCtor = readPageGlobal('Response', null, pageGlobal);
	    if (typeof ResponseCtor === 'function' && ResponseCtor.prototype) {
	      const responseProto = ResponseCtor.prototype;
	      if (typeof responseProto.json === 'function') {
	        state.originalResponseJson = responseProto.json;
	        responseProto.json = function graspRatObservedResponseJson() {
	          const result = state.originalResponseJson.apply(this, arguments);
	          observeFetchResponse(this, result, 'page-native-fetch-json');
	          return result;
	        };
	      }
	      if (typeof responseProto.text === 'function') {
	        state.originalResponseText = responseProto.text;
	        responseProto.text = function graspRatObservedResponseText() {
	          const result = state.originalResponseText.apply(this, arguments);
	          const snapshotUrl = pageNativeSnapshotUrl(this?.url || '');
	          if (snapshotUrl) {
	            const response = this;
	            const parsed = Promise.resolve(result).then(text => JSON.parse(String(text || 'null')));
	            observeFetchResponse(response, parsed, 'page-native-fetch-text');
	          }
	          return result;
	        };
	      }
	    }
	    const XMLHttpRequestCtor = readPageGlobal('XMLHttpRequest', null, pageGlobal);
	    if (typeof XMLHttpRequestCtor === 'function') {
	      const proto = XMLHttpRequestCtor.prototype;
	      state.originalXhrOpen = proto.open;
	      state.observedXhrs = typeof WeakSet === 'function' ? new WeakSet() : null;
	      proto.open = function graspRatObservedXhrOpen(method, url) {
	        const xhr = this;
	        let snapshotUrl = '';
	        try {
	          snapshotUrl = pageNativeSnapshotUrl(url);
	        } catch (_) {
	          snapshotUrl = '';
	        }
	        if (snapshotUrl && (!state.observedXhrs || !state.observedXhrs.has(xhr))) {
	          try {
	            state.observedXhrs?.add(xhr);
	          } catch (_) {}
	          xhr.addEventListener('loadend', () => {
	            try {
	              if (xhr.status < 200 || xhr.status >= 300) throw new Error('/snapshot HTTP ' + xhr.status);
	              const payload = xhr.responseType === 'json'
	                ? xhr.response
	                : JSON.parse(String(xhr.responseText || xhr.response || 'null'));
	              state.handleSnapshotPayload?.(payload, { source: 'page-native-xhr', url: snapshotUrl });
	            } catch (err) {
	              state.handleSnapshotError?.(err, { source: 'page-native-xhr', url: snapshotUrl });
	            }
	          });
	        }
	        return state.originalXhrOpen.apply(this, arguments);
	      };
	    }
	  }
`;
}

module.exports = {
  pageNativeSnapshotSource
};
