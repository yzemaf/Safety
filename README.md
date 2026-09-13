# Safety

A proactive personal protection and community awareness platform built for the Safety, Reporting & Protection hackathon challenge.

Safety combines an active check-in system (heartbeat protection), neighborhood threat mapping, and an emergency response dashboard with direct voice calling and dispatch routing.

## The Problem

Most safety applications only work reactively: when danger happens, the victim is expected to unlock their phone, open an app, and trigger an emergency button. In real-life scenarios involving sudden threats, medical emergencies, or phone snatching, victims often cannot reach their phone in time.

Additionally, community reporting often lacks trust, privacy, and immediate actionable follow-up from local responders.

## How Safety Works

Safety approaches safety in three core pillars:

### 1. Active Safety Mode (Heartbeat Check-in)
Users can turn on Safety Mode before walking home or entering unfamiliar environments. 
* Activating safety mode requires location permissions and begins streaming coordinates to the backend.
* The app presents a clean, centralized toggle button (similar to a VPN connection switch).
* At set intervals, the app requests a quick confirmation tap from the user. It runs in the background and can prompt on screen so users never miss a check-in.
* If a check-in is missed and the grace period expires, the platform immediately triggers Emergency Mode.

### 2. Community Awareness and Risk Mapping
* Users can submit incident reports for their area, with an option to report anonymously to protect their privacy.
* The awareness view features an interactive map displaying community reports and historical distress hotspots.
* The system evaluates local report density to give users a real-time risk indicator for their immediate surroundings.

### 3. Admin Response Center
When a user enters Emergency Mode:
* The admin map highlights the exact coordinates with a pulsing alert indicator.
* Responders can immediately reach out to the user either via standard phone call or in-app voice call powered by Agora.
* Responders can open direct turn-by-turn navigation via Google Maps to trace and reach the user.
* Staff can manage reports, add incident comments, and update case statuses in real time.

## Design Philosophy

The mobile and web interfaces follow a minimalist, modern aesthetic:
* Clean white canvas with subtle green accents.
* Uncluttered navigation focused on clarity, speed, and ease of use under stress.

## Project Structure

This repository is organized into three workspaces:

* `mobile/`: Flutter cross-platform mobile application for end users.
* `admin/`: Vite and React web application for administrators and emergency responders, including an APK download page for testing.
* `backend/`: Node.js and Fastify API server with MongoDB for real-time location streaming, alerts, and report management.

## Technical Documentation

For detailed architecture diagrams, API schemas, background services, and Agora configuration, see `TECHNICAL_SPEC.md`.

## Selected Category Details

Safety, Reporting & Protection
Design tools that allow individuals and communities to safely report threats, violence, or abuse and get timely support. Prioritize anonymity, trust, and clear pathways to action so reporting actually leads to protection.