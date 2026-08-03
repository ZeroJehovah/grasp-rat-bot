#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');
const STATE_FILE_NAME = 'grasp-rat-iteration-timing.json';
const DEFAULT_STATE_FILE = defaultStateFilePath(ROOT);
const DEFAULT_DOCUMENT_DIRECTORY = path.join(WORKSPACE_ROOT, 'docs', 'iteration-records');
const TIME_ZONE = 'Asia/Shanghai';
const PHASE_NAMES = new Set([
  'development-end',
  'validation-start',
  'validation-end',
  'restart-start',
  'restart-end',
]);
const REPLACEABLE_PHASE_NAMES = new Set(['development-end', 'validation-end']);
const ITERATION_MODES = new Set(['release', 'daily-log']);
const ACTIVITY_STATUSES = new Set(['running', 'completed', 'failed', 'interrupted', 'skipped']);
const ACTIVITY_CATEGORIES = new Set([
  'inspect',
  'design',
  'edit',
  'test',
  'benchmark',
  'git',
  'deploy',
  'restart',
  'docs',
  'wait',
  'other',
]);
const STATE_LOCK_TIMEOUT_MS = 30_000;
const STATE_LOCK_STALE_MS = 60_000;

function usage() {
  return [
    'Usage:',
    '  node scripts/iteration-timing.js start --summary <中文一句话> [--mode release|daily-log] [--at <ISO时间>]',
    '  node scripts/iteration-timing.js mark <阶段> [--at <ISO时间>]',
    '  node scripts/iteration-timing.js step-start --label <步骤名> [--category <类别>] [--at <ISO时间>]',
    '  node scripts/iteration-timing.js step-end --label <步骤名> [--status <状态>] [--error <摘要>] [--at <ISO时间>]',
    '  node scripts/iteration-timing.js run --label <步骤名> [--category <类别>] [--cwd <目录>] -- <命令> [参数...]',
    '  node scripts/iteration-timing.js status [--all]',
    '  node scripts/iteration-timing.js finish [--no-restart] [--status completed|blocked] [--at <ISO时间>]',
    '  node scripts/iteration-timing.js --self-test',
    '',
    '迭代模式: release（默认发布迭代）, daily-log（明确要求的每日日志迭代）',
    '阶段: development-end, validation-start, validation-end, restart-start, restart-end',
    '活动状态: running, completed, failed, interrupted, skipped',
  ].join('\n');
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  const commandArgs = [];
  let passthrough = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (passthrough) {
      commandArgs.push(value);
      continue;
    }
    if (value === '--') {
      passthrough = true;
      continue;
    }
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === 'no-restart' || key === 'self-test' || key === 'all') {
      options[key] = true;
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw new Error(`选项 --${key} 缺少值`);
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  return { positional, options, commandArgs };
}

function resolvePathFromFile(file, value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(path.dirname(file), value);
}

function resolveGitDir(root) {
  const dotGitPath = path.join(root, '.git');
  let stat;
  try {
    stat = fs.statSync(dotGitPath);
  } catch (error) {
    throw new Error(`找不到 Git 元数据: ${dotGitPath}`);
  }
  if (stat.isDirectory()) return dotGitPath;
  if (!stat.isFile()) throw new Error(`不支持的 .git 类型: ${dotGitPath}`);
  const pointer = fs.readFileSync(dotGitPath, 'utf8').trim();
  const match = /^gitdir:\s*(.+)$/.exec(pointer);
  if (!match) throw new Error(`无效的 linked worktree .git 指针: ${dotGitPath}`);
  return resolvePathFromFile(dotGitPath, match[1].trim());
}

function resolveCommonGitDir(gitDir) {
  const commonDirFile = path.join(gitDir, 'commondir');
  if (!fs.existsSync(commonDirFile)) return gitDir;
  const value = fs.readFileSync(commonDirFile, 'utf8').trim();
  if (!value) throw new Error(`Git commondir 为空: ${commonDirFile}`);
  return resolvePathFromFile(commonDirFile, value);
}

function defaultStateFilePath(root) {
  return path.join(resolveGitDir(root), STATE_FILE_NAME);
}

function linkedWorktreeRoot(gitDir) {
  const gitDirFile = path.join(gitDir, 'gitdir');
  if (!fs.existsSync(gitDirFile)) return null;
  const value = fs.readFileSync(gitDirFile, 'utf8').trim();
  if (!value) return null;
  return path.dirname(resolvePathFromFile(gitDirFile, value));
}

