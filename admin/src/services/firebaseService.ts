import { initializeApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { SafetySession, IncidentReport, StaffComment } from '../types';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBQsQgMeNJwJT40tMcfT9_m523ECGlXR5o",
  authDomain: "safety-711a9.firebaseapp.com",
  projectId: "safety-711a9",
  storageBucket: "safety-711a9.firebasestorage.app",
  messagingSenderId: "171668239587",
  appId: "1:171668239587:web:safety_admin_web_client",
};

let firebaseApp: FirebaseApp | null = null;
let db: Firestore | null = null;

// Eager initialization on module load
try {
  if (!getApps().length) {
    firebaseApp = initializeApp(DEFAULT_FIREBASE_CONFIG);
  } else {
    firebaseApp = getApps()[0];
  }
  db = getFirestore(firebaseApp);
} catch (e) {
  console.warn('[Admin Firebase] Auto-init warning:', e);
}

export const initFirebase = (configJson: string): boolean => {
  if (!configJson) return Boolean(db);
  try {
    const config = JSON.parse(configJson);
    if (!getApps().length) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApps()[0];
    }
    db = getFirestore(firebaseApp);
    return true;
  } catch (err) {
    console.error('Failed to initialize Firebase Firestore:', err);
    return Boolean(db);
  }
};

export const subscribeToActiveSessions = (
  onData: (sessions: SafetySession[]) => void
): (() => void) => {
  if (!db) return () => {};

  const colRef = collection(db, 'safety_sessions');
  const unsubscribe = onSnapshot(colRef, (snapshot) => {
    const list: SafetySession[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as SafetySession;
      if (data && (data.status === 'active' || data.status === 'distress_pending' || data.status === 'emergency')) {
        list.push({ ...data, id: docSnap.id });
      }
    });
    onData(list);
  }, (err) => {
    console.warn('[Admin Firestore] subscribeToActiveSessions error:', err);
  });

  return unsubscribe;
};

export const subscribeToIncidentReports = (
  onData: (reports: IncidentReport[]) => void
): (() => void) => {
  if (!db) return () => {};

  const colRef = collection(db, 'incident_reports');
  const unsubscribe = onSnapshot(colRef, (snapshot) => {
    const list: IncidentReport[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as IncidentReport;
      if (data) {
        list.push({ ...data, id: docSnap.id });
      }
    });
    onData(list);
  }, (err) => {
    console.warn('[Admin Firestore] subscribeToIncidentReports error:', err);
  });

  return unsubscribe;
};

export const subscribeToCallStatus = (
  sessionId: string,
  userId: string | undefined,
  onStatusChange: (status: string, callData: any) => void
): (() => void) => {
  if (!db) return () => {};

  const unsubs: Array<() => void> = [];

  const targets = [
    ...(userId ? [{ col: 'calls', id: userId }] : []),
    { col: 'calls', id: sessionId },
  ];

  targets.forEach((target) => {
    try {
      const docRef = doc(db!, target.col, target.id);
      const unsub = onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.status) {
            onStatusChange(data.status, data);
          }
        }
      });
      unsubs.push(unsub);
    } catch (err) {
      console.warn('[Admin Firestore] subscribeToCallStatus error on target:', target, err);
    }
  });

  return () => {
    unsubs.forEach((u) => u());
  };
};

export const updateIncidentInFirestore = async (reportId: string, updates: Partial<IncidentReport>): Promise<void> => {
  if (!db || !reportId) return;
  try {
    const docRef = doc(db, 'incident_reports', reportId);
    await setDoc(docRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('[Admin Firestore] Error updating incident:', err);
  }
};

export const addCommentInFirestore = async (reportId: string, comment: StaffComment): Promise<void> => {
  if (!db || !reportId) return;
  try {
    const docRef = doc(db, 'incident_reports', reportId);
    await setDoc(
      docRef,
      {
        staffComments: arrayUnion(comment),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Admin Firestore] Error appending comment to incident:', err);
  }
};
