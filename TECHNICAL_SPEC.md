# Technical Specifications & Architecture

This document provides a comprehensive technical reference for the **Safety** ecosystem — spanning the Flutter Mobile Application, Node.js/Fastify Backend Server, React/Vite Admin Response Portal, Firebase Realtime/Firestore Sync, Agora WebRTC Audio Infrastructure, and Google Gemini AI Intelligence Engine.

---

## 1. High-Level System Architecture

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │               Flutter Mobile Application               │
                                  │   - Minimalist Clean UI with Dark/Light Emerald Palette │
                                  │   - Background GPS Location & Breadcrumb Stream        │
                                  │   - Heartbeat Check-In & Grace Period State Machine    │
                                  │   - Android Full-Screen Intent & Lock-Screen WakeLock  │
                                  │   - Floating System Overlay (FlutterOverlayWindow)     │
                                  │   - Agora RTC Bidirectional Voice Engine               │
                                  │   - Safety PIN False-Alarm Tamper Protection           │
                                  │   - OSM Nominatim Administrative Boundary Resolution   │
                                  └───────────────┬────────────────────────┬───────────────┘
                                                  │                        │
                                   Direct Cloud   │                        │ REST API & FCM
                                   Firestore Sync │                        │ Push Notifications
                                                  ▼                        ▼
┌─────────────────────────────────────────────────────────┐      ┌─────────────────────────────────────────────────────────┐
│                 Firebase Cloud Platform                 │      │                 Fastify Backend Server                  │
│  - Cloud Firestore: `safety_sessions`, `incident_reports`│◄────►│  - User & Guest Device-Token Registration               │
│  - FCM Push Messaging: Proximity Threat Alerts          │      │  - Server-Side Missed Check-In Escalation Worker        │
│  - Realtime Call Signaling: `calls/{userId}`            │      │  - Agora RTC Token Generator & WebRTC Dispatch Engine   │
└───────────────────────────┬─────────────────────────────┘      │  - Google Gemini AI Threat Analysis & Briefings         │
                            │                                    │  - MongoDB 2dsphere Spatial Geolocation Indexing        │
                            │ Direct Realtime Sync               └────────────────────────────┬────────────────────────────┘
                            │                                                                 │
                            ▼                                                                 ▼
┌─────────────────────────────────────────────────────────┐      ┌─────────────────────────────────────────────────────────┐
│              Admin & Dispatch Web Portal                │      │                      MongoDB Atlas                      │
│  - React 19, Vite, TypeScript, Custom Minimalist CSS    │      │  - `users`: Guest & Registered Citizens                 │
│  - Live Google Maps Dispatch Radar (Multi-Jurisdiction) │      │  - `safety_sessions`: Active Walks, Breadcrumbs & State │
│  - WebRTC Voice Dispatch via Agora Web SDK              │      │  - `incident_reports`: Geo-tagged Community Reports     │
│  - Incident Triage, Staff Case Notes & AI Threat Modal  │      │  - `staffs`: Regional Responders & Dispatch Officers    │
└─────────────────────────────────────────────────────────┘      └─────────────────────────────────────────────────────────┘
```

---

## 2. Flutter Mobile Application Architecture (`mobile/`)

The mobile application is built with **Flutter 3.3.3+** (Dart 3.3+), engineered for zero-latency emergency response, resilient background lifecycle execution, and high legibility under distress.

### Package & Namespace
- **Bundle ID / Org**: `com.yzemaf.safety`
- **Application Name**: `safety_app`

---

### 2.1 State Management & Providers

The app utilizes `provider` with `MultiProvider` mounted at root in [`mobile/lib/main.dart`](file:///c:/Users/DELL/Safety/mobile/lib/main.dart):

| Provider | File | Responsibilities |
|---|---|---|
| **`SafetySessionProvider`** | [`safety_session_provider.dart`](file:///c:/Users/DELL/Safety/mobile/lib/providers/safety_session_provider.dart) | Drives the safety state machine: Active walk, countdown interval, grace period warning, emergency distress escalation, automatic vibration patterns, Firestore sync, floating overlay coordination, and location health auto-shutdown. |
| **`AuthProvider`** | [`auth_provider.dart`](file:///c:/Users/DELL/Safety/mobile/lib/providers/auth_provider.dart) | Manages authentication, 1-tap instant guest sessions (`guestDeviceId`), full account registration/login, JWT persistence, user profile caching, and safety PIN storage. |
| **`IncidentProvider`** | [`incident_provider.dart`](file:///c:/Users/DELL/Safety/mobile/lib/providers/incident_provider.dart) | Fetches and filters community incident reports, handles real-time direct injections when emergency is triggered, computes local risk scores, and submits user reports. |
| **`SettingsProvider`** | [`settings_provider.dart`](file:///c:/Users/DELL/Safety/mobile/lib/providers/settings_provider.dart) | Persists user preferences: check-in intervals (1, 3, 5, 10 min), timeout durations (30, 60, 120s), call handling mode (`standard_ring` vs `auto_answer_speaker`), and emergency contacts. |

---

### 2.2 Safety Mode State Machine & Escalation Engine

```
 ┌───────────────┐
 │   IDLE MODE   │
 └───────┬───────┘
         │ User toggles Power Ring / Verifies GPS & Mic
         ▼
 ┌───────────────┐
 │  ACTIVE WALK  │◄───────────────────┐
 │ (Normal Ping) │                    │
 └───────┬───────┘                    │
         │ Timer reaches 0            │ User taps "I'm Safe"
         ▼                            │ / Confirms Check-In
 ┌───────────────┐                    │
 │ GRACE WARNING │────────────────────┘
 │ (Amber Alert) │
 └───────┬───────┘
         │ Grace period expires (30-120s) OR User taps Manual SOS
         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                       EMERGENCY DISTRESS                    │
 │ - High-priority siren vibration repeats every 3s            │
 │ - Direct instant Firestore incident & session broadcast     │
 │ - Backend Fastify escalation & FCM Proximity broadcast      │
 │ - Agora RTC bidirectional voice link auto-connects          │
 │ - Android wakes lock-screen & brings app to foreground      │
 │ - Safety PIN required to cancel false alarm                 │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Verified Safety PIN Entry
                                ▼
                       ┌─────────────────┐
                       │ CANCEL / RESOLVE│
                       └─────────────────┘
