#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
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

function usage() {
  return [
    'Usage:',
    '  node scripts/iteration-timing.js start --summary <中文一句话> [--at <ISO时间>]',
    '  node scripts/iteration-timing.js mark <阶段> [--at <ISO时间>]',
    '  node scripts/iteration-timing.js step-start --label <步骤名> [--at <ISO时间>]',
    '  node scripts/iteration-timing.js step-end --label <步骤名> [--at <ISO时间>]',
    '  node scripts/iteration-timing.js status [--all]',
    '  node scripts/iteration-timing.js finish [--no-restart] [--status completed|blocked] [--at <ISO时间>]',
    '  node scripts/iteration-timing.js --self-test',
    '',
    '阶段: development-end, validation-start, validation-end, restart-start, restart-end',
  ].join('\n');
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
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
  return { positional, options };
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
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readStateFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeState(state) {
  const file = stateFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
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
    version: 2,
    summary: validateSummary(options.summary),
    startedAt: parseTimestamp(options.at),
    workspaceRoot: WORKSPACE_ROOT,
    phases: {},
    phaseHistory: {},
    steps: [],
  };
  writeState(state);
  return [
    `迭代计时已开始: ${state.summary}`,
    `开发开始: ${formatTimestamp(state.startedAt)}`,
    `迭代工作区: ${WORKSPACE_ROOT}`,
  ].join('\n');
}

function mark(phase, options) {
  if (!PHASE_NAMES.has(phase)) throw new Error(`未知阶段: ${phase}`);
  const state = readState();
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
  writeState(state);
  return `${phase}${previous ? '（已更新）' : ''}: ${formatTimestamp(state.phases[phase])}`;
}

function stepStart(options) {
  const state = readState();
  const label = String(options.label || '').trim();
  if (!label) throw new Error('必须提供 --label');
  if (state.steps.some((step) => step.label === label)) throw new Error(`步骤 ${label} 已存在`);
  state.steps.push({ label, start: parseTimestamp(options.at), end: null });
  writeState(state);
  return `步骤开始: ${label}`;
}

function stepEnd(options) {
  const state = readState();
  const label = String(options.label || '').trim();
  const step = state.steps.find((candidate) => candidate.label === label);
  if (!step) throw new Error(`找不到步骤: ${label}`);
  if (step.end) throw new Error(`步骤 ${label} 已结束`);
  step.end = parseTimestamp(options.at);
  if (new Date(step.end) < new Date(step.start)) throw new Error(`步骤 ${label} 的结束时间早于开始时间`);
  writeState(state);
  return `步骤结束: ${label}（${formatDuration(elapsedMs(step.start, step.end))}）`;
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

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderRecord(state, options, finishedAt) {
  const developmentEnd = state.phases['development-end'];
  const validationStart = state.phases['validation-start'];
  const validationEnd = state.phases['validation-end'];
  const restartStart = state.phases['restart-start'];
  const restartEnd = state.phases['restart-end'];
  const statusLabel = options.status === 'blocked' ? '受阻结束' : '完成';
  const lines = [
    `## ${formatTimestamp(state.startedAt)} — ${state.summary}`,
    '',
    `- 状态：${statusLabel}`,
    `- 记录完成：${formatTimestamp(finishedAt)}`,
    '',
    '| 阶段 | 开始 | 结束 | 耗时 |',
    '| --- | --- | --- | ---: |',
    `| 开发（含方案设计） | ${formatTimestamp(state.startedAt)} | ${formatTimestamp(developmentEnd)} | ${formatDuration(elapsedMs(state.startedAt, developmentEnd))} |`,
    `| 测试验证 | ${formatTimestamp(validationStart)} | ${formatTimestamp(validationEnd)} | ${formatDuration(elapsedMs(validationStart, validationEnd))} |`,
  ];
  if (options['no-restart']) {
    lines.push('| 服务重启 | 不适用 | 不适用 | 未影响运行服务 |');
  } else {
    lines.push(`| 服务重启 | ${formatTimestamp(restartStart)} | ${formatTimestamp(restartEnd)} | ${formatDuration(elapsedMs(restartStart, restartEnd))} |`);
  }
  if (state.steps.length) {
    lines.push('', '### 细分步骤', '', '| 步骤 | 开始 | 结束 | 耗时 |', '| --- | --- | --- | ---: |');
    for (const step of state.steps) {
      lines.push(`| ${escapeCell(step.label)} | ${formatTimestamp(step.start)} | ${formatTimestamp(step.end)} | ${formatDuration(elapsedMs(step.start, step.end))} |`);
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
      '本文件按时间顺序记录每次项目迭代的开发、测试验证和服务重启耗时。时间统一使用 Asia/Shanghai（UTC+8）。',
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
  const state = readState();
  const status = options.status || 'completed';
  if (!['completed', 'blocked'].includes(status)) throw new Error('--status 只能是 completed 或 blocked');
  options.status = status;
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
}

function statusDetails(state, location) {
  return {
    workspaceRoot: path.dirname(location.worktreeRoot),
    sourceWorktree: location.worktreeRoot,
    stateFile: location.stateFile,
    summary: state.summary,
    startedAt: formatTimestamp(state.startedAt),
    phases: Object.fromEntries(Object.entries(state.phases).map(([key, value]) => [key, formatTimestamp(value)])),
    steps: state.steps.map((step) => ({
      label: step.label,
      start: formatTimestamp(step.start),
      end: step.end ? formatTimestamp(step.end) : null,
    })),
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

function selfTest() {
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

function main() {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    if (options['self-test'] || positional[0] === '--self-test') {
      console.log(selfTest());
      return;
    }
    const command = positional[0];
    let result;
    if (command === 'start') result = start(options);
    else if (command === 'mark') result = mark(positional[1], options);
    else if (command === 'step-start') result = stepStart(options);
    else if (command === 'step-end') result = stepEnd(options);
    else if (command === 'status') result = status(options);
    else if (command === 'finish') result = finish(options);
    else throw new Error(usage());
    console.log(result);
  } catch (error) {
    console.error(`Iteration timing error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  elapsedMs,
  formatDuration,
  formatTimestamp,
  activeIterationLocations,
  defaultStateFilePath,
  recordFileName,
  renderRecord,
  resolveGitDir,
};