function activeIterationLocations(root = ROOT) {
  const gitDir = resolveGitDir(root);
  const commonGitDir = resolveCommonGitDir(gitDir);
  const locations = new Map();
  const addLocation = (worktreeRoot, iterationGitDir) => {
    const stateFile = path.join(iterationGitDir, STATE_FILE_NAME);
    if (!fs.existsSync(stateFile)) return;
    locations.set(stateFile, { worktreeRoot, stateFile });
  };
  addLocation(path.dirname(commonGitDir), commonGitDir);
  const worktreesDirectory = path.join(commonGitDir, 'worktrees');
  if (fs.existsSync(worktreesDirectory)) {
    for (const entry of fs.readdirSync(worktreesDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const iterationGitDir = path.join(worktreesDirectory, entry.name);
      const worktreeRoot = linkedWorktreeRoot(iterationGitDir);
      if (worktreeRoot) addLocation(worktreeRoot, iterationGitDir);
    }
  }
  return [...locations.values()];
}

function stateFilePath() {
  return process.env.GRASP_RAT_ITERATION_TIMING_STATE || DEFAULT_STATE_FILE;
}

function documentFilePath() {
  return process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT || null;
}

function documentDirectoryPath() {
  return process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY || DEFAULT_DOCUMENT_DIRECTORY;
}

function recordFileName(state) {
  const localTimestamp = formatTimestamp(state.startedAt)
    .replace(' +08:00', '')
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(' ', '-');
  const identity = crypto.createHash('sha256')
    .update(`${state.startedAt}\n${state.summary}\n${state.workspaceRoot || WORKSPACE_ROOT}`)
    .digest('hex')
    .slice(0, 10);
  return `${localTimestamp}-${identity}.md`;
}

function validateDocumentWorkspace() {
  if (documentFilePath() || process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY) return;
  const docsGitPath = path.join(WORKSPACE_ROOT, 'docs', '.git');
  if (!fs.existsSync(docsGitPath)) {
    throw new Error(`当前迭代缺少配对的 docs worktree: ${path.join(WORKSPACE_ROOT, 'docs')}`);
  }
}

function parseTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error(`无效时间: ${value}`);
  return date.toISOString();
}

