# Daily Life

For Railway hosting and a directly installable Android APK, follow [the deployment guide](../backend/DEPLOYMENT.md). Run `npm run release:check` before building; the `apk` EAS profile uses the production environment and produces an APK.

Dependency installation runs `patch-package` to replace the SMS library's obsolete `jcenter()` repositories with Maven Central for Gradle 9. Keep `patches/react-native-get-sms-android+2.1.0.patch`, `package.json`, and `package-lock.json` together so fresh installs and EAS builds receive the same fix. The app retains its custom `android/` sources; the EAS notice that native Android settings override `app.json` is expected.

A daily planner built with Expo/React Native, FastAPI, and MongoDB. Home and Schedule share one schedule store, so edits, completion changes, and deletions appear on both screens immediately after the server confirms them.

## Run locally

The API now requires a verified Firebase account for planner and food-analysis data. Set up Firebase Email/Password Authentication before using the app:

1. Create a Firebase project and enable the Email/Password sign-in provider.
2. Create a Firebase web app and copy its client configuration into `Hello-app/.env` using the `EXPO_PUBLIC_FIREBASE_*` keys in `.env.example`.
3. Create a Firebase Admin service account for the same project. Keep its JSON private; for local use set it in `backend/.env` as `FIREBASE_SERVICE_ACCOUNT_JSON` and set `FIREBASE_PROJECT_ID` to the matching project ID.
4. Start MongoDB, then start the API:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
# Copy .env.example to .env only if you do not already have .env.
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend requires `MONGODB_URL`; `DATABASE_NAME` defaults to `daily_life`. Local API documentation is available at `http://localhost:8000/docs`. The app requires a verified Firebase email before accessing account data.

In another terminal:

```powershell
cd Hello-app
npm install
npm start
```

For an Android development build, run `npm run android`. For web, run `npm run web`. The money summary supports private on-device manual expense/income entries and a repeating daily pocket-money budget on all platforms. Optional bank SMS import is Android-only, requires the user to enable `READ_SMS`, and is scanned on-device while the Home screen is open; message contents are not uploaded. A new Android build is required after changing native permissions.

The Messages tab can optionally capture new notification previews from WhatsApp, Instagram, Facebook, and Messenger on Android after the user explicitly enables Android Notification Access in system settings. Android does not provide the app with past notification history or full chat contents; only preview text included in notifications delivered after access is enabled can be captured, and messages hidden by notification privacy settings are unavailable. Captures are stored in the app's private no-backup device storage, are not uploaded, and can be deleted individually or all at once. Deleting a capture does not delete the original message in its messaging app. iOS does not allow third-party apps to read other apps' notifications. This native feature requires a custom Android build and is not available in Expo Go.

The Private Vault stores entries only in the current browser or on the current mobile device. Mobile uses an AES-GCM-encrypted vault with its key protected by the OS secure store and device biometric authentication; web uses AES-GCM with a unique vault password (12+ characters) and PBKDF2-SHA-256. PDF/JPG/JPEG/PNG/WebP documents (up to 20 MB each) are AES-GCM encrypted separately in private device/browser storage; document names, categories, and extracted fields are also stored in the encrypted vault index. Categories include Aadhaar, PAN, 10th/12th certificates, degrees/diplomas, bank documents, other and custom labels. Search, category filters, and PDF/image filters are available. The vault is not synced or backed up, and there is no password/key recovery. Opening/exporting a document decrypts a temporary copy for the system share/open UI or browser download, which can create a copy outside the encrypted vault. The vault also supports website/app logins, PINs, bank account details, and limited card details (issuer, last four digits, expiry); do not store CVVs or full payment-card numbers. A custom native development build is required to use biometrics; Expo Go does not support the biometric-protected secure key.

The Family area connects existing, verified-email accounts using in-app requests; it does not send an email or SMS invitation. Connected members can create assigned reminders and shared savings wishes. Only the reminder creator can edit/delete a reminder, and only its assignee can mark it complete. Wish participants can see contributor names and amounts and add contributions; only the creator can delete the shared wish. Family data is account-linked and stored by the backend, unlike personal Wishes, which remain on-device. Assigned reminder notifications are scheduled locally when the assignee opens Family; there is no remote push notification service.

The Home notification bell opens a device-local inbox for this app's reminders. It lists upcoming scheduled reminders and remembers notifications received while the app is open or opened from the device notification tray; it is not a history of notifications from other apps.

Family document sharing is separate from the device-only Private Vault. The owner explicitly publishes an encrypted copy (maximum 10 MB) from a vault document. Connected relatives can see its title/category and request access; the owner approves each request. X25519 key agreement, HKDF-SHA-256 and AES-GCM encrypt file contents and wrap each file key for the owner or approved member. The backend stores ciphertext, public keys, and encrypted key envelopes, not plaintext files or private keys. Native private keys are protected by the OS secure store/biometrics; web keys are held only in memory and must be restored from the recovery key after a page reload. Save the recovery key privately; losing it makes existing shared files unreadable. Titles, categories, filenames, account/email identities, reminders, and wish/contribution data are not end-to-end encrypted. Approved recipients can download a copy; revoking or deleting the server copy cannot erase files or keys already downloaded. The app does not prevent screenshots or copies.

