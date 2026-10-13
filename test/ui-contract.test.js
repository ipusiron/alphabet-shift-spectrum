'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

function loadMessages() {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'messages.js'), 'utf8'), context);
  return context.globalThis.AlphabetShiftMessages;
}

test('runtime CSP does not allow inline script or style', () => {
  const csp = html.match(/Content-Security-Policy" content="([^"]+)/)?.[1] ?? '';
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("style-src 'self'"));
  assert.ok(!csp.includes("'unsafe-inline'"));
});

test('only implemented tabs are exposed', () => {
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.ok(!html.includes('Tab3'));
  assert.ok(!html.includes('準備中'));
});

test('logic, messages, and UI scripts load in dependency order', () => {
  assert.ok(html.indexOf('logic.js') < html.indexOf('messages.js'));
  assert.ok(html.indexOf('messages.js') < html.indexOf('script.js'));
});

test('Japanese and English dictionaries have identical keys', () => {
  const messages = loadMessages();
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.ja).sort());
});

test('all static i18n keys exist in both dictionaries', () => {
  const messages = loadMessages();
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)]
    .map((match) => match[1]);
  for (const key of keys) {
    assert.equal(typeof messages.ja[key], 'string', `missing ja.${key}`);
    assert.equal(typeof messages.en[key], 'string', `missing en.${key}`);
  }
});

test('language changes rerender every derived result', () => {
  const switchBody = script.match(/function switchLanguage\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(switchBody.includes('applyStaticTranslations()'));
  assert.ok(switchBody.includes('renderDynamicResults()'));
});

test('input mutation invalidates stale analysis', () => {
  const handlerBody = script.match(/function handleInputChange\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(handlerBody.includes('currentText !== appState.normalizedText'));
  assert.ok(handlerBody.includes('clearAnalysis()'));
});

test('analysis view exposes contribution evidence and the sensitivity lab', () => {
  assert.ok(html.includes('id="chi-contribution-results"'));
  assert.ok(html.includes('id="sensitivity-form"'));
  assert.ok(html.includes('id="sensitivity-adjust"'));
  assert.ok(html.includes('id="copy-summary-btn"'));
  assert.ok(html.includes('id="copy-fallback-text"'));
});

test('sensitivity inputs rerender on every input mutation', () => {
  assert.ok(script.includes("document.getElementById('sensitivity-form').addEventListener('input', handleSensitivityMutation)"));
  const mutationBody = script.match(/function handleSensitivityMutation\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(mutationBody.includes('renderSensitivityLab()'));
  assert.ok(mutationBody.includes('renderMonteCarloResult()'));
  assert.ok(mutationBody.includes('renderRecordSection()'));
  const renderBody = script.match(/function renderDynamicResults\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(renderBody.includes('renderContributionResults()'));
  assert.ok(renderBody.includes('renderSensitivityLab()'));
  assert.ok(renderBody.includes('renderMonteCarloResult()'));
  assert.ok(renderBody.includes('renderCopyControls()'));
  assert.ok(renderBody.includes('renderActiveProfile()'));
  assert.ok(renderBody.includes('renderRecordSection()'));
});

test('reference profile controls invalidate stale rankings and feed the core calculation', () => {
  assert.ok(html.includes('id="profile-select"'));
  assert.ok(html.includes('id="profile-corpus"'));
  assert.ok(script.includes("document.getElementById('profile-select').addEventListener('change', handleProfileMutation)"));
  assert.ok(script.includes("document.getElementById('profile-corpus').addEventListener('input', handleProfileMutation)"));
  const generateBody = script.match(/function handleGenerate\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(generateBody.includes('readReferenceProfile()'));
  assert.ok(generateBody.includes('referenceProfile.frequencies'));
  const profileBody = script.match(/function handleProfileMutation\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(profileBody.includes('clearAnalysis()'));
});

test('analysis records expose file controls and are built from aggregate counts', () => {
  for (const id of ['record-save-btn', 'record-load-btn', 'record-file', 'record-clear-btn', 'record-results']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  const recordBody = script.match(/function buildCurrentAnalysisRecord\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(recordBody.includes('Core.calculateFrequency(appState.normalizedText)'));
  assert.ok(recordBody.includes('Core.createAnalysisRecord'));
  assert.ok(!recordBody.includes('cipher-input'));
  const importBody = script.match(/async function handleRecordFile\(event\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(importBody.includes('Core.parseAnalysisRecord'));
});

test('Monte Carlo comparison is explicit, seeded, and manually triggered', () => {
  assert.ok(html.includes('id="monte-carlo-form"'));
  assert.ok(html.includes('id="monte-carlo-seed"'));
  assert.ok(html.includes('id="monte-carlo-run"'));
  const handlerBody = script.match(/function handleMonteCarloSubmit\(event\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(handlerBody.includes('Core.createThresholdSensitivitySeries'));
  assert.ok(handlerBody.includes('Core.simulateBinomialUpperTail'));
});

test('copied analysis summary is built from structured results rather than plaintext', () => {
  const summaryBody = script.match(/function buildAnalysisSummaryText\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.ok(summaryBody.includes('Core.createAnalysisSummary'));
  assert.ok(!summaryBody.includes('normalizedText'));
  assert.ok(!summaryBody.includes('cipher-input'));
});

test('README files exist for both languages', () => {
  assert.ok(fs.existsSync(path.join(root, 'README.md')));
  assert.ok(fs.existsSync(path.join(root, 'README.en.md')));
});
