# Technical Specifications & Architecture

This document describes the system architecture, database models, web console pages, and services powering Safety.

## System Architecture

```
                    ┌──────────────────────────────────────┐
                    │      Flutter Mobile Application      │
                    │   - Minimalist Clean UI              │
                    │   - Background Location & Tracking   │
                    │   - Periodic Heartbeat Check-ins     │
                    │   - Agora Voice Audio Receiver       │
                    └──────────────────┬───────────────────┘
                                       │
                       REST & WebSocket │ (Socket.io / WebSocket)
                                       │
                    ┌──────────────────▼───────────────────┐
                    │       Fastify Backend Server         │
                    │   - User & Session Management        │
                    │   - Location Ingestion               │
                    │   - Missed Check-in Escalation       │
                    │   - Threat Proximity Scoring         │
                    │   - Agora Voice Token Generation     │
                    └──────────┬──────────────────────┬────┘
                               │                      │
                   Mongoose /  │                      │ WebSocket / REST
                    2dsphere   │                      │
                               ▼                      ▼
                    ┌──────────────────────┐  ┌───────────────────────────────────┐
                    │    MongoDB Atlas     │  │    Web & Admin Dashboard          │
                    │ - Users              │  │ 1. Public Landing Page & App DL   │
                    │ - Active Walks       │  │ 2. Staff Sign-In Gate             │
                    │ - Incident Reports   │  │ 3. Live Radar Map & Dispatch      │
                    │ - Staff / Team       │  │ 4. Incidents & Reports            │
                    │ - Staff Comments     │  │ 5. Staff & Team Management        │
                    └──────────────────────┘  └───────────────────────────────────┘
```

---

## 1. Web Portal & Admin Architecture

The web application (`admin/`) provides a clean, responsive management portal built with React, Vite, and Ant Design:

1. **Public Landing Page (`LandingPage.tsx`)**:
   - Primary entry point for visitors, judges, and users.
   - Core pillars showcase and app feature walkthrough.
   - Direct Android APK download button and on-screen QR code scanner.
   - Quick link to the Staff Sign-In gate.
2. **Staff Sign-In Page (`LoginPage.tsx`)**:
   - Clean, secure sign-in interface.
   - Pre-filled evaluation credentials (`admin@safety.org` / `admin123`).
3. **Live Radar Map (`LiveRadarMap.tsx`)**:
   - Interactive map showing active walks (green) and timed-out emergency sessions (pulsing red alerts).
   - Details drawer showing user name, speed, battery level, time since last update, and live location.
   - Quick actions: In-App Voice Call, Phone Call, Get Directions (Google Maps), and Resolve Alert.
4. **Incidents & Reports (`IncidentsPage.tsx`)**:
   - Real-time list of all citizen incident reports (Harassment, Theft, Hazards, Physical Threats, Emergencies).
   - Fast filtering by category and status (Open, Investigating, Resolved), plus centralized header search.
   - Clear anonymous vs. verified user indicators.
5. **Incident Detail Page (`ReportDetailPage.tsx`)**:
   - Dedicated view with report narrative, verified coordinates, and Google Maps directions.
   - Activity notes thread for team members to log updates.
6. **Staff & Team (`StaffPage.tsx`)**:
   - Overview of all administrators and staff.
   - Country region filtering with national SVG flags.
   - "Add Staff Member" modal with default password (`safety2026`) and country selection.
   - Staff deletion and management controls.

### Service Credentials & Security Rules (.env)

> [!WARNING]
> **Never Commit Secrets or API Keys to Public Repositories.**
> - All actual credentials (Google Maps API Key, Agora App ID, Firebase configuration) belong strictly in private `.env` / `.env.local` files.
> - Private environment files are ignored by `.gitignore`.
> - Use `.env.example` as a template for required variable names.

Configured Environment Variables:
- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps JavaScript API.
- `VITE_AGORA_APP_ID`: Agora Web RTC App ID for in-browser voice calls.
- `VITE_FIREBASE_CONFIG`: Firebase JSON configuration for live data synchronization.

---

## 2. Database Models (MongoDB Schemas)

### User Schema (`users`)
Supports standard registered profiles as well as anonymous guest users.
```typescript
{
  _id: ObjectId,
  isGuest: { type: Boolean, default: false },
  guestDeviceId: { type: String, sparse: true, index: true },
  name: { type: String, default: 'Guest User' },
  email: { type: String, sparse: true, unique: true, index: true },
  phone: { type: String, sparse: true },
  passwordHash: { type: String, required: false },
  settings: {
    checkInIntervalMinutes: { type: Number, default: 5 },
    timeoutDurationSeconds: { type: Number, default: 60 },
    callHandlingPreference: { 
      type: String, 
      enum: ['standard_ring', 'auto_answer_speaker'], 
      default: 'standard_ring' 
    },
    defaultLandingTab: { 
      type: String, 
      enum: ['safety_mode', 'awareness', 'settings'], 
      default: 'safety_mode' 
    }
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Safety Walk Session Schema (`safety_sessions`)
```typescript
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', index: true },
  status: { 
    type: String, 
    enum: ['active', 'distress_pending', 'emergency', 'resolved', 'cancelled'], 
    default: 'active',
    index: true
  },
  lastPingAt: Date,
  nextPromptDueAt: Date,
  emergencyTriggeredAt: Date,
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  breadcrumbs: [
    {
      coordinates: [Number], // [longitude, latitude]
      recordedAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
// Index: { currentLocation: "2dsphere" }
```

### Incident Report Schema (`incident_reports`)
```typescript
{
  _id: ObjectId,
  reportedBy: { type: ObjectId, ref: 'User', required: false },
  isAnonymous: { type: Boolean, default: false },
  source: { type: String, enum: ['community_report', 'safety_mode_emergency'], default: 'community_report' },
  category: { type: String, enum: ['harassment', 'theft', 'physical_threat', 'hazard', 'emergency', 'other'] },
  title: String,
  description: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  status: { type: String, enum: ['open', 'investigating', 'resolved'], default: 'open' },
  staffComments: [
    {
      staffId: { type: ObjectId, ref: 'Staff' },
      staffName: String,
      comment: String,
      createdAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
// Index: { location: "2dsphere" }
```

### Staff & Team Schema (`staffs`)
```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  phone: { type: String, default: '' },
  role: { 
    type: String, 
    enum: ['super_admin', 'dispatch_officer', 'field_responder', 'support_lead'], 
    default: 'dispatch_officer' 
  },
  status: { 
    type: String, 
    enum: ['active', 'on_duty', 'offline', 'suspended'], 
    default: 'active' 
  },
  countryCode: { type: String, default: 'ALL' },
  assignedJurisdiction: { type: String, default: 'Global Command' },
  lastActiveAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

## 3. Mobile Authentication & Guest Access

The mobile app supports two entry options to keep safety accessible to everyone:

### Standard Account
- Fields: Full Name, Email, Phone Number, Password.
- Saves personal settings, contact info for dispatchers, and custom check-in preferences.

### Continue as Guest (Anonymous)
- Instant access without requiring email, phone, or password.
- Uses a device token to maintain session state locally.
- **Guest Capabilities**:
  - Turn on Safety Walk mode with countdown prompts.
  - View the live Community Threat Radar and neighborhood alerts.
  - Submit incident reports anonymously.
  - If a check-in is missed, GPS coordinates and emergency audio tokens are securely shared with control room dispatchers.
