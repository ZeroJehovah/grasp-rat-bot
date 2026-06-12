#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const RUNTIME_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js',
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const REMOTE_BOT_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js'
];

const BOOTSTRAP_FILES = [
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const NUMERIC_INVARIANTS = [
  { key: 'postLoginZoomOutClicks', value: 4 },
  { key: 'postLoginZoomStartDelayMs', value: 350 },
  { key: 'postLoginZoomOutIntervalMs', value: 80 },
  { key: 'postLoginZoomArmMissingMs', value: 1000 },
  { key: 'unsafeExitReloginMinDelayMs', value: 60000 },
  { key: 'staminaBudgetReloginDelayMs', value: 300000 },
  { key: 'leaveRetryMinMs', value: 10000 },
  { key: 'leaveCommandTimeoutMs', value: 10000 },
  { key: 'leave403ReloginDelayMs', value: 3600000 },
  { key: 'leave403SnapshotSuccessRequired', value: 5 },
  { key: 'page403ErrorReloadMs', value: 600000 },
  { key: 'combatAttackRange', value: 14500 },
  { key: 'combatPressureCloseMinHp', value: 60 },
  { key: 'combatShootEveryMs', value: 160 },
  { key: 'combatShootReserveMs', value: 5600 },
  { key: 'combatShootDodgeReserveMs', value: 3800 },
  { key: 'combatShootHardReserveMs', value: 1800 },
  { key: 'combatShootConserveEveryMs', value: 360 },
  { key: 'combatShootRecoveryEveryMs', value: 700 }
];

const results = [];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail: detail || '' });
  } catch (err) {
    results.push({ ok: false, name, detail: err && err.message ? err.message : String(err) });
  }
}

