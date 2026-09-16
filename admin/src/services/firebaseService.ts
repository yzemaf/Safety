import { initializeApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import type { Database } from 'firebase/database';
import type { SafetySession, IncidentReport } from '../types';

let firebaseApp: FirebaseApp | null = null;
let db: Database | null = null;

export const initFirebase = (configJson: string): boolean => {
  if (!configJson) return false;
  try {
    const config = JSON.parse(configJson);
    if (!getApps().length) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }
    db = getDatabase(firebaseApp);
    return true;
  } catch (err) {
    console.error('Failed to initialize Firebase:', err);
    return false;
  }
};

export const subscribeToActiveSessions = (
  onData: (sessions: SafetySession[]) => void
): (() => void) => {
  if (!db) return () => {};

  const sessionsRef = ref(db, 'safety_sessions');
  const unsubscribe = onValue(sessionsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const list: SafetySession[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      onData(list);
    }
  });

  return () => off(sessionsRef, 'value', unsubscribe);
};

export const subscribeToIncidentReports = (
  onData: (reports: IncidentReport[]) => void
): (() => void) => {
  if (!db) return () => {};

  const reportsRef = ref(db, 'incident_reports');
  const unsubscribe = onValue(reportsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const list: IncidentReport[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      onData(list);
    }
  });

  return () => off(reportsRef, 'value', unsubscribe);
};
