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
  { key: 'staminaBudgetReloginDelayMs', value: 1800000 },
  { key: 'leaveRetryMinMs', value: 10000 },
  { key: 'leaveCommandTimeoutMs', value: 10000 },
  { key: 'leave403ReloginDelayMs', value: 3600000 },
  { key: 'leave403SnapshotSuccessRequired', value: 5 },
  { key: 'loginSnapshotSuccessRequired', value: 3 },
  { key: 'gameSessionNoSelfLeaveMs', value: 30000 },
  { key: 'nativeCoinAuthoritativeRadius', value: 50000 },
  { key: 'opportunityVisibleDistance', value: 50000 },
  { key: 'opportunityNearbyPriorityDistance', value: 50000 },
  { key: 'opportunityOscillationSwitchLimit', value: 5 },
  { key: 'attackApproachRange', value: 50000 },
  { key: 'globalAttackMaxDistance', value: 50000 },
  { key: 'globalCoinMaxDistance', value: 50000 },
  { key: 'postAttackRecoveryDropMaxDistance', value: 50000 },
  { key: 'postAttackRecoveryDropMinScore', value: 60000 },
  { key: 'postAttackDropWaitMs', value: 2500 },
  { key: 'postAttackDropWaitMinDrop', value: 8 },
  { key: 'postAttackDropWaitMaxDistance', value: 50000 },
  { key: 'postAttackDropWaitStopDistance', value: 900 },
  { key: 'killChatAttackMatchMs', value: 120000 },
  { key: 'killAttributionMergeMs', value: 120000 },
  { key: 'page403ErrorReloadMs', value: 600000 },
  { key: 'combatAttackRange', value: 14500 },
  { key: 'combatLowHpCloseRiskMargin', value: 5 },
  { key: 'combatSpacingEmergencyRange', value: 3000 },
  { key: 'combatSpacingLowHpThreshold', value: 70 },
  { key: 'combatPressureCloseMinHp', value: 60 },
  { key: 'combatShootEveryMs', value: 160 },
  { key: 'combatShootReserveMs', value: 5600 },
  { key: 'combatShootDodgeReserveMs', value: 3800 },
  { key: 'combatShootHighHpDodgeReserveMs', value: 3000 },
  { key: 'combatShootHighHpMinHp', value: 90 },
  { key: 'combatShootSteadyAimDodgeReserveMs', value: 3000 },
  { key: 'combatShootSteadyAimNoDamageMs', value: 6000 },
  { key: 'combatShootSteadyAimMinHp', value: 75 },
  { key: 'combatShootSteadyAimMaxHpGap', value: 15 },
  { key: 'combatShootHardReserveMs', value: 1800 },
  { key: 'combatShootConserveEveryMs', value: 360 },
  { key: 'combatShootRecoveryEveryMs', value: 700 },
  { key: 'combatNativeTickMinMs', value: 80 },
  { key: 'combatAimFallbackPrecisionNoDamageMs', value: 25000 },
  { key: 'combatAimLiveDivergencePrecisionCm', value: 1200 },
  { key: 'combatAimLiveDivergencePrecisionRatio', value: 0.08 },
  { key: 'combatAimRadialPrecisionLateralRatio', value: 0.35 },
  { key: 'combatServerStallNoDamagePrecisionGraceMs', value: 10000 },
  { key: 'combatAimSteadyNoDamageMs', value: 6000 },
  { key: 'combatAimSteadySpeedMax', value: 5 }
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
    check(`${file} formats display distances in meters`, () => {
      const distanceBody = functionBody(text, 'formatDistance');
      assert(distanceBody.includes('const meters = n / 100'), 'formatDistance does not convert cm to meters');
      assert(distanceBody.includes("+ '米'"), 'formatDistance does not append meter unit');
      const staminaSummaryBody = functionBody(text, 'staminaBudgetCoinLeaveSummary');
      assert(staminaSummaryBody.includes("最近金币距离' + formatDistance(detail.distance)"), 'stamina budget leave summary does not use meter distance formatting');
      const pursuitSummaryBody = functionBody(text, 'pursuitLeaveSummary');
      assert(pursuitSummaryBody.includes("'，距离' + formatDistance(distance)"), 'pursuit leave summary does not use meter distance formatting');
    });
    check(`${file} freezes session uptime while self is missing`, () => {
      const sessionBody = functionBody(text, 'summarizeSessionStats');
      assert(sessionBody.includes('const stoppedAt = Number(session.missingSince || 0) || 0'), 'session stopped-at marker not used');
      assert(sessionBody.includes('uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0'), 'session uptime does not freeze at missingSince');
      assert(sessionBody.includes('uptimeStoppedAt: stoppedAt'), 'session uptime stopped-at status is not exposed');
    });
    check(`${file} keeps 500m realtime coins ahead of snapshot travel`, () => {
      assert(text.includes('function pickRealtimeLocalCoin'), 'realtime local coin picker not found');
      assert(text.includes('.filter(coin => !isSnapshotOnlyCoin(coin))'), 'realtime local coin picker can include snapshot-only coins');
      assert(text.includes('const localRealtimeCoin = pickRealtimeLocalCoin(self,'), 'local realtime coin is not computed before snapshot selection');
      assert(text.includes('const snapshotCompetitionCoin = localRealtimeCoin ? null : pickSnapshotCoinDestination'), 'snapshot travel is not blocked by local realtime coins');
      assert(text.includes('if (localRealtimeCoin) {'), 'local realtime coin fallback action not found');
      assert(text.includes('if (!localRealtimeCoin && snapshotWaitAgeMs >= cfg.snapshotCoinIdleMaxMs)'), 'snapshot idle fallback is not blocked by local realtime coins');
    });
    check(`${file} prices player drops with full pickup travel cost`, () => {
      const body = functionBody(text, 'opportunityEnemyStaminaCost');
      assert(body.includes('const moveCost = opportunityMoveStaminaCost(target?.distance, 0)'), 'enemy opportunity movement cost still stops at shooting range');
      assert(body.includes('estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500))'), 'enemy opportunity shooting cost missing');
    });
    check(`${file} lets high-value combat drops interrupt recovery`, () => {
      const body = functionBody(text, 'pickPostAttackDropCoin');
      assert(body.includes('options.maxDistance ?? cfg.postAttackDropCoinMaxDistance'), 'post-attack drop picker does not accept maxDistance override');
      assert(body.includes('options.minScore ?? 0'), 'post-attack drop picker does not accept minScore override');
      assert(body.includes('if (score < minScore) continue'), 'post-attack drop picker does not filter by recovery ROI score');
      assert(text.includes('maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance'), 'recovery post-attack drop max distance not wired');
      assert(text.includes('minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0'), 'recovery post-attack drop min score not wired');
    });
    check(`${file} locks oscillating opportunity target pairs`, () => {
      const body = functionBody(text, 'applyOpportunityOscillationLock');
      assert(body.includes('cfg.opportunityOscillationSwitchLimit'), 'oscillation lock limit config not used');
      assert(body.includes('switchCount > limit'), 'oscillation lock does not wait until the switch limit is exceeded');
      assert(body.includes('lockedKey: fromKey'), 'oscillation lock does not pin the current target');
      assert(text.includes('resetOpportunitySwitchLock()'), 'opportunity switch lock reset helper not found');
      assert(text.includes('oscillationLocked: Boolean'), 'opportunity choice does not expose oscillation lock state');
    });
    check(`${file} waits at killed high-drop target position before drop refresh`, () => {
      const body = functionBody(text, 'pickPostAttackDropWaitTarget');
      assert(body.includes('cfg.postAttackDropWaitMs'), 'post-attack wait window not used');
      assert(body.includes('cfg.postAttackDropWaitMinDrop'), 'post-attack wait minimum drop not used');
      assert(body.includes('postAttackVisibleCoinExists'), 'post-attack wait does not skip already-visible drops');
      assert(body.includes("item.action === 'attack'") && body.includes("item.action === 'opportunistic-shot'"), 'post-attack wait can trigger without a recent shot/attack');
      assert(body.includes('!recentAttackTargetStillAttackable') || body.includes("!(entities || []).some(e => String(e.user_id ?? e.id ?? '') === String(item.id) && isAlive(e))"), 'post-attack wait does not require target disappearance');
      assert(text.includes("reason: 'post-attack-drop-wait-position'"), 'post-attack wait action reason not found');
      const actionBody = functionBody(text, 'buildPostAttackDropWaitAction');
      assert(!actionBody.includes('\n      target: {'), 'post-attack wait should move without selecting a decision target');
      assert(actionBody.includes('postAttackTarget'), 'post-attack wait should keep metadata for the killed target position');
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
        countMatches(text, /const isAfkProfitTarget = e => isAfkTarget\(e\) \|\| \(isJoinModeActive\(e\) && !is(?:Currently)?Active\(e\) && !isMovingThreat\(e\) && !isFiringEntity\(e\)\);/g) >= expectedMin,
        'passive Active profit target helper not found'
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
      assert(
        countMatches(text, /!isAfkProfitTarget\(target\) && !isInvulnerable\(target\) && is(?:Currently)?Active\(target\) && Number\(target\.drop \|\| 0\) > 0/g) >= expectedMin,
        'profitable combat can still select passive Active profit targets'
      );
      assert(
        countMatches(text, /filter\(isAfkProfitTarget\)/g) >= expectedMin,
        'ordinary profit opportunities do not include passive Active targets'
      );
    });
	    check(`${file} ends combat logs on relogin wait/manual states`, () => {
	      const body = functionBody(text, 'combatLogSuspendReason');
	      assert(body.includes('login-suppressed'), 'login-suppressed suspend reason not found');
	      assert(body.includes('login-snapshot-gate'), 'login-snapshot-gate suspend reason not found');
	      assert(body.includes('manual-login'), 'manual-login suspend reason not found');
	    });
    check(`${file} keeps specific exit reason during leave cooldown`, () => {
      const body = functionBody(text, 'combatLogExitSummaryFromDecision');
      assert(body.includes("leaveReason !== 'cooldown'"), 'cooldown leave detail can override specific exit reason');
      assert(body.includes('exitishDecisionReason'), 'decision exit reason fallback not found for cooldown leave detail');
      assert(body.includes("pendingExit ? 'pending-exit-active'"), 'pending exit fallback not found for active pending exit frames');
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
      assert(
        queueBody.includes('(!state.enabled && !critical && !important)')
          || queueBody.includes('(!state.enabled && !critical)'),
        'critical exit audit logs still depend on combat logging enabled'
      );
      assert(queueBody.includes('persistExitAuditLogEntry(queued)'), 'critical exit audit logs are not persisted before flush');
      const pendingIdsBody = functionBody(text, 'pendingExitAuditLogIds');
      assert(pendingIdsBody.includes('if (!state.endpoint) return []'), 'unconfigured log endpoint can still block on persisted exit audit logs');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('removePersistedExitAuditLogs(exitAuditIds)'), 'persisted exit audit logs are not cleared on successful flush');
      assert(text.includes('failedEntryKeys'), 'remote log failed entries are not tracked by entry key');
      assert(flushBody.includes('markCombatLogEntriesSent(entries)'), 'successful remote log retry does not clear failed entry count');
      assert(flushBody.includes('markCombatLogEntriesFailed(entries)'), 'remote log send failure does not mark failed entry count');
      const recordBody = functionBody(text, 'recordCombatLogTick');
      assert(
        /state\.lastSkipReason = suspendedReason;[\s\S]{0,120}flushCombatLogs\(false\);[\s\S]{0,120}return;/.test(recordBody),
        'suspended combat-log ticks do not retry pending remote logs'
      );
      const reloadBody = functionBody(text, 'requestReload');
      assert(reloadBody.includes('if (exitAuditFlushPending())'), 'requestReload does not block on pending exit audit logs');
      const loginBody = functionBody(text, 'maybeStartAutoLogin');
      assert(loginBody.includes('if (exitAuditFlushPending())'), 'auto login does not block on pending exit audit logs');
      assert(loginBody.includes("reason: 'exit-log-flush-pending'"), 'blocked login reason not reported');
      const manualLoginBody = functionBody(text, 'forceLoginNow');
      assert(manualLoginBody.includes('skipped: true'), 'manual login can clear exit holds while audit logs are pending');
      assert(manualLoginBody.includes("skipReason: 'exit-log-flush-pending'"), 'manual login hold-clear skip reason not reported');
    });
    check(`${file} persists important daily summary logs locally and remotely`, () => {
      assert(text.includes('IMPORTANT_LOGS_KEY'), 'important local log key not found');
      assert(text.includes("'graspRatImportantLogs'"), 'important logs are not stored under the expected localStorage key');
      assert(text.includes("recordImportantEvent('session-start'"), 'session-start important log not recorded');
      assert(text.includes("recordImportantEvent('session-end'"), 'session-end important log not recorded');
      assert(text.includes("recordImportantEvent('kill'"), 'kill important log not recorded');
      assert(text.includes("recordImportantEvent('combat-summary'"), 'combat-summary important log not recorded');
      const queueBody = functionBody(text, 'queueCombatLogEntry');
      assert(queueBody.includes('const important = Boolean('), 'important log queue marker not found');
      assert(queueBody.includes('!state.enabled && !critical && !important'), 'important logs cannot flush while combat logging is disabled');
      const flushBody = functionBody(text, 'flushCombatLogs');
      assert(flushBody.includes('const hasImportant ='), 'flush does not detect important logs');
      assert(flushBody.includes('markImportantLogsRemoteSent(importantLogIds'), 'important logs are not marked sent after remote flush');
      assert(functionBody(text, 'markImportantLogsRemoteSent').includes("bot.importantLogging.lastRemoteError = ''"), 'successful important remote sends do not clear stale error state');
      assert(text.includes('restoreImportantLogsForRemote();'), 'unsent important logs are not restored for remote flush');
      assert(text.includes('pureRefreshCoins'), 'session logs do not include pure refreshed coin totals');
      assert(text.includes('staminaSpentMs'), 'session logs do not include stamina spent');
      assert(text.includes('playerCategory'), 'kill summaries do not include AFK/active player category');
      assert(text.includes('afkKillRewardCoins') && text.includes('activeKillRewardCoins'), 'session logs do not include AFK/active kill reward buckets');
      assert(text.includes('rewardConfirmed') && text.includes('unconfirmedDropCoins'), 'kill summaries do not separate confirmed rewards from unconfirmed drops');
      assert(text.includes('staminaSpentStartMs') && text.includes('staminaSpentEndMs'), 'combat summaries do not include combat stamina range');
      assert(text.includes('selfHpDelta') && text.includes('enemyHpDelta'), 'combat summaries do not include HP deltas');
      assert(text.includes('closeOpenImportantSessionsBeforeStart(session'), 'unclosed important sessions are not closed before the next login');
      assert(text.includes('function importantCombatDecisionIsExitOnly'), 'important combat exit-only classifier not found');
      assert(text.includes('if (sample.exitOnly) return;'), 'exit-only combat samples can still start combat summaries');
      assert(text.includes('!importantCombatHasActualEngagement(record)'), 'empty combat summaries are not discarded');
      assert(text.includes("exitReason = 'session-interrupted-before-next-login'"), 'next-login interrupted sessions are not explicitly marked');
      assert(text.includes('recordDropMatchedKill(candidate') && text.includes("'post-attack-drop-visible'"), 'post-attack visible drop coins are not attributed as kill rewards');
      assert(text.includes('recordDropMatchedKill(target, value'), 'picked post-attack drop coins are not attributed as kill rewards');
      assert(text.includes('dropMatched') && text.includes('chatConfirmed'), 'kill summaries do not include attribution/confirmation flags');
      assert(functionBody(text, 'updateKillHistory').includes('rewardCoins: existingRewardConfirmed') && functionBody(text, 'updateKillHistory').includes('reportedRewardCoins: targetDrop'), 'chat-confirmed kills still treat target Drop as confirmed reward');
      assert(text.includes('function findLiveKillVictim') && functionBody(text, 'updateKillHistory').includes('findLiveKillVictim') && text.includes('victim-still-alive'), 'chat-confirmed kills are not blocked while the victim is still alive');
      assert(text.includes('bot.globalState.messages'), 'snapshot chat kill messages are not inspected');
    });
    check(`${file} blocks relogin and reload until session-end important logs flush`, () => {
      assert(text.includes('function importantSessionEndFlushPending'), 'session-end important flush pending helper not found');
      assert(text.includes('function importantSessionEndFlushBlockDetail'), 'session-end important flush block detail helper not found');
      assert(text.includes("event.importantType === 'session-end'") && text.includes('flushCombatLogs(true)'), 'session-end important logs are not force-flushed');
      assert(functionBody(text, 'maybeStartAutoLogin').includes('closeCurrentImportantSessionBeforeLogin'), 'auto login does not close the current important session before relogin');
      assert(functionBody(text, 'maybeStartAutoLogin').includes('importantSessionEndFlushPending()'), 'auto login does not block on unsent session-end important logs');
      assert(functionBody(text, 'maybeStartAutoLogin').includes("reason: 'important-log-flush-pending'"), 'auto login does not report the session-end log flush block reason');
      assert(functionBody(text, 'forceLoginNow').includes('closeCurrentImportantSessionBeforeLogin'), 'manual login does not close the current important session before relogin');
      assert(functionBody(text, 'forceLoginNow').includes("skipReason: 'important-log-flush-pending'"), 'manual login can clear relogin holds while session-end logs are pending');
      assert(functionBody(text, 'requestReload').includes('closeCurrentImportantSessionBeforeReload'), 'requestReload does not close the current important session before refresh');
      assert(functionBody(text, 'requestReload').includes('importantSessionEndFlushPending()'), 'requestReload does not block on unsent session-end important logs');
      assert(functionBody(text, 'maybeReloadCloudflareError').includes('importantSessionEndFlushPending()'), 'error-page reload does not block on unsent session-end important logs');
      assert(functionBody(text, 'combatLogSuspendReason').includes('important-log-flush-pending'), 'combat log suspension does not understand session-end flush waits');
      assert(text.includes('等待会话结束日志发送完成'), 'session-end flush wait is not exposed with a Chinese display reason');
      assert(text.includes('下一次登录时发现上一局已结束，按下一次登录时间收口'), 'next-login inferred session closure still uses the old missing-exit wording');
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
      assert(text.includes('function combatTrendState'), 'combat trend state helper not found');
      assert(shootingBody.includes('const trend = options.trend'), 'combat shooting plan does not accept precomputed trend state');
      assert(shootingBody.includes('combatTrendState(self, options)'), 'combat shooting plan cannot compute trend state fallback');
      assert(shootingBody.includes("stance: trend.stance || 'normal'"), 'combat shooting plan does not expose trend stance');
      assert(shootingBody.includes('highHpFireWindow'), 'combat shooting plan does not expose high-HP fire window');
      assert(shootingBody.includes('combatShootHighHpDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for high HP');
      assert(shootingBody.includes('closePressureFireWindow'), 'combat shooting plan does not expose close-pressure fire window');
      assert(shootingBody.includes('combatShootPressureDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve under close bullet pressure');
      assert(shootingBody.includes('steadyAimFireWindow'), 'combat shooting plan does not expose steady-aim fire window');
      assert(shootingBody.includes('combatShootSteadyAimDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for steady aim');
      assert(shootingBody.includes('noDamageDuelFireWindow'), 'combat shooting plan does not expose long no-damage duel fire window');
      assert(shootingBody.includes('combatShootNoDamageDuelDodgeReserveMs'), 'combat shooting plan does not relax dodge reserve for long no-damage duels');
      assert(shootingBody.includes('stamina-rebuild'), 'combat shooting plan does not stop fire for stamina rebuild');
      assert(shootingBody.includes('forceShoot: false'), 'combat shooting plan can still force-shoot');
      const combatBody = functionBody(text, 'buildCombatAction');
      const aimBody = functionBody(text, 'combatAimTarget');
      assert(text.includes('function combatAimFallbackPrecisionState'), 'fallback precision aim helper not found');
      assert(text.includes('function combatAimDynamicStrategyState'), 'dynamic combat aim strategy helper not found');
      assert(text.includes('function combatAimSourceDivergenceState'), 'combat aim source divergence helper not found');
      assert(text.includes('function combatLiveAimTarget'), 'live/native combat aim helper not found');
      assert(text.includes('function combatAimSteadyNoDamageState'), 'steady no-damage aim helper not found');
      assert(aimBody.includes('combatAimDynamicStrategyState(self, target, aimSource'), 'combat aim does not use dynamic strategy state');
      assert(text.includes("reason = 'coordinate-divergence'"), 'combat aim does not switch on live/source coordinate divergence');
      assert(text.includes("reason = 'radial-motion'"), 'combat aim does not switch on target radial movement');
      assert(text.includes("reason = 'no-damage-fallback'"), 'combat aim fallback precision reason not found');
      assert(aimBody.includes('mode: aimStrategy.mode'), 'combat aim does not use dynamic strategy mode');
      assert(aimBody.includes('precisionAim: Boolean(aimStrategy.precision)'), 'combat logs do not expose dynamic precision aim state');
      assert(aimBody.includes('liveAim: Boolean(aimSource.nativeAimResolved)'), 'combat logs do not expose live aim state');
      assert(aimBody.includes('aimStrategyReason: aimStrategy.reason'), 'combat logs do not expose aim strategy reason');
      assert(aimBody.includes('sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm'), 'combat logs do not expose aim source divergence');
      assert(aimBody.includes('if (aimStrategy.bypassJitter) return exact'), 'dynamic precision/steady aim does not bypass jitter');
      assert(text.includes('function combatSpacingShouldOverrideBullet'), 'combat spacing cannot override real bullet dodge when too close');
      assert(text.includes('function combatLowHpCloseRiskState'), 'low-HP close-risk exit helper not found');
      assert(text.includes('function combatPressureDisadvantageState'), 'close-pressure HP disadvantage exit helper not found');
      assert(text.includes('function combatServerStallNoDamageLeaveState'), 'server-stall no-damage exit helper not found');
      assert(text.includes('combatServerStallNoDamageLeaveMs: 25000'), 'server-stall no-damage exit wait is not configured');
      assert(text.includes('combatServerStallNoDamagePrecisionGraceMs: 10000'), 'server-stall no-damage exit does not allow precision aim grace');
      assert(text.includes('combatServerStallNoDamageHpGap: 5'), 'server-stall no-damage HP gap is not configured');
      assert(functionBody(text, 'combatServerStallNoDamageLeaveState').includes('effectiveWaitMs'), 'server-stall no-damage exit does not use an effective precision-grace wait');
      assert(combatBody.includes('const closeRisk = combatLowHpCloseRiskState'), 'combat action does not evaluate low-HP close-risk exit');
      assert(combatBody.includes('const pressureDisadvantage = combatPressureDisadvantageState'), 'combat action does not evaluate close-pressure HP disadvantage exit');
      assert(combatBody.includes("combatLeaveAction('combat-hp-disadvantage-leave', baseTarget"), 'combat action does not leave on close-pressure HP disadvantage');
      assert(combatBody.includes('const serverStallNoDamage = combatServerStallNoDamageLeaveState'), 'combat action does not evaluate server-stall no-damage disadvantage');
      assert(combatBody.includes('summarizeServerPositionStall()'), 'server-stall no-damage exit does not read stall state');
      assert(combatBody.includes('serverStallNoDamage'), 'combat action does not log server-stall no-damage evidence');
      assert(combatBody.includes('!realBulletPressure || spacingOverride'), 'combat action does not merge spacing during emergency real-bullet pressure');
      assert(combatBody.includes('overrideBullet: Boolean(spacingOverride)'), 'combat logs do not expose bullet spacing override');
      assert(combatBody.includes('const trend = combatTrendState(self'), 'combat action does not precompute combat trend state');
      assert(combatBody.includes('const shooting = combatShootingPlan(self'), 'combat action does not use shooting plan');
      assert(combatBody.includes('trend,'), 'combat action does not pass trend state into shooting plan');
      assert(combatBody.includes('shoot: shooting.shoot'), 'combat action does not expose planned shoot flag');
      assert(combatBody.includes('forceShoot: shooting.forceShoot'), 'combat action does not expose planned force flag');
      assert(combatBody.includes('shootEveryMs: shooting.shootEveryMs'), 'combat action does not expose planned cadence');
      assert(combatBody.includes('steadyAim: Boolean(aim.steadyAim)'), 'combat action does not pass steady aim to shooting plan');
      assert(combatBody.includes("engagedCombat: target.combatIntent === 'engaged'"), 'combat action does not pass engaged state to shooting plan');
      assert(combatBody.includes('targetActive: isCurrentlyActive(target)'), 'combat action does not pass active target state to shooting plan');
      assert(combatBody.includes('targetMoving'), 'combat action does not pass moving target state to shooting plan');
      assert(combatBody.includes('steady: Boolean(aim.steadyAim)'), 'combat logs do not expose steady aim state');
      assert(combatBody.includes("shooting.suppressed ? 'combat-stamina-conserve'"), 'combat action does not report fire suppression reason');
      assert(combatBody.includes("shooting.throttled ? 'combat-burst-fire'"), 'combat action does not report burst-fire reason');
      assert(!combatBody.includes("combat-low-hp-no-damage-leave', baseTarget"), 'low no-damage can still trigger combat leave');
      assert(!text.includes('forceShoot: true'), 'force shooting is still present');
      const switchBody = functionBody(text, 'defensiveTargetOverridesEngaged');
      assert(text.includes('function incomingBulletRequiresTargetSwitch'), 'target switch immediate-bullet helper not found');
      assert(switchBody.includes('incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)'), 'defensive target switch can still override engaged target for distant bullets');
      const pursuitBody = functionBody(text, 'updatePursuitTracking');
      assert(text.includes('function pursuitLeaveSuppressedByCombatAction'), 'same-target combat pursuit suppression helper not found');
      assert(pursuitBody.includes('pursuitLeaveSuppressedByCombatAction(picked, action)'), 'pursuit tracking does not check same-target combat suppression');
      assert(pursuitBody.includes('const startedAt = combatSuppressed ? t'), 'pursuit timer is not reset while fighting the same target');
      assert(functionBody(text, 'summarizePursuit').includes('combatSuppressed'), 'pursuit summary does not expose combat suppression');
      const nativeTickBody = functionBody(text, 'triggerNativeTick');
      assert(text.includes('function combatTickActiveFromState'), 'combat tick active helper not found');
      assert(text.includes('function nativeTickMinIntervalMs'), 'native tick interval helper not found');
      assert(nativeTickBody.includes('nativeTickMinIntervalMs({'), 'native tick trigger does not use dynamic interval helper');
      assert(nativeTickBody.includes('combatTarget: bot.combatTarget'), 'native tick interval does not consider active combat target');
      assert(nativeTickBody.includes('pendingExit: bot.pendingExit'), 'native tick interval does not consider pending combat exit');
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
    check(`${file} gates relogin on consecutive snapshot success`, () => {
      const gateBody = functionBody(text, 'ensureLoginSnapshotGate');
      assert(gateBody.includes('await refreshGlobalState(true)'), 'login snapshot gate does not actively probe snapshot');
      const refreshBody = functionBody(text, 'refreshGlobalState');
      assert(refreshBody.includes('noteLoginSnapshotProbe(true'), 'snapshot success does not advance login gate');
      assert(refreshBody.includes('noteLoginSnapshotProbe(false'), 'snapshot failure does not reset login gate');
      const loginBody = functionBody(text, 'maybeStartAutoLogin');
      assert(loginBody.includes('await ensureLoginSnapshotGate(reason)'), 'auto login does not wait for snapshot gate');
      assert(loginBody.includes("reason: 'snapshot-gate'"), 'snapshot gate block reason not reported');
      const manualBody = functionBody(text, 'forceLoginNow');
      assert(manualBody.includes('await ensureLoginSnapshotGate(manualReason)'), 'manual login does not check snapshot gate');
      assert(manualBody.includes("skipReason: 'snapshot-gate'"), 'manual login can clear holds before snapshot gate');
      const triggerBody = functionBody(text, 'startExitAudit');
      assert(triggerBody.includes("resetLoginSnapshotGate('exit-trigger:'"), 'exit trigger does not reset login snapshot gate');
      const confirmBody = functionBody(text, 'confirmPendingExit');
      assert(confirmBody.includes("resetLoginSnapshotGate('exit-confirmed:'"), 'exit confirmation does not reset login snapshot gate');
      assert(text.includes('loginSnapshotGate: snapshotLoginGateStatus()'), 'status/logs do not expose login snapshot gate');
    });
    check(`${file} leaves broken no-self game sessions`, () => {
      const noSelfBody = functionBody(text, 'noSelfGameSessionExitState');
      assert(noSelfBody.includes('controlHasNativeGameSession(control)'), 'no-self session detection does not use native session evidence');
      assert(noSelfBody.includes('control?.nativeReconnectChurn'), 'no-self session detection does not detect reconnect churn');
      assert(noSelfBody.includes('cfg.gameSessionNoSelfLeaveMs'), 'no-self session detection does not use timeout');
      assert(noSelfBody.includes('shouldLeave'), 'no-self helper does not return leave decision');
      const tickBody = functionBody(text, 'tick');
      assert(tickBody.includes('noSelfGameSessionExitState(control, noSelfAgeMs)'), 'main loop does not evaluate no-self session exit');
      assert(tickBody.includes("stopMotionSafely(noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session')"), 'no-self session exit does not stop motion with explicit reason');
      assert(tickBody.includes('await leaveOffline(noSelfExit.reason, bot.lastSelf, offlineSafety)'), 'no-self session exit does not issue offline leave');
      assert(text.includes("control-ws-no-self-game-session"), 'no-self session exit reason is not exposed');
    });
    check(`${file} logs combat target mode and safety fields`, () => {
      const body = functionBody(text, 'buildCombatAction');
      assert(body.includes("mode: target.current_join_mode || target.mode || ''"), 'combat target mode not logged');
      assert(body.includes("life: target.life || ''"), 'combat target life not logged');
      assert(body.includes('active: isCurrentlyActive(target)'), 'combat target active flag not logged');
      assert(body.includes('firing: isFiringEntity(target)'), 'combat target firing flag not logged');
      assert(body.includes('invulnerable: isInvulnerable(target)'), 'combat target invulnerable flag not logged');
    });
    check(`${file} logs per-frame combat metrics`, () => {
      assert(text.includes('function combatLogFrameMetrics'), 'combat metrics helper not found');
      const buildBody = functionBody(text, 'buildCombatLogEntry');
      assert(buildBody.includes('const combatMetrics = combatLogFrameMetrics('), 'combat log entry does not compute metrics');
      assert(buildBody.includes('combatMetrics,'), 'combat log entry does not include combatMetrics');
      const metricsBody = functionBody(text, 'combatLogFrameMetrics');
      assert(metricsBody.includes('selfDamageTaken'), 'combat metrics do not expose self damage delta');
      assert(metricsBody.includes('targetDamageTaken'), 'combat metrics do not expose target damage delta');
      assert(metricsBody.includes('shotSincePreviousFrame'), 'combat metrics do not expose per-frame shot timing');
      assert(metricsBody.includes('combatMetricBulletStats(bullets)'), 'combat metrics do not include bullet stats');
      assert(functionBody(text, 'combatMetricBulletStats').includes('threatBulletCount'), 'combat bullet stats do not expose bullet threat count');
      assert(metricsBody.includes('serverPositionStall: serverPositionStall ?'), 'combat metrics do not expose server-position stall state');
      const shotBody = functionBody(text, 'recordCombatShotAttempt');
      assert(shotBody.includes('blockedByCadence'), 'shot telemetry does not record cadence-blocked attempts');
      assert(shotBody.includes('sent: Boolean(detail.sent)'), 'shot telemetry does not record sent status');
      assert(functionBody(text, 'shootAt').includes('recordCombatShotAttempt(self, target'), 'shootAt does not record shot attempts');
      assert(text.includes('lastCombatLogMetric: preserved.lastCombatLogMetric'), 'combat metric frame state is not attached to bot');
      assert(text.includes('lastCombatShot: preserved.lastCombatShot'), 'shot telemetry state is not attached to bot');
      assert(functionBody(text, 'startCombatLogSession').includes('combatMetrics: entry.combatMetrics || null'), 'combat-start does not include combatMetrics');
      assert(functionBody(text, 'endCombatLogSession').includes('combatMetrics: entry?.combatMetrics || null'), 'combat-end does not include combatMetrics');
    });
    check(`${file} logs source hash on combat session boundaries`, () => {
      assert(functionBody(text, 'startCombatLogSession').includes('sourceHash: cfg.sourceHash'), 'combat-start does not include sourceHash');
      assert(functionBody(text, 'endCombatLogSession').includes('sourceHash: cfg.sourceHash'), 'combat-end does not include sourceHash');
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

  check('combat-log daily summary merges all daily JSONL important logs', () => {
    const dailySummary = readText('combat-log-service/daily-summary.js');
    assert(dailySummary.includes('listJsonlFiles(dayDir)'), 'daily summary does not scan the day directory');
    assert(dailySummary.includes("item.name.endsWith('.jsonl')"), 'daily summary does not read all JSONL files');
    assert(dailySummary.includes("item.type === 'important-log'") || dailySummary.includes("entry.type === 'important-log'"), 'daily summary does not filter important logs');
    assert(dailySummary.includes('importantEventsById'), 'daily summary does not dedupe important logs by id');
    assert(dailySummary.includes('mergeSession(sessions.get(event.session.sessionId), event.session)'), 'daily summary does not merge session-start/end records');
    assert(dailySummary.includes('staminaSpentMs === 123000'), 'daily summary self-test does not cover cross-file stamina merge');
    assert(dailySummary.includes("event.importantType === 'combat-summary'"), 'daily summary does not consume combat-summary events');
    assert(dailySummary.includes('## 登录统计') && dailySummary.includes('## 活跃玩家战斗统计'), 'daily summary does not print both required report dimensions');
    assert(dailySummary.includes('formatStaminaSpent(session.staminaSpentMs)') && dailySummary.includes('formatStaminaSpent(combat.staminaSpentMs)'), 'daily summary stamina columns are not formatted through unitless helper');
    assert(!dailySummary.includes('staminaSpentMs) / 1000)}s') && !dailySummary.includes('combatStaminaSpentMs / 1000)}s'), 'daily summary stamina output still includes seconds unit');
    assert(dailySummary.includes('activeKillCount === 1') && dailySummary.includes('afkKillCount === 1') && dailySummary.includes('activeUnconfirmedKillCount === 1') && dailySummary.includes('activeUnconfirmedDropCoins === 30'), 'daily summary self-test does not cover AFK/active confirmed and unconfirmed kill buckets');
    assert(dailySummary.includes('report.combats[0].staminaSpentMs === 2500'), 'daily summary self-test does not cover combat stamina');
    assert(dailySummary.includes('combatHasActualEngagement(combat)'), 'daily summary does not filter non-engaged combat summaries');
    assert(dailySummary.includes('immediate login exit was incorrectly counted as combat'), 'daily summary self-test does not cover immediate login exits');
  });

  check('combat-log daily summary exposes incomplete exits and no-self text', () => {
    const dailySummary = readText('combat-log-service/daily-summary.js');
    assert(dailySummary.includes('日志尚未收口：下一次登录在'), 'daily summary does not show next-login context for open sessions');
    assert(dailySummary.includes('inferredExit') && dailySummary.includes('推断收口：${reasonText'), 'daily summary does not keep inferred exits visible');
    assert(dailySummary.includes('已登录但自身实体不可见，退出等待重连'), 'daily summary does not explain no-self exits');
    assert(dailySummary.includes('!item.inferredExit'), 'inferred exits still count as completed sessions');
    assert(dailySummary.includes('日期：${report.day') && dailySummary.includes('登录合计：明确退出'), 'daily summary top-level report text is not Chinese');
    assert(dailySummary.includes('combatReasonText') && dailySummary.includes("left: '主动退出'") && dailySummary.includes('${label}：${detail}'), 'daily summary does not explain combat result reasons in Chinese');
    assert(dailySummary.includes('说明：主动退出表示已离开当前局并等待安全重登'), 'daily summary does not explain combat result state labels');
    assert(dailySummary.includes('疑似表示只有聊天或掉落值线索') && dailySummary.includes('unconfirmedDropCoins'), 'daily summary does not separate confirmed kill rewards from unconfirmed drops');
    assert(!dailySummary.includes('登录合计: completed='), 'daily summary still prints English aggregate field names');
  });

  check('combat-log package exposes daily summary commands', () => {
    const pkg = readJson('combat-log-service/package.json');
    assert(pkg.scripts && pkg.scripts.daily === 'node daily-summary.js', 'daily summary npm script missing');
    assert(pkg.scripts && pkg.scripts['daily:self-test'] === 'node daily-summary.js --self-test', 'daily summary self-test npm script missing');
    assert(pkg.scripts && pkg.scripts.replay === 'node replay-combat.js', 'combat replay npm script missing');
    assert(pkg.scripts && pkg.scripts['replay:self-test'] === 'node replay-combat.js --self-test', 'combat replay self-test npm script missing');
    assert(String(pkg.scripts.test || '').includes('daily-summary.js --self-test'), 'npm test does not run daily summary self-test');
    assert(String(pkg.scripts.test || '').includes('replay-combat.js --self-test'), 'npm test does not run combat replay self-test');
  });

  check('combat replay tool verifies reference combat improvement', () => {
    const replay = readText('combat-log-service/replay-combat.js');
    assert(replay.includes('function dynamicAimForShot'), 'combat replay tool does not emulate dynamic aim strategy');
    assert(replay.includes('liveDivergencePrecisionCm: 1200'), 'combat replay tool does not use live-divergence threshold');
    assert(replay.includes('dynamic replay did not improve hits'), 'combat replay self-test does not require hit improvement');
    assert(replay.includes('startLine: 12167') && replay.includes('endLine: 12351'), 'combat replay self-test does not cover the xmsthc reference fight');
  });

  check('grasp-rat-bot.js covers stationary full-stamina Active non-combat profit self-tests', () => {
    assert(
      /name: 'stationary full-stamina active zero drop does not beat coin pickup'[\s\S]*current_join_mode: 'Active'[\s\S]*stamina_5s_remaining_milli: 10000[\s\S]*coins: \[\{ drop_id: 2, x: 5000, y: 0, amount: 1 \}\][\s\S]*want: 'coin'/.test(sourceBot),
      'stationary full-stamina Active zero-drop no-combat self-test not found'
    );
    assert(
      /name: 'stationary full-stamina active with drop is non-combat profit attack'[\s\S]*current_join_mode: 'Active'[\s\S]*death_reward_preview: 20[\s\S]*want: 'attack:false:best-opportunity-afk-drop-target'/.test(sourceBot),
      'stationary full-stamina Active profit attack non-combat self-test not found'
    );
  });

  check('grasp-rat-bot.js covers visible opportunity ROI self-tests', () => {
    assert(sourceBot.includes("name: 'higher roi 200m coin beats 150m coin inside visible pool'"), 'visible coin ROI self-test not found');
    assert(sourceBot.includes("name: 'visible high afk drop beats opposite one coin by stamina roi'"), 'visible AFK-vs-coin ROI self-test not found');
    assert(sourceBot.includes("name: '500m drop five afk loses to 100m one coin by pickup travel cost'"), 'full pickup travel cost self-test not found');
    assert(sourceBot.includes("name: 'same distance ten coin beats drop ten after kill pickup cost'"), 'same-distance coin-vs-drop pickup cost self-test not found');
    assert(sourceBot.includes("name: 'high roi post combat drop at visible edge beats recovery wait'"), 'high-value post-combat recovery pickup self-test not found');
    assert(sourceBot.includes("name: 'low roi far post combat drop waits for recovery'"), 'low-ROI post-combat recovery wait self-test not found');
    assert(sourceBot.includes("name: 'oscillating opportunity pair locks after repeated switches'"), 'opportunity oscillation lock self-test not found');
    assert(sourceBot.includes("name: 'high drop kill waits at last target position before coin refresh'"), 'post-kill drop wait self-test not found');
    assert(sourceBot.includes("name: 'alive high drop target does not trigger post kill wait'"), 'alive-target no-wait self-test not found');
    assert(sourceBot.includes("name: 'unshot high drop target disappearance does not trigger post kill wait'"), 'unshot-target no-wait self-test not found');
    assert(sourceBot.includes("want: 'seek-enemy:approach-afk-drop-target'"), 'visible AFK-vs-coin expected action not found');
  });

  check('grasp-rat-bot.js covers combat fire discipline self-tests', () => {
    assert(sourceBot.includes("name: 'low hp no-damage combat keeps fighting without disadvantage'"), 'no-damage non-exit self-test not found');
    assert(sourceBot.includes("name: 'combat preserves dodge stamina by pausing fire'"), 'dodge stamina reserve self-test not found');
    assert(sourceBot.includes("name: 'combat reserve band uses burst fire without force shooting'"), 'burst fire self-test not found');
    assert(sourceBot.includes("name: 'combat close pressure fire window keeps mid hp shooting'"), 'close-pressure fire window self-test not found');
    assert(sourceBot.includes("name: 'combat long no-damage active duel resumes reserve-band fire'"), 'long no-damage duel fire self-test not found');
    assert(sourceBot.includes("name: 'combat coordinate divergence immediately uses live precision aim'"), 'coordinate-divergence live precision self-test not found');
    assert(sourceBot.includes("name: 'combat radial live target uses precision aim without waiting'"), 'radial-motion live precision self-test not found');
    assert(sourceBot.includes("name: 'combat trend classifies long no-damage duel stance'"), 'combat trend stance self-test not found');
    assert(sourceBot.includes("name: 'combat native tick interval tightens only during combat'"), 'combat-only native tick self-test not found');
    assert(sourceBot.includes("name: 'combat action suppresses same-target pursuit leave'"), 'same-target pursuit suppression self-test not found');
    assert(sourceBot.includes("name: 'defensive target switch requires immediate incoming bullet'"), 'defensive target switch self-test not found');
    assert(sourceBot.includes("name: 'combat close pressure hp disadvantage exits before low hp threshold'"), 'close-pressure HP disadvantage self-test not found');
    assert(sourceBot.includes("name: 'combat server stall no-damage waits for precision aim grace'"), 'server-stall precision grace self-test not found');
    assert(sourceBot.includes("name: 'combat server stall long no-damage exits before broad hp disadvantage'"), 'server-stall no-damage exit self-test not found');
    assert(sourceBot.includes("name: 'combat emergency close spacing overrides incoming bullet strafe'"), 'emergency close spacing override self-test not found');
    assert(sourceBot.includes("name: 'combat low hp close risk exits before losing hp disadvantage'"), 'low-HP close-risk exit self-test not found');
    assert(sourceBot.includes("name: 'combat log exit summary covers pending exit decisions'"), 'pending-exit log summary self-test not found');
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
      assert(text.includes('combatLogEndpointConfigured'), 'combat log endpoint configured flag not found');
      assert(text.includes('const remoteLogVisible = Boolean(cfg.combatLogEndpointConfigured)'), 'remote-log visibility gate not found');
      assert(text.includes('if (remoteLogVisible) {'), 'remote-log dot is not hidden before endpoint configuration');
      assert(text.includes('const logDot = createDot(remoteLogTitle, remoteLogColor, remoteLogHalo, remoteLogGlow'), 'remote-log dot not found');
      assert(text.includes("label: '日志'"), 'remote-log dot visible label not found');
      assert(text.includes('justify-content:flex-start'), 'status dots are not left aligned');
      const loginBody = functionBody(text, 'syncEntityControlLogin');
      assert(text.includes('function reloginHoldRemainingFromStatus'), 'relogin hold inline-login helper not found');
      assert(text.includes('function shouldShowInlineLogin'), 'inline login visibility helper not found');
      assert(loginBody.includes('!shouldShowInlineLogin(status)'), 'inline login is still hidden solely by logged-in state');
      assert(loginBody.includes('跳过重连等待并立即登录/加入游戏'), 'inline login title does not reflect relogin hold bypass');
      assert(text.includes('const remoteLogHasFailure = remoteLogFailed > 0'), 'remote-log failure state not found');
      assert(text.includes('const remoteLogColor = remoteLogHasFailure'), 'remote-log color does not depend on outstanding failed count');
      assert(text.includes('pending: remoteLogPending > 0 && !remoteLogHasFailure'), 'remote-log pending blink state not found');
      assert(text.includes('onClick: () => configureCombatLogging({ enabled: !remoteLogEnabled })'), 'remote-log dot toggle not found');
      assert(text.includes("logDot.setAttribute('aria-pressed', String(remoteLogEnabled))"), 'remote-log dot aria-pressed not found');
    });
    check(`${file} suppresses routine bootstrap console noise`, () => {
      assert(text.includes('function shouldLogBootstrap'), 'bootstrap log filter not found');
      assert(text.includes('debugBootstrapLogging'), 'bootstrap verbose logging switch not found');
      assert(text.includes('watchdog ok|watchdog skipped: busy|poll skipped: busy|poll ok: bot current'), 'routine watchdog/poll logs are not filtered');
      assert(text.includes('manifest fetch start|manifest fetch try|manifest fetch ok|manifest fetch complete'), 'routine manifest fetch logs are not filtered');
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
    check(`${file} keeps compact panel spacing and wait countdown inline`, () => {
      assert(text.includes('padding:10px 16px 9px'), 'first panel section does not use 16px horizontal padding');
      assert(text.includes('padding:9px 16px'), 'panel sections do not use 16px horizontal padding');
      assert(text.includes("appendLine('当前行为：' + behaviorText(decision, status) + (hold > 0 ? '，等待重连：' + formatDuration(hold) : ''))"), 'relogin countdown is not inline with current behavior');
      assert(!text.includes("appendLine('等待重连：' + formatDuration(hold))"), 'standalone relogin countdown line is still present');
    });
    check(`${file} renders combat HP as a full-width fight panel`, () => {
      const body = functionBody(text, 'appendCombatHpPanel');
      assert(body.includes("'width:100%'"), 'combat HP panel is not full width');
      assert(body.includes("'background:rgba(24,24,27,.96)'"), 'combat HP panel does not use its own background');
      assert(body.includes("'grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)'"), 'combat HP panel does not use symmetric VS columns');
      assert(body.includes("box.appendChild(sideBlock(hp.selfName, hp.selfHp, hp.selfMaxHp, 'right', '#86efac'))"), 'self side is not right-aligned left of VS');
      assert(body.includes("box.appendChild(sideBlock(hp.targetName, hp.targetHp, hp.targetMaxHp, 'left', '#fca5a5'))"), 'target side is not left-aligned right of VS');
      assert(body.includes("'width:' + combatHpPercent(value, maxValue) + '%'"), 'combat HP bar width is not driven by HP percent');
      assert(body.includes("right ? 'right:0' : 'left:0'"), 'combat HP bar fill is not mirrored by side');
      assert(text.includes('function entityNameText(entity)'), 'combat HP display does not prefer entity names');
      assert(text.includes('selfName: entityNameText(selfEntity)') && text.includes('targetName: entityNameText(target)'), 'combat HP summary does not expose names');
      assert(text.includes('appendCombatHpPanel(panel, hp)'), 'combat HP panel is not appended as its own panel block');
      assert(!text.includes('combatHpComparisonParts'), 'old inline combat HP comparison renderer is still present');
    });
    check(`${file} shows script versions without v prefix`, () => {
      assert(!text.includes('远程脚本 v'), 'remote script visible version still has v prefix');
      assert(!text.includes('加载器 篡改猴 v'), 'userscript visible version still has v prefix');
      assert(!text.includes('加载器 扩展 v'), 'extension visible version still has v prefix');
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