Document OCR is optional and uses the existing server-side `GEMINI_API_KEY`. Each extraction requires explicit confirmation and sends a decrypted copy over HTTPS through the backend to Google Gemini. The app backend does not persist the document; Google processes it under its own service terms. Do not send documents unless you accept those terms. Extracted values are estimates, must be checked against the original, and should not be relied on for official, legal, or financial decisions. Extracted fields are masked until revealed and are encrypted in the local vault. Documents over 6 MB can be saved but not OCR-processed.

Set `EXPO_PUBLIC_API_URL` in `Hello-app/.env` if automatic development host detection does not suit your setup. The URL must include `/api`, for example `http://192.168.1.10:8000/api` for a phone on the same LAN. Restart Expo after changing this variable. Without an explicit URL, the app uses the Expo development host, `10.0.2.2` on an Android emulator, or `localhost` on web.

## Production deployment (Railway + MongoDB Atlas)

This project is mobile-focused and does not include public web hosting. Deploy the API from the `backend` directory using its Dockerfile. In Railway, configure:

- `APP_ENV=production`
- `MONGODB_URL` with the Atlas `mongodb+srv://` connection string and `DATABASE_NAME`
- `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON` for the same Firebase project
- `CORS_ORIGINS` as an empty value for mobile-only use. If a browser client is added later, list only its exact HTTPS origin(s), comma-separated.
- `GEMINI_API_KEY` only if food photo analysis is enabled; keep it server-side.

In Atlas, create a least-privilege database user and restrict network access to the Railway service's static egress IP or private network. Do not leave Atlas open to `0.0.0.0/0` for production. Store credentials in Railway variables, never in Git or the Expo bundle. The production API disables interactive docs and requires verified Firebase ID tokens; schedule, life-item, and food-analysis records are isolated by Firebase user ID.

For the mobile release, set `EXPO_PUBLIC_API_URL` to the Railway HTTPS URL ending in `/api` and set all `EXPO_PUBLIC_FIREBASE_*` client values for the same Firebase project. These client values are embedded in the app and are not secrets; protect the Firebase project with its API restrictions and authentication settings. Build with `eas build --platform android --profile production` or `eas build --platform ios --profile production`. Verify sign-up, email verification, sign-in, account isolation, and sign-out against the deployed API before distribution.

Existing MongoDB schedule and life-item records without `user_id` will no longer be returned after authentication is enabled. Do not automatically assign shared legacy records to an arbitrary account. Before migration, back up the database and decide explicitly which verified Firebase UID owns each legacy dataset; update only records whose ownership is known, or start with an empty production database. Validate the migration in a separate database before touching production.

## Daily features

- The Home dashboard provides entry points to schedules, meal/calorie logs, weight check-ins, office tasks, and upcoming events.
- Wishes lets you create multiple on-device savings goals with target amounts and dates, record contributions, and track progress. The daily amount due includes any missed installments. On mobile, Wishes can schedule a repeating 9:00 AM local notification to check the current due; allow notifications when prompted. Wish records are not synced or backed up, and browser notifications are not supported.
- Meals record meal type, calories, date/time, and notes. The daily calorie total is calculated from that day's saved entries.
- The Camera tab between Home and Schedule lets you take a photo or choose one from the phone gallery. Food analysis uses the Gemini API only after explicit confirmation, then lets you review/edit estimates before saving a meal. Photos can also be saved directly to the app's private on-device gallery without upload; non-food photos are saved there after analysis as well. Set `GEMINI_API_KEY` in the backend `.env` to enable analysis; Gemini free-tier quotas and data-use terms apply. The app resizes photos before upload and does not automatically save food photos to its gallery.
- Private Vault accepts PDF and image documents. They stay encrypted locally; document categorization and OCR detail extraction are optional. Sending a document to Gemini is a separate, confirmed action.
- For Gemini setup, copy `backend/.env.example` to `backend/.env` if needed and set `GEMINI_API_KEY` from Google AI Studio. Restart FastAPI after changing it. Do not put this key in `Hello-app/.env` or frontend configuration.
- The Family area handles verified-email connections, assigned reminders, pooled wishes, and document access requests. Family document contents are encrypted on the client before upload; only the owner can approve requests. Recovery keys are required to open shared files on another device/browser.
- The Home market watch calls `GET /api/market/quotes` on the backend. It uses Yahoo Finance's no-key chart endpoint, caches quotes for five minutes, and marks cached quotes stale after an upstream error. Gold/silver values are COMEX futures converted using USD/INR, not local spot/retail prices.
- Weight check-ins are saved with a timestamp and show the latest measurement and change from the previous one.
- Office tasks support a due date, priority, completion, editing, and deletion.
- Events support a start date, an optional local device reminder, editing, and deletion.
- Schedule and event/task reminders are scheduled locally on the device for 10 minutes before the saved time. Android notification permission is requested when reminders are first synchronized. Reminders must be at least 10 minutes in the future to be scheduled.
- Market watch loads NIFTY 50, gold and silver COMEX futures from Yahoo Finance through the backend without a provider key. Quotes are cached for five minutes and display provider timestamps. Gold and silver are approximate INR/10g and INR/kg conversions of USD futures, not Indian retail/MCX prices; quotes may be delayed or unavailable. Gemini is not used to generate market prices.
- Theme selection toggles between light and dark modes and is saved on the device.
- Schedule has a month calendar with activity markers; selecting a day shows its schedule details.
- Weather and air quality use the Open-Meteo APIs and require foreground location permission. Coordinates are sent to Open-Meteo for the lookup, not to the app backend.
- Android Screen time is opt-in and requires a custom Android build plus Usage Access enabled in Android Settings. It reports on-device daily, current-week, and current-month foreground-use totals by package; the app does not upload or persist those totals. Expo Go cannot provide this native usage data.
- Daily steps are opt-in on Android and require a device step-counter sensor plus Activity Recognition and notification permissions. An ongoing Android notification is shown while the foreground service counts steps in the background. Daily totals and the last seven days are stored only on-device; counting starts when tracking is enabled, so earlier steps are not included. Expo Go cannot provide this native sensor.

