// SetList Firebase configuration.
//
// STATUS: CONFIGURED 2026-11-17 (free Spark plan, project setlist-96961).
// Record: c145-buildhybridai/FIREBASE_SETUP_2026-11-17.md
// App Check provider note: the Firebase console registered "SetList Web" with
// Fraud Defense (reCAPTCHA Enterprise), NOT Classic reCAPTCHA v3 — Classic
// registration is deprecated and its secret-key field is disabled in the
// console. app.js therefore uses ReCaptchaEnterpriseProvider with the site
// key below. The reCAPTCHA secret key stays in the reCAPTCHA admin console
// (key ID 774135239) and is not needed in client config.

export const FIREBASE_CONFIGURED = true;

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCZcu2Ui6TdlXzDsoEuJm5goJU-gY_xhP0',
  authDomain: 'setlist-96961.firebaseapp.com',
  projectId: 'setlist-96961',
  storageBucket: 'setlist-96961.firebasestorage.app',
  messagingSenderId: '361936581565',
  appId: '1:361936581565:web:e0eecc802fb2c17a4c58d4',
  measurementId: 'G-9JMB3HKEZX',
};

// reCAPTCHA v3 site key for App Check on the deployed site (not localhost).
// Registered in App Check as Fraud Defense (reCAPTCHA Enterprise).
export const RECAPTCHA_V3_SITE_KEY = '6LfHXSQuAAAAAIuPojGl1R0k-A1KwqWfLQgZ8o-z';
