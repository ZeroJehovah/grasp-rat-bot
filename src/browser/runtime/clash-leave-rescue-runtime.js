'use strict';

const {
  pendingExitRetryMsCore: pendingExitRetryMsForLeaveCommandCore,
  pendingExitDisplayReasonCore: pendingExitDisplayReasonForLeaveCommandCore,
  summarizePendingExitCore: summarizePendingExitForLeaveCommandCore,
  leaveDetailHasHttp403Core: leaveDetailHasHttp403ForLeaveCommandCore,
  leaveDetailSucceededCore: leaveDetailSucceededForLeaveCommandCore
} = require('./pending-exit');
const {
  leaveCommandFailureMessageCore,
  summarizeLeaveCommandResultCore,
  leaveDetailFailedForClashRescueCore,
  clashLeaveRescueAttemptsCore,
  nextClashLeaveRescueStageCore,
  summarizeClashLeaveRescueResultCore,
  clashLeaveRescueRetryDetailCore
} = require('./leave-command');

function createClashLeaveRescueRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    pageGlobal = typeof window !== 'undefined' ? window : null,
    pendingExitStateKey = '',
    readPageGlobal = () => null,
    normalizePendingExitReloadConfirmationCore = value => value,
    writePersistentPendingExitStateCore = () => null,
    pendingExitPersistenceCoreHelpers = () => ({}),
    recordExitAuditEvent = () => false,
    logStatus = () => {},
    recordUnhandledTickError = () => {},
    stopMotionAfterExit = () => {},
    noteImportantSessionExit = () => null,
    ensureExitAuditDetail = () => null,
    isVisible = () => false,
    cloneForPendingExit = value => value || null,
    pendingExitSkipNewLeave = () => null,
    recordPendingExitResult = () => {},
    pendingExitSelfState = () => ({ known: false, alive: false }),
    pendingExitLocalConfirmationState = () => ({ confirmed: false }),
    confirmPendingExit = (_pending, state) => state || null,
    requestPendingExitLeaveSuccessReload = () => false,
    getSelf = () => null,
    newExitAuditRequestId = exitAuditId => String(exitAuditId || '') + '-leave'
  } = runtime;
  const localStorage = storage;
  const PENDING_EXIT_STATE_KEY = pendingExitStateKey;

  function waitWithTimeout(promise, timeoutMs, label) {
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

  function clashLeaveRescueHook() {
    try {
      const hook = readPageGlobal('__graspRatBotClashLeaveRescue', null, pageGlobal);
      return typeof hook === 'function' ? hook : null;
    } catch (_) {
      return null;
    }
  }

  function appendClashLeaveRescueAttempt(detail, attempt) {
    if (!detail || !attempt) return;
    const attempts = clashLeaveRescueAttemptsCore(detail).concat([attempt]).slice(-6);
    detail.clashLeaveRescueAttempts = attempts;
    detail.clashLeaveRescue = attempt;
    bot.clashLeaveRescue.lastAt = Number(attempt.at || Date.now()) || Date.now();
    bot.clashLeaveRescue.lastStage = attempt.stage || '';
    bot.clashLeaveRescue.lastResult = attempt;
    bot.clashLeaveRescue.attempts = (Array.isArray(bot.clashLeaveRescue.attempts) ? bot.clashLeaveRescue.attempts : [])
      .concat([attempt])
      .slice(-8);
  }

  async function prepareDefaultClashLeaveProxy(detail) {
    if (!cfg.clashLeaveRescueEnabled) return false;
    if (!detail || typeof detail !== 'object') return false;
    if (detail.clashLeaveRescueRetry || clashLeaveRescueAttemptsCore(detail).length) return false;
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
        attempt = summarizeClashLeaveRescueResultCore(result, stage, '');
      } catch (err) {
        attempt = summarizeClashLeaveRescueResultCore(null, stage, err?.message || String(err));
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
    if (!leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })) return null;
    let stage = nextClashLeaveRescueStageCore(detail);
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
          attempt = summarizeClashLeaveRescueResultCore(result, stage, '');
        } catch (err) {
          attempt = summarizeClashLeaveRescueResultCore(null, stage, err?.message || String(err));
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
          const retryDetail = clashLeaveRescueRetryDetailCore(detail, stage, { nowMs: Date.now(), cloneForPendingExit, pendingExitDisplayReason: summary => pendingExitDisplayReasonForLeaveCommandCore(summary) });
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
            writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
            retryDetail.pendingExit = (() => {
        const pendingExitSummaryPending = bot.pendingExit;
        if (!pendingExitSummaryPending) return null;
        const pendingExitSummaryNow = Date.now();
        const pendingExitSummaryReload = normalizePendingExitReloadConfirmationCore(pendingExitSummaryPending.reloadConfirmation, pendingExitSummaryPending, pendingExitSummaryNow);
        return summarizePendingExitForLeaveCommandCore(pendingExitSummaryPending, {
          nowMs: pendingExitSummaryNow,
          retryMs: pendingExitRetryMsForLeaveCommandCore(pendingExitSummaryPending, {
        leaveRetryMinMs: cfg.leaveRetryMinMs,
        leaveCommandTimeoutMs: cfg.leaveCommandTimeoutMs,
        offlineLeaveRetryMs: cfg.offlineLeaveRetryMs,
        combatLeaveRetryMs: cfg.combatLeaveRetryMs,
        pursuitLeaveRetryMs: cfg.pursuitLeaveRetryMs
      }),
          reloadConfirmation: pendingExitSummaryReload
        });
      })();
          }
          recordPendingExitResult(pending?.source || detail.exitAuditSource || 'offline', retryDetail, retryAt);
          await issueLeaveCommand(retryDetail);
          if (
            !retryDetail.leaveRequestPending
            && leaveDetailFailedForClashRescueCore(retryDetail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })
            && nextClashLeaveRescueStageCore(retryDetail)
          ) {
            detail = retryDetail;
            stage = nextClashLeaveRescueStageCore(detail);
            continue;
          }
          return retryDetail;
        }
        logStatus('clash leave rescue failed ' + stage, { stage, clashLeaveRescue: attempt });
        stage = nextClashLeaveRescueStageCore(detail);
      }
    } finally {
      bot.clashLeaveRescue.running = false;
    }
    return null;
  }

  function scheduleClashLeaveRescueRetry(detail) {
    if (!leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) })) return false;
    if (!nextClashLeaveRescueStageCore(detail)) return false;
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
    writePersistentPendingExitStateCore(localStorage, PENDING_EXIT_STATE_KEY, (bot.pendingExit) || bot.pendingExit, Date.now(), pendingExitPersistenceCoreHelpers());
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (leaveDetailHasHttp403ForLeaveCommandCore(detail)) {
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
    if (leaveDetailSucceededForLeaveCommandCore(detail)) {
      requestPendingExitLeaveSuccessReload(detail, 'leave-success');
      return null;
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || leaveCommandFailureMessageCore(rawResult);
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = summarizeLeaveCommandResultCore(rawResult);
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
    detail.leaveRequests = detail.leaveRequests.slice(-20);
    detail.lastLeaveRequest = request;
    const http403 = leaveDetailHasHttp403ForLeaveCommandCore(detail);
    const clashRescuePending = http403 && leaveDetailFailedForClashRescueCore(detail, { clashLeaveRescueEnabled: cfg.clashLeaveRescueEnabled, hasClashLeaveRescueHook: () => Boolean(clashLeaveRescueHook()) }) && Boolean(nextClashLeaveRescueStageCore(detail));
    if (leaveDetailSucceededForLeaveCommandCore(detail) || http403) {
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
    if (leaveDetailSucceededForLeaveCommandCore(detail)) requestPendingExitLeaveSuccessReload(detail, 'leave-success');
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


  return {
    waitWithTimeout,
    clashLeaveRescueHook,
    appendClashLeaveRescueAttempt,
    prepareDefaultClashLeaveProxy,
    runClashLeaveRescueRetry,
    scheduleClashLeaveRescueRetry,
    updatePendingExitLastResult,
    maybeConfirmPendingExitFromLeaveDetail,
    completeLeaveRequest,
    issueLeaveCommand
  };
}

module.exports = {
  createClashLeaveRescueRuntime
};
