'use strict';

const {
  writePersistentPendingExitStateCall
} = require('./pending-exit-persistence-call-source');
const {
  pendingExitSummaryPreludeSource,
  summarizePendingExitCall
} = require('./pending-exit-summary-call-source');

function leaveCommandSource(options = {}) {
  const runtimePrelude = pendingExitSummaryPreludeSource('LeaveCommand', options);
  const writePendingExit = pending => writePersistentPendingExitStateCall(pending, options);
  const pendingExitDisplayReason = summary => options.bundledRuntime
    ? `pendingExitDisplayReasonCore(${summary})`
    : `pendingExitDisplayReason(${summary})`;
  return String.raw`${runtimePrelude}  function waitWithTimeout(promise, timeoutMs, label) {
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
    retryDetail.displayReason = detail.displayReason || ${pendingExitDisplayReason('retryDetail.summary')};
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
            ${writePendingExit('bot.pendingExit')};
            retryDetail.pendingExit = ${summarizePendingExitCall('bot.pendingExit', { ...options, alias: 'LeaveCommand' })};
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

  function updatePendingExitLastResult(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return;
    bot.pendingExit = {
      ...pending,
      updatedAt: Date.now(),
      lastAttemptAt: Number(detail.at || detail.lastLeaveRequest?.sentAt || pending.lastAttemptAt || Date.now()),
      lastResult: cloneForPendingExit(detail)
    };
    ${writePendingExit('bot.pendingExit')};
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (leaveDetailHasHttp403(detail)) {
      if (scheduleClashLeaveRescueRetry(detail)) return null;
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
    }
    if (leaveDetailSucceeded(detail)) {
      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
      return null;
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || leaveCommandFailureMessage(rawResult);
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = summarizeLeaveCommandResult(rawResult);
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
    detail.leaveRequests = detail.leaveRequests.slice(-20);
    detail.lastLeaveRequest = request;
    const http403 = leaveDetailHasHttp403(detail);
    const clashRescuePending = http403 && leaveDetailFailedForClashRescue(detail) && Boolean(nextClashLeaveRescueStage(detail));
    if (leaveDetailSucceeded(detail) || http403) {
      stopMotionAfterExit(http403 ? 'leave-http-403' : 'leave-success');
      if (http403 && !clashRescuePending) {
        noteImportantSessionExit('leave-http-403:' + (detail.reason || ''), detail.self || bot.lastSelf, request.completedAt, { exit: detail });
      }
    }
	    updatePendingExitLastResult(detail);
	    recordExitAuditEvent('leave-request', detail, {
	      at: request.completedAt,
      request,
      source: detail.exitAuditSource || detail.reason || 'leave-command',
      scope: detail.exitAuditScope || ''
    });
    if (leaveDetailSucceeded(detail)) requestPendingExitLeaveSuccessReload(detail, 'leave-success');
    const rescueScheduled = scheduleClashLeaveRescueRetry(detail);
    if (!rescueScheduled) maybeConfirmPendingExitFromLeaveDetail(detail);
    return detail;
  }

  async function issueLeaveCommand(detail) {
    if (bot.pendingExit && !detail?.pendingExitRetry) {
      const skipped = pendingExitSkipNewLeave(detail?.exitAuditSource || detail?.reason || 'leave-command', detail?.reason || '', detail || {});
      if (skipped) {
        Object.assign(detail, skipped);
        return detail;
      }
    }
    ensureExitAuditDetail(detail, {
      source: detail?.exitAuditSource || detail?.reason || 'leave-command',
      scope: detail?.exitAuditScope || ''
    });
    await prepareDefaultClashLeaveProxy(detail);
    const request = {
      requestId: newExitAuditRequestId(detail.exitAuditId),
      exitAuditId: detail.exitAuditId || '',
      sentAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      attempted: false,
      method: '',
      error: '',
      result: null,
      pending: false
    };
	    try {
	      if (typeof leave === 'function') {
	        detail.attempted = true;
	        detail.method = detail.userId ? 'leave(userId)' : 'leave';
	        const result = detail.userId ? leave(detail.userId) : leave();
	        if (result && typeof result.then === 'function') {
          detail.leaveRequestPending = true;
          detail.leaveRequestSentAt = request.sentAt;
          detail.leaveRequestTimeoutMs = Math.max(1000, Number(cfg.leaveCommandTimeoutMs || 0) || 3000);
          request.attempted = true;
          request.method = detail.method;
          request.pending = true;
          detail.lastLeaveRequest = request;
          let settled = false;
          const timeoutMs = detail.leaveRequestTimeoutMs;
          const finish = (rawResult, errorMessage = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            completeLeaveRequest(detail, request, rawResult, errorMessage);
          };
          const timer = setTimeout(() => {
            finish({ error: 'leave request timed out after ' + timeoutMs + 'ms' }, 'leave request timed out after ' + timeoutMs + 'ms');
          }, timeoutMs);
          Promise.resolve(result).then(
            value => finish(value, ''),
            err => finish({ error: err?.message || String(err) }, err?.message || String(err))
          );
          return detail;
	        }
        return completeLeaveRequest(detail, request, result, '');
	      } else {
	        const leaveBtn = document.querySelector('#leaveBtn');
	        if (leaveBtn && isVisible(leaveBtn)) {
	          detail.attempted = true;
	          detail.method = '#leaveBtn';
	          leaveBtn.click();
          return completeLeaveRequest(detail, request, undefined, '');
	        } else {
	          detail.error = 'leave control not found';
          return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	        }
	      }
	    } catch (err) {
	      detail.error = err?.message || String(err);
      return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	    }
	    return detail;
	  }

`;
}

module.exports = {
  leaveCommandSource
};
