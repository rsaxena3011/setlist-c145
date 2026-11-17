# SetList - on-set script to shotlist (Firebase AI Logic hybrid inference)

Built for **#BuildHybridAI 2026** (C145), Web/Chrome lane, targeting Best Web/Chrome App.

**Judge promise:** paste a script on set with no signal and get the shotlist in seconds
on-device; hand the long script to the cloud for the full breakdown. One SDK, both engines.

## What it does

- Paste a script or client brief. SetList extracts shots and a call sheet.
- **Short inputs (up to 600 chars)** are attempted **on-device first** with Gemini Nano
  via Firebase AI Logic (`InferenceMode.ONLY_ON_DEVICE`, after `initializeDeviceModel`
  on the user's click). If the model is unavailable, the attempt is logged and the
  cloud answers instead.
- **Long inputs (over 600 chars)** go straight to the **cloud** (Gemini 3.5 Flash-Lite,
  `InferenceMode.ONLY_IN_CLOUD`) for the full breakdown and call sheet.
- A **routing log** in the UI shows which engine answered which input, with latency
  and the SDK-reported `inferenceSource`.
- Saved shotlists persist in **Firestore** (collection `shotlists`). No sign-in: the
  demo stays login-free.
- **Firebase App Check** is initialised (debug provider on localhost, reCAPTCHA v3 on
  the deployed site), as enforced by the AI Logic guided setup.
- Two bundled demo inputs: a short brief (on-device path) and a long script
  (cloud path), so both engines are visible without pasting anything.
- An **on-device check** button runs `LanguageModel.availability()` live in the
  visitor's browser and reports the result.

## Honest status (2026-11-15, v1)

- **On-device inference is NOT verified in the build VM.** Headed Chrome for Testing
  156 on localhost exposes `window.LanguageModel`, but `availability()` returns
  `"unavailable"` and `create()` throws `NotSupportedError: Unable to create a text
  session because the service is not running` (see `ON_DEVICE_VERIFICATION_2026-11-15.md`
  in the competition folder). The on-device path is therefore attempted, logged, and
  allowed to fail over to the cloud; it is never claimed as a measured run in this
  environment. On a real desktop Chrome 139+ with the model downloaded, the same code
  path runs on-device.
- **Firebase is not connected yet in this v1.** `firebase-config.js` still holds
  placeholders, so the app runs in **demo mode**: the interface, routing log and save
  flow work, and shotlists come from the clearly-labelled rule-based local stand-in
  parser (`local-parser.js`). The stand-in is labelled `LOCAL PARSER (stand-in)` in
  the UI and the log, and is never presented as Gemini Nano or cloud output. The
  Firebase AI Logic code path (`getAI`, `getGenerativeModel`, `InferenceMode`,
  `initializeDeviceModel`, `generateContent`, `inferenceSource`, App Check,
  Firestore) is fully written in `app.js` and runs as soon as a real config is
  pasted (steps below).

## Run locally

```sh
# Any static server; no build step, no dependencies.
python3 -m http.server 8000
# Open http://localhost:8000
```

## Connect Firebase (free Spark plan, no card)

1. Firebase console: create a project, add a Web app, copy its `firebaseConfig`
   into `firebase-config.js` and set `FIREBASE_CONFIGURED = true`.
2. AI Services > AI Logic > Get started: choose the **Gemini Developer API**
   provider (free within limits). Finish the guided setup; it enforces App Check.
3. Security > App Check > Apps: register a debug token for localhost testing
   (the app sets `FIREBASE_APPCHECK_DEBUG_TOKEN` on localhost; the token prints
   in the browser console on first run). Add your reCAPTCHA v3 site key to
   `firebase-config.js` for the deployed site.
4. Firestore: create the database and a collection named `shotlists`.
5. Redeploy and run the smoke test (`tests/smoke.mjs`).

## Deploy

Static files only (`index.html`, `app.js`, `styles.css`, `firebase-config.js`,
`demo-inputs.js`, `local-parser.js`). Hosted on GitHub Pages from this repo.
`firebase.json` is included for `firebase deploy` (hosting) once a project exists.

## Tests

```sh
node --test tests/parser.test.mjs   # local parser + routing decision (pure functions)
node tests/smoke.mjs                # headless-Chrome UI smoke test + screenshots
```

## Tech

- Firebase JS SDK 12.19.0 via CDN import map (hybrid inference needs 12.5.0+).
- `firebase/app`, `firebase/ai` (`getAI`, `GoogleAIBackend`, `getGenerativeModel`,
  `InferenceMode`, `Schema`), `firebase/app-check`, `firebase/firestore`.
- Cloud model: `gemini-3.5-flash-lite`. On-device model: Gemini Nano via Chrome Prompt API.
- No auth, no paid tier, no image generation, no second platform.

## Licence

Apache License 2.0 (see `LICENSE`).