function expectObjectNumber(text, key, value) {
  const re = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*${escapeRegExp(String(value))}(?![0-9.])`);
  return re.test(text);
}

function stringFromCodes(codes) {
  return String.fromCharCode(...codes);
}

function functionBody(text, name) {
  const marker = `function ${name}`;
  const start = text.indexOf(marker);
  assert(start >= 0, `${name} function not found`);
  const paren = text.indexOf('(', start + marker.length);
  assert(paren >= 0, `${name} parameter list not found`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = paren; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = i + 1;
        break;
      }
    }
  }
  assert(bodyStart >= 0, `${name} parameter list not closed`);
  const open = text.indexOf('{', bodyStart);
  assert(open >= 0, `${name} function body not found`);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`${name} function body not closed`);
}

function countMatches(text, re) {
  const matches = String(text || '').match(re);
  return matches ? matches.length : 0;
}

function generateRemoteSource(manifest) {
  return execFileSync(process.execPath, [
    path.join(ROOT, 'grasp-rat-bot.js'),
    '--print-source',
    '--bot-version', String(manifest.version || ''),
    '--status-every', String(manifest.statusEvery || 1000)
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
}

function extractSingle(text, re, label) {
  const match = String(text || '').match(re);
  assert(match && match[1], `${label} missing`);
  return String(match[1]);
}

function main() {
  const manifest = readJson('dist/manifest.json');
  const distSource = readText('dist/grasp-rat-remote-bot.js');
  const sourceBot = readText('grasp-rat-bot.js');
  const generatedSource = generateRemoteSource(manifest);
  const distHash = sha256Hex(distSource);
  const generatedHash = sha256Hex(generatedSource);

  check('manifest version is a bootstrap release', () => {
    assert(/^bootstrap-\d+\.\d+\.\d+$/.test(String(manifest.version || '')), `unexpected version ${manifest.version || '(empty)'}`);
    return manifest.version;
  });

  check('manifest sha256 is valid hex', () => {
    assert(/^[0-9a-f]{64}$/.test(String(manifest.sha256 || '')), `unexpected sha256 ${manifest.sha256 || '(empty)'}`);
    return manifest.sha256;
  });

  check('manifest sha256 matches dist remote bot', () => {
    assert(String(manifest.sha256 || '') === distHash, `manifest=${manifest.sha256 || '(empty)'} dist=${distHash}`);
    return distHash;
  });

  check('dist remote bot is generated from current source', () => {
    assert(generatedSource === distSource, `generated hash ${generatedHash} differs from dist hash ${distHash}`);
    return `${manifest.version} ${generatedHash}`;
  });

  check('generated remote bot hash matches manifest', () => {
    assert(String(manifest.sha256 || '') === generatedHash, `manifest=${manifest.sha256 || '(empty)'} generated=${generatedHash}`);
    return generatedHash;
  });

  for (const file of REMOTE_BOT_FILES) {
    const text = file === 'grasp-rat-bot.js' ? sourceBot : distSource;
    for (const invariant of NUMERIC_INVARIANTS) {
      check(`${file} has ${invariant.key}=${invariant.value}`, () => {
        assert(expectObjectNumber(text, invariant.key, invariant.value), `${invariant.key}: ${invariant.value} not found`);
      });
    }
    check(`${file} accepts injected sourceHash`, () => {
      assert(text.includes('sourceHash: String(config.sourceHash || \'\')'), 'sourceHash config field not found');
    });
    check(`${file} keeps post-login zoom-out scheduling flow`, () => {
      assert(text.includes('postLoginZoom: previousBot?.postLoginZoom'), 'post-login zoom state is not preserved across bot updates');
      assert(text.includes('armed: preserved.postLoginZoom ? Boolean(preserved.postLoginZoom.armed) : true'), 'post-login zoom armed state does not reuse preserved state');
      assert(text.includes("appliedKey: String(preserved.postLoginZoom?.appliedKey || '')"), 'post-login zoom applied key is not preserved');
      assert(text.includes("scheduledKey: String(preserved.postLoginZoom?.scheduledKey || '')"), 'post-login zoom scheduled key is not preserved');
      const keyBody = functionBody(text, 'postLoginZoomSessionKey');
      assert(keyBody.includes("return String(userId) + ':token:' + String(token).slice(0, 24)"), 'token-based zoom session key not found');
      assert(keyBody.includes("return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0)"), 'generation-based zoom session key not found');

      const unavailableBody = functionBody(text, 'noteSelfUnavailableForPostLoginZoom');
      assert(unavailableBody.includes('cfg.postLoginZoomArmMissingMs'), 'missing-self arm delay config not used');
      assert(unavailableBody.includes('state.generation = Number(state.generation || 0) + 1'), 'zoom generation increment not found');
      assert(unavailableBody.includes('state.armed = true'), 'zoom re-arm state not found');
      assert(unavailableBody.includes("state.scheduledKey = ''"), 'scheduled key reset not found');

      const scheduleBody = functionBody(text, 'schedulePostLoginZoomOut');
      assert(scheduleBody.includes('state.lastSeenSelfAt = t'), 'last seen self timestamp not updated');
      assert(scheduleBody.includes('state.missingSince = 0'), 'missing-self timer not cleared on self detection');
      assert(scheduleBody.includes('cfg.postLoginZoomOutClicks'), 'zoom click count config not used');
      assert(scheduleBody.includes('if (!clicks || !state.armed) return null'), 'zoom armed/click guard not found');
      assert(scheduleBody.includes('state.appliedKey === key || state.scheduledKey === key'), 'duplicate session zoom guard not found');
      assert(scheduleBody.includes('state.armed = false'), 'zoom not disarmed after scheduling');
      assert(scheduleBody.includes('requestedClicks: clicks'), 'requested click count not recorded');
      assert(scheduleBody.includes('cfg.postLoginZoomStartDelayMs'), 'zoom start delay config not used');
      assert(scheduleBody.includes('requestNativeViewportResize'), 'zoom scheduling does not request native viewport resize');
      assert(scheduleBody.includes('cfg.postLoginZoomOutIntervalMs'), 'zoom click interval config not used');
      assert(scheduleBody.includes('for (let index = 0; index < clicks; index += 1)'), 'per-click scheduling loop not found');
      assert(scheduleBody.includes('clickZoomOutControl()'), 'scheduled callback does not click zoom-out control');
      assert(scheduleBody.includes('index * intervalMs'), 'scheduled clicks are not interval-spaced');
      assert(scheduleBody.includes('latest.completedClicks') && scheduleBody.includes('latest.failedClicks'), 'zoom result counters not updated');

      const findBody = functionBody(text, 'findZoomOutControl');
      assert(findBody.includes('#zoomOutBtn') && findBody.includes('[data-testid="zoom-out"]'), 'native zoom-out selectors not found');
      assert(findBody.includes('缩小'), 'localized zoom-out text fallback not found');
      const clickBody = functionBody(text, 'clickZoomOutControl');
      assert(clickBody.includes('control.click()'), 'zoom-out control click not found');
      assert(text.includes('postLoginZoom: this.postLoginZoom'), 'status does not expose postLoginZoom state');
    });
    check(`${file} ignores join-mode-only Active for defensive combat`, () => {
      const expectedMin = file === 'grasp-rat-bot.js' ? 2 : 1;
      assert(
        countMatches(text, /const isJoinModeActive = e => e\?\.current_join_mode === 'Active' \|\| e\?\.mode === 'Active';/g) >= expectedMin,
        'join-mode Active helper not found'
      );
      assert(
        countMatches(text, /const isAfkTarget = e => !isJoinModeActive\(e\) && !is(?:Currently)?Active\(e\) && !isMovingThreat\(e\);/g) >= expectedMin,
        'AFK target filter does not exclude join-mode Active'
      );
      assert(
        countMatches(text, /if \(isJoinModeActive\(target\)\) return true;/g) === 0,
        'join-mode-only Active can still force defensive combat'
      );
      assert(
        countMatches(text, /if \(isFiringEntity\(target\)\) return true;/g) >= expectedMin,
        'defensive combat target no longer accepts firing targets'
      );
      assert(
        countMatches(text, /if \(is(?:Currently)?Active\(target\)\) return true;/g) >= expectedMin,
        'defensive combat target no longer accepts real active targets'
      );
      assert(
        countMatches(text, /\+ \(isJoinModeActive\(target\) \? [0-9]+ : 0\)/g) >= expectedMin,
        'combat target priority does not include join-mode Active'
      );
    });
    check(`${file} ends combat logs on relogin wait/manual states`, () => {
      const body = functionBody(text, 'combatLogSuspendReason');
      assert(body.includes('login-suppressed'), 'login-suppressed suspend reason not found');
      assert(body.includes('manual-login'), 'manual-login suspend reason not found');
    });
    check(`${file} keeps specific exit reason during leave cooldown`, () => {
      const body = functionBody(text, 'combatLogExitSummaryFromDecision');
      assert(body.includes("leaveReason !== 'cooldown'"), 'cooldown leave detail can override specific exit reason');
      assert(body.includes('decisionReason || leaveReason'), 'decision reason fallback not found for cooldown leave detail');
      assert(body.includes('safeReloginAllowed: Boolean(detail.safeReloginAllowed || decision?.safeReloginAllowed)'), 'safe relogin marker not included in top-level exit summary');
      assert(body.includes('offlineSafety: detail.offlineSafety || decision?.offlineSafety || null'), 'offline safety not included in top-level exit summary');
    });
    check(`${file} keeps longest exit suppress delay`, () => {
      const confirmedBody = functionBody(text, 'setExitReloginSuppress');
      assert(
        confirmedBody.includes('const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'confirmed exit suppress does not take max(delay, minimum)'
      );
      const pendingBody = functionBody(text, 'primePendingUnsafeExitLoginSuppress');
      assert(
        pendingBody.includes('const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'pending unsafe exit suppress does not take max(delay, minimum)'
      );
    });
    check(`${file} records exit audit events and blocks login/reload until flushed`, () => {
      assert(text.includes('EXIT_AUDIT_PENDING_LOGS_KEY'), 'exit audit persistence key not found');
      assert(text.includes("type: 'exit-audit'"), 'exit audit event type not found');
      assert(text.includes("recordExitAuditEvent('exit-trigger'"), 'exit trigger audit event not recorded');
      assert(text.includes("recordExitAuditEvent('leave-request'"), 'leave request audit event not recorded');
      assert(text.includes("recordExitAuditEvent('exit-confirmed'"), 'exit confirmation audit event not recorded');
      const queueBody = functionBody(text, 'queueCombatLogEntry');
      assert(queueBody.includes('const critical = Boolean(options.critical || snapshot.exitAuditLogId)'), 'critical exit audit queue marker not found');
      assert(queueBody.includes('(!state.enabled && !critical)'), 'critical exit audit logs still depend on combat logging enabled');
      assert(queueBody.includes('persistExitAuditLogEntry(queued)'), 'critical exit audit logs are not persisted before flush');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('removePersistedExitAuditLogs(exitAuditIds)'), 'persisted exit audit logs are not cleared on successful flush');
      const reloadBody = functionBody(text, 'requestReload');
      assert(reloadBody.includes('if (exitAuditFlushPending())'), 'requestReload does not block on pending exit audit logs');
      const loginBody = functionBody(text, 'maybeStartAutoLogin');
      assert(loginBody.includes('if (exitAuditFlushPending())'), 'auto login does not block on pending exit audit logs');
      assert(loginBody.includes("reason: 'exit-log-flush-pending'"), 'blocked login reason not reported');
      const manualLoginBody = functionBody(text, 'forceLoginNow');
      assert(manualLoginBody.includes('skipped: true'), 'manual login can clear exit holds while audit logs are pending');
      assert(manualLoginBody.includes("skipReason: 'exit-log-flush-pending'"), 'manual login hold-clear skip reason not reported');
    });
    check(`${file} keeps failed leave attempts pending until confirmed`, () => {
      assert(countMatches(text, /if \(detail\.attempted \|\| detail\.exitAuditId\)/g) >= 4, 'failed/non-attempted exit audit leaves are not remembered as pending exits');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes('const lastError = String(pending.lastResult?.error || \'\')'), 'pending exit does not inspect last leave error');
      assert(pendingBody.includes('weakConfirmation'), 'pending exit does not mark weak auth-page confirmations');
      assert(pendingBody.includes('ignoredBecauseLastLeaveError'), 'pending exit may confirm auth/login page after leave error');
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('detail.leaveRequestPending = true'), 'async leave requests are not marked pending');
      assert(issueBody.includes('setTimeout(() =>'), 'async leave requests do not have a timeout gate');
      assert(issueBody.includes('detail.leaveRequestTimeoutMs'), 'leave timeout metadata is not recorded');
	      const completeBody = functionBody(text, 'completeLeaveRequest');
	      assert(completeBody.includes('request.durationMs'), 'leave request duration is not recorded');
	      assert(completeBody.includes('detail.leaveRequests.push(request)'), 'leave request history is not stored on leave detail');
	    });
	    check(`${file} stops native motion immediately after confirmed exits`, () => {
	      const completeBody = functionBody(text, 'completeLeaveRequest');
	      assert(
	        completeBody.includes("stopMotionAfterExit(leaveDetailHasHttp403(detail) ? 'leave-http-403' : 'leave-success')"),
	        'successful/403 leave completion does not stop motion immediately'
	      );
	      const confirmBody = functionBody(text, 'confirmPendingExit');
	      assert(confirmBody.includes("stopMotionAfterExit('exit-confirmed')"), 'pending exit confirmation does not stop motion');
	      assert(confirmBody.includes("clearCombatEngagement('exit-confirmed')"), 'pending exit confirmation does not clear combat engagement');
	      const clearBody = functionBody(text, 'clearNativeMotionState');
	      assert(clearBody.includes("nativeState.lastVel = '0 0'"), 'native lastVel is not cleared on stop');
	      assert(clearBody.includes("const vectorFields = ['currentVel', 'targetVel', 'velocity']"), 'native velocity vector fields are not cleared on stop');
	      const stopBody = functionBody(text, 'stopMotionSafely');
	      assert(stopBody.includes('const sent = sendNativeVelocity(0, 0, true);'), 'stopMotionSafely does not send forced zero velocity');
	      assert(stopBody.includes('stopLocalMotionOnly(reason);'), 'stopMotionSafely does not clear local motion after native stop');
	    });
	    check(`${file} confirms exits from local evidence and throttles live pending retries`, () => {
	      const localBody = functionBody(text, 'pendingExitLocalConfirmationState');
	      assert(localBody.includes('tokenCleared && chatLeftUser && ownEntity.disappeared'), 'token/chat/self-missing exit confirmation is not enforced');
      assert(text.includes("'token-chat-left-user-self-missing'"), 'local exit confirmation source not logged');
      const chatBody = functionBody(text, 'chatLeftUserMessageSeen');
      assert(/left\\{2,4}s\+user/.test(chatBody), 'left user chat message matcher not found');
      const ownBody = functionBody(text, 'ownEntityDisappearedState');
      assert(ownBody.includes('getOwnEntity') && ownBody.includes('native-entities') && ownBody.includes('snapshot'), 'own entity disappearance does not check native and snapshot sources');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes('if (state.known && state.alive)'), 'alive pending exit does not have a non-blocking path');
      assert(pendingBody.includes('schedulePendingExitRetry(pending, self, state)'), 'alive pending exit does not schedule retry in background');
      assert(pendingBody.includes('return null'), 'alive pending exit does not return to normal action selection');
      const retryBody = functionBody(text, 'pendingExitRetryMs');
      assert(retryBody.includes('cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000'), 'pending exit retry floor does not use 10s leave timeout');
      assert(text.includes('const pendingExitAlive = Boolean(bot.pendingExit && self && isAlive(self))'), 'pending alive exit guard not found before offline branch');
      assert(text.includes('controlOffline && !pendingExitAlive'), 'offline branch can still block live pending exits');
      assert(text.includes("pendingExitIntent:") && text.includes("reason: 'injury-leave'"), 'injury leave no longer preserves normal control action');
    });
    check(`${file} suppresses ordinary injury leave while combat state is active`, () => {
      const body = functionBody(text, 'isCombatStateForInjuryLeave');
      assert(body.includes('action?.combat'), 'combat action does not suppress ordinary injury leave');
      assert(body.includes('bot.pendingCombatLeave'), 'pending combat leave does not suppress ordinary injury leave');
      assert(body.includes('bot.lastSafety?.engagedCombat'), 'engaged combat safety state does not suppress ordinary injury leave');
      assert(body.includes('hasRecentCombatEngagementForInjuryLeave()'), 'recent combat engagement does not suppress ordinary injury leave');
      assert(text.includes('bot.pendingInjuryLeave && isCombatStateForInjuryLeave(action)'), 'main loop does not use combat-state injury suppression');
      assert(text.includes("suppressedReason: 'combat-state'"), 'combat-state injury suppression is not logged');
    });
    check(`${file} keeps engaged combat above recovery avoidance`, () => {
      const body = functionBody(text, 'chooseAction');
      assert(body.includes('const recoveryCombatAction = buildCombatAction(self, recoveryCombatTarget, bullets)'), 'recovery combat action is not built in chooseAction');
      assert(body.includes("if (engagedCombatTarget || recoveryCombatAction?.kind === 'leave')"), 'engaged recovery combat can still fall through to non-combat logic');
      assert(!body.includes('const recoveryLeave = buildCombatAction(self, recoveryCombatTarget, bullets)'), 'old recovery-leave-only combat branch is still present');
    });
    check(`${file} uses stamina-aware combat fire discipline`, () => {
      const shootingBody = functionBody(text, 'combatShootingPlan');
      assert(shootingBody.includes("staminaRemaining(self, '5s')"), 'combat shooting plan does not read 5s stamina');
      assert(shootingBody.includes('reserve-for-dodge'), 'combat shooting plan does not reserve stamina for dodge');
      assert(shootingBody.includes('stamina-rebuild'), 'combat shooting plan does not stop fire for stamina rebuild');
      assert(shootingBody.includes('forceShoot: false'), 'combat shooting plan can still force-shoot');
      const combatBody = functionBody(text, 'buildCombatAction');
      assert(combatBody.includes('const shooting = combatShootingPlan(self'), 'combat action does not use shooting plan');
      assert(combatBody.includes('shoot: shooting.shoot'), 'combat action does not expose planned shoot flag');
      assert(combatBody.includes('forceShoot: shooting.forceShoot'), 'combat action does not expose planned force flag');
      assert(combatBody.includes('shootEveryMs: shooting.shootEveryMs'), 'combat action does not expose planned cadence');
      assert(combatBody.includes("shooting.suppressed ? 'combat-stamina-conserve'"), 'combat action does not report fire suppression reason');
      assert(combatBody.includes("shooting.throttled ? 'combat-burst-fire'"), 'combat action does not report burst-fire reason');
      assert(!combatBody.includes("combat-low-hp-no-damage-leave', baseTarget"), 'low no-damage can still trigger combat leave');
      assert(!text.includes('forceShoot: true'), 'force shooting is still present');
    });
    check(`${file} blocks new leave triggers while pending exit is active`, () => {
      const skipBody = functionBody(text, 'pendingExitSkipNewLeave');
      assert(skipBody.includes('if (!pending) return null'), 'pending-exit skip helper can run without pending exit');
      assert(skipBody.includes('skippedNewLeave: true'), 'pending-exit skip helper does not mark skipped new leave');
      assert(skipBody.includes('pendingExit: summarizePendingExit(pending)'), 'pending-exit skip helper does not preserve pending exit summary');
      const issueBody = functionBody(text, 'issueLeaveCommand');
      assert(issueBody.includes('bot.pendingExit && !detail?.pendingExitRetry'), 'leave command can send non-retry leave while pending exit is active');
      assert(issueBody.includes('pendingExitSkipNewLeave'), 'leave command does not delegate pending-exit skip result');
      assert(functionBody(text, 'retryPendingExit').includes('detail.pendingExitRetry = true'), 'pending exit retry is not explicitly allowed through leave command lock');
      assert(functionBody(text, 'leaveOffline').includes("pendingExitSkipNewLeave('offline'"), 'offline leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForInjury').includes("pendingExitSkipNewLeave('injury'"), 'injury leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForPursuit').includes("pendingExitSkipNewLeave('pursuit'"), 'pursuit leave does not skip during active pending exit');
      assert(functionBody(text, 'leaveForCombat').includes("pendingExitSkipNewLeave('combat'"), 'combat leave does not skip during active pending exit');
      assert(text.includes('staminaState.mustLeave && !bot.pendingExit'), 'stamina exit can still start a new leave during active pending exit');
      assert(text.includes("pendingExitIntentForSkippedLeave('injury'"), 'injury skip intent is not logged on normal action');
      assert(text.includes("pendingExitIntentForSkippedLeave('pursuit'"), 'pursuit skip intent is not logged on normal action');
    });
    check(`${file} treats leave HTTP 403 as confirmed exit with snapshot recovery`, () => {
      const requestBody = functionBody(text, 'leaveRequestHasHttp403');
      assert(requestBody.includes('status === 403'), 'leave 403 status detector not found');
      const confirmBody = functionBody(text, 'confirmPendingExit');
      assert(confirmBody.includes('leave403ReloginDelayMs()'), '403 confirmation does not keep one hour fallback helper');
      assert(confirmBody.includes("minimumReason: 'leave HTTP 403 risk control'"), '403 risk-control minimum reason not recorded');
      assert(confirmBody.includes('detail.http403RiskControl = true'), '403 risk-control marker not recorded');
      const pendingBody = functionBody(text, 'handlePendingExit');
      assert(pendingBody.includes("source: 'leave-http-403'"), 'pending exit does not confirm on leave HTTP 403');
      const refreshBody = functionBody(text, 'refreshGlobalState');
      assert(refreshBody.includes("fetchJsonNoStore('/snapshot')"), 'snapshot refresh request not found');
      assert(refreshBody.includes('noteLeave403SnapshotProbe(true'), 'snapshot success does not update 403 recovery probe');
      assert(refreshBody.includes('noteLeave403SnapshotProbe(false'), 'snapshot failure does not reset 403 recovery probe');
      const probeBody = functionBody(text, 'noteLeave403SnapshotProbe');
      assert(probeBody.includes('clearLeave403RiskHolds'), 'snapshot success streak does not clear 403 hold');
      assert(probeBody.includes('leave403SnapshotSuccessRequired()'), 'snapshot success threshold helper not used');
      const clearBody = functionBody(text, 'clearLeave403RiskHolds');
      assert(clearBody.includes('clearLoginSuppressMatching'), '403 snapshot recovery does not clear login suppress');
      assert(clearBody.includes('clearPersistentExitState'), '403 snapshot recovery does not clear persistent hold state');
    });
    check(`${file} logs combat target mode and safety fields`, () => {
      const body = functionBody(text, 'buildCombatAction');
      assert(body.includes("mode: target.current_join_mode || target.mode || ''"), 'combat target mode not logged');
      assert(body.includes("life: target.life || ''"), 'combat target life not logged');
      assert(body.includes('active: isCurrentlyActive(target)'), 'combat target active flag not logged');
      assert(body.includes('firing: isFiringEntity(target)'), 'combat target firing flag not logged');
      assert(body.includes('invulnerable: isInvulnerable(target)'), 'combat target invulnerable flag not logged');
    });
    check(`${file} allows immediate relogin after safe offline exit`, () => {
      const body = functionBody(text, 'setOfflineLeaveSuppress');
      assert(
        body.includes('!(Number(options.minimumUntil || 0) > Date.now()) && !offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)'),
        'safe offline exit does not bypass offline relogin suppress'
      );
      assert(body.includes('detail.safeReloginAllowed = true'), 'safe offline relogin marker not recorded');
      assert(body.includes('clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY)'), 'safe offline path does not clear persistent hold state');
      assert(body.includes('return 0'), 'safe offline path does not return without suppress');
    });
  }

  check('grasp-rat-bot.js covers stationary full-stamina Active zero-drop self-test', () => {
    assert(
      /name: 'stationary full-stamina active zero drop does not beat coin pickup'[\s\S]*current_join_mode: 'Active'[\s\S]*stamina_5s_remaining_milli: 10000[\s\S]*coins: \[\{ drop_id: 2, x: 5000, y: 0, amount: 1 \}\][\s\S]*want: 'coin'/.test(sourceBot),
      'stationary full-stamina Active zero-drop no-combat self-test not found'
    );
  });

  check('grasp-rat-bot.js covers combat fire discipline self-tests', () => {
    assert(sourceBot.includes("name: 'low hp no-damage combat keeps fighting without disadvantage'"), 'no-damage non-exit self-test not found');
    assert(sourceBot.includes("name: 'combat preserves dodge stamina by pausing fire'"), 'dodge stamina reserve self-test not found');
    assert(sourceBot.includes("name: 'combat reserve band uses burst fire without force shooting'"), 'burst fire self-test not found');
  });

  const obsoleteReason = ['wait', 'for', 'clear', 'opportunity'].join('-');
  const obsoleteDisplayText = String.fromCharCode(0x6536, 0x76ca, 0x63a5, 0x8fd1);
  const obsoletePatterns = [
    { label: 'obsolete ambiguous wait reason', text: obsoleteReason },
    { label: 'obsolete ambiguous wait display text', text: obsoleteDisplayText }
  ];

  for (const pattern of obsoletePatterns) {
    check(`${pattern.label} is absent from runtime files`, () => {
      const offenders = RUNTIME_FILES.filter(file => readText(file).includes(pattern.text));
      assert(offenders.length === 0, `found in ${offenders.join(', ')}`);
    });
  }

  for (const file of BOOTSTRAP_FILES) {
    const text = readText(file);
    check(`${file} passes manifest sha256 as sourceHash`, () => {
      assert(text.includes('sourceHash: String(manifest.sha256 || \'\')'), 'manifest sha256 sourceHash injection not found');
    });
    check(`${file} resets embedded workspace layout`, () => {
      assert(/\.workspace\{[^'"\r\n]*inset:auto!important[^'"\r\n]*transform:none!important[^'"\r\n]*flex:1 1 0!important/.test(text), 'workspace inset/transform/flex reset not found');
      assert(/\.workspace>\.map-shell\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important/.test(text), 'map-shell fill rule not found');
      assert(/\.workspace #world\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important[^'"\r\n]*display:block!important/.test(text), 'world fill rule not found');
      assert(/@media \(min-aspect-ratio:1\/1\)\{body\.grasp-rat-bot-sidebar-embedded \.workspace #world\{[^'"\r\n]*width:calc\(100% \+ 368px\)!important[^'"\r\n]*max-width:none!important[^'"\r\n]*margin-left:-368px!important/.test(text), 'landscape world crop offset rule not found');
      assert(functionBody(text, 'dispatchNativeViewportResize').includes("window.dispatchEvent(new Event('resize'))"), 'native resize dispatch helper not found');
      const syncBody = functionBody(text, 'syncNativeSidebarStructure');
      assert(syncBody.includes("scheduleNativeViewportResize('sidebar-structure')"), 'sidebar layout changes do not schedule native resize');
      const placeBody = functionBody(text, 'placeBootstrapPanel');
      assert(placeBody.includes("scheduleNativeViewportResize('panel-insert')"), 'panel insertion does not schedule native resize');
    });
    check(`${file} uses compact dot panel controls`, () => {
      assert(text.includes('const statusDot = createDot(statusTitle, statusColor, statusHalo, statusGlow'), 'BOT status dot not found');
      assert(text.includes("label: 'BOT'"), 'BOT status dot visible label not found');
      assert(text.includes("onClick: () => setPaused(!isPaused(), 'panel bot dot')"), 'BOT status dot pause toggle not found');
      assert(text.includes("statusDot.setAttribute('aria-pressed', String(paused))"), 'BOT status dot aria-pressed not found');
      assert(text.includes('actions.appendChild(createDot(wsTitle, wsColor'), 'WS state dot not found');
      assert(text.includes("label: 'WS'"), 'WS state dot visible label not found');
      assert(text.includes('const logDot = createDot(remoteLogTitle, remoteLogColor, remoteLogHalo, remoteLogGlow'), 'remote-log dot not found');
      assert(text.includes("label: '日志'"), 'remote-log dot visible label not found');
      assert(text.includes('justify-content:flex-start'), 'status dots are not left aligned');
      assert(text.includes('pending: remoteLogPending > 0 && remoteLogFailed <= 0'), 'remote-log pending blink state not found');
      assert(text.includes('onClick: () => configureCombatLogging({ enabled: !remoteLogEnabled })'), 'remote-log dot toggle not found');
      assert(text.includes("logDot.setAttribute('aria-pressed', String(remoteLogEnabled))"), 'remote-log dot aria-pressed not found');
    });
    check(`${file} keeps panel section titles removed`, () => {
      const removedText = [
        stringFromCodes([0x72b6, 0x6001, 0xff1a]),
        stringFromCodes([0x811a, 0x672c, 0x4fe1, 0x606f]),
        stringFromCodes([0x7edf, 0x8ba1, 0x4fe1, 0x606f]),
        'BOT' + stringFromCodes([0x884c, 0x4e3a])
      ];
      const offenders = removedText.filter(value => text.includes(value));
      assert(offenders.length === 0, `removed visible text found: ${offenders.join(', ')}`);
      assert(!/appendLine\(['"]\s*remote log/i.test(text), 'visible remote log append line found');
    });
    check(`${file} uses tooltip-only metric labels`, () => {
      assert(text.includes("item.title = String(metric.label ?? '')"), 'metric item title not found');
      assert(text.includes("item.setAttribute('aria-label', String(metric.label ?? ''))"), 'metric item aria-label not found');
      assert(text.includes("value.textContent = String(metric.value ?? '-')"), 'metric value-only text not found');
      assert(!/textContent\s*=\s*String\(metric\.label/.test(text), 'metric label appears as visible textContent');
      assert(!/appendChild\(label\)/.test(text), 'metric label element append found');
    });
    check(`${file} formats stamina as second-scale remaining/limit values`, () => {
      const body = functionBody(text, 'formatStamina');
      assert(countMatches(body, /\bpairText\(/g) === 3, 'formatStamina should use exactly three pairText calls');
      assert(body.includes("Math.max(0, Math.round(r / 1000)) + '/' + Math.round(l / 1000)"), 'second-scale remaining/limit pair formatting not found');
      assert(!body.includes('%'), 'percent stamina formatting found');
      assert(text.includes("staminaPill.textContent = '") && text.includes("' + formatStamina(self)"), 'stamina line does not render formatStamina output');
    });
  }

  const userscriptText = readText('userscript/grasp-rat-bootstrap.user.js');
  check('userscript metadata version matches runtime constant', () => {
    const metaVersion = extractSingle(userscriptText, /^\s*\/\/\s*@version\s+([^\s]+)/m, 'userscript @version');
    const constantVersion = extractSingle(userscriptText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'userscript BOOTSTRAP_VERSION');
    assert(metaVersion === constantVersion, `metadata=${metaVersion} constant=${constantVersion}`);
    return metaVersion;
  });

  const extensionManifest = readJson('extension/manifest.json');
  const extensionBootstrapText = readText('extension/page-bootstrap.js');
  check('extension manifest version matches page bootstrap constant', () => {
    const constantVersion = extractSingle(extensionBootstrapText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'extension BOOTSTRAP_VERSION');
    assert(String(extensionManifest.version || '') === constantVersion, `manifest=${extensionManifest.version || '(empty)'} constant=${constantVersion}`);
    return constantVersion;
  });

  for (const result of results) {
    const prefix = result.ok ? 'ok' : 'FAIL';
    const detail = result.detail ? ` - ${result.detail}` : '';
    console.log(`${prefix} ${result.name}${detail}`);
  }

  const failures = results.filter(result => !result.ok);
  if (failures.length) {
    console.error(`verify-objective-build failed: ${failures.length} issue(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`objective build verification ok (${results.length} checks)`);
}

main();
