# Safety Mobile Application

The official cross-platform mobile application for **Safety** — personal protection, active heartbeat check-ins, neighborhood threat mapping, and emergency dispatch links.

## Key Features

1. **Active Safety Mode (Heartbeat System)**:
   - Central interactive orbit ring indicating active/idle/distress state.
   - Dynamic countdown timer for periodic confirmation prompts.
   - Urgent Grace Period escalation HUD with audible/vibrating alerts.
   - Proactive "I'm Safe" confirmation reset.
   - Instant 1-tap manual SOS trigger.

2. **Community Threat Radar & Risk Heatmap**:
   - Interactive local map with OpenStreetMap tiles (`flutter_map`).
   - Category filtering (Harassment, Theft, Physical Threat, Hazards, Emergencies).
   - Real-time Threat Risk Score calculator (0-100 score + proximity weighting).
   - Incident detailed bottom sheet with staff comment threads.

3. **Citizen Incident Reporting**:
   - Quick-select category cards with dedicated iconography.
   - Auto-detected GPS coordinates and reverse geocoded address.
   - Anonymity toggle switch (anonymous by default for guests).

4. **Emergency SOS Response**:
   - Full-screen high-priority alert state.
   - Direct dialer for local emergency services (911 / 112 / 999).
   - Live bidirectional Agora WebRTC audio link with control room dispatchers.
   - High-frequency GPS beacon stream.
   - False alarm PIN cancellation gate.

5. **Settings & Customization**:
   - Configurable check-in intervals (1m, 3m, 5m, 10m).
   - Configurable grace period timeouts (30s, 60s, 120s).
   - Auto-answer on speakerphone mode for hands-free emergency response.
   - Emergency contacts management.
   - Guest Mode to full permanent profile upgrade.

## Getting Started

### Prerequisites
- Flutter SDK (>= 3.19.0)
- Dart SDK (>= 3.3.0)

### Installation
```bash
cd mobile
flutter pub get
flutter run
```
