import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
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
    threshold: document.getElementById('rare-threshold').textContent,
    message: document.getElementById('input-message').textContent,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }))()`);

  if (generated.cards !== 26 || generated.heatmapCells !== 676 || generated.rankItems !== 5) {
    throw new Error(`Unexpected generated counts: ${JSON.stringify(generated)}`);
  }
  if (generated.documentWidth > generated.viewportWidth) {
    throw new Error(`Page overflow: ${generated.documentWidth} > ${generated.viewportWidth}`);
  }

  if (screenshot) {
    await evaluate(cdp, 'window.scrollTo(0, 0)');
    await delay(150);
    await capture(cdp, path.resolve(screenshot));
  }

  if (assetsDirectory) {
    await evaluate(cdp, `(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      return true;
    })()`);
    await delay(150);
    await capture(cdp, path.join(assetsDirectory, 'screenshot.png'));
    await evaluate(cdp, `(() => {
      document.getElementById('tab2-button').click();
      document.getElementById('heatmap-heading').scrollIntoView({ block: 'start' });
      return true;
    })()`);
    await delay(150);
    await capture(cdp, path.join(assetsDirectory, 'screenshot1.png'));
    await evaluate(cdp, `(() => {
      document.getElementById('rare-heading').scrollIntoView({ block: 'start' });
      return true;
    })()`);
    await delay(150);
    await capture(cdp, path.join(assetsDirectory, 'screenshot2.png'));
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
      staleCards: document.querySelectorAll('.shift-card').length,
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
  if (interaction.staleCards !== 0) {
    throw new Error(`Stale cards were not cleared: ${interaction.staleCards}`);
  }
  if (interaction.documentWidth > interaction.viewportWidth) {
    throw new Error(`Page overflow after interaction: ${interaction.documentWidth} > ${interaction.viewportWidth}`);
  }

  process.stdout.write(`${JSON.stringify({ url, width, height, generated, interaction })}\n`);
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
