// SetList Firebase configuration.
//
// STATUS: NOT CONFIGURED. This file still holds placeholders, so the app runs in
// DEMO MODE (see app.js): the interface, routing log and save flow all work, and
// shotlists are produced by the clearly-labelled local stand-in parser in
// local-parser.js. No Firebase call is attempted until real values are pasted here.
//
// TO CONNECT (parent browser pass, Firebase console, free Spark plan, no card):
//   1. Create a Firebase project, add a Web app, copy its firebaseConfig here.
//   2. In the console go to AI Services > AI Logic > Get started, choose the
//      Gemini Developer API provider (free within limits), finish the guided
//      setup. App Check is enforced automatically by that workflow.
//   3. In Security > App Check > Apps, register a debug token for local testing
//      (the app sets FIREBASE_APPCHECK_DEBUG_TOKEN on localhost) and add the
//      reCAPTCHA v3 site key below for the deployed site.
//   4. In Firestore, create the database (production mode) and a collection
//      named "shotlists". No auth is used: the demo stays login-free.
//   5. Set FIREBASE_CONFIGURED to true, redeploy, and run the live smoke test.

export const FIREBASE_CONFIGURED = false;

export const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// reCAPTCHA v3 site key for App Check on the deployed site (not localhost).
// Leave as the placeholder until the Firebase project exists.
export const RECAPTCHA_V3_SITE_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY';
