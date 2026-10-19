const { existsSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

function checkReleaseConfig(env) {
  const errors = [];
  const required = [
    'EXPO_PUBLIC_API_URL',
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  ];
  for (const name of required) {
    const value = (env[name] || '').trim();
    if (!value || /YOUR_|your-api|your-project|example\.com/i.test(value)) {
      errors.push(`${name} is missing or still a placeholder.`);
    }
  }
  try {
    const api = new URL(env.EXPO_PUBLIC_API_URL);
    const host = api.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '[::1]' || host.endsWith('.local') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    if (api.protocol !== 'https:' || isLocal || api.username || api.password || api.search || api.hash ||
        !api.pathname.replace(/\/$/, '').endsWith('/api')) {
      errors.push('EXPO_PUBLIC_API_URL must be a public HTTPS URL ending in /api, without credentials or query parameters.');
    }
  } catch {
    errors.push('EXPO_PUBLIC_API_URL must be a valid public HTTPS URL ending in /api.');
  }
  return errors;
}

if (require.main === module) {
  const easHook = process.argv.includes('--eas');
  if (easHook && process.env.EAS_BUILD_PROFILE === 'development') {
    console.log('Development build: production endpoint checks skipped.');
  } else {
    const errors = checkReleaseConfig(process.env);
    // EAS must receive these hand-written Android modules, not just generated Expo files.
    if (!easHook || process.env.EAS_BUILD_PLATFORM === 'android') {
      for (const name of [
        'AppUsageModule.kt',
        'StepCounterModule.kt',
        'StepCounterService.kt',
        'MessageCaptureModule.kt',
        'MessageNotificationListenerService.kt',
      ]) {
        if (!existsSync(resolve(dirname(module.filename), '../android/app/src/main/java/com/anonymous/Helloapp', name))) {
          errors.push(`Android source ${name} is missing from this checkout/build archive.`);
        }
      }
    }
    if (errors.length) {
      console.error('Release is not ready:\n' + errors.map(error => `- ${error}`).join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Release configuration passed. Verify sign-in and the deployed API before distributing the APK.');
    }
  }
}

module.exports = { checkReleaseConfig };
