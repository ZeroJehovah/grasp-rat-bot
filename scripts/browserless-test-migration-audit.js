#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { runStrategyModuleSelfTests } = require('../src/strategy/self-test');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_BASELINE = '03c5c8f^';
const LEGACY_EXPECTED_CASES = 349;
const RENAMED_CASES = new Map([
  [
    'new out-of-range afk target can be chased before stamina drop observed',
    'new out-of-range full-stamina afk target can be chased immediately'
  ],
  [
    'same first coin route keeps overlay metadata when single coin roi is higher',
    'same first weaker coin route stays preview-only when single coin roi is higher'
  ],
  [
    'same first coin route keeps overlay metadata near non-avoidance active',
    'same first weaker coin route stays preview-only near non-avoidance active'
  ]
]);

const LEGACY_PLATFORM_PATTERN = /browser preserved state|help modal|login control|page global|post-login zoom|tmpGame|hot update|native transport stall recovery|local session reset|snapshot no-self|session mismatch takeover|reload confirmation|requests page reload|external left user|exit audit reload|target whitelist URL defaults next to remote script/i;

function readGitFile(revision, file) {
  try {
    return childProcess.execFileSync('git', ['show', `${revision}:${file}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`cannot read ${revision}:${file}: ${detail}`);
  }
}

function extractTopLevelCases(source) {
  const start = source.indexOf('const cases = [');
  const end = source.indexOf('const resolvedCases = []', start);
  if (start < 0 || end < 0) throw new Error('cannot locate broad self-test case array');
  const lines = source.slice(start, end).split(/\r?\n/);
  const entries = [];
  const pattern = /^\t* {6}name:\s*'([^']+)'/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    entries.push({ name: match[1], line: index, body: '' });
  }
  for (let index = 0; index < entries.length; index += 1) {
    const nextLine = entries[index + 1]?.line ?? lines.length;
    entries[index].body = lines.slice(entries[index].line, nextLine).join('\n');
  }
  return entries;
}

function coverageArea(name) {
  const value = String(name || '').toLowerCase();
  if (/whitelist/.test(value)) return 'target-filtering';
  if (/stamina|daily budget|hourly limit|long-window/.test(value)) return 'stamina-budget';
  if (/combat|bullet|dodge|aim|fire|pressure|retreat|engage|trade estimate/.test(value)) return 'combat';
  if (/coin|route|profit|afk|drop|pickup|opportunit|bait|reward/.test(value)) return 'profit';
  if (/leave|exit|offline|login|session|reload|pending|websocket|transport|reconnect/.test(value)) return 'lifecycle-safety';
  if (/panel|display|summary|format|log|diagnos/.test(value)) return 'observability';
  return 'shared-runtime';
}

function disposition(entry) {
  if (LEGACY_PLATFORM_PATTERN.test(entry.name)) return 'browser-platform-replaced';
  if (/\bchoose\s*\(/.test(entry.body) || /\bbot\./.test(entry.body)) return 'merged-browserless-behavior';
  return 'shared-retained';
}

function countBy(items, selector) {
  const result = {};
  for (const item of items) {
    const key = selector(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function main() {
  const details = process.argv.includes('--details');
  const baselineSource = readGitFile(LEGACY_BASELINE, 'src/node/run-self-test.js');
  const currentSource = fs.readFileSync(path.join(ROOT, 'src/node/run-self-test.js'), 'utf8');
  const baseline = extractTopLevelCases(baselineSource);
  const current = extractTopLevelCases(currentSource);
  const currentNames = new Set(current.map(item => item.name));
  const retained = baseline.filter(item => currentNames.has(item.name));
  const renamed = baseline.filter(item => {
    const replacement = RENAMED_CASES.get(item.name);
    return replacement && currentNames.has(replacement);
  });
  const missing = baseline.filter(item => !currentNames.has(item.name)
    && !(RENAMED_CASES.get(item.name) && currentNames.has(RENAMED_CASES.get(item.name))));
  const baselineNames = new Set(baseline.map(item => item.name));
  const replacementNames = new Set(RENAMED_CASES.values());
  const added = current.filter(item => !baselineNames.has(item.name) && !replacementNames.has(item.name));
  const explicitBrowserless = current.filter(item => item.name.startsWith('browserless '));
  const strategy = runStrategyModuleSelfTests();
  const classifiedBaseline = baseline.map(item => ({
    name: item.name,
    replacement: RENAMED_CASES.get(item.name) || '',
    disposition: disposition(item),
    area: coverageArea(item.name)
  }));
  const dispositionCounts = countBy(classifiedBaseline, item => item.disposition);
  const legacyAreaCounts = countBy(
    classifiedBaseline.filter(item => item.disposition !== 'browser-platform-replaced'),
    item => item.area
  );
  const browserlessAreaCounts = countBy(explicitBrowserless, item => coverageArea(item.name));
  const uncoveredAreas = Object.keys(legacyAreaCounts).filter(area => !browserlessAreaCounts[area]);
  const ok = baseline.length === LEGACY_EXPECTED_CASES
    && missing.length === 0
    && uncoveredAreas.length === 0
    && strategy.success;
  const output = {
    ok,
    baseline: {
      revision: LEGACY_BASELINE,
      cases: baseline.length,
      expectedCases: LEGACY_EXPECTED_CASES,
      retainedByName: retained.length,
      renamedOrMerged: renamed.length,
      missing: missing.map(item => item.name)
    },
    current: {
      broadCases: current.length,
      explicitBrowserlessCases: explicitBrowserless.length,
      addedSinceBaseline: added.length,
      strategyCases: strategy.total,
      strategyPassed: strategy.passed,
      strategyFailed: strategy.failed
    },
    dispositions: dispositionCounts,
    legacyApplicableAreas: legacyAreaCounts,
    browserlessAreas: browserlessAreaCounts,
    uncoveredAreas,
    renamedCases: Object.fromEntries(RENAMED_CASES),
    ...(details ? { cases: classifiedBaseline } : {})
  };
  console.log(JSON.stringify(output, null, 2));
  if (!ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
}