```

#### 1. Active Walk Phase
- **Interval**: 1, 3, 5, or 10 minutes (configurable in Settings).
- **Location Stream**: Coordinates and hardware battery levels streamed continuously to `LocationService` and synchronized to Cloud Firestore (`safety_sessions/{sessionId}`).
- **Floating Overlay**: Launches `FlutterOverlayWindow` to display live countdown ring over any other application the user is browsing.

#### 2. Grace Period Warning Phase
- **Trigger**: Countdown reaches zero without manual check-in.
- **Duration**: 30, 60, or 120 seconds.
- **Behavior**:
  - UI shifts to deep warning amber (`#C2410C`).
  - Screen is awakened via Android `PowerManager` WakeLock.
  - Native heads-up warning notification is dispatched with full-screen intent.
  - Periodic warning haptic pulse fires every 2 seconds.
  - Status updates to `distress_pending` in Firestore, turning the admin radar pin amber immediately.

#### 3. Emergency Distress Phase
- **Trigger**: Grace period countdown reaches zero OR user taps "Report Emergency" / Instant SOS.
- **Behavior**:
  - Full app background turns crimson (`#450A0A`).
  - Immediate emergency incident report generated and synced to Firestore (`incident_reports`) and MongoDB Atlas via Fastify API.
  - FCM push notification broadcast to nearby citizens within the community perimeter.
  - Agora RTC voice channel joined with broadcaster role.
  - Repeating emergency vibration patterns every 3 seconds.
  - **Server-Side Safety**: Even if the phone is crushed or thrown into water, the backend `escalationWorker` detects the elapsed `nextPromptDueAt + gracePeriod` and escalates the distress call on the server side automatically.

---

### 2.3 Native Android Integration & Call Handling

