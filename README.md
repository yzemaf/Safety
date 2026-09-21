# Safety — Proactive Protection & Threat Radar

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Flutter](https://img.shields.io/badge/Flutter-3.3.3+-02569B?logo=flutter&logoColor=white)](https://flutter.dev)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify&logoColor=white)](https://www.fastify.io)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20%26%20FCM-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Agora](https://img.shields.io/badge/Agora-WebRTC%20Audio-099DFD?logo=agora&logoColor=white)](https://www.agora.io)
[![Gemini](https://img.shields.io/badge/Google-Gemini%20AI-8E75C2?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

**Safety** is an end-to-end personal protection, community threat awareness, and emergency dispatch platform built for the **Safety, Reporting & Protection** hackathon challenge.

Safety replaces reactive "panic buttons" with a proactive heartbeat safety engine, real-time community danger heatmaps, AI-driven threat intelligence briefings, and an emergency response center with direct two-way voice communication.

---

## 🌐 Live Web Portal & Mobile APK Download

> **Live Testing URL**: The web app and dispatch portal is hosted for live testing, including the interactive Walk Simulator, Live Threat Radar, and Android APK Download:

* **Live Testing Link**: [https://safety-thon.vercel.app/](https://safety-thon.vercel.app/)
* **Direct Android APK Download**: Available directly from the landing page on the live link above (includes 1-tap download and a quick QR code scanner for physical phones).

### Demo Credentials for Testing:
* **Super Admin**: `admin@safety.org` / `admin123`

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
* **Anonymous / Verified Incident Reporting**: Citizens can report harassment, theft, physical threats, or hazards with automatic GPS reverse geocoding.
* **Real-Time Neighborhood Risk Score**: Computes a local threat level (**Safe**, **Moderate**, **Caution**, **Severe**) based on nearby report density.
* **Google Gemini AI Threat Intelligence**: The backend analyzes incident clusters and active sessions within a geographical bounding area to generate structured safety briefings and threat assessments for dispatchers.
* **FCM Proximity Alerts**: High-urgency distress beacons trigger push notifications to nearby citizens within the community perimeter.

### 3. Admin Emergency Command & Response Center
* **Live Radar Map**: Real-time Google Maps canvas with dark/silver styling displaying active walks (emerald pulsing pins) and distress alerts (crimson wave pins).
* **Instant In-Browser Agora Voice Calling**: Responders can initiate two-way WebRTC voice calls to the victim's phone directly through the browser.
* **Turn-by-Turn Navigation**: 1-click Google Maps routing from the dispatcher's location or station to the citizen's exact coordinates.
* **Multi-Jurisdiction Scoping**: Hierarchical filtering across countries, states/regions, and specific neighborhood communities.

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
│   │   ├── components/  # LiveRadarMap, EmergencyCallModal, AiSummaryModal, CountryFlag
│   │   ├── pages/       # LandingPage, LoginPage, RadarPage, IncidentsPage, StaffPage
│   │   └── services/    # ApiService, AgoraService, FirebaseService, BoundaryService
│   └── package.json
│
├── TECHNICAL_SPEC.md # Full architectural blueprint, schemas, and API documentation
└── README.md
```

---

## 🚀 Quick Start Guide

### Prerequisites
* **Node.js**: `v18.0.0+`
* **Flutter SDK**: `v3.3.3+` (with Android Studio & Dart SDK)
* **MongoDB Atlas** database URI
* **Firebase Project** with Cloud Firestore & Cloud Messaging enabled
* **Agora.io Developer Account** (App ID & Certificate for voice calling)
* **Google Gemini API Key** (for AI intelligence summaries)

---

### 1. Backend Server Setup

```bash
cd backend
npm install

# Configure environment variables (copy from template)
cp .env.example .env
# Edit .env with your MongoDB URI, JWT Secret, Agora Keys, Firebase credentials, and Gemini API Key

# Start development server on http://localhost:5000
npm run dev
```

---

### 2. Admin Web Portal Setup

```bash
cd admin
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your backend API URL, Google Maps Key, Agora App ID, and Firebase Web Config

# Start Vite dev server on http://localhost:5173
npm run dev
```

Demo credentials for testing:
* **Super Admin**: `admin@safety.org` / `admin123`

---

### 3. Flutter Mobile App Setup

```bash
cd mobile

# Configure mobile environment variables (copy from template)
cp lib/config/env.example.dart lib/config/env.dart
# Edit lib/config/env.dart with your Agora App ID, Google Maps Key, and Backend URL

# (Optional for Android builds) Add MAPS_API_KEY to android/local.properties:
# MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY

# Install Flutter dependencies
flutter pub get

# Launch on connected Android device or emulator
flutter run
```

---

## 🔑 Environment Configuration Reference

Refer to the service templates for full details:
* Backend: [`backend/.env.example`](file:///c:/Users/DELL/Safety/backend/.env.example)
* Admin Web: [`admin/.env.example`](file:///c:/Users/DELL/Safety/admin/.env.example)
* Mobile: [`mobile/lib/config/env.example.dart`](file:///c:/Users/DELL/Safety/mobile/lib/config/env.example.dart) & [`mobile/android/local.properties`](file:///c:/Users/DELL/Safety/mobile/android/local.properties)

---

## 📖 Deep-Dive Architecture Documentation

For complete data models, state transition diagrams, WebRTC audio pipelines, OpenStreetMap polygon smoothing algorithms, and API specifications, see **[`TECHNICAL_SPEC.md`](file:///c:/Users/DELL/Safety/TECHNICAL_SPEC.md)**.