function readState() {
  const file = stateFilePath();
  if (!fs.existsSync(file)) throw new Error('当前没有进行中的迭代计时');
  return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function readStateFile(file) {
  return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function normalizeState(state) {
  state.mode ||= 'release';
  if (!ITERATION_MODES.has(state.mode)) throw new Error(`迭代模式无效: ${state.mode}`);
  state.phaseHistory ||= {};
  state.steps ||= [];
  return state;
}

function writeState(state) {
  const file = stateFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function stateLockPath() {
  return `${stateFilePath()}.lock`;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function maybeRemoveStaleStateLock(lockFile) {
  try {
    const stat = fs.statSync(lockFile);
    if (Date.now() - stat.mtimeMs < STATE_LOCK_STALE_MS) return false;
    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    } catch (error) {
      owner = null;
    }
    if (owner && processExists(owner.pid)) return false;
    fs.unlinkSync(lockFile);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    return false;
  }
}

function acquireStateLock() {
  const lockFile = stateLockPath();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const startedAt = Date.now();
  while (Date.now() - startedAt < STATE_LOCK_TIMEOUT_MS) {
    try {
      const descriptor = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, 'utf8');
      return { descriptor, lockFile };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!maybeRemoveStaleStateLock(lockFile)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
  }
  throw new Error(`无法获取迭代状态锁: ${lockFile}`);
}

function releaseStateLock(lock) {
  try {
    fs.closeSync(lock.descriptor);
  } finally {
    try {
      fs.unlinkSync(lock.lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function updateState(mutator) {
  const lock = acquireStateLock();
  try {
    const state = readState();
    const result = mutator(state);
    writeState(state);
    return result;
  } finally {
    releaseStateLock(lock);
  }
}

function activityId(kind) {
  return `${kind}-${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
}

function validateActivityCategory(value) {
  const category = String(value || 'other').trim();
  if (!category) throw new Error('活动类别不能为空');
  if (!ACTIVITY_CATEGORIES.has(category)) {
    throw new Error(`未知活动类别: ${category}；可用类别: ${[...ACTIVITY_CATEGORIES].join(', ')}`);
  }
  return category;
}

function validateIterationMode(value) {
  const mode = String(value || 'release').trim();
  if (!ITERATION_MODES.has(mode)) {
    throw new Error(`迭代模式只能是 release 或 daily-log，收到: ${mode}`);
  }
  return mode;
}

function iterationModeLabel(mode) {
  return mode === 'daily-log' ? '每日日志迭代' : '发布迭代';
}

function validateActivityStatus(value) {
  const status = String(value || 'completed').trim();
  if (!ACTIVITY_STATUSES.has(status) || status === 'running') {
    throw new Error(`无效的结束状态: ${status}`);
  }
  return status;
}

function activityStatus(activity) {
  return activity.status || (activity.end ? 'completed' : 'running');
}

function activityDurationMs(activity, endValue = activity.end || new Date().toISOString()) {
  return Math.max(0, activity.end && activity.durationMs != null
    ? Number(activity.durationMs)
    : elapsedMs(activity.start, endValue));
}

function validateSummary(summary) {
  if (!summary || typeof summary !== 'string') throw new Error('必须提供迭代内容');
  const normalized = summary.trim();
  if (!normalized) throw new Error('迭代内容不能为空');
  if (/\r|\n/.test(normalized)) throw new Error('迭代内容必须是一句话');
  if (![...normalized].some((character) => character >= '\u3400' && character <= '\u9fff')) {
    throw new Error('迭代内容必须包含中文');
  }
  return normalized;
}

function start(options) {
  const file = stateFilePath();
  if (fs.existsSync(file)) throw new Error('已有进行中的迭代；请先执行 status 或 finish');
  validateDocumentWorkspace();
  const state = {
    version: 4,
    summary: validateSummary(options.summary),
    mode: validateIterationMode(options.mode),
    startedAt: parseTimestamp(options.at),
    workspaceRoot: WORKSPACE_ROOT,
    phases: {},
    phaseHistory: {},
    steps: [],
  };
  writeState(state);
  return [
    `迭代计时已开始: ${state.summary}`,
    `迭代模式: ${iterationModeLabel(state.mode)} (${state.mode})`,
    `开发开始: ${formatTimestamp(state.startedAt)}`,
    `迭代工作区: ${WORKSPACE_ROOT}`,
  ].join('\n');
}

function mark(phase, options) {
  if (!PHASE_NAMES.has(phase)) throw new Error(`未知阶段: ${phase}`);
  return updateState((state) => {
    const previous = state.phases[phase];
    if (previous && !REPLACEABLE_PHASE_NAMES.has(phase)) {
      throw new Error(`阶段 ${phase} 已记录，不能覆盖原始时间`);
    }
    if (previous) {
      state.phaseHistory ||= {};
      state.phaseHistory[phase] ||= [];
      state.phaseHistory[phase].push(previous);
    }
    state.phases[phase] = parseTimestamp(options.at);
    validateStateChronology(state, false);
    return `${phase}${previous ? '（已更新）' : ''}: ${formatTimestamp(state.phases[phase])}`;
  });
}

function stepStart(options) {
  const label = String(options.label || '').trim();
  if (!label) throw new Error('必须提供 --label');
  const category = validateActivityCategory(options.category);
  return updateState((state) => {
    if (state.steps.some((step) => step.label === label && !step.end)) {
      throw new Error(`步骤 ${label} 已存在且尚未结束`);
    }
    state.steps.push({
      id: activityId('step'),
      kind: 'step',
      label,
      category,
      start: parseTimestamp(options.at),
      end: null,
      durationMs: null,
      status: 'running',
      error: null,
    });
    return `步骤开始: ${label}`;
  });
}

function stepEnd(options) {
  const label = String(options.label || '').trim();
  const status = validateActivityStatus(options.status);
  return updateState((state) => {
    const step = [...state.steps].reverse().find((candidate) => candidate.label === label && !candidate.end);
    if (!step) throw new Error(`找不到未结束步骤: ${label}`);
    step.end = parseTimestamp(options.at);
    if (new Date(step.end) < new Date(step.start)) throw new Error(`步骤 ${label} 的结束时间早于开始时间`);
    step.durationMs = elapsedMs(step.start, step.end);
    step.status = status;
    step.error = options.error ? String(options.error).trim() : null;
    return `步骤结束: ${label}（${formatDuration(step.durationMs)}，${status}）`;
  });
}

function validateStateChronology(state, finalValidation) {
  const { phases } = state;
  const startedAt = new Date(state.startedAt);
  for (const [name, value] of Object.entries(phases)) {
    if (new Date(value) < startedAt) throw new Error(`${name} 早于迭代开始时间`);
  }
  for (const step of state.steps) {
    if (new Date(step.start) < startedAt) throw new Error(`细分步骤 ${step.label} 早于迭代开始时间`);
    if (step.end && new Date(step.end) < new Date(step.start)) {
      throw new Error(`细分步骤 ${step.label} 的结束时间早于开始时间`);
    }
    const status = activityStatus(step);
    if (!ACTIVITY_STATUSES.has(status)) throw new Error(`细分活动 ${step.label} 状态无效: ${status}`);
    if (status === 'running' && step.end) throw new Error(`细分活动 ${step.label} 已结束但仍为 running`);
    if (status !== 'running' && !step.end) throw new Error(`细分活动 ${step.label} 已标记为 ${status} 但没有结束时间`);
  }
  if (phases['validation-end'] && !phases['validation-start']) {
    throw new Error('validation-end 之前必须记录 validation-start');
  }
  if (phases['validation-start'] && phases['validation-end']
      && new Date(phases['validation-end']) < new Date(phases['validation-start'])) {
    throw new Error('validation-end 早于 validation-start');
  }
  if (phases['restart-end'] && !phases['restart-start']) {
    throw new Error('restart-end 之前必须记录 restart-start');
  }
  if (phases['restart-start'] && phases['restart-end']
      && new Date(phases['restart-end']) < new Date(phases['restart-start'])) {
    throw new Error('restart-end 早于 restart-start');
  }
  if (finalValidation) {
    for (const required of ['development-end', 'validation-start', 'validation-end']) {
      if (!phases[required]) throw new Error(`完成记录前缺少阶段: ${required}`);
    }
    if (new Date(phases['development-end']) > new Date(phases['validation-end'])) {
      throw new Error('development-end 不能晚于最终 validation-end');
    }
    const unfinishedStep = state.steps.find((step) => !step.end);
    if (unfinishedStep) throw new Error(`细分步骤尚未结束: ${unfinishedStep.label}`);
  }
}

function formatTimestamp(value) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} +08:00`;
}

function formatTimestampPrecise(value) {
  const date = new Date(value);
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${formatTimestamp(value).replace(' +08:00', '')}.${milliseconds} +08:00`;
}

function elapsedMs(startValue, endValue) {
  return new Date(endValue).getTime() - new Date(startValue).getTime();
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}小时`);
  if (minutes || hours) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);
  return parts.join('');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+@%-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function redactCommandArgs(args) {
  const redacted = [];
  let redactNext = false;
  for (const value of args) {
    if (redactNext) {
      redacted.push('[REDACTED]');
      redactNext = false;
      continue;
    }
    const text = String(value);
    if (/^--?(?:api[-_]?)?(?:key|token|secret|password|management-key)$/i.test(text)) {
      redacted.push(text);
      redactNext = true;
      continue;
    }
    if (/^(?:[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|MANAGEMENT_KEY))=/.test(text)) {
      redacted.push(`${text.slice(0, text.indexOf('='))}=[REDACTED]`);
      continue;
    }
    redacted.push(text.replace(/(bearer\s+)[^\s]+/ig, '$1[REDACTED]'));
  }
  return redacted;
}

function commandText(args) {
  return redactCommandArgs(args).map(shellQuote).join(' ');
}

function resolveCommandCwd(value) {
  const cwd = path.resolve(process.cwd(), String(value || '.'));
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch (error) {
    throw new Error(`命令工作目录不存在: ${cwd}`);
  }
  if (!stat.isDirectory()) throw new Error(`命令工作目录不是目录: ${cwd}`);
  return cwd;
}

function signalExitCode(signal) {
  const signals = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGTERM: 15,
  };
  return signal && signals[signal] ? 128 + signals[signal] : 1;
}

function createCommandActivity(options, args, cwd) {
  const startedAt = parseTimestamp();
  return {
    id: activityId('command'),
    kind: 'command',
    label: String(options.label || '').trim(),
    category: validateActivityCategory(options.category),
    command: commandText(args),
    cwd,
    start: startedAt,
    end: null,
    durationMs: null,
    status: 'running',
    pid: null,
    exitCode: null,
    signal: null,
    error: null,
  };
}

function updateActivity(activityIdValue, mutator) {
  return updateState((state) => {
    const activity = state.steps.find((candidate) => candidate.id === activityIdValue);
    if (!activity) throw new Error(`找不到活动: ${activityIdValue}`);
    return mutator(activity, state);
  });
}

function completeCommandActivity(id, result) {
  return updateActivity(id, (activity) => {
    activity.end = parseTimestamp();
    activity.durationMs = elapsedMs(activity.start, activity.end);
    activity.status = result.status;
    activity.exitCode = result.exitCode == null ? null : result.exitCode;
    activity.signal = result.signal || null;
    activity.error = result.error || null;
    return activity;
  });
}

async function runCommand(options, args) {
  const label = String(options.label || '').trim();
  if (!label) throw new Error('run 必须提供 --label');
  if (!args.length) throw new Error('run 必须在 -- 后提供命令');
  const cwd = resolveCommandCwd(options.cwd);
  const activity = createCommandActivity(options, args, cwd);
  updateState((state) => {
    state.steps.push(activity);
  });

  let child;
  try {
    child = childProcess.spawn(args[0], args.slice(1), {
      cwd,
      stdio: 'inherit',
      shell: false,
    });
    updateActivity(activity.id, (current) => {
      current.pid = child.pid;
    });
  } catch (error) {
    const result = {
      status: 'failed',
      exitCode: 1,
      signal: null,
      error: `${error.code || 'spawn-error'}: ${error.message}`,
    };
    completeCommandActivity(activity.id, result);
    return { ...result, label, durationMs: activityDurationMs(readState().steps.find((step) => step.id === activity.id)) };
  }

  let interruptedSignal = null;
  const interrupt = (signal) => {
    interruptedSignal = signal;
    if (child && !child.killed) {
      try {
        child.kill(signal);
      } catch (error) {
        interruptedSignal = signal;
      }
    }
  };
  const handleSigint = () => interrupt('SIGINT');
  const handleSigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  const result = await new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({
        status: 'failed',
        exitCode: 1,
        signal: null,
        error: `${error.code || 'command-error'}: ${error.message}`,
      });
    });
    child.once('close', (exitCode, signal) => {
      const actualSignal = signal || interruptedSignal;
      if (actualSignal) {
        resolve({
          status: 'interrupted',
          exitCode: signalExitCode(actualSignal),
          signal: actualSignal,
          error: interruptedSignal ? `收到 ${interruptedSignal}` : null,
        });
        return;
      }
      resolve({
        status: exitCode === 0 ? 'completed' : 'failed',
        exitCode: exitCode == null ? 1 : exitCode,
        signal: null,
        error: exitCode === 0 ? null : `退出码 ${exitCode}`,
      });
    });
  });
  process.removeListener('SIGINT', handleSigint);
  process.removeListener('SIGTERM', handleSigterm);
  const finished = completeCommandActivity(activity.id, result);
  return {
    ...result,
    label,
    durationMs: finished.durationMs,
  };
}

function formatRunResult(result) {
  const exit = result.signal ? `signal=${result.signal}` : `exit=${result.exitCode}`;
  const error = result.error ? `，${result.error}` : '';
  return `命令结束: ${result.label}（${formatDuration(result.durationMs)}，${result.status}，${exit}${error}）`;
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function activityMetrics(state, finishedAt) {
  const totalMs = elapsedMs(state.startedAt, finishedAt);
  const intervals = state.steps
    .filter((step) => step.end)
    .map((step) => ({
      start: Math.max(new Date(state.startedAt).getTime(), new Date(step.start).getTime()),
      end: Math.min(new Date(finishedAt).getTime(), new Date(step.end).getTime()),
    }))
    .filter((interval) => interval.end >= interval.start)
    .sort((left, right) => left.start - right.start);
  let unionMs = 0;
  let current = null;
  for (const interval of intervals) {
    if (!current) {
      current = { ...interval };
      continue;
    }
    if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
      continue;
    }
    unionMs += current.end - current.start;
    current = { ...interval };
  }
  if (current) unionMs += current.end - current.start;
  const activitySumMs = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const failedCount = state.steps.filter((step) => ['failed', 'interrupted'].includes(activityStatus(step))).length;
  return {
    totalMs: Math.max(0, totalMs),
    activitySumMs,
    activeWallMs: unionMs,
    overlapMs: Math.max(0, activitySumMs - unionMs),
    untrackedGapMs: Math.max(0, totalMs - unionMs),
    activityCount: state.steps.length,
    failedCount,
  };
}

function renderRecord(state, options, finishedAt) {
  const developmentEnd = state.phases['development-end'];
  const validationStart = state.phases['validation-start'];
  const validationEnd = state.phases['validation-end'];
  const restartStart = state.phases['restart-start'];
  const restartEnd = state.phases['restart-end'];
  const statusLabel = options.status === 'blocked' ? '受阻结束' : '完成';
  const metrics = activityMetrics(state, finishedAt);
  const lines = [
    `## ${formatTimestamp(state.startedAt)} — ${state.summary}`,
    '',
    `- 模式：${iterationModeLabel(state.mode)}（${state.mode}）`,
    `- 状态：${statusLabel}`,
    `- 记录完成：${formatTimestamp(finishedAt)}`,
    `- 总历时：${formatDuration(metrics.totalMs)}（${Math.round(metrics.totalMs)}ms）`,
    `- 已记录活动：${metrics.activityCount} 条；活动累计耗时 ${formatDuration(metrics.activitySumMs)}（${Math.round(metrics.activitySumMs)}ms）；并行重叠 ${formatDuration(metrics.overlapMs)}（${Math.round(metrics.overlapMs)}ms）；未记录空档 ${formatDuration(metrics.untrackedGapMs)}（${Math.round(metrics.untrackedGapMs)}ms）`,
    `- 失败或中断活动：${metrics.failedCount} 条`,
    '',
    '| 阶段 | 开始 | 结束 | 耗时 | 毫秒 |',
    '| --- | --- | --- | ---: | ---: |',
    `| 开发（含方案设计） | ${formatTimestamp(state.startedAt)} | ${formatTimestamp(developmentEnd)} | ${formatDuration(elapsedMs(state.startedAt, developmentEnd))} | ${Math.round(elapsedMs(state.startedAt, developmentEnd))} |`,
    `| 测试验证 | ${formatTimestamp(validationStart)} | ${formatTimestamp(validationEnd)} | ${formatDuration(elapsedMs(validationStart, validationEnd))} | ${Math.round(elapsedMs(validationStart, validationEnd))} |`,
  ];
  if (options['no-restart']) {
    lines.push('| 服务重启 | 不适用 | 不适用 | 未影响运行服务 | — |');
  } else {
    lines.push(`| 服务重启 | ${formatTimestamp(restartStart)} | ${formatTimestamp(restartEnd)} | ${formatDuration(elapsedMs(restartStart, restartEnd))} | ${Math.round(elapsedMs(restartStart, restartEnd))} |`);
  }
  if (state.steps.length) {
    lines.push('', '### 细分活动', '', '| 类型 | 类别 | 活动 | 开始 | 结束 | 耗时 | 毫秒 | 状态 | 退出 | 目录/命令/错误 |', '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |');
    for (const step of state.steps) {
      const status = activityStatus(step);
      const exit = step.kind === 'command'
        ? [step.exitCode == null ? null : `exit=${step.exitCode}`, step.signal ? `signal=${step.signal}` : null]
          .filter(Boolean).join('<br>')
        : '';
      const detail = [
        step.cwd,
        step.command,
        step.error,
      ].filter(Boolean).map(escapeCell).join('<br>');
      const durationMs = activityDurationMs(step, step.end || finishedAt);
      lines.push(`| ${escapeCell(step.kind || 'step')} | ${escapeCell(step.category || 'other')} | ${escapeCell(step.label)} | ${formatTimestampPrecise(step.start)} | ${step.end ? formatTimestampPrecise(step.end) : '未结束'} | ${formatDuration(durationMs)} | ${Math.round(durationMs)} | ${escapeCell(status)} | ${escapeCell(exit)} | ${detail || '—'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function appendDocument(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, [
      '# 迭代耗时记录',
      '',
      '本文件按时间顺序记录每次项目迭代的开发、测试验证和服务重启耗时，并保留命令级活动、状态、退出信息、并行重叠和未记录空档。时间统一使用 Asia/Shanghai（UTC+8）。',
      '',
      '记录由 `src/scripts/iteration-timing.js` 生成；执行规范见 `docs/agent/iteration-timing.md`。',
      '',
    ].join('\n'), 'utf8');
  }
  const existing = fs.readFileSync(file, 'utf8');
  const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(file, `${separator}${record.trimEnd()}\n`, 'utf8');
}

function writeRecordDocument(state, record) {
  const aggregateFile = documentFilePath();
  if (aggregateFile) {
    appendDocument(aggregateFile, record);
    return aggregateFile;
  }
  const file = path.join(documentDirectoryPath(), recordFileName(state));
  const content = `# 迭代耗时记录\n\n${record.trimEnd()}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') !== content) throw new Error(`迭代记录文件已存在且内容不同: ${file}`);
    return file;
  }
  fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
  return file;
}

function finish(options) {
  const status = options.status || 'completed';
  if (!['completed', 'blocked'].includes(status)) throw new Error('--status 只能是 completed 或 blocked');
  options.status = status;
  const lock = acquireStateLock();
  try {
    const state = readState();
    validateStateChronology(state, true);
    if (options['no-restart']) {
      if (state.phases['restart-start'] || state.phases['restart-end']) {
        throw new Error('已经记录服务重启阶段，不能使用 --no-restart');
      }
    } else {
      for (const required of ['restart-start', 'restart-end']) {
        if (!state.phases[required]) throw new Error(`需要重启服务时缺少阶段: ${required}`);
      }
    }
    const finishedAt = parseTimestamp(options.at);
    const latestRecordedAt = [
      state.startedAt,
      ...Object.values(state.phases),
      ...state.steps.flatMap((step) => [step.start, step.end]),
    ].filter(Boolean).reduce((latest, value) => (
      new Date(value) > new Date(latest) ? value : latest
    ));
    if (new Date(finishedAt) < new Date(latestRecordedAt)) {
      throw new Error('记录完成时间早于已记录的阶段或细分步骤');
    }
    const recordFile = writeRecordDocument(state, renderRecord(state, options, finishedAt));
    fs.unlinkSync(stateFilePath());
    return `迭代记录已写入: ${path.relative(ROOT, recordFile)}`;
  } finally {
    releaseStateLock(lock);
  }
}

function statusDetails(state, location) {
  const now = new Date().toISOString();
  return {
    workspaceRoot: path.dirname(location.worktreeRoot),
    sourceWorktree: location.worktreeRoot,
    stateFile: location.stateFile,
    summary: state.summary,
    mode: state.mode,
    modeLabel: iterationModeLabel(state.mode),
    startedAt: formatTimestamp(state.startedAt),
    phases: Object.fromEntries(Object.entries(state.phases).map(([key, value]) => [key, formatTimestamp(value)])),
    steps: state.steps.map((step) => ({
      id: step.id || null,
      kind: step.kind || 'step',
      label: step.label,
      category: step.category || 'other',
      start: formatTimestampPrecise(step.start),
      end: step.end ? formatTimestampPrecise(step.end) : null,
      duration: formatDuration(activityDurationMs(step, step.end || now)),
      durationMs: Math.round(activityDurationMs(step, step.end || now)),
      status: activityStatus(step),
      pid: step.pid || null,
      exitCode: step.exitCode == null ? null : step.exitCode,
      signal: step.signal || null,
      error: step.error || null,
      command: step.command || null,
      cwd: step.cwd || null,
    })),
    metrics: activityMetrics(state, now),
  };
}

function status(options = {}) {
  if (options.all) {
    const iterations = activeIterationLocations().map((location) => (
      statusDetails(readStateFile(location.stateFile), location)
    )).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    return JSON.stringify({ activeCount: iterations.length, iterations }, null, 2);
  }
  const state = readState();
  return JSON.stringify(statusDetails(state, {
    worktreeRoot: ROOT,
    stateFile: stateFilePath(),
  }), null, 2);
}

async function selfTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'iteration-timing-'));
  const previousState = process.env.GRASP_RAT_ITERATION_TIMING_STATE;
  const previousDocument = process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT;
  const previousDocumentDirectory = process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY;
  process.env.GRASP_RAT_ITERATION_TIMING_STATE = path.join(directory, 'state.json');
  process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT = path.join(directory, 'records.md');
  try {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const expectError = (operation, expectedMessage) => {
      try {
        operation();
      } catch (error) {
        if (error.message.includes(expectedMessage)) return;
        throw error;
      }
      throw new Error(`预期操作失败: ${expectedMessage}`);
    };
    const repositoryRoot = path.join(directory, 'repository');
    const commonGitDir = path.join(repositoryRoot, '.git');
    const worktreeRootA = path.join(directory, 'worktrees', 'task-a');
    const worktreeRootB = path.join(directory, 'worktrees', 'task-b');
    const worktreeGitDirA = path.join(commonGitDir, 'worktrees', 'task-a');
    const worktreeGitDirB = path.join(commonGitDir, 'worktrees', 'task-b');
    fs.mkdirSync(commonGitDir, { recursive: true });
    fs.mkdirSync(worktreeRootA, { recursive: true });
    fs.mkdirSync(worktreeRootB, { recursive: true });
    fs.mkdirSync(worktreeGitDirA, { recursive: true });
    fs.mkdirSync(worktreeGitDirB, { recursive: true });
    fs.writeFileSync(path.join(worktreeRootA, '.git'), `gitdir: ${worktreeGitDirA}\n`, 'utf8');
    fs.writeFileSync(path.join(worktreeRootB, '.git'), `gitdir: ${path.relative(worktreeRootB, worktreeGitDirB)}\n`, 'utf8');
    for (const [worktreeRoot, worktreeGitDir] of [
      [worktreeRootA, worktreeGitDirA],
      [worktreeRootB, worktreeGitDirB],
    ]) {
      fs.writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n', 'utf8');
      fs.writeFileSync(path.join(worktreeGitDir, 'gitdir'), path.join(worktreeRoot, '.git'), 'utf8');
    }
    assert(defaultStateFilePath(repositoryRoot) === path.join(commonGitDir, STATE_FILE_NAME), '主工作树状态路径错误');
    assert(defaultStateFilePath(worktreeRootA) === path.join(worktreeGitDirA, STATE_FILE_NAME), '绝对 worktree 指针解析错误');
    assert(defaultStateFilePath(worktreeRootB) === path.join(worktreeGitDirB, STATE_FILE_NAME), '相对 worktree 指针解析错误');
    const fixtureState = (summary, startedAt) => ({
      version: 1,
      summary,
      startedAt,
      phases: {},
      phaseHistory: {},
      steps: [],
    });
    fs.writeFileSync(
      path.join(commonGitDir, STATE_FILE_NAME),
      `${JSON.stringify(fixtureState('主工作树迭代', '2026-07-17T23:00:00.000Z'))}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(worktreeGitDirA, STATE_FILE_NAME),
      `${JSON.stringify(fixtureState('工作树甲迭代', '2026-07-17T23:01:00.000Z'))}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(worktreeGitDirB, STATE_FILE_NAME),
      `${JSON.stringify(fixtureState('工作树乙迭代', '2026-07-17T23:02:00.000Z'))}\n`,
      'utf8',
    );
    const activeLocations = activeIterationLocations(worktreeRootA);
    assert(activeLocations.length === 3, '未发现三个并行工作树迭代');
    assert(new Set(activeLocations.map((location) => location.worktreeRoot)).size === 3, '并行迭代工作树未隔离');
    start({ summary: '验证迭代计时记录器', at: '2026-07-18T00:00:00+08:00' });
    expectError(
      () => start({ summary: '不应覆盖进行中的记录', at: '2026-07-18T00:01:00+08:00' }),
      '已有进行中的迭代',
    );
    mark('validation-start', { at: '2026-07-18T00:10:00+08:00' });
    mark('development-end', { at: '2026-07-18T00:11:00+08:00' });
    mark('development-end', { at: '2026-07-18T00:12:00+08:00' });
    mark('validation-end', { at: '2026-07-18T00:20:00+08:00' });
    mark('validation-end', { at: '2026-07-18T00:21:00+08:00' });
    assert(readState().phaseHistory['validation-end'].length === 1, 'validation-end 更新历史缺失');
    stepStart({ label: '检查文档', at: '2026-07-18T00:15:00+08:00' });
    stepEnd({ label: '检查文档', at: '2026-07-18T00:16:30+08:00' });
    expectError(
      () => finish({ status: 'completed', at: '2026-07-18T00:22:00+08:00' }),
      '需要重启服务时缺少阶段',
    );
    finish({ 'no-restart': true, status: 'completed', at: '2026-07-18T00:22:00+08:00' });
    start({ summary: '验证服务重启计时', at: '2026-07-18T01:00:00+08:00' });
    mark('development-end', { at: '2026-07-18T01:05:00+08:00' });
    mark('validation-start', { at: '2026-07-18T01:05:00+08:00' });
    mark('validation-end', { at: '2026-07-18T01:06:00+08:00' });
    mark('restart-start', { at: '2026-07-18T01:07:00+08:00' });
    stepStart({ label: '安全退出游戏', at: '2026-07-18T01:07:10+08:00' });
    stepEnd({ label: '安全退出游戏', at: '2026-07-18T01:07:40+08:00' });
    mark('restart-end', { at: '2026-07-18T01:08:00+08:00' });
    finish({ status: 'completed', at: '2026-07-18T01:09:00+08:00' });
    const output = fs.readFileSync(process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT, 'utf8');
    const required = [
      '验证迭代计时记录器',
      '12分0秒',
      '11分0秒',
      '1分30秒',
      '未影响运行服务',
      '验证服务重启计时',
      '安全退出游戏',
      '30秒',
    ];
    for (const value of required) {
      if (!output.includes(value)) throw new Error(`自检输出缺少: ${value}`);
    }
    delete process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT;
    process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY = path.join(directory, 'record-files');
    start({ summary: '验证独立迭代记录文件', at: '2026-07-18T03:00:00+08:00' });
    mark('development-end', { at: '2026-07-18T03:05:00+08:00' });
    mark('validation-start', { at: '2026-07-18T03:05:00+08:00' });
    mark('validation-end', { at: '2026-07-18T03:06:00+08:00' });
    finish({ 'no-restart': true, status: 'completed', at: '2026-07-18T03:07:00+08:00' });
    const recordFiles = fs.readdirSync(process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY);
    assert(
      recordFiles.length === 1 && /^\d{8}-\d{6}-[0-9a-f]{10}\.md$/.test(recordFiles[0]),
      '独立迭代记录文件数量或命名错误',
    );
    const standaloneRecord = fs.readFileSync(
      path.join(process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY, recordFiles[0]),
      'utf8',
    );
    assert(standaloneRecord.startsWith('# 迭代耗时记录\n\n'), '独立迭代记录标题缺失');
    assert(standaloneRecord.includes('验证独立迭代记录文件'), '独立迭代记录内容缺失');

    const commandIterationStart = new Date(Date.now() - 5000);
    start({ summary: '验证命令级细粒度耗时记录', mode: 'daily-log', at: commandIterationStart.toISOString() });
    assert(readState().mode === 'daily-log', '每日日志迭代模式未保存');
    const successfulCommand = await runCommand({
      label: '成功命令',
      category: 'test',
      cwd: directory,
      at: commandIterationStart.toISOString(),
    }, [process.execPath, '-e', 'process.exit(0)']);
    assert(successfulCommand.status === 'completed' && successfulCommand.exitCode === 0, '成功命令状态错误');
    const failedCommand = await runCommand({
      label: '失败命令',
      category: 'test',
      cwd: directory,
      at: commandIterationStart.toISOString(),
    }, [process.execPath, '-e', 'process.exit(7)']);
    assert(failedCommand.status === 'failed' && failedCommand.exitCode === 7, '失败命令状态或退出码错误');
    const interruptedCommand = await runCommand({
      label: '信号中断命令',
      category: 'test',
      cwd: directory,
      at: commandIterationStart.toISOString(),
    }, [process.execPath, '-e', "process.kill(process.pid, 'SIGTERM')"]);
    assert(interruptedCommand.status === 'interrupted' && interruptedCommand.signal === 'SIGTERM', '信号中断命令状态错误');
    const overlapStart = new Date(commandIterationStart.getTime() + 1000).toISOString();
    const overlapAEnd = new Date(commandIterationStart.getTime() + 2200).toISOString();
    const overlapBStart = new Date(commandIterationStart.getTime() + 1600).toISOString();
    const overlapBEnd = new Date(commandIterationStart.getTime() + 2800).toISOString();
    stepStart({ label: '并行活动甲', category: 'test', at: overlapStart });
    stepStart({ label: '并行活动乙', category: 'test', at: overlapBStart });
    stepEnd({ label: '并行活动甲', at: overlapAEnd });
    stepEnd({ label: '并行活动乙', at: overlapBEnd });
    stepStart({ label: '被中断活动', category: 'test', at: new Date(commandIterationStart.getTime() + 3000).toISOString() });
    stepEnd({ label: '被中断活动', status: 'interrupted', error: '自测夹具模拟中断', at: new Date(commandIterationStart.getTime() + 3400).toISOString() });
    mark('development-end', { at: new Date().toISOString() });
    mark('validation-start', { at: new Date().toISOString() });
    mark('validation-end', { at: new Date().toISOString() });
    const commandFinishAt = new Date(Date.now() + 10).toISOString();
    finish({ 'no-restart': true, status: 'completed', at: commandFinishAt });
    const commandRecordFiles = fs.readdirSync(process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY);
    assert(commandRecordFiles.length === 2, '命令级测试记录文件数量错误');
    const commandRecord = commandRecordFiles
      .map((file) => fs.readFileSync(path.join(process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY, file), 'utf8'))
      .find((content) => content.includes('验证命令级细粒度耗时记录'));
    assert(commandRecord, '命令级记录内容缺失');
    for (const value of ['每日日志迭代', '成功命令', '失败命令', '信号中断命令', 'exit=7', 'signal=SIGTERM', 'interrupted', '并行重叠', '未记录空档']) {
      assert(commandRecord.includes(value), `命令级自检输出缺少: ${value}`);
    }
  } finally {
    if (previousState === undefined) delete process.env.GRASP_RAT_ITERATION_TIMING_STATE;
    else process.env.GRASP_RAT_ITERATION_TIMING_STATE = previousState;
    if (previousDocument === undefined) delete process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT;
    else process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT = previousDocument;
    if (previousDocumentDirectory === undefined) delete process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY;
    else process.env.GRASP_RAT_ITERATION_TIMING_DOCUMENT_DIRECTORY = previousDocumentDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return 'Iteration timing self-test: ok';
}

async function main() {
  try {
    const { positional, options, commandArgs } = parseArgs(process.argv.slice(2));
    if (options['self-test'] || positional[0] === '--self-test') {
      console.log(await selfTest());
      return;
    }
    const command = positional[0];
    let result;
    if (command === 'start') result = start(options);
    else if (command === 'mark') result = mark(positional[1], options);
    else if (command === 'step-start') result = stepStart(options);
    else if (command === 'step-end') result = stepEnd(options);
    else if (command === 'run') {
      const runResult = await runCommand(options, commandArgs);
      console.log(formatRunResult(runResult));
      process.exitCode = runResult.exitCode || 0;
      return;
    }
    else if (command === 'status') result = status(options);
    else if (command === 'finish') result = finish(options);
    else throw new Error(usage());
    console.log(result);
  } catch (error) {
    console.error(`Iteration timing error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Iteration timing error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  elapsedMs,
  formatDuration,
  formatTimestamp,
  activeIterationLocations,
  activityMetrics,
  defaultStateFilePath,
  recordFileName,
  renderRecord,
  resolveGitDir,
  runCommand,
};
