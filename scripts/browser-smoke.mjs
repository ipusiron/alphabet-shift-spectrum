import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith('--')) ?? 'http://127.0.0.1:8765/';
const width = Number(args.find((arg) => arg.startsWith('--width='))?.split('=')[1] ?? 390);
const height = Number(args.find((arg) => arg.startsWith('--height='))?.split('=')[1] ?? 844);
const screenshot = args.find((arg) => arg.startsWith('--screenshot='))?.slice('--screenshot='.length);
const assetsDirectory = args.find((arg) => arg.startsWith('--assets='))?.slice('--assets='.length);
const defaultBrowser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserPath = process.env.DAY107_BROWSER_PATH ?? defaultBrowser;
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const sample = [
  'WKH TXLFN EURZQ IRA MXPSV RYHU WKH ODCB GRJ',
  'WKLV HGXFDWLRQDO VDPSOH LV ORQJ HQRXJK WR FRPSDUH OHWWHU IUHTXHQFLHV',
  'IUHTXHQFB DORQH FDQQRW SURYH WKH FRUUHFW SODLQWHAW'
].join(' ');

await access(browserPath);
const profile = await mkdtemp(path.join(os.tmpdir(), 'day107-browser-'));
const downloads = path.join(profile, 'downloads');
await mkdir(downloads, { recursive: true });
const browser = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-background-networking',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(endpoint, options) {
  const response = await fetch(endpoint, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${endpoint}`);
  return response.json();
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await delay(100);
    }
  }
  throw new Error('Browser debugging endpoint did not become ready.');
}

function createCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const eventWaiters = new Map();

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    const waiters = eventWaiters.get(message.method) ?? [];
    eventWaiters.delete(message.method);
    waiters.forEach((resolve) => resolve(message.params));
  });

  return {
    opened,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    waitFor(method) {
      return new Promise((resolve) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolve);
        eventWaiters.set(method, waiters);
      });
    }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function capture(cdp, targetPath) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(result.data, 'base64'));
}

let cdp;
try {
  await waitForDebugger();
  const target = await fetchJson(
    `http://127.0.0.1:${port}/json/new?about%3Ablank`,
    { method: 'PUT' }
  );
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.opened;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloads
  });
  if (url.startsWith('http')) {
    await cdp.send('Browser.grantPermissions', {
      origin: new URL(url).origin,
      permissions: ['clipboardReadWrite']
    });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 500
  });
  await cdp.send('Page.navigate', { url });
  let pageReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    pageReady = await evaluate(cdp, `document.readyState === 'complete' && Boolean(document.getElementById('cipher-input'))`);
    if (pageReady) break;
    await delay(100);
  }
  if (!pageReady) {
    const diagnostics = await evaluate(cdp, `({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      body: document.body?.innerText?.slice(0, 200)
    })`);
    throw new Error(`Application did not load: ${url} ${JSON.stringify(diagnostics)}`);
  }

  await evaluate(cdp, `(() => {
    const input = document.getElementById('cipher-input');
    input.value = ${JSON.stringify(sample)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('generate-btn').click();
    return true;
  })()`);

  const generated = await evaluate(cdp, `(() => ({
    cards: document.querySelectorAll('.shift-card').length,
    heatmapCells: document.querySelectorAll('.heatmap-cell').length,
    rankItems: document.querySelectorAll('.rank-list li').length,
    contributionCards: document.querySelectorAll('.contribution-card').length,
    contributionRows: document.querySelectorAll('.contribution-table tbody tr').length,
    sensitivityRows: document.querySelectorAll('.sensitivity-table tbody tr').length,
    sensitivityBaseThreshold: document.querySelector('.sensitivity-table tbody tr[data-factor="1"]')?.dataset.threshold,
    sensitivitySampleSize: document.getElementById('sensitivity-n').value,
    copyEnabled: !document.getElementById('copy-summary-btn').disabled,
    threshold: document.getElementById('rare-threshold').textContent,
    message: document.getElementById('input-message').textContent,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }))()`);

  if (
    generated.cards !== 26
    || generated.heatmapCells !== 676
    || generated.rankItems !== 5
    || generated.contributionCards !== 3
    || generated.contributionRows !== 15
    || generated.sensitivityRows !== 3
    || generated.sensitivityBaseThreshold !== generated.threshold
    || generated.sensitivitySampleSize !== '138'
    || !generated.copyEnabled
  ) {
    throw new Error(`Unexpected generated counts: ${JSON.stringify(generated)}`);
  }
  if (generated.documentWidth > generated.viewportWidth) {
    throw new Error(`Page overflow: ${generated.documentWidth} > ${generated.viewportWidth}`);
  }

  await evaluate(cdp, `(() => {
    document.getElementById('tab2-button').click();
    const button = document.getElementById('copy-summary-btn');
    button.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await delay(500);
  const copyButtonPoint = await evaluate(cdp, `(() => {
    const button = document.getElementById('copy-summary-btn');
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (width <= 500) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: copyButtonPoint.x, y: copyButtonPoint.y }]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
  } else {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: copyButtonPoint.x,
      y: copyButtonPoint.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: copyButtonPoint.x,
      y: copyButtonPoint.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    });
  }
  const copyResult = await evaluate(cdp, `(async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = document.getElementById('copy-status').textContent.trim();
    if (status) return {
      status,
      fallbackVisible: !document.getElementById('copy-fallback').hidden,
      fallbackContainsInput: document.getElementById('copy-fallback-text').value.includes('WKH TXLFN')
    };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { status: '' };
  })()`);
  if (!copyResult.status) {
    throw new Error('Copy summary did not report a result.');
  }
  if (copyResult.fallbackContainsInput) {
    throw new Error(`Copy fallback exposed the input text: ${JSON.stringify(copyResult)}`);
  }
  if (!copyResult.status.includes('コピーしました') && !copyResult.fallbackVisible) {
    throw new Error(`Copy failure did not expose the manual fallback: ${JSON.stringify(copyResult)}`);
  }
  if (url.startsWith('http') && !copyResult.status.includes('コピーしました')) {
    throw new Error(`HTTP clipboard copy failed: ${JSON.stringify(copyResult)}`);
  }
  await evaluate(cdp, `(() => {
    document.getElementById('tab1-button').click();
    document.getElementById('copy-status').textContent = '';
    window.scrollTo(0, 0);
    return true;
  })()`);

  if (screenshot) {
    await evaluate(cdp, 'window.scrollTo(0, 0)');
    await delay(750);
    await capture(cdp, path.resolve(screenshot));
  }

  if (assetsDirectory) {
    await evaluate(cdp, `(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      return true;
    })()`);
    await delay(750);
    await capture(cdp, path.join(assetsDirectory, 'screenshot.png'));
    await evaluate(cdp, `(() => {
      document.getElementById('tab2-button').click();
      document.getElementById('rank-heading').scrollIntoView({ block: 'start' });
      return true;
    })()`);
    await delay(750);
    await capture(cdp, path.join(assetsDirectory, 'screenshot1.png'));
    await evaluate(cdp, `(() => {
      document.getElementById('sensitivity-heading').scrollIntoView({ block: 'start' });
      return true;
    })()`);
    await delay(750);
    await capture(cdp, path.join(assetsDirectory, 'screenshot2.png'));
  }

  const phase3 = await evaluate(cdp, `(async () => {
    document.getElementById('tab2-button').click();
    document.getElementById('monte-carlo-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true
    }));
    const monteCarloText = document.getElementById('monte-carlo-result').textContent;
    const monteCarloValues = document.querySelectorAll('.monte-carlo-condition, .monte-carlo-value').length;

    const core = globalThis.AlphabetShiftCore;
    const normalized = core.normalizeText(${JSON.stringify(sample)});
    const profile = core.createReferenceProfile('english');
    const thresholdInfo = {
      ...core.calculateRareLetterThreshold(normalized.length),
      n: normalized.length
    };
    const analyzedRows = core.analyzeRows(
      core.generateAllShifts(normalized),
      thresholdInfo.threshold,
      profile.frequencies
    );
    const sensitivitySettings = {
      sampleSize: Number(document.getElementById('sensitivity-n').value),
      pMax: Number(document.getElementById('sensitivity-p').value),
      familyAlpha: Number(document.getElementById('sensitivity-alpha').value),
      comparisonCount: Number(document.getElementById('sensitivity-comparisons').value),
      useBonferroni: document.getElementById('sensitivity-adjust').checked
    };
    const record = core.createAnalysisRecord({
      baseFrequency: core.calculateFrequency(normalized),
      analyzedRows,
      thresholdInfo,
      referenceProfile: profile,
      sensitivitySettings
    });
    const recordJson = JSON.stringify(record);
    const fileInput = document.getElementById('record-file');
    const transfer = new DataTransfer();
    transfer.items.add(new File([recordJson], 'analysis.json', { type: 'application/json' }));
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (document.querySelectorAll('.record-rank-list li').length === 5) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const recordLoadedStatus = document.getElementById('record-status').textContent;

    const profileSelect = document.getElementById('profile-select');
    profileSelect.value = 'custom';
    profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const customFieldsVisible = !document.getElementById('custom-profile-fields').hidden;
    const customCorpus = document.getElementById('profile-corpus');
    customCorpus.value = 'ETAOIN SHRDLU ETAOIN SHRDLU CUSTOM REFERENCE CORPUS';
    customCorpus.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('generate-btn').click();
    const customProfileLabel = document.getElementById('active-profile').textContent;
    const customCards = document.querySelectorAll('.shift-card').length;

    profileSelect.value = 'uniform';
    profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('generate-btn').click();
    const uniformScores = [...document.querySelectorAll('.rank-score')].map((item) => item.textContent);
    const saveEnabled = !document.getElementById('record-save-btn').disabled;
    document.getElementById('record-save-btn').click();

    return {
      monteCarloText,
      monteCarloValues,
      recordRows: document.querySelectorAll('.record-rank-list li').length,
      recordLoadedStatus,
      recordStatus: document.getElementById('record-status').textContent,
      recordTextIncludesPlaintext: recordJson.includes(normalized),
      customFieldsVisible,
      customProfileLabel,
      customCards,
      uniformUniqueScores: new Set(uniformScores).size,
      uniformProfileLabel: document.getElementById('active-profile').textContent,
      saveEnabled,
      monteCarloClearedAfterRegeneration: document.querySelectorAll('.monte-carlo-value').length === 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`);

  let downloadedRecord = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const files = await readdir(downloads);
    const jsonFile = files.find((file) => file.endsWith('.json'));
    if (jsonFile) {
      downloadedRecord = JSON.parse(await readFile(path.join(downloads, jsonFile), 'utf8'));
      break;
    }
    await delay(50);
  }
  phase3.downloadedRecord = Boolean(
    downloadedRecord
    && downloadedRecord.schema === 'alphabet-shift-spectrum-analysis'
    && downloadedRecord.version === 1
    && downloadedRecord.inputAggregate?.letterCount === 138
    && !JSON.stringify(downloadedRecord).includes(sample.replace(/[^A-Z]/g, ''))
  );

  if (
    phase3.monteCarloValues !== 4
    || !phase3.monteCarloText.includes('厳密値')
    || phase3.recordRows !== 5
    || !phase3.recordLoadedStatus.includes('再計算')
    || phase3.recordTextIncludesPlaintext
    || !phase3.customFieldsVisible
    || !phase3.customProfileLabel.includes('利用者コーパス')
    || phase3.customCards !== 26
    || phase3.uniformUniqueScores !== 1
    || !phase3.uniformProfileLabel.includes('均等分布')
    || !phase3.saveEnabled
    || !phase3.downloadedRecord
    || !phase3.monteCarloClearedAfterRegeneration
  ) {
    throw new Error(`Phase 3 controls failed: ${JSON.stringify(phase3)}`);
  }
  if (phase3.documentWidth > phase3.viewportWidth) {
    throw new Error(`Phase 3 page overflow: ${phase3.documentWidth} > ${phase3.viewportWidth}`);
  }

  const interaction = await evaluate(cdp, `(() => {
    document.getElementById('tab2-button').click();
    document.getElementById('language-toggle').click();
    const helpButton = document.getElementById('formula-help-btn');
    helpButton.focus();
    helpButton.click();
    const modal = document.getElementById('formula-modal');
    const modalOpened = !modal.hidden && document.activeElement.classList.contains('modal-close');
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const modalClosed = modal.hidden && document.activeElement.id === 'formula-help-btn';
    const adjustedThreshold = Number(document.querySelector('.sensitivity-table tbody tr[data-factor="1"]')?.dataset.threshold);
    const adjustment = document.getElementById('sensitivity-adjust');
    adjustment.checked = false;
    adjustment.dispatchEvent(new Event('input', { bubbles: true }));
    const unadjustedThreshold = Number(document.querySelector('.sensitivity-table tbody tr[data-factor="1"]')?.dataset.threshold);
    const sensitivityRows = document.querySelectorAll('.sensitivity-table tbody tr').length;
    const contributionHeading = document.getElementById('contribution-heading').textContent;
    const sensitivityN = document.getElementById('sensitivity-n');
    sensitivityN.value = '0';
    sensitivityN.dispatchEvent(new Event('input', { bubbles: true }));
    const invalidSensitivityMessage = document.getElementById('sensitivity-message').textContent;
    const invalidSensitivityRows = document.querySelectorAll('.sensitivity-table tbody tr').length;
    document.getElementById('sensitivity-reset').click();
    const resetSensitivityRows = document.querySelectorAll('.sensitivity-table tbody tr').length;
    const resetSensitivityN = sensitivityN.value;
    const input = document.getElementById('cipher-input');
    input.value += 'A';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      lang: document.documentElement.lang,
      analysisLabel: document.getElementById('tab2-button').textContent,
      modalOpened,
      modalClosed,
      modalHiddenAfterEscape: modal.hidden,
      activeAfterEscape: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
      adjustedThreshold,
      unadjustedThreshold,
      sensitivityRows,
      contributionHeading,
      invalidSensitivityMessage,
      invalidSensitivityRows,
      resetSensitivityRows,
      resetSensitivityN,
      staleCards: document.querySelectorAll('.shift-card').length,
      copyDisabledAfterInput: document.getElementById('copy-summary-btn').disabled,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`);

  if (interaction.lang !== 'en' || interaction.analysisLabel.trim() !== 'Analysis') {
    throw new Error(`Language switch failed: ${JSON.stringify(interaction)}`);
  }
  if (!interaction.modalOpened || !interaction.modalClosed) {
    throw new Error(`Modal focus behavior failed: ${JSON.stringify(interaction)}`);
  }
  if (
    interaction.sensitivityRows !== 3
    || interaction.unadjustedThreshold > interaction.adjustedThreshold
    || !interaction.contributionHeading.includes('contributions')
    || !interaction.invalidSensitivityMessage
    || interaction.invalidSensitivityRows !== 0
    || interaction.resetSensitivityRows !== 3
    || interaction.resetSensitivityN !== '138'
  ) {
    throw new Error(`Phase 2 analysis controls failed: ${JSON.stringify(interaction)}`);
  }
  if (interaction.staleCards !== 0) {
    throw new Error(`Stale cards were not cleared: ${interaction.staleCards}`);
  }
  if (!interaction.copyDisabledAfterInput) {
    throw new Error(`Copy summary remained enabled after input invalidation: ${JSON.stringify(interaction)}`);
  }
  if (interaction.documentWidth > interaction.viewportWidth) {
    throw new Error(`Page overflow after interaction: ${interaction.documentWidth} > ${interaction.viewportWidth}`);
  }

  process.stdout.write(`${JSON.stringify({ url, width, height, generated, copyResult, phase3, interaction })}\n`);
  await cdp.send('Browser.close');
} finally {
  if (!browser.killed) browser.kill();
  const tempRoot = await realpath(os.tmpdir());
  const resolvedProfile = path.resolve(profile);
  if (!resolvedProfile.startsWith(`${tempRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove unexpected browser profile: ${resolvedProfile}`);
  }
  await delay(500);
  await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