Located in [`mobile/android/app/src/main/kotlin/com/yzemaf/safety/safety_app/`](file:///c:/Users/DELL/Safety/mobile/android/app/src/main/kotlin/com/yzemaf/safety/safety_app/):

1. **`MainActivity.kt`**:
   - Implements `MethodChannel` (`com.yzemaf.safety/call_foreground`) for bidirectional communication with Flutter.
   - Configures `setShowWhenLocked(true)`, `setTurnScreenOn(true)`, and requests `KeyguardManager.requestDismissKeyguard()`.
   - Handles launch intents for incoming emergency voice calls, safety warnings, and SOS activations.
2. **`SafetyCallNotifier.kt`**:
   - Manages dedicated high-priority notification channels (`safety_incoming_emergency_calls`, `safety_warning_alerts`, `safety_emergency_mode_alerts`) with `IMPORTANCE_HIGH` and ringtone audio attributes.
   - Dispatches `PendingIntent.getActivity()` with `FLAG_ACTIVITY_NEW_TASK` and `FLAG_ACTIVITY_REORDER_TO_FRONT` to immediately launch full-screen call UI over locked devices.
   - Acquires temporary 15-second `SCREEN_BRIGHT_WAKE_LOCK` to ensure the screen turns on even in sleep mode.
3. **`CallActionReceiver.kt`**:
   - Broadcast receiver handling instant "Decline" actions directly from Android notification action buttons without opening the full UI.
4. **`SafetyFirebaseMessagingService.kt`**:
   - Intercepts background push messages, extracts call/distress payloads, wakes the screen, and launches foreground intents.

---

### 2.4 Mobile Services Reference

| Service | File | Functionality |
|---|---|---|
| **`AgoraVoiceService`** | [`agora_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/agora_service.dart) | Wraps `agora_rtc_engine` SDK (v6.3.2). Handles communication profile initialization, microphone permissions, ghost user-offline filtering, automatic speakerphone routing, volume indication, and call timer tracking. |
| **`FirebaseFirestoreService`** | [`firebase_firestore_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/firebase_firestore_service.dart) | Direct real-time bidirectional syncing of active sessions, location breadcrumbs, emergency distress incidents, and real-time incoming call signaling via document snapshots on `calls/{userId}`. |
| **`FcmService`** | [`fcm_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/fcm_service.dart) | Handles FCM device token registration, background message execution via `@pragma('vm:entry-point')`, local notification channel creation, and tap navigation routing. |
| **`ForegroundCallService`** | [`foreground_call_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/foreground_call_service.dart) | Flutter-to-native method channel bridge for waking lockscreens, triggering full-screen call intents, and dismissing system alerts. |
| **`OverlayService`** | [`overlay_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/overlay_service.dart) | Controls `flutter_overlay_window` to render a draggable floating pill over other applications with live countdown status, check-in taps, and incoming call prompts. |
| **`BoundaryService`** | [`boundary_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/boundary_service.dart) | Reverse geocodes GPS coordinates and queries OpenStreetMap / Nominatim API to construct organic multi-vertex administrative boundary polygons with ray-casting point-in-polygon validation. |
| **`LocationService`** | [`location_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/location_service.dart) | Hardware GPS position streaming via `geolocator`, battery monitoring via `battery_plus`, and location service availability monitoring. |
| **`StorageService`** | [`storage_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/storage_service.dart) | Offline persistent key-value cache (`shared_preferences`) for auth tokens, guest device IDs, active session recovery, user settings, and hashed safety PIN. |
| **`VibrationService`** | [`vibration_service.dart`](file:///c:/Users/DELL/Safety/mobile/lib/services/vibration_service.dart) | Custom haptic patterns for warning prompts, check-in taps, and repeating SOS distress sequences. |

---

### 2.5 Screen Inventory & Routing

```
mobile/lib/screens/
├── splash_screen.dart             # Splash branding, auto-session restore, permission validation
├── landing_screen.dart            # Minimalist welcome screen with 1-tap Guest Mode & Sign In
├── sign_in_screen.dart            # Registered citizen authentication
├── sign_up_screen.dart            # New user account registration
├── onboarding_screen.dart         # Interactive feature walkthrough (Walk Mode, Community & AI Briefs, Voice Dispatch, Settings)
├── main_navigation_screen.dart    # AnimatedIndexedStack hosting bottom navigation tabs:
│   ├── safety_mode_screen.dart    # Tab 0 ('Home'): Main power ring, countdown progress, emergency SOS
│   ├── awareness_radar_screen.dart# Tab 1 ('Community'): Live Threat Radar, local risk scores, category filters
│   ├── report_incident_screen.dart# Tab 2 ('Report'): Incident submission form, location pin picker, AI summaries
│   └── settings_screen.dart       # Tab 3 ('Settings'): Intervals, timeout, call handling, contacts, PIN setup
└── active_voice_call_screen.dart  # Full-screen incoming/active WebRTC dispatch voice call modal
```

---

### 2.6 Active Widgets & Modal Sheets

```
mobile/lib/widgets/
├── safety_overlay_widget.dart     # Draggable floating pill overlay (FlutterOverlayWindow entrypoint)
├── safety_pin_sheet.dart          # 4-digit PIN setup, verification, and tamper protection modal
├── location_picker_sheet.dart     # Interactive map pin picker sheet for incident geolocation
├── in_app_notification.dart       # Floating banner notifications with info/success/warning/error styles
├── pulsing_radar_widget.dart      # Organic multi-ring radar pulse animation used during splash & active scan
```

---

### 2.7 Mobile Environment & Secrets Architecture

Flutter secrets are strictly isolated from source control:
1. **`lib/config/env.dart`** *(Ignored by Git)*: Holds active local keys (`agoraAppId`, `googleMapsApiKey`, `apiBaseUrl`).
2. **`lib/config/env.example.dart`** *(Tracked Template)*: Checked into Git with placeholder values for other developers.
3. **`lib/config/constants.dart`**: Consumes `Env.agoraAppId` and `Env.googleMapsApiKey` at compile time.
4. **`android/local.properties`** *(Ignored by Git)*: Contains `MAPS_API_KEY=...` which is injected dynamically into `AndroidManifest.xml` via Gradle `manifestPlaceholders = [mapsApiKey: mapsApiKey]`, ensuring no production Google Maps API key is committed into the manifest.

---

## 3. Fastify Backend Architecture (`backend/`)

The backend is built on **Node.js, TypeScript, and Fastify**, structured for high-throughput geolocation ingestion, fast token issuance, and background escalation workers.

### 3.1 Directory Structure
```
backend/
├── src/
│   ├── config/
│   │   ├── db.ts                  # MongoDB Atlas connection pooling
│   │   └── env.ts                 # Environment variable validation
│   ├── models/
│   │   ├── IncidentReport.ts      # GeoJSON 2dsphere community reports
│   │   ├── SafetySession.ts       # Active walks, breadcrumb history, status
│   │   ├── Staff.ts               # Administrative & responder accounts
│   │   └── User.ts                # Citizens, guest device IDs, emergency contacts
│   ├── routes/
│   │   ├── agoraRoutes.ts         # Agora RTC token issuance
│   │   ├── authRoutes.ts          # Guest tokens, citizen auth, staff auth
│   │   ├── incidentRoutes.ts      # Incident CRUD, staff comments, Gemini AI summary
│   │   ├── sessionRoutes.ts       # Safety walk lifecycle (start, ping, check-in, SOS, resolve)
│   │   ├── staffRoutes.ts         # Staff management & jurisdiction scoping
│   │   └── userRoutes.ts          # Device token registration & direct calling
│   ├── services/
│   │   ├── agoraService.ts        # Agora token builder (AccessToken2 / RtcTokenBuilder)
│   │   ├── escalationWorker.ts    # Background timer monitoring missed check-ins
│   │   ├── firebaseService.ts     # Firebase Admin SDK, FCM push notifications
│   │   └── geminiService.ts       # Google Gemini AI intelligence analysis
│   ├── app.ts                     # Fastify plugin registration & CORS setup
│   └── server.ts                  # Process bootstrapper & worker initialization
```

---

### 3.2 Automated Missed Check-In Escalation Worker

Located in [`backend/src/services/escalationWorker.ts`](file:///c:/Users/DELL/Safety/backend/src/services/escalationWorker.ts):
- Runs every **5 seconds** in the backend event loop.
- Queries MongoDB for active sessions where `nextPromptDueAt + gracePeriod` is in the past:
  ```typescript
  SafetySession.find({
    status: { $in: ['active', 'distress_pending'] },
    nextPromptDueAt: { $lt: new Date(Date.now() - gracePeriodMs) }
  })
  ```
- Automatically triggers emergency status on MongoDB, writes distress beacon to Firestore, and pushes high-priority FCM notifications to control room dispatchers.

---

### 3.3 Google Gemini AI Intelligence Engine

Located in [`backend/src/services/geminiService.ts`](file:///c:/Users/DELL/Safety/backend/src/services/geminiService.ts):
- Model: `gemini-3.5-flash-lite` (or configured `GEMINI_MODEL`).
- Endpoint: `POST /api/incidents/ai-summary`
- Accepts nearby community incidents, active walks, and geographic bounding parameters.
- Analyzes patterns to return structured JSON containing:
  - **`overallRiskScore`** (0–100 numerical threat rating)
  - **`threatLevel`** (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`)
  - **`executiveSummary`** (Concise situational overview)
  - **`keyHotspots`** (Identified danger corridors and times)
  - **`recommendedPrecautions`** (Actionable advice for citizens and patrolling dispatchers)

---

## 4. Web Admin & Dispatch Portal Architecture (`admin/`)

The Admin Response Center is a modern web application built with **React 19, Vite, and TypeScript**.

### Key Pages & Capabilities
1. **Live Radar Map ([`RadarPage.tsx`](file:///c:/Users/DELL/Safety/admin/src/pages/admin/RadarPage.tsx) & [`LiveRadarMap.tsx`](file:///c:/Users/DELL/Safety/admin/src/components/LiveRadarMap.tsx))**:
   - Google Maps dark/light silver canvas with custom map styles.
   - Emerald pulsing markers for active walks, crimson wave markers for emergency distress.
   - Citizen breadcrumb trail rendering, battery percentage, velocity, and last ping timestamps.
   - Multi-tier jurisdiction hierarchy filtering (Country, State/Region, Community).
   - Dispatch Action Drawer: 1-click WebRTC Voice Call, Direct Phone Dialer, Google Maps Navigation Directions, and Emergency Resolution.
2. **Emergency Dispatch Voice Modal ([`EmergencyCallModal.tsx`](file:///c:/Users/DELL/Safety/admin/src/components/EmergencyCallModal.tsx))**:
   - In-browser voice room powered by Agora RTC Web SDK (`agora-rtc-sdk-ng`).
   - Live call duration timer, mute/unmute microphone toggle, speaker volume controls, and call termination.
3. **Incidents Center ([`IncidentsPage.tsx`](file:///c:/Users/DELL/Safety/admin/src/pages/admin/IncidentsPage.tsx) & [`ReportDetailPage.tsx`](file:///c:/Users/DELL/Safety/admin/src/pages/admin/ReportDetailPage.tsx))**:
   - Filterable stream of reports with urgency badges (Low, Medium, High, Critical).
   - Status transitions (`open` ➔ `investigating` ➔ `resolved`).
   - Staff investigation thread with timestamped dispatcher notes.
   - AI Intelligence Summary Modal ([`AiSummaryModal.tsx`](file:///c:/Users/DELL/Safety/admin/src/components/AiSummaryModal.tsx)) displaying live Gemini threat assessments.
4. **Staff Management ([`StaffPage.tsx`](file:///c:/Users/DELL/Safety/admin/src/pages/admin/StaffPage.tsx))**:
   - Overview of dispatchers, field responders, and super admins.
   - National SVG flags ([`CountryFlag.tsx`](file:///c:/Users/DELL/Safety/admin/src/components/CountryFlag.tsx)) and assigned jurisdiction scoping.
5. **Public Landing Page ([`LandingPage.tsx`](file:///c:/Users/DELL/Safety/admin/src/pages/LandingPage.tsx))**:
   - Live interactive Safety Mode simulator with countdown ring.
   - Android APK direct download gateway with QR code scanner.

---

## 5. Database Schemas (MongoDB Atlas)

### 5.1 User Schema (`users`)
```typescript
{
  _id: ObjectId,
  isGuest: { type: Boolean, default: false },
  guestDeviceId: { type: String, sparse: true, index: true },
  name: { type: String, default: 'Guest' },
  email: { type: String, sparse: true, unique: true, index: true },
  phone: { type: String, default: '' },
  passwordHash: { type: String, required: false },
  emergencyContacts: [
    {
      name: String,
      phone: String,
      relationship: String
    }
  ],
  settings: {
    checkInIntervalMinutes: { type: Number, default: 5 },
    timeoutDurationSeconds: { type: Number, default: 60 },
    callHandlingPreference: { 
      type: String, 
      enum: ['standard_ring', 'auto_answer_speaker'], 
      default: 'standard_ring' 
    }
  },
  createdAt: Date,
  updatedAt: Date
}
```

### 5.2 Safety Session Schema (`safety_sessions`)
```typescript
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', index: true },
  userName: String,
  userPhone: String,
  userEmail: String,
  status: { 
    type: String, 
    enum: ['active', 'distress_pending', 'emergency', 'resolved', 'cancelled'], 
    default: 'active',
    index: true
  },
  batteryLevel: { type: Number, default: 100 },
  lastPingAt: Date,
  nextPromptDueAt: Date,
  emergencyTriggeredAt: Date,
  agoraChannelName: String,
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  addressName: String,
  countryCode: String,
  stateCode: String,
  communityId: String,
  breadcrumbs: [
    {
      coordinates: [Number], // [longitude, latitude]
      recordedAt: Date,
      batteryLevel: Number
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
// 2dsphere Index: { currentLocation: "2dsphere" }
```

### 5.3 Incident Report Schema (`incident_reports`)
```typescript
{
  _id: ObjectId,
  customId: { type: String, unique: true, sparse: true },
  reportedBy: { type: ObjectId, ref: 'User', required: false },
  reporterName: { type: String, default: 'Anonymous' },
  isAnonymous: { type: Boolean, default: false },
  source: { type: String, enum: ['community_report', 'safety_mode_emergency'], default: 'community_report' },
  category: { 
    type: String, 
    enum: ['harassment', 'theft', 'physical_threat', 'hazard', 'emergency', 'other'],
    index: true
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  addressName: String,
  countryCode: String,
  stateCode: String,
  communityId: String,
  status: { 
    type: String, 
    enum: ['open', 'investigating', 'resolved'], 
    default: 'open',
    index: true
  },
  urgency: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'medium' 
  },
  staffComments: [
    {
      staffId: { type: ObjectId, ref: 'Staff' },
      staffName: String,
      staffRole: String,
      comment: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
// 2dsphere Index: { location: "2dsphere" }
```

---

## 6. Complete Backend REST API Reference

### Authentication (`/api/auth`)
- `POST /api/auth/guest-session`: Initialize or resume an instant UUID-based guest session.
- `POST /api/auth/register`: Register permanent citizen account.
- `POST /api/auth/login`: Authenticate citizen or administrative staff credentials.
- `GET /api/auth/me`: Retrieve currently authenticated user profile.

### Safety Sessions (`/api/sessions`)
- `POST /api/sessions/start`: Begin new active walk session with GPS coordinates.
- `POST /api/sessions/ping`: High-frequency breadcrumb coordinate ingestion.
- `POST /api/sessions/check-in`: Confirm citizen safety and advance check-in deadline.
- `POST /api/sessions/trigger-sos`: Manually escalate walk into emergency distress.
- `POST /api/sessions/resolve`: Mark session as safely concluded.
- `GET /api/sessions/active`: Query active and distress sessions for dispatch radar.
- `GET /api/sessions/:id/call-status`: Fetch real-time call status for active session.

### Incidents (`/api/incidents`)
- `GET /api/incidents`: Fetch reports with geo-radius (`lat`, `lng`, `radiusKm`), category, and status filters.
- `POST /api/incidents`: Submit verified or anonymous community report.
- `POST /api/incidents/:id/comments`: Add dispatcher activity log entry.
- `PATCH /api/incidents/:id/status`: Transition report state (`open`, `investigating`, `resolved`).
- `POST /api/incidents/ai-summary`: Query Gemini AI for community risk analysis.
- `POST /api/incidents/purge-all`: Purge test data (dev/staging tool).

### Agora RTC (`/api/agora`)
- `GET /api/agora/token/:channelName`: Generate dynamic Agora RTC audio token.

### User Signaling (`/api/users`)
- `POST /api/users/device-token`: Register FCM push token, platform, and last known GPS point.
- `POST /api/users/:userId/call`: Initiate direct dispatch voice call to citizen device.
- `POST /api/users/:userId/end-call`: Signal call termination to citizen device.

---

## 7. Security, Privacy & Anonymity Architecture

1. **Tamper-Proof Safety PIN**:
   - Prevents an assailant who seizes a user's phone from canceling the distress beacon.
   - PIN hash stored securely offline in `StorageService`.
2. **True Anonymity for Community Reporting**:
   - Anonymous submissions omit user IDs and display as `Anonymous Citizen` across public feeds and dispatch records.
3. **Fail-Safe Server-Side Escalation**:
   - If an attacker disables the victim's phone or removes the SIM card during an active walk, the backend worker detects the missed check-in on the server side and dispatches emergency alerts regardless.
4. **Least-Privilege Token Architecture**:
   - Fastify JWT authentication tokens for registered citizens and staff.
   - Scoped Agora RTC tokens with 24-hour expiration windows.
   - Firebase service account secrets strictly isolated to backend servers.