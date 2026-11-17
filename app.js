// SetList: on-set script-to-shotlist using Firebase AI Logic hybrid inference.
//
// Routing (the whole product idea):
//   short input (<= 600 chars) -> on-device first (Gemini Nano, ONLY_ON_DEVICE,
//     after initializeDeviceModel on the user's click). If the model is
//     unavailable the attempt is logged honestly and the cloud answers instead.
//   long input  (> 600 chars)  -> cloud only (Gemini 3.5 Flash-Lite, ONLY_IN_CLOUD)
//     for the full breakdown and call sheet.
// Every answer is logged with the engine that served it, the SDK-reported
// inferenceSource when available, and latency.
//
// LIVE MODE: firebase-config.js holds the real Firebase project (setlist-96961,
// free Spark plan), so the app runs real hybrid inference. If the config is
// removed, it falls back to the labelled local stand-in parser in demo mode:
// shotlists then come from the rule-based local parser (local-parser.js),
// labelled LOCAL PARSER (stand-in) everywhere. That label is load-bearing: the
// stand-in is never presented as Gemini Nano or cloud output.
//
// Firebase AI Logic is genuinely called in this file (getAI, getGenerativeModel
// with InferenceMode, initializeDeviceModel, generateContent, response
// .inferenceSource, App Check, Firestore) whenever a real config is present.
// Firebase JS SDK 12.19.0 (hybrid inference needs 12.5.0+).

import { FIREBASE_CONFIGURED, FIREBASE_CONFIG, RECAPTCHA_V3_SITE_KEY } from './firebase-config.js';
import { SHORT_BRIEF, LONG_SCRIPT, SHORT_MAX_CHARS } from './demo-inputs.js';
import { parseShotlistLocally, decideRoute } from './local-parser.js';

const CLOUD_MODEL = 'gemini-3.5-flash-lite';
const $ = (id) => document.getElementById(id);

let fb = null; // { app, ai, db } once Firebase is initialised, else null (demo mode)
let fbError = '';
let lastResult = null;
let lastEngine = '';
let lastInputLabel = 'pasted input';
const routingLog = [];
const savedLocalKey = 'setlist-saved-v1';

// ---------------------------------------------------------------- Firebase ---
async function initFirebase() {
  const statusEl = $('firebase-status');
  const noteEl = $('mode-note');
  if (!FIREBASE_CONFIGURED) {
    statusEl.textContent = 'Firebase: not connected (demo mode)';
    statusEl.className = 'pill pill-demo';
    noteEl.textContent = 'Demo mode: Firebase is not connected yet, so shotlists below come from the labelled local stand-in parser, not from Gemini Nano or the cloud. Connect a Firebase project (README steps) to run real hybrid inference.';
    return;
  }
  try {
    const { initializeApp } = await import('firebase/app');
    const { getAI, GoogleAIBackend } = await import('firebase/ai');
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    const { getFirestore } = await import('firebase/firestore');
    const app = initializeApp(FIREBASE_CONFIG);
    // App Check: debug provider on localhost (register the printed debug token in
    // the console), Fraud Defense (reCAPTCHA Enterprise) on the deployed site.
    // Classic reCAPTCHA v3 registration is deprecated in the console, so the
    // app is registered under Fraud Defense — use ReCaptchaEnterpriseProvider.
    // Enforced by the AI Logic guided setup; debug tokens are accepted for submissions.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_V3_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const db = getFirestore(app);
    fb = { app, ai, db };
    statusEl.textContent = 'Firebase: connected (live hybrid inference)';
    statusEl.className = 'pill pill-live';
    noteEl.textContent = '';
  } catch (e) {
    fbError = String((e && e.message) || e);
    statusEl.textContent = 'Firebase: config present but init failed (demo mode)';
    statusEl.className = 'pill pill-bad';
    noteEl.textContent = `Firebase init failed (${fbError}). Running in demo mode with the labelled local stand-in parser.`;
  }
}

// ------------------------------------------------------- Model + prompts -----
function buildPrompt(text, longForm) {
  const shape = `Respond with ONLY valid JSON matching this shape, no markdown, no extra text:
{"title": string, "shots": [{"n": number, "scene": string, "shot": string, "description": string, "camera": string, "durationSeconds": number}], "callSheet": {"scenes": number, "totalShots": number, "estRuntimeSeconds": number, "notes": [string]}}`;
  const brief = longForm
    ? 'Break down this full script into a shotlist and a call sheet. Cover every scene. Keep each shot practical for a small crew with one camera.'
    : 'Turn this short brief into a tight shotlist (3 to 5 shots) with a small call sheet. Keep it practical for a small crew with one camera.';
  return `${brief}\n\n${shape}\n\nSCRIPT OR BRIEF:\n${text}`;
}

