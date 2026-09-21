# OSF x Andela Hackathon

# Safety — Proactive Protection & Threat Radar

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Flutter](https://img.shields.io/badge/Flutter-3.3.3+-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify&logoColor=white)](https://www.fastify.io)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20%26%20FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Agora](https://img.shields.io/badge/Agora-WebRTC%20Audio-099DFD?logo=agora&logoColor=white)](https://www.agora.io)
[![Gemini](https://img.shields.io/badge/Google-Gemini%20AI-8E75C2?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-Default%20Map-7EBC6F?logo=openstreetmap&logoColor=white)](https://www.openstreetmap.org)


**Safety** is an end-to-end personal protection, community threat awareness, and emergency dispatch platform built for the **Safety, Reporting & Protection** hackathon challenge.

Safety replaces reactive "panic buttons" with a proactive heartbeat safety engine, real-time community danger heatmaps, AI-driven threat intelligence briefings, and an emergency response center with direct two-way voice communication.

---

## 🌐 Live Web Portal & Mobile APK Download

> **Live Testing URL**: The web app and dispatch portal is hosted for live testing, including the interactive Walk Simulator, Live Threat Radar, and Android APK Download:

* **Live Testing Link**: [https://safety-thon.vercel.app/](https://safety-thon.vercel.app/)
* **Direct Android APK Download**: Available directly from the landing page on the live link above (includes 1-tap download and a quick QR code scanner for physical phones).

### Demo Credentials for Testing:
* **Super Admin**: `admin@safety.org` / `admin123`
* **User**: `user@safety.org` / `123456`
* **Default Emergency Pins**: `1234`

---

## 🚨 The Core Problem

Most safety applications operate **reactively**: when danger strikes, the victim is expected to unlock their phone, find an app, and trigger an emergency button. In real-life emergencies — sudden physical assaults, medical collapse, accidents, or phone theft — victims rarely have the time or ability to reach their phones.

Additionally, community threat reporting often suffers from lack of anonymity, slow response times, and an absence of actionable dispatch coordination.

---

## 🛡️ How Safety Works: The 3 Pillars

```
┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     1. PROACTIVE HEARTBEAT      │   │    2. COMMUNITY THREAT RADAR    │   │    3. EMERGENCY COMMAND CENTER  │
│  - Continuous walk check-ins    │   │  - Anonymous incident reporting │   │  - Multi-tier live GPS radar    │
│  - Grace period warning pulse   │   │  - Local risk score calculation │   │  - Instant Agora voice call     │
│  - Server-side fail-safe SOS    │   │  - Gemini AI threat briefings   │   │  - Turn-by-turn dispatch route  │
│  - Floating system overlay      │   │  - Proximity push notifications │   │  - Incident dossier & triage    │
└─────────────────────────────────┘   └─────────────────────────────────┘   └─────────────────────────────────┘
```

### 1. Active Safety Mode (Heartbeat Check-In)
* **Pre-Walk Activation**: Users toggle Safety Mode on before walking home, commuting late, or entering unfamiliar environments.
* **Interval Countdown**: The app runs a countdown timer (e.g. 1, 3, 5, or 10 minutes) with a live progress ring.
* **1-Tap Confirmation**: Tapping the center ring or "Check-in" button confirms safety and resets the interval.
* **Floating System Overlay**: Runs a draggable floating pill widget (`FlutterOverlayWindow`) over any active app with live countdown status.
* **Grace Period & Full-Screen Intent**: If a check-in is missed, the phone immediately triggers amber warning haptics, wakes the screen over the lock-screen, and presents an urgent 60-second countdown.
* **Server-Side Fail-Safe Escalation**: If the countdown expires or the device is destroyed/powered off, the backend `escalationWorker` automatically escalates the session into Emergency Mode on the server side.
* **Tamper-Proof Safety PIN**: Canceling an emergency requires entering a verified 4-digit Safety PIN, preventing an attacker from canceling a distress beacon.

### 2. Community Awareness & Threat Radar
* **Anonymous / Verified Incident Reporting**: Citizens can report harassment, theft, physical threats, or hazards with automatic GPS reverse geocoding via OpenStreetMap Nominatim.
* **Real-Time Neighborhood Risk Score**: Computes a local threat level (**Safe**, **Moderate**, **Caution**, **Severe**) based on nearby report density.
* **Google Gemini AI Threat Intelligence**: The backend analyzes incident clusters and active sessions within a geographical bounding area to generate structured safety briefings and threat assessments for dispatchers.
* **FCM Proximity Alerts**: High-urgency distress beacons trigger push notifications to nearby citizens within the community perimeter.

### 3. Admin Emergency Command & Response Center
* **Live Radar Map**: Real-time **Leaflet + OpenStreetMap** canvas (default, zero API key required) displaying active walks (emerald pulsing pins) and distress alerts (crimson wave pins). Google Maps is available as an optional alternative engine switchable via a single constant.
* **Instant In-Browser Agora Voice Calling**: Responders can initiate two-way WebRTC voice calls to the victim's phone directly through the browser.
* **Turn-by-Turn Navigation**: 1-click routing from the dispatcher's location or station to the citizen's exact coordinates.
* **Multi-Jurisdiction Scoping**: Hierarchical filtering across countries, states/regions, and specific neighborhood communities powered by OSM Nominatim boundary resolution.

---

## 🗺️ Map Engine

The platform ships with a **dual map engine** architecture. The active engine is controlled by a single constant in [`LiveRadarMap.tsx`](file:///c:/Users/DELL/Safety/admin/src/components/LiveRadarMap.tsx) for the web portal and a `MapEngine` enum in [`awareness_radar_screen.dart`](file:///c:/Users/DELL/Safety/mobile/lib/screens/awareness_radar_screen.dart) for mobile:

```typescript
// admin/src/components/LiveRadarMap.tsx
// Set to 'osm' for OpenStreetMap/Leaflet (default — zero API keys required)
// Set to 'googlemaps' to use the Google Maps JavaScript API
export const ACTIVE_MAP_ENGINE: MapEngineMode = 'osm';
```

| Feature | OpenStreetMap / Leaflet (Default ✅) | Google Maps (Optional) |
|---|---|---|
| **API Key Required** | ❌ None | ✅ `VITE_GOOGLE_MAPS_API_KEY` |
| **Tile Source** | OpenStreetMap tile servers | Google Maps tile infrastructure |
| **Community Search** | OSM Nominatim (free) | Google Places Autocomplete |
| **Boundary Polygons** | OSM Nominatim GeoJSON | Google Geocoding API |
| **Map Animations** | Leaflet `flyTo()` | Custom cubic-bezier RAF engine |
| **Cost** | Free & open-source | Pay-per-use billing |

The **mobile Flutter app** (Community Radar screen) mirrors this pattern — `flutter_map` with OpenStreetMap tiles is the default active engine (`MapEngine.openStreetMap`), with `google_maps_flutter` available as an opt-in alternative.

---

## 📂 Project Structure

```
Safety/
├── mobile/          # Flutter Cross-Platform Mobile App (Android / iOS)
│   ├── lib/
│   │   ├── config/      # Constants, colors, themes, and env templates
│   │   ├── models/      # IncidentReport, SafetySession, User, LocationPoint
│   │   ├── providers/   # SafetySession, Auth, Incident, Settings Providers
│   │   ├── screens/     # Home (SafetyMode), Community (AwarenessRadar), Report (ReportIncident), Settings, ActiveCall
│   │   ├── services/    # Agora, Firestore, FCM, Location, Boundary, Overlay
│   │   └── widgets/     # SafetyOverlay, SafetyPinSheet, LocationPickerSheet, InAppNotification, AppLoader, PulsingRadar
│   └── android/         # Native Kotlin full-screen intents, wake locks, and receivers
│
├── backend/         # Fastify Node.js & TypeScript Backend API
│   ├── src/
│   │   ├── config/      # Database & environment configurations
│   │   ├── models/      # MongoDB Mongoose schemas (2dsphere spatial indexing)
│   │   ├── routes/      # Auth, Sessions, Incidents, Staff, Users, Agora routes
│   │   └── services/    # EscalationWorker, GeminiService, FirebaseService, AgoraService
│   └── package.json
│
├── admin/           # React 19 + Vite + TypeScript Web Dispatch Portal
│   ├── src/
│   │   ├── components/  # LiveRadarMap (Leaflet/OSM default + Google Maps fallback), EmergencyCallModal, AiSummaryModal, CountryFlag
│   │   ├── pages/       # LandingPage, LoginPage, RadarPage, IncidentsPage, StaffPage
│   │   └── services/    # ApiService, AgoraService, FirebaseService, BoundaryService, OsmLocationService
│   └── package.json
│
├── TECHNICAL_SPEC.md # Full architectural blueprint, schemas, and API documentation
└── README.md
```

---

## 🚀 How to Run the Source Code (Quick Start Guide)

This repository is organized as a monorepo containing three core components:
1. **[Admin & Web Dispatch Portal](file:///c:/Users/DELL/Safety/admin)** (`admin/`) — React 19 + Vite web client for landing, live dispatch radar, incidents triage, and Agora WebRTC voice calling.
2. **[Mobile Application](file:///c:/Users/DELL/Safety/mobile)** (`mobile/`) — Flutter cross-platform mobile app (Android / iOS) with proactive heartbeat safety checks, floating overlay, and real-time community radar.
3. **[Backend API & Escalation Engine](file:///c:/Users/DELL/Safety/backend)** (`backend/`) — Fastify Node.js & TypeScript service with MongoDB spatial indexes, Firebase sync, Agora token generation, and Gemini AI threat briefings.

---

### 📋 Prerequisites

| Component | Prerequisites |
|---|---|
| **Admin & Web Portal** | Node.js `v18.0.0+`, npm `v9+` |
| **Mobile App** | Flutter SDK `v3.3.3+`, Dart SDK, Android Studio / Xcode, Android SDK (API level 26+), physical phone or emulator |
| **Backend API** | Node.js `v18.0.0+`, MongoDB Atlas (or local MongoDB), Firebase Project, Agora Developer Account |

---

### ⚡ Quick Run Summary (Cheat Sheet)

```bash
# 1. Start Backend API (Port 5000)
cd backend && npm install && cp .env.example .env && npm run seed && npm run dev

# 2. Start Admin & Web Dispatch Portal (Port 5173)
cd admin && npm install && cp .env.example .env && npm run dev

# 3. Start Flutter Mobile App
cd mobile && cp lib/config/env.example.dart lib/config/env.dart && flutter pub get && flutter run
```

---

### 1️⃣ Running the Admin & Web Dispatch Portal (`admin/`)

The **Admin Web Portal** provides the interactive landing page, real-time command center radar, emergency Agora voice dispatch, and incident triage dashboard.

#### Step 1: Navigate to the `admin` directory and install dependencies
```bash
cd admin
npm install
```

#### Step 2: Configure Environment Variables
Create your local environment file by copying the template:
```bash
cp .env.example .env
```

Open `.env` and set the following parameters:
```env
# Fastify Backend API Base URL
VITE_API_URL=http://localhost:5000/api

# Agora App ID (for in-browser WebRTC two-way voice calling)
VITE_AGORA_APP_ID=your_agora_app_id_here

# Firebase Web Client Configuration JSON (for real-time Firestore synchronization)
VITE_FIREBASE_CONFIG={"apiKey":"your_api_key","authDomain":"safety-711a9.firebaseapp.com","projectId":"safety-711a9","storageBucket":"safety-711a9.firebasestorage.app","messagingSenderId":"your_sender_id","appId":"your_app_id","databaseURL":"https://safety-711a9-default-rtdb.europe-west1.firebasedatabase.app"}

# (Optional) Google Maps JavaScript API Key
# Note: Leaflet + OpenStreetMap is the DEFAULT engine and requires NO API KEY.
# Only populate this if switching ACTIVE_MAP_ENGINE to 'googlemaps' in LiveRadarMap.tsx
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

#### Step 3: Start the Vite Development Server
```bash
npm run dev
```
The web portal will be accessible at **`http://localhost:5173`**.

#### Step 4: Login & Testing Credentials
* **Super Admin**: `admin@safety.org` / `admin123`
* **Test User**: `user@safety.org` / `123456`
* **Default PIN**: `1234`

#### Additional Admin Scripts
* **Production Build**: `npm run build` (outputs optimized bundle to `dist/`)
* **Local Production Preview**: `npm run preview`
* **Linting**: `npm run lint`

---

### 2️⃣ Running the Mobile Application (`mobile/`)

The **Mobile App** is built with Flutter and supports Android and iOS. It delivers proactive heartbeat check-ins, floating system overlays, background grace-period alerts, community incident heatmaps, and Agora WebRTC voice calling.

#### Step 1: Navigate to the `mobile` directory and fetch packages
```bash
cd mobile
flutter pub get
```

#### Step 2: Configure Mobile Environment Variables
Copy the template configuration file:
```bash
cp lib/config/env.example.dart lib/config/env.dart
```

Open `lib/config/env.dart` and configure your settings:
```dart
class Env {
  // Agora App ID for two-way emergency audio
  static const String agoraAppId = 'YOUR_AGORA_APP_ID';

  // Optional: only if using Google Maps engine (Default is OpenStreetMap)
  static const String googleMapsApiKey = 'YOUR_GOOGLE_MAPS_API_KEY';

  // Backend API URL:
  // - Android Emulator: http://10.0.2.2:5000/api
  // - iOS Simulator:    http://localhost:5000/api
  // - Physical Device:  http://<YOUR_LOCAL_IP>:5000/api (e.g. http://192.168.1.50:5000/api)
  // - Production:       https://your-production-domain.com/api
  static const String apiBaseUrl = 'http://10.0.2.2:5000/api';
}
```

> [!TIP]
> **Connecting Mobile to Local Backend**:
> - If running on the **Android Emulator**, use `http://10.0.2.2:5000/api` to reach your host machine.
> - If running on a **physical device connected via USB/Wi-Fi**, use your machine's LAN IP (e.g., `http://192.168.x.x:5000/api`) and ensure your phone is on the same local network.

#### Step 3: Run the App on a Device or Emulator
Ensure your emulator is booted or your physical Android/iOS phone is connected with USB Debugging enabled:

```bash
# Check available devices
flutter devices

# Launch the app
flutter run

# Or target a specific device directly
flutter run -d <device-id>
```

#### Step 4: Build Release APK (Android)
To build a standalone installable Android package:
```bash
flutter build apk --release
```
The output APK will be generated at `build/app/outputs/flutter-apk/app-release.apk`.

#### Required Permissions on First Launch:
* **Location Permission**: For GPS tracking and reverse geocoding nearby incidents.
* **Microphone Permission**: For Agora WebRTC emergency voice communication.
* **System Overlay Permission** (`Display over other apps`): Required for the draggable floating pill widget during active safety walks.
* **Notification Permission**: For background countdown timer alerts and proximity danger alerts.

---

### 3️⃣ Running the Backend API & Escalation Engine (`backend/`)

The **Backend** is a high-performance Fastify Node.js server that handles REST API endpoints, JWT authentication, MongoDB 2dsphere spatial indexing, Agora RTC token signing, Google Gemini AI threat briefings, and background auto-escalation workers.

#### Step 1: Navigate to the `backend` directory and install dependencies
```bash
cd backend
npm install
```

#### Step 2: Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Edit `backend/.env` with your credentials:
```env
PORT=5000
HOST=0.0.0.0
NODE_ENV=development

# MongoDB Atlas Database URI
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/safety?retryWrites=true&w=majority

# JWT Authentication Secret Key
JWT_SECRET=your_jwt_secret_key_here

# Agora RTC Voice Configuration
AGORA_APP_ID=your_agora_app_id_here
AGORA_APP_CERTIFICATE=your_agora_app_certificate_here

# Firebase Admin SDK & Realtime Database
FIREBASE_PROJECT_ID=safety-711a9
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_DATABASE_URL=https://safety-711a9-default-rtdb.europe-west1.firebasedatabase.app

# Google Gemini AI Threat Analysis Config
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

#### Step 3: Seed Initial Data (Admin & Sample Incidents)
Run the built-in seeder to populate sample users, super admins, and geo-located community incidents:
```bash
npm run seed
```

#### Step 4: Start the Development Server
```bash
npm run dev
```
The server will start listening at **`http://localhost:5000`**.

#### Additional Backend Scripts
* **Compile TypeScript**: `npm run build` (outputs to `dist/`)
* **Start Production Server**: `npm start`
* **Clean Database**: `npm run clean`

---

## 🔑 Environment Configuration Reference

Refer to the service templates for full details:
* Backend: [`backend/.env.example`](file:///c:/Users/DELL/Safety/backend/.env.example)
* Admin Web: [`admin/.env.example`](file:///c:/Users/DELL/Safety/admin/.env.example)
* Mobile: [`mobile/lib/config/env.example.dart`](file:///c:/Users/DELL/Safety/mobile/lib/config/env.example.dart) & [`mobile/android/local.properties`](file:///c:/Users/DELL/Safety/mobile/android/local.properties)

---

## 📖 Deep-Dive Architecture Documentation

For complete data models, state transition diagrams, WebRTC audio pipelines, Leaflet/OpenStreetMap dual-engine architecture details, OSM Nominatim boundary polygon algorithms, and API specifications, see **[`TECHNICAL_SPEC.md`](file:///c:/Users/DELL/Safety/TECHNICAL_SPEC.md)**.

