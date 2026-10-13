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

test('README files exist for both languages', () => {
  assert.ok(fs.existsSync(path.join(root, 'README.md')));
  assert.ok(fs.existsSync(path.join(root, 'README.en.md')));
});
