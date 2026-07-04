'use strict';

function tickSafetySource(options = {}) {
  const recordRuntimeDiagnosticsCall = values => options.bundledRuntime
    ? `recordRuntimeDiagnosticsCore(bot, ${values})`
    : `recordRuntimeDiagnostics(${values})`;
  return String.raw`
      function recordUnhandledTickError(source, err) {
        const entry = {
          at: Date.now(),
          source,
          message: err?.message || String(err),
          stack: String(err?.stack || '')
        };
        try {
          if (!Array.isArray(bot.errors)) bot.errors = [];
          bot.errors.push(entry);
          if (bot.errors.length > 20) bot.errors.splice(0, bot.errors.length - 20);
        } catch (_) {}
        try {
          console.error('[grasp-rat-bot:unhandled-tick]', err);
        } catch (_) {}
        return entry;
      }

      function runTickSafely(source = 'timer') {
        const tickStartedAt = Date.now();
        const tickStartedPerf = now();
        ${recordRuntimeDiagnosticsCall(`{
          lastTickStartedAt: tickStartedAt,
          lastTickSource: source
        }`)};
        return Promise.resolve()
          .then(() => tick(source))
          .catch(err => {
            recordUnhandledTickError(source, err);
          })
          .finally(() => {
            ${recordRuntimeDiagnosticsCall(`{
              lastTickCompletedAt: Date.now(),
              lastTickDurationMs: Math.max(0, Math.round(now() - tickStartedPerf)),
              lastTickSource: source
            }`)};
          });
      }

      function runCallbackSafely(label, fn) {
        return function (...args) {
          try {
            const result = fn.apply(this, args);
            if (result && typeof result.then === 'function') {
              result.catch(err => recordUnhandledTickError(label, err));
            }
            return result;
          } catch (err) {
            recordUnhandledTickError(label, err);
            return undefined;
          }
        };
      }`;
}

module.exports = { tickSafetySource };
