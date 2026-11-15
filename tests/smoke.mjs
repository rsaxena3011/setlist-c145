// UI smoke test: serves the app locally, drives it in headless Chrome, and
// asserts the demo-mode flows end to end. Expects DEMO MODE (Firebase not
// connected): results must be labelled LOCAL PARSER (stand-in), never as model
// output. Run: node tests/smoke.mjs
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ondv/node_modules/puppeteer-core');
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(path) || !path.startsWith(ROOT)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  const mode = await page.evaluate(() => window.__setlist?.mode);
  check('app boots in demo mode (Firebase not connected)', mode === 'demo', `mode=${mode}`);

  const statusText = await page.$eval('#firebase-status', (el) => el.textContent);
  check('status pill says demo mode', /not connected \(demo mode\)/.test(statusText), statusText);

  // Short brief flow
  await page.click('#load-short');
  await page.click('#generate');
  await page.waitForFunction(() => document.querySelectorAll('#results .shot').length >= 3, { timeout: 10000 });
  const short = await page.evaluate(() => ({
    engine: window.__setlist.lastEngine,
    shots: document.querySelectorAll('#results .shot').length,
    log: window.__setlist.log.map((e) => e.engineServed),
    badge: document.getElementById('engine-badge').textContent,
  }));
  check('short brief produces a shotlist', short.shots >= 3, `${short.shots} shot cards`);
  check('short brief labelled LOCAL PARSER stand-in, not a model', /LOCAL PARSER \(stand-in\)/.test(short.engine) && /stand-in/.test(short.badge), short.engine);
  check('routing log records the short run', short.log.some((e) => /LOCAL PARSER/.test(e)), short.log.join(' | '));

  await page.screenshot({ path: join(ROOT, 'tests/screenshots/short-brief.png') });

  // Long script flow
  await page.click('#load-long');
  await page.click('#generate');
  await page.waitForFunction(() => window.__setlist.log.length >= 2, { timeout: 10000 });
  const long = await page.evaluate(() => ({
    shots: document.querySelectorAll('#results .shot').length,
    callsheet: document.getElementById('results').textContent,
    logLen: window.__setlist.log.length,
  }));
  check('long script produces a multi-scene shotlist', long.shots >= 12, `${long.shots} shot cards`);
  check('long script shows a call sheet', /Call sheet/.test(long.callsheet) && /Scenes: 4/.test(long.callsheet));
  check('routing log has both runs', long.logLen === 2, `entries=${long.logLen}`);

  await page.screenshot({ path: join(ROOT, 'tests/screenshots/long-script.png') });

  // Save flow (demo mode: localStorage)
  await page.click('#save-shotlist');
  await page.waitForFunction(() => !/Nothing saved yet/.test(document.getElementById('saved-list').textContent), { timeout: 5000 });
  const saved = await page.$eval('#saved-list', (el) => el.textContent);
  check('save stores the shotlist in-browser in demo mode', /Multi-scene shotlist/.test(saved), saved.slice(0, 120));

  // On-device check button (VM Chrome: API missing in headless, or unavailable)
  await page.click('#check-device');
  await page.waitForFunction(() => document.getElementById('device-check-result').textContent.length > 10, { timeout: 10000 });
  const deviceText = await page.$eval('#device-check-result', (el) => el.textContent);
  check('on-device check reports honestly (no fake success)', /not available|unavailable|No on-device API/.test(deviceText), deviceText.slice(0, 120));

  // No page errors
  check('no page errors during the flows', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.close();
}
if (failures.length) { console.error(`\n${failures.length} SMOKE FAILURE(S): ${failures.join(', ')}`); process.exit(1); }
console.log('\nSMOKE: all checks passed.');
