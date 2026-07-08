#!/usr/bin/env node
'use strict';

const path = require('path');
const { summarizeAudit: auditCanary } = require('./browserless-canary-audit');
const { auditDeployment } = require('./browserless-deployment-audit');

const DEFAULT_PROFILES = ['read-only', 'movement-only', 'profit', 'combat-dry-run', 'combat-live'];

function parseArgs(argv) {
  const out = {
    logDir: '/var/log/grasp-rat-browserless',
    day: new Date().toISOString().slice(0, 10),
    profiles: DEFAULT_PROFILES.slice(),
    includeStop: true,
    skipDeployment: false,
    skipSystemctl: false,
    unitPath: '',
    envPath: '',
    deploymentEnvMode: 'any',
    dataDir: '',
    deploymentLogDir: '',
    json: false,
    failOnIncomplete: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--log-dir') out.logDir = argv[++i] || out.logDir;
    else if (arg === '--day') out.day = argv[++i] || out.day;
    else if (arg === '--profiles') out.profiles = String(argv[++i] || '').split(',').map(item => item.trim()).filter(Boolean);
    else if (arg === '--profile') out.profiles.push(argv[++i] || '');
    else if (arg === '--no-stop') out.includeStop = false;
    else if (arg === '--skip-deployment') out.skipDeployment = true;
    else if (arg === '--skip-systemctl') out.skipSystemctl = true;
    else if (arg === '--unit') out.unitPath = argv[++i] || '';
    else if (arg === '--env') out.envPath = argv[++i] || '';
    else if (arg === '--deployment-env-mode') out.deploymentEnvMode = argv[++i] || out.deploymentEnvMode;
    else if (arg === '--data-dir') out.dataDir = argv[++i] || '';
    else if (arg === '--deployment-log-dir') out.deploymentLogDir = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-incomplete') out.failOnIncomplete = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  out.profiles = Array.from(new Set(out.profiles.filter(Boolean)));
  return out;
}

function failedKeys(report) {
  return (report?.failed || []).map(item => item.key).join(',') || '';
}

function canaryEvidenceSummary(report) {
  const parts = [];
  const finalEvent = report?.finalEvent || null;
  const runWindow = report?.runWindow || null;
  const counts = report?.counts || {};
  if (report?.runId || finalEvent?.runId) {
    parts.push(`runId=${report.runId || finalEvent.runId}`);
  }
  if (finalEvent?.type) {
    parts.push(`final=${finalEvent.type}@${finalEvent.at || 'missing'}`);
  }
  if (runWindow?.applied) {
    parts.push(`window=${runWindow.startedAt || 'missing'}..${runWindow.completedAt || 'missing'}`);
  }
  parts.push(`decisions=${Number(counts.decisions || 0)}`);
  parts.push(`movement=${Number(counts.movementCommand || 0)}`);
  parts.push(`shoot=${Number(counts.shootCommand || 0)}`);
  if (Number(counts.combatDryRun || 0) || Number(counts.combatLive || 0)) {
    parts.push(`combat=${Number(counts.combatDryRun || 0) + Number(counts.combatLive || 0)}`);
  }
  if (Number(counts.combatDryRunTarget || 0) || Number(counts.combatLiveTarget || 0)) {
    parts.push(`combatTargets=${Number(counts.combatDryRunTarget || 0) + Number(counts.combatLiveTarget || 0)}`);
  }
  if (Number(counts.explicitStop || 0)) {
    parts.push(`explicitStop=${Number(counts.explicitStop || 0)}`);
  }
  return parts.join(', ');
}

function canarySectionSummary(profile, report, options = {}) {
  const label = options.requireStop ? `${profile} forced-stop` : `${profile} canary`;
  const evidence = canaryEvidenceSummary(report);
  if (report.ok) return `${label} audit passed${evidence ? ` (${evidence})` : ''}`;
  return `${label} audit failed: ${failedKeys(report)}${evidence ? ` (${evidence})` : ''}`;
}

function buildAcceptanceReport(options = {}, deps = {}) {
  const logDir = path.resolve(String(options.logDir || '/var/log/grasp-rat-browserless'));
  const day = String(options.day || new Date().toISOString().slice(0, 10));
  const profiles = Array.isArray(options.profiles) && options.profiles.length ? options.profiles : DEFAULT_PROFILES;
  const canaryAudit = deps.canaryAudit || auditCanary;
  const deploymentAudit = deps.deploymentAudit || auditDeployment;
  const sections = [];

  if (!options.skipDeployment) {
    const deployment = deploymentAudit({
      unitPath: options.unitPath || undefined,
      envPath: options.envPath || undefined,
      envMode: options.deploymentEnvMode || 'any',
      dataDir: options.dataDir || undefined,
      logDir: options.deploymentLogDir || undefined,
      skipSystemctl: Boolean(options.skipSystemctl)
    }, deps);
    sections.push({
      key: 'deployment',
      kind: 'deployment',
      ok: Boolean(deployment.ok),
      summary: deployment.ok ? 'deployment audit passed' : `deployment audit failed: ${failedKeys(deployment)}`,
      report: deployment
    });
  }

  for (const profile of profiles) {
    const report = canaryAudit({
      logDir,
      day,
      profile
    });
    sections.push({
      key: `canary:${profile}`,
      kind: 'canary',
      profile,
      ok: Boolean(report.ok),
      summary: canarySectionSummary(profile, report),
      report
    });
  }

  if (options.includeStop !== false) {
    const report = canaryAudit({
      logDir,
      day,
      profile: 'read-only',
      requireStop: true
    });
    sections.push({
      key: 'canary:read-only:forced-stop',
      kind: 'canary',
      profile: 'read-only',
      requireStop: true,
      ok: Boolean(report.ok),
      summary: canarySectionSummary('read-only', report, { requireStop: true }),
      report
    });
  }

  const failed = sections.filter(section => !section.ok);
  return {
    ok: failed.length === 0,
    day,
    logDir,
    generatedAt: new Date().toISOString(),
    profiles,
    includeStop: options.includeStop !== false,
    skipDeployment: Boolean(options.skipDeployment),
    deploymentEnvMode: options.deploymentEnvMode || 'any',
    sections,
    failed: failed.map(section => ({
      key: section.key,
      summary: section.summary
    }))
  };
}

function formatHuman(report) {
  const lines = [
    `Browserless acceptance report: ${report.ok ? 'ok' : 'incomplete'}`,
    `Day: ${report.day}`,
    `Logs: ${report.logDir}`
  ];
  for (const section of report.sections) {
    lines.push(`- ${section.ok ? 'ok' : 'missing'} ${section.key}: ${section.summary}`);
  }
  return lines.join('\n');
}

function usage() {
  return [
    'Usage: node scripts/browserless-acceptance-report.js [--log-dir <dir>] [--day YYYY-MM-DD] [--profiles a,b] [--no-stop] [--skip-deployment] [--skip-systemctl] [--deployment-env-mode safe|live|any] [--json] [--fail-on-incomplete]',
    '',
    'Aggregates browserless deployment and staged canary audit results for cutover review.',
    'Defaults require deployment, read-only forced-stop, and all staged canary profiles. Deployment env mode defaults to any so final reports can run after live canary env changes.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = buildAcceptanceReport(args);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatHuman(report));
  if (args.failOnIncomplete && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PROFILES,
  buildAcceptanceReport,
  canaryEvidenceSummary,
  canarySectionSummary,
  formatHuman,
  parseArgs
};