function shotlistSchema(Schema) {
  const shot = Schema.object({
    properties: {
      n: Schema.integer(),
      scene: Schema.string(),
      shot: Schema.string(),
      description: Schema.string(),
      camera: Schema.string(),
      durationSeconds: Schema.integer(),
    },
    optionalProperties: [],
  });
  return Schema.object({
    properties: {
      title: Schema.string(),
      shots: Schema.array({ items: shot }),
      callSheet: Schema.object({
        properties: {
          scenes: Schema.integer(),
          totalShots: Schema.integer(),
          estRuntimeSeconds: Schema.integer(),
          notes: Schema.array({ items: Schema.string() }),
        },
        optionalProperties: [],
      }),
    },
    optionalProperties: [],
  });
}

function parseModelJson(rawText) {
  const cleaned = String(rawText || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.shots)) throw new Error('Model reply was not a shotlist JSON object.');
  return parsed;
}

// A stalled model call must surface as an error, never hang the UI with
// Generate disabled. 60 s is generous for a flash model on a small prompt.
// (2026-11-17: gemini-3.8-flash hung twice with no response and no error, so
// the cloud model moved to the lighter gemini-3.5-flash-lite and every
// generateContent call got this timeout.)
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s with no response`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function generateWithFirebase(ai, text, route, longForm) {
  // Dynamic import keeps the Firebase SDK load tied to the live path only.
  const { getGenerativeModel, InferenceMode, Schema } = await import('firebase/ai');
  const schema = shotlistSchema(Schema);
  const prompt = buildPrompt(text, longForm);
  if (route === 'ON_DEVICE_FIRST') {
    const deviceModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { promptOptions: { responseConstraint: schema } },
    });
    // Must run on a user gesture and before any prompt request.
    await deviceModel.initializeDeviceModel((p) => {
      $('engine-badge').textContent = `Downloading on-device model: ${Math.round(p * 100)}%`;
    });
    const result = await withTimeout(deviceModel.generateContent(prompt), 60000, 'On-device generation');
    const rawText = result.response.text();
    try {
      return { parsed: parseModelJson(rawText), rawText: null, inferenceSource: result.response.inferenceSource || 'on_device', engine: 'ON_DEVICE (Gemini Nano)' };
    } catch (parseError) {
      // Model answered but not as shotlist JSON: show its raw text, do not invent shots.
      return { parsed: null, rawText, inferenceSource: result.response.inferenceSource || 'on_device', engine: 'ON_DEVICE (Gemini Nano)' };
    }
  }
  const cloudModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    },
  });
  const result = await withTimeout(cloudModel.generateContent(prompt), 60000, `Cloud generation (${CLOUD_MODEL})`);
  const rawText = result.response.text();
  try {
    return { parsed: parseModelJson(rawText), rawText: null, inferenceSource: result.response.inferenceSource || 'in_cloud', engine: 'CLOUD (Gemini 3.5 Flash-Lite)' };
  } catch (parseError) {
    return { parsed: null, rawText, inferenceSource: result.response.inferenceSource || 'in_cloud', engine: 'CLOUD (Gemini 3.5 Flash-Lite)' };
  }
}

// ------------------------------------------------------------- UI rendering --
function renderResults(parsed, engine, note) {
  const badgeClass = engine.startsWith('ON_DEVICE') ? 'badge-device' : engine.startsWith('CLOUD') ? 'badge-cloud' : 'badge-local';
  $('engine-badge').innerHTML = `Answered by <span class="badge ${badgeClass}">${engine}</span>${note ? ` <span class="muted">${note}</span>` : ''}`;
  const box = $('results');
  if (!parsed || !Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    box.innerHTML = '<p class="muted">No shots produced. Try a longer or clearer input.</p>';
    return;
  }
  const shotsHtml = parsed.shots.map((s) => `
    <div class="shot"><h3>Shot ${s.n}: ${escapeHtml(s.shot)} <span class="muted">(${escapeHtml(s.scene)}, ${Number(s.durationSeconds) || 0}s)</span></h3>
    <p>${escapeHtml(s.description)}</p><p class="muted">Camera: ${escapeHtml(s.camera)}</p></div>`).join('');
  const cs = parsed.callSheet || {};
  const notes = Array.isArray(cs.notes) ? cs.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('') : '';
  box.innerHTML = `<h3>${escapeHtml(parsed.title || 'Shotlist')}</h3>${shotsHtml}
    <div class="shot"><h3>Call sheet</h3><p>Scenes: ${Number(cs.scenes) || '-'} | Total shots: ${Number(cs.totalShots) || parsed.shots.length} | Est. runtime: ${Number(cs.estRuntimeSeconds) || '-'}s</p><ul>${notes}</ul></div>`;
  $('save-shotlist').disabled = false;
}

function renderRawText(rawText, engine, note) {
  $('engine-badge').innerHTML = `Answered by <span class="badge badge-cloud">${engine}</span> <span class="muted">${note}</span>`;
  $('results').innerHTML = `<pre>${escapeHtml(rawText)}</pre>`;
  $('save-shotlist').disabled = true;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addLogEntry(entry) {
  routingLog.push(entry);
  const tbody = document.querySelector('#routing-log tbody');
  tbody.innerHTML = routingLog.map((e) => `<tr>
    <td>${escapeHtml(e.time)}</td><td>${escapeHtml(e.input)}</td><td>${e.chars}</td>
    <td>${escapeHtml(e.route)}</td><td>${escapeHtml(e.engineServed)}</td><td>${e.latencyMs} ms</td>
    <td>${escapeHtml(e.note)}</td></tr>`).join('');
}

function updateRouteHint() {
  const len = $('input-text').value.length;
  $('char-count').textContent = `${len} characters`;
  const route = decideRoute(len, SHORT_MAX_CHARS);
  $('route-hint').textContent = len === 0
    ? 'Route: type or load an input to see the routing decision.'
    : `Route: ${route === 'ON_DEVICE_FIRST' ? `short input (<= ${SHORT_MAX_CHARS} chars): on-device first, cloud fallback` : `long input (> ${SHORT_MAX_CHARS} chars): cloud only`}.`;
}

// -------------------------------------------------------------- Save + list --
async function saveShotlist() {
  if (!lastResult) return;
  const record = {
    title: lastResult.title || 'Shotlist',
    inputLabel: lastInputLabel,
    engine: lastEngine,
    createdAt: new Date().toISOString(),
    result: lastResult,
  };
  $('save-result').textContent = 'Saving...';
  if (fb) {
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(fb.db, 'shotlists'), { ...record, createdAt: serverTimestamp() });
      $('save-result').textContent = 'Saved to Firestore.';
    } catch (e) {
      $('save-result').textContent = `Firestore save failed (${(e && e.message) || e}); kept in this browser instead.`;
      saveLocally(record);
    }
  } else {
    saveLocally(record);
    $('save-result').textContent = 'Saved in this browser only (demo mode: Firestore not connected).';
  }
  await refreshSavedList();
}

function saveLocally(record) {
  const list = JSON.parse(localStorage.getItem(savedLocalKey) || '[]');
  list.unshift(record);
  localStorage.setItem(savedLocalKey, JSON.stringify(list.slice(0, 20)));
}

async function refreshSavedList() {
  const ul = $('saved-list');
  let items = [];
  if (fb) {
    try {
      const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(query(collection(fb.db, 'shotlists'), orderBy('createdAt', 'desc'), limit(10)));
      items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      ul.innerHTML = `<li class="muted">Could not read Firestore (${escapeHtml((e && e.message) || e)}).</li>`;
      return;
    }
  } else {
    items = JSON.parse(localStorage.getItem(savedLocalKey) || '[]');
  }
  if (items.length === 0) { ul.innerHTML = '<li class="muted">Nothing saved yet.</li>'; return; }
  ul.innerHTML = items.map((it) => `<li><strong>${escapeHtml(it.title || 'Shotlist')}</strong> <span class="muted">(${escapeHtml(it.engine || '')}, ${escapeHtml(it.inputLabel || '')}, ${escapeHtml((it.createdAt && it.createdAt.toDate) ? it.createdAt.toDate().toISOString() : String(it.createdAt || ''))})</span></li>`).join('');
}

// ----------------------------------------------------------- Device check ----
async function checkOnDevice() {
  const out = $('device-check-result');
  const pill = $('device-status');
  if (typeof window.LanguageModel === 'undefined') {
    out.textContent = 'No on-device API in this browser (window.LanguageModel is missing). On desktop Chrome 139+ it appears; the model itself may still need downloading.';
    pill.textContent = 'On-device model: API not present in this browser';
    pill.className = 'pill pill-bad';
    return 'api-missing';
  }
  try {
    const availability = await window.LanguageModel.availability();
    out.textContent = `LanguageModel.availability() = "${availability}". "available" means the model can run now; "downloading"/"downloadable" means it can be fetched; "unavailable" means this device/browser build cannot run it.`;
    pill.textContent = `On-device model: ${availability}`;
    pill.className = availability === 'available' ? 'pill pill-live' : 'pill pill-demo';
    return availability;
  } catch (e) {
    out.textContent = `On-device check failed: ${(e && e.message) || e}`;
    pill.textContent = 'On-device model: check failed';
    pill.className = 'pill pill-bad';
    return 'check-failed';
  }
}

// ---------------------------------------------------------------- Generate ---
async function generate() {
  const text = $('input-text').value.trim();
  const btn = $('generate');
  if (!text) { $('engine-badge').textContent = 'Paste a script or brief first, or load a demo input.'; return; }
  const chars = text.length;
  const route = decideRoute(chars, SHORT_MAX_CHARS);
  const longForm = route === 'CLOUD_ONLY';
  const t0 = performance.now();
  btn.disabled = true;
  $('engine-badge').textContent = 'Generating...';
  try {
    if (!fb) {
      const parsed = parseShotlistLocally(text);
      const ms = Math.round(performance.now() - t0);
      lastResult = parsed; lastEngine = 'LOCAL PARSER (stand-in)';
      renderResults(parsed, lastEngine, 'Demo mode: rule-based stand-in, not Gemini Nano and not the cloud.');
      addLogEntry({ time: new Date().toLocaleTimeString(), input: lastInputLabel, chars, route, engineServed: 'LOCAL PARSER (stand-in)', latencyMs: ms, note: fbError ? `Firebase init failed: ${fbError}` : 'Firebase not connected.' });
      return;
    }
    try {
      const { parsed, rawText, inferenceSource, engine } = await generateWithFirebase(fb.ai, text, route, longForm);
      const ms = Math.round(performance.now() - t0);
      lastResult = parsed; lastEngine = engine;
      if (parsed) renderResults(parsed, engine, `SDK inferenceSource: ${inferenceSource}.`);
      else renderRawText(rawText, engine, 'Model reply was not shotlist JSON; shown as text, no shots invented.');
      addLogEntry({ time: new Date().toLocaleTimeString(), input: lastInputLabel, chars, route, engineServed: `${engine} [${inferenceSource}]`, latencyMs: ms, note: parsed ? (route === 'ON_DEVICE_FIRST' ? 'On-device attempt succeeded.' : 'Cloud path.') : 'Model reply was not shotlist JSON.' });
    } catch (deviceError) {
      // On-device attempt failed (model unavailable, download blocked, etc.):
      // log the failure honestly, then answer from the cloud.
      const failMs = Math.round(performance.now() - t0);
      const reason = String((deviceError && deviceError.message) || deviceError);
      addLogEntry({ time: new Date().toLocaleTimeString(), input: lastInputLabel, chars, route, engineServed: 'ON-DEVICE ATTEMPT FAILED', latencyMs: failMs, note: reason.slice(0, 160) });
      $('engine-badge').textContent = `On-device attempt failed (${reason.slice(0, 120)}). Falling back to the cloud...`;
      const { parsed, rawText, inferenceSource, engine } = await generateWithFirebase(fb.ai, text, 'CLOUD_ONLY', longForm);
      const ms = Math.round(performance.now() - t0);
      lastResult = parsed; lastEngine = engine;
      if (parsed) renderResults(parsed, engine, `SDK inferenceSource: ${inferenceSource}. On-device failed first; see log.`);
      else renderRawText(rawText, engine, 'Model reply was not shotlist JSON; shown as text, no shots invented. On-device failed first; see log.');
      addLogEntry({ time: new Date().toLocaleTimeString(), input: lastInputLabel, chars, route: 'CLOUD FALLBACK', engineServed: `${engine} [${inferenceSource}]`, latencyMs: ms, note: 'Cloud fallback after on-device failure.' });
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    $('engine-badge').textContent = `Generation failed: ${(e && e.message) || e}`;
    addLogEntry({ time: new Date().toLocaleTimeString(), input: lastInputLabel, chars, route, engineServed: 'FAILED', latencyMs: ms, note: String((e && e.message) || e).slice(0, 160) });
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------------ Wiring ---
function loadDemo(which) {
  if (which === 'short') { $('input-text').value = SHORT_BRIEF; lastInputLabel = 'short brief (demo)'; }
  else { $('input-text').value = LONG_SCRIPT; lastInputLabel = 'long script (demo)'; }
  updateRouteHint();
}

function updateOnline() {
  const el = $('online-status');
  el.textContent = navigator.onLine ? 'Online: yes' : 'Online: no (offline: on-device path still attempted when the model is present)';
}

$('input-text').addEventListener('input', () => { lastInputLabel = 'pasted input'; updateRouteHint(); });
$('load-short').addEventListener('click', () => loadDemo('short'));
$('load-long').addEventListener('click', () => loadDemo('long'));
$('generate').addEventListener('click', generate);
$('check-device').addEventListener('click', checkOnDevice);
$('save-shotlist').addEventListener('click', saveShotlist);
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

updateOnline();
updateRouteHint();
initFirebase().then(() => refreshSavedList());

// Test hooks (used by the smoke test, not by the UI).
window.__setlist = {
  get mode() { return fb ? 'live' : 'demo'; },
  get log() { return routingLog; },
  get lastEngine() { return lastEngine; },
  get lastResult() { return lastResult; },
};