## Planner behavior

- Home shows today's first four activities and completion progress.
- Schedule supports creating, editing, deleting, completing, and reopening activities.
- Today, Week (Monday to Sunday), and Month use the device's local calendar. All includes past and future activities. A save outside the current filter switches to All so the saved activity remains visible.
- Date changes preserve the chosen time; time changes preserve the date. The API requires an explicit UTC offset and MongoDB stores UTC instants.
- Schedule lists refresh on tab focus, app foregrounding, and pull-to-refresh. A failed refresh retains the last loaded list and offers Retry.
- Failed form submissions retain entered values. Deletion requires confirmation; a failed delete keeps the confirmation open for retry.
- Schedules persist in MongoDB across app and server restarts and are scoped to the verified Firebase user.
- Schedule reminders are optional and stored as offset-aware timestamps alongside the schedule.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/schedules` | List schedules in chronological order |
| POST | `/api/schedules` | Create a schedule |
| PATCH | `/api/schedules/{id}` | Update supplied fields, including `completed` |
| DELETE | `/api/schedules/{id}` | Delete a schedule; returns 204 |
| GET | `/api/life-items?kind=meal\|weight\|task\|event` | List entries of a life-feature type |
| POST | `/api/life-items` | Create a meal, weight entry, task, or event |
| PATCH | `/api/life-items/{id}` | Update supplied entry fields |
| DELETE | `/api/life-items/{id}` | Delete an entry; returns 204 |
| POST | `/api/documents/extract` | Extract visible text fields from a confirmed PDF/JPEG/PNG/WebP document (maximum 6 MB). Requires Firebase authentication and server-side `GEMINI_API_KEY`; uploaded files are not persisted by the backend. |

`GET /api/schedules?scheduled_for=...` accepts an offset-aware datetime and filters its calendar day using that offset. Encode `+` in query strings or use an HTTP client's query parameters. Existing records without `completed` are treated as incomplete. Naive datetimes read from old MongoDB records are interpreted as UTC; old `date`/`start_time` documents remain readable.

## Checks

Frontend (Node 22.13 or later):

```powershell
cd Hello-app
npm test
npm run typecheck
npx expo export --platform web --max-workers 2
npx expo export --platform android --max-workers 2 --output-dir dist-android
```

Backend:

```powershell
cd backend
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\venv\Scripts\python.exe -m pytest -q
```

After changing native Android permissions or native modules, rebuild and reinstall the Android development app; reloading the JavaScript bundle alone does not update native code:

```powershell
npx expo run:android
```

If generated route declarations are stale after adding routes, run `npm start` once before typechecking so Expo regenerates `.expo/types`.

Backend:

```powershell
cd backend
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:TEST_MONGODB_URL = 'mongodb://127.0.0.1:27017'
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

Integration tests use a uniquely named `daily_life_test_*` database and remove it afterward. Without `TEST_MONGODB_URL`, schema tests still run and integration tests are skipped.

Before shipping an Android build, check on a device or emulator: create an activity with the native date/time pickers, edit its date without changing its time, complete and reopen it from both tabs, restart the app, cancel and confirm deletion, and retry a failed save with the API stopped. On a device with a step sensor, enable step tracking, confirm the ongoing notification appears, verify counts while the app is backgrounded, then stop tracking. Also check keyboard dismissal, system Back, safe areas, and larger text sizes.
