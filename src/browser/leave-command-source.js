'use strict';

function leaveCommandSource() {
  return String.raw`  function waitWithTimeout(promise, timeoutMs, label) {
    const ms = Math.max(100, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function leaveCommandFailureMessage(value) {
    if (value === false) return 'leave request returned false';
    if (!value || typeof value !== 'object') return '';
    if (value.ok === false || value.success === false) {
      return value.message || value.error || 'leave request returned failure';
    }
    if (value.error && value.ok !== true && value.success !== true) {
      return value.message || value.error || 'leave request returned error';
    }
    const status = Number(value.status || value.statusCode || 0);
    if (status >= 400) return value.statusText || value.message || ('leave request HTTP ' + status);
    return '';
  }

  function summarizeLeaveCommandResult(value) {
    if (value === undefined) return { type: 'undefined' };
    if (value === null) return { type: 'null' };
    if (value === false || value === true) return { type: 'boolean', value: Boolean(value) };
    if (typeof value !== 'object') return { type: typeof value, value: String(value).slice(0, 200) };
    return {
      type: Array.isArray(value) ? 'array' : 'object',
      ok: value.ok ?? null,
      success: value.success ?? null,
      status: value.status ?? value.statusCode ?? null,
      statusText: value.statusText || '',
      message: value.message || '',
      error: value.error || ''
    };
  }

  function clashLeaveRescueHook() {
    try {
      const hook = readPageGlobal('__graspRatBotClashLeaveRescue', null, pageGlobal);
      return typeof hook === 'function' ? hook : null;
    } catch (_) {
      return null;
    }
  }

  function leaveDetailFailedForClashRescue(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (!detail.attempted || detail.leaveRequestPending) return false;
    if (detail.exitConfirmed) return false;
    const http403 = leaveDetailHasHttp403(detail);
    if (!detail.error && !http403) return false;
    if (leaveDetailSucceeded(detail)) return false;
    return Boolean(clashLeaveRescueHook());
  }

  function clashLeaveRescueAttempts(detail) {
    return Array.isArray(detail?.clashLeaveRescueAttempts)
      ? detail.clashLeaveRescueAttempts.filter(item => item && typeof item === 'object')
      : [];
  }

  const CLASH_LEAVE_RESCUE_STAGE_ORDER = ['auto', 'direct', 'manual'];

  function nextClashLeaveRescueStage(detail) {
    const stages = new Set(clashLeaveRescueAttempts(detail).map(item => String(item.stage || '')));
    for (const stage of CLASH_LEAVE_RESCUE_STAGE_ORDER) {
      if (!stages.has(stage)) return stage;
    }
    return '';
  }

  function summarizeClashLeaveRescueResult(result, stage, error = '') {
    const raw = result && typeof result === 'object' ? result : {};
    return {
      stage,
      ok: Boolean(!error && raw.ok !== false),
      target: raw.target || '',
      group: raw.group || '',
      at: Number(raw.at || Date.now()) || Date.now(),
      durationMs: Math.max(0, Math.round(Number(raw.durationMs || 0) || 0)),
      switched: raw.switched ? {
        ok: Boolean(raw.switched.ok !== false),
        status: Number(raw.switched.status || 0) || 0
      } : null,
      closeConnections: raw.closeConnections ? {
        ok: Boolean(raw.closeConnections.ok !== false),
        status: Number(raw.closeConnections.status || 0) || 0,
        error: raw.closeConnections.error || ''
      } : null,
      error: error || raw.error || ''
    };
  }

  function appendClashLeaveRescueAttempt(detail, attempt) {
    if (!detail || !attempt) return;
    const attempts = clashLeaveRescueAttempts(detail).concat([attempt]).slice(-6);
    detail.clashLeaveRescueAttempts = attempts;
    detail.clashLeaveRescue = attempt;
    bot.clashLeaveRescue.lastAt = Number(attempt.at || Date.now()) || Date.now();
    bot.clashLeaveRescue.lastStage = attempt.stage || '';
    bot.clashLeaveRescue.lastResult = attempt;
    bot.clashLeaveRescue.attempts = (Array.isArray(bot.clashLeaveRescue.attempts) ? bot.clashLeaveRescue.attempts : [])
      .concat([attempt])
      .slice(-8);
  }

  function clashLeaveRescueRetryDetail(detail, stage) {
    const retryDetail = cloneForPendingExit(detail) || {};
    retryDetail.at = Date.now();
    retryDetail.attempted = false;
    retryDetail.method = '';
    retryDetail.error = '';
    retryDetail.leaveRequestPending = false;
    retryDetail.lastLeaveRequest = null;
    retryDetail.leaveRequests = [];
    retryDetail.pendingExitRetry = true;
    retryDetail.clashLeaveRescueRetry = true;
    retryDetail.clashLeaveRescueStage = stage;
    retryDetail.clashLeaveRescueAttempts = clashLeaveRescueAttempts(detail);
    retryDetail.summary = detail.summary || detail.exitSummary || detail.reason || '';
    retryDetail.displayReason = detail.displayReason || pendingExitDisplayReason(retryDetail.summary);
    return retryDetail;
  }

  function resetClashLeaveRescueRound(detail) {
    if (!detail || typeof detail !== 'object') return detail;
    detail.clashLeaveRescueAttempts = [];
    detail.clashLeaveRescue = null;
    detail.clashLeaveRescueStage = '';
    detail.clashLeaveRescueRetry = false;
    return detail;
  }

  async function prepareDefaultClashLeaveProxy(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (detail.clashLeaveRescueRetry || clashLeaveRescueAttempts(detail).length) return false;
    if (bot.clashLeaveRescue.running) return false;
    const hook = clashLeaveRescueHook();
    if (!hook) return false;
    const stage = 'auto';
    bot.clashLeaveRescue.running = true;
    try {
      let attempt = null;
      try {
        const result = await waitWithTimeout(
          hook({
            stage,
            reason: detail.reason || '',
            scope: detail.exitAuditScope || '',
            source: detail.exitAuditSource || '',
            exitAuditId: detail.exitAuditId || '',
            requestId: ''
          }),
          Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
          'Clash leave default ' + stage
        );
        attempt = summarizeClashLeaveRescueResult(result, stage);
      } catch (err) {
        attempt = summarizeClashLeaveRescueResult(null, stage, err?.message || String(err));
      }
      appendClashLeaveRescueAttempt(detail, attempt);
      updatePendingExitLastResult(detail);
      recordExitAuditEvent('clash-leave-rescue', detail, {
        at: attempt.at || Date.now(),
        source: detail.exitAuditSource || 'leave-command',
        scope: detail.exitAuditScope || '',
        request: attempt
      });
      logStatus(
        attempt.ok ? 'clash leave default switched ' + stage : 'clash leave default failed ' + stage,
        { stage, clashLeaveRescue: attempt }
      );
      return Boolean(attempt.ok);
    } finally {
      bot.clashLeaveRescue.running = false;
    }
  }

  async function runClashLeaveRescueRetry(detail) {
    if (bot.clashLeaveRescue.running) return null;
    if (!leaveDetailFailedForClashRescue(detail)) return null;
    let stage = nextClashLeaveRescueStage(detail);
    if (!stage) return null;
    bot.clashLeaveRescue.running = true;
    try {
      while (stage) {
        const hook = clashLeaveRescueHook();
        if (!hook) return null;
        let attempt = null;
        try {
          const result = await waitWithTimeout(
            hook({
              stage,
              reason: detail.reason || '',
              scope: detail.exitAuditScope || '',
              source: detail.exitAuditSource || '',
              exitAuditId: detail.exitAuditId || '',
              requestId: detail.lastLeaveRequest?.requestId || ''
            }),
            Math.max(1000, Number(cfg.clashLeaveRescueTimeoutMs || 9000) || 9000),
            'Clash leave rescue ' + stage
          );
          attempt = summarizeClashLeaveRescueResult(result, stage);
        } catch (err) {
          attempt = summarizeClashLeaveRescueResult(null, stage, err?.message || String(err));
        }
        appendClashLeaveRescueAttempt(detail, attempt);
        updatePendingExitLastResult(detail);
        recordExitAuditEvent('clash-leave-rescue', detail, {
          at: attempt.at || Date.now(),
          source: detail.exitAuditSource || 'leave-command',
          scope: detail.exitAuditScope || '',
          request: attempt
        });
        if (attempt.ok) {
          logStatus('clash leave rescue switched ' + stage, { stage, clashLeaveRescue: attempt });
          const retryDetail = clashLeaveRescueRetryDetail(detail, stage);
          const pending = bot.pendingExit;
          const retryAt = Number(retryDetail.at || Date.now()) || Date.now();
          if (pending) {
            bot.pendingExit = {
              ...pending,
              updatedAt: retryAt,
              lastAttemptAt: retryAt,
              retryCount: Number(pending.retryCount || 0) + 1,
              lastResult: cloneForPendingExit(retryDetail)
            };
            writePersistentPendingExitState(bot.pendingExit);
            retryDetail.pendingExit = summarizePendingExit(bot.pendingExit);
          }
          recordPendingExitResult(pending?.source || detail.exitAuditSource || 'offline', retryDetail, retryAt);
          await issueLeaveCommand(retryDetail);
          if (
            !retryDetail.leaveRequestPending
            && leaveDetailFailedForClashRescue(retryDetail)
            && nextClashLeaveRescueStage(retryDetail)
          ) {
            detail = retryDetail;
            stage = nextClashLeaveRescueStage(detail);
            continue;
          }
          return retryDetail;
        }
        logStatus('clash leave rescue failed ' + stage, { stage, clashLeaveRescue: attempt });
        stage = nextClashLeaveRescueStage(detail);
      }
    } finally {
      bot.clashLeaveRescue.running = false;
    }
    return null;
  }

  function scheduleClashLeaveRescueRetry(detail) {
    if (!leaveDetailFailedForClashRescue(detail)) return false;
    if (!nextClashLeaveRescueStage(detail)) return false;
    if (bot.clashLeaveRescue.running) return true;
    Promise.resolve()
      .then(() => runClashLeaveRescueRetry(detail))
      .catch(err => recordUnhandledTickError('clash-leave-rescue', err));
    return true;
  }

`;
}

module.exports = {
  leaveCommandSource
};
