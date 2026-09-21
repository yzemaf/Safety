import mongoose from 'mongoose';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { IIncidentReport } from '../models/IncidentReport.js';
import { ISafetySession } from '../models/SafetySession.js';

let firebaseInitialized = false;
let firestoreDb: admin.firestore.Firestore | null = null;

export function initFirebase(): void {
  try {
    if (admin.apps.length > 0) {
      firebaseInitialized = true;
      try {
        firestoreDb = admin.firestore();
      } catch (_) {}
      return;
    }

    // Resolve service account path relative to backend root or absolute
    let serviceAccountFile = config.firebase.serviceAccountPath;
    if (serviceAccountFile && !path.isAbsolute(serviceAccountFile)) {
      const candidatePaths = [
        path.resolve(process.cwd(), serviceAccountFile),
        path.resolve(process.cwd(), 'serviceAccountKey.json'),
        path.resolve(process.cwd(), 'src', serviceAccountFile),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          serviceAccountFile = p;
          break;
        }
      }
    }

    if (serviceAccountFile && fs.existsSync(serviceAccountFile)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebase.projectId || serviceAccount.project_id,
        databaseURL: config.firebase.databaseUrl,
      });
      firebaseInitialized = true;
      try {
        firestoreDb = admin.firestore();
      } catch (dbErr) {
        console.warn('[FCM/Firestore] Database init note:', dbErr);
      }
      console.log(`[Firebase] Admin & Cloud Firestore initialized successfully with key: ${serviceAccountFile}`);
    } else {
      admin.initializeApp({
        projectId: config.firebase.projectId,
        databaseURL: config.firebase.databaseUrl,
      });
      firebaseInitialized = true;
      try {
        firestoreDb = admin.firestore();
      } catch (_) {}
      console.log(`[Firebase] Admin initialized for project: ${config.firebase.projectId}`);
    }
  } catch (error) {
    console.warn(`[Firebase] Initialization warning:`, error);
    firebaseInitialized = false;
  }
}

/**
 * Syncs a safety walk session to Firebase Realtime Database node `safety_sessions/{sessionId}`.
 * This delivers sub-second GPS & state updates directly to Admin Radar map.
 */
export async function syncSessionToFirebase(session: ISafetySession | any): Promise<void> {
  if (!firestoreDb) return;
  try {
    const sessionId = session._id ? session._id.toString() : session.id;
    if (!sessionId) return;

    const coords = session.currentLocation?.coordinates || [3.3515, 6.6018];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    const formattedBreadcrumbs = Array.isArray(session.breadcrumbs)
      ? session.breadcrumbs.map((b: any) => ({
          lat: Number(b.coordinates ? b.coordinates[1] : b.lat),
          lng: Number(b.coordinates ? b.coordinates[0] : b.lng),
          recordedAt: b.recordedAt ? new Date(b.recordedAt).toISOString() : new Date().toISOString(),
          batteryLevel: b.batteryLevel ?? session.batteryLevel ?? 100,
        }))
      : [];

    const payload = {
      id: sessionId,
      userId: session.userId ? session.userId.toString() : '',
      userName: session.userName || 'Citizen',
      userPhone: session.userPhone || '',
      userEmail: session.userEmail || '',
      status: session.status || 'active',
      batteryLevel: session.batteryLevel ?? 100,
      lastPingAt: session.lastPingAt ? new Date(session.lastPingAt).toISOString() : new Date().toISOString(),
      nextPromptDueAt: session.nextPromptDueAt ? new Date(session.nextPromptDueAt).toISOString() : null,
      emergencyTriggeredAt: session.emergencyTriggeredAt ? new Date(session.emergencyTriggeredAt).toISOString() : null,
      agoraChannelName: session.agoraChannelName || `safety_emergency_${session.userId}`,
      addressName: session.addressName || 'Live Location',
      countryCode: session.countryCode || '',
      stateCode: session.stateCode || '',
      communityId: session.communityId || '',
      currentLocation: {
        lat,
        lng,
      },
      breadcrumbs: formattedBreadcrumbs,
      updatedAt: new Date().toISOString(),
    };

    await firestoreDb.collection('safety_sessions').doc(sessionId).set(payload, { merge: true });
  } catch (err) {
    console.warn('[Firebase Firestore] Error syncing session:', err);
  }
}

/**
 * Syncs an incident report to Firebase Realtime Database node `incident_reports/{incidentId}`.
 */
export async function syncIncidentToFirebase(incident: IIncidentReport | any): Promise<void> {
  if (!firestoreDb) return;
  try {
    const incidentId = incident.customId || (incident._id ? incident._id.toString() : incident.id);
    if (!incidentId) return;

    const coords = incident.location?.coordinates || [0, 0];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    const payload = {
      id: incidentId,
      reportedBy: incident.reportedBy ? incident.reportedBy.toString() : '',
      reporterName: incident.reporterName || 'Citizen',
      isAnonymous: Boolean(incident.isAnonymous),
      source: incident.source || 'community_report',
      category: incident.category || 'other',
      urgency: incident.urgency || 'medium',
      title: incident.title || 'Incident Reported',
      description: incident.description || '',
      addressName: incident.addressName || 'Near Current Location',
      countryCode: incident.countryCode || '',
      stateCode: incident.stateCode || '',
      communityId: incident.communityId || '',
      status: incident.status || 'open',
      location: {
        lat,
        lng,
      },
      staffComments: Array.isArray(incident.staffComments) ? incident.staffComments : [],
      createdAt: incident.createdAt ? new Date(incident.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await firestoreDb.collection('incident_reports').doc(incidentId).set(payload, { merge: true });
  } catch (err) {
    console.warn('[Firebase Firestore] Error syncing incident:', err);
  }
}

/**
 * Pillar 3: Dispatches instant push notifications to all citizen devices
 * within a 3.5km geo-radius or matching the community jurisdiction.
 */
export async function sendProximityNotification(
  incident: IIncidentReport,
  radiusMeters: number = 3500
): Promise<number> {
  try {
    const [lng, lat] = incident.location.coordinates;

    // 1. Query users within geo-radius or same communityId who have an FCM token (excluding reporter)
    const earthRadiusMeters = 6378137;
    const radiusRadians = radiusMeters / earthRadiusMeters;

    const reporterIdStr = incident.reportedBy ? incident.reportedBy.toString() : '';
    let reporterFcmToken = '';
    if (reporterIdStr) {
      const reporterUser = await User.findById(reporterIdStr).select('fcmToken');
      if (reporterUser?.fcmToken) reporterFcmToken = reporterUser.fcmToken;
    }

    const reporterObjId = mongoose.Types.ObjectId.isValid(reporterIdStr)
      ? new mongoose.Types.ObjectId(reporterIdStr)
      : null;

    const nearbyUsers = await User.find({
      $and: [
        { fcmToken: { $exists: true, $ne: '' } },
        ...(reporterObjId ? [{ _id: { $nin: [reporterIdStr, reporterObjId] } }] : []),
        {
          $or: [
            {
              lastKnownLocation: {
                $geoWithin: {
                  $centerSphere: [[lng, lat], radiusRadians],
                },
              },
            },
            { communityId: incident.communityId },
          ],
        },
      ],
    }).select('fcmToken name');

    const tokens = nearbyUsers
      .map((u) => u.fcmToken)
      .filter((t): t is string => Boolean(t && t.length > 10 && t !== reporterFcmToken));

    if (tokens.length === 0) {
      console.log(
        `[FCM] No registered device tokens found within ${radiusMeters}m / community '${incident.communityId}'.`
      );
      return 0;
    }

    const urgencyEmoji = incident.urgency === 'critical' ? '🚨' : '⚠️';
    const title = `${urgencyEmoji} Threat Alert: ${incident.title}`;
    const body = `${incident.category.toUpperCase()} reported nearby in ${incident.communityId.toUpperCase()} • Tap to open radar map.`;

    if (!firebaseInitialized) {
      console.log(`[FCM Mock Log] Would dispatch push to ${tokens.length} devices:`, {
        title,
        body,
        incidentId: incident._id,
      });
      return tokens.length;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        type: 'proximity_alert',
        incidentId: incident._id.toString(),
        communityId: incident.communityId,
        category: incident.category,
        urgency: incident.urgency,
        lat: lat.toString(),
        lng: lng.toString(),
        channelId: 'safety_alerts',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'safety_alerts',
          color: '#1B8529',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `[FCM] Sent proximity push: ${response.successCount} succeeded, ${response.failureCount} failed.`
    );
    return response.successCount;
  } catch (error) {
    console.error('[FCM] Error dispatching proximity notifications:', error);
    return 0;
  }
}

/**
 * Dispatches high-urgency emergency distress notification when a user triggers SOS.
 * Broadcasts to all citizens in the same community / radius.
 */
export async function sendEmergencySosNotification(session: ISafetySession): Promise<number> {
  try {
    const coords = session.currentLocation?.coordinates || [3.3515, 6.6018];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);

    // Query all users in same community or 5km geo-radius, excluding the victim
    const earthRadiusMeters = 6378137;
    const radiusRadians = 5000 / earthRadiusMeters;

    const victimIdStr = session.userId ? session.userId.toString() : '';
    let victimFcmToken = '';
    if (victimIdStr) {
      const victimUser = await User.findById(victimIdStr).select('fcmToken');
      if (victimUser?.fcmToken) victimFcmToken = victimUser.fcmToken;
    }

    const victimObjId = mongoose.Types.ObjectId.isValid(victimIdStr)
      ? new mongoose.Types.ObjectId(victimIdStr)
      : null;

    const nearbyUsers = await User.find({
      $and: [
        { fcmToken: { $exists: true, $ne: '' } },
        ...(victimObjId ? [{ _id: { $nin: [victimIdStr, victimObjId] } }] : []),
        {
          $or: [
            {
              lastKnownLocation: {
                $geoWithin: {
                  $centerSphere: [[lng, lat], radiusRadians],
                },
              },
            },
            { communityId: session.communityId },
          ],
        },
      ],
    }).select('fcmToken name');

    const tokens = nearbyUsers
      .map((u) => u.fcmToken)
      .filter((t): t is string => Boolean(t && t.length > 10 && t !== victimFcmToken));

    const title = `🚨 EMERGENCY DISTRESS BEACON: ${session.userName}`;
    const body = `Emergency SOS active at ${session.addressName || session.communityId}. Tap to view on radar map.`;

    if (tokens.length === 0) {
      console.log(`[FCM Emergency] No nearby registered tokens found for session ${session._id}.`);
      return 0;
    }

    if (!firebaseInitialized) {
      console.log(`[FCM Mock Log] Would dispatch emergency SOS push to ${tokens.length} devices.`);
      return tokens.length;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        type: 'emergency_sos',
        sessionId: session._id ? session._id.toString() : (session.id || ''),
        userId: session.userId ? session.userId.toString() : '',
        userName: session.userName || 'Citizen',
        userPhone: session.userPhone || '',
        lat: lat.toString(),
        lng: lng.toString(),
        communityId: session.communityId || '',
        agoraChannelName: session.agoraChannelName || '',
        channelId: 'safety_emergency_alerts',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'safety_emergency_alerts',
          color: '#DC2626',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM Emergency] SOS push sent: ${response.successCount} succeeded, ${response.failureCount} failed.`);
    return response.successCount;
  } catch (error) {
    console.error('[FCM] Error dispatching emergency SOS notification:', error);
    return 0;
  }
}

/**
 * Dispatches an incoming voice call signal push notification to the mobile user's device
 * and updates Firebase Realtime Database call state.
 */
export async function sendIncomingCallPush(params: {
  userId: string;
  callerName: string;
  callerRole?: string;
  channelName: string;
  token?: string;
  appId: string;
  sessionId: string;
}): Promise<boolean> {
  try {
    const { userId, callerName, callerRole = 'Command Dispatcher', channelName, token = '', appId, sessionId } = params;

    // 1. Update Cloud Firestore call state documents
    if (firestoreDb) {
      const callData = {
        status: 'ringing',
        userId,
        sessionId,
        callerName,
        callerRole,
        channelName,
        token,
        appId,
        initiatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (userId) await firestoreDb.collection('calls').doc(userId).set(callData, { merge: true });
      if (sessionId) {
        await firestoreDb.collection('calls').doc(sessionId).set(callData, { merge: true });
        await firestoreDb.collection('safety_sessions').doc(sessionId).set({
          incomingCall: callData,
          activeCall: callData,
        }, { merge: true });
      }
    }

    // 2. Fetch user's FCM token (searching by ID, guestDeviceId, or email)
    let user = null;
    try {
      if (userId && userId.length === 24 && /^[0-9a-fA-F]{24}$/.test(userId)) {
        user = await User.findById(userId).select('fcmToken name');
      }
      if (!user) {
        user = await User.findOne({ guestDeviceId: userId }).select('fcmToken name');
      }
      if (!user) {
        user = await User.findOne({ email: userId }).select('fcmToken name');
      }
    } catch (_) {}

    if (!user || !user.fcmToken) {
      console.log(`[FCM Call] No device token registered for user ${userId}. (Call recorded in RTDB & Session)`);
      return false;
    }

    if (!firebaseInitialized) {
      console.log(`[FCM Call Mock] Would dispatch incoming call push to ${user.name} (${user.fcmToken}):`, {
        channelName,
        callerName,
      });
      return true;
    }

    const title = `📞 Incoming Call from ${callerName}`;
    const body = `${callerRole} is calling via Safety Command Center. Tap to answer.`;

    const message: admin.messaging.Message = {
      token: user.fcmToken,
      data: {
        type: 'incoming_call',
        userId,
        sessionId,
        callerName,
        callerRole,
        channelName,
        token,
        appId,
        channelId: 'safety_calls',
      },
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
          },
        },
      },
    };

    await admin.messaging().send(message);
    console.log(`[FCM Call] Incoming call push dispatched successfully to user ${userId}.`);
    return true;
  } catch (error) {
    console.error('[FCM Call] Error dispatching incoming call push:', error);
    return false;
  }
}

/**
 * Updates call status in Firebase RTDB (e.g. 'ringing', 'accepted', 'declined', 'ended')
 * and purges stale nodes upon completion.
 */
export async function updateCallStateInFirebase(
  sessionId: string,
  userId: string,
  status: string,
  extra: Record<string, any> = {}
): Promise<void> {
  if (!firestoreDb) return;
  try {
    const update = { status, updatedAt: new Date().toISOString(), ...extra };
    if (userId) {
      await firestoreDb.collection('calls').doc(userId).set(update, { merge: true });
    }
    if (sessionId) {
      await firestoreDb.collection('calls').doc(sessionId).set(update, { merge: true });
      await firestoreDb.collection('safety_sessions').doc(sessionId).set({
        incomingCall: update,
        activeCall: update,
      }, { merge: true });
    }

    // Auto-purge stale call documents after brief notification window (1.5s)
    if (status === 'ended' || status === 'declined') {
      setTimeout(async () => {
        try {
          if (userId) await firestoreDb?.collection('calls').doc(userId).delete();
          if (sessionId) {
            await firestoreDb?.collection('calls').doc(sessionId).delete();
            await firestoreDb?.collection('safety_sessions').doc(sessionId).set({
              incomingCall: admin.firestore.FieldValue.delete(),
              activeCall: admin.firestore.FieldValue.delete(),
            }, { merge: true });
          }
        } catch (_) {}
      }, 1500);
    }
  } catch (err) {
    console.warn('[Firebase Firestore] Error updating call state:', err);
  }
}

/**
 * Complete purge of all test incident reports, safety sessions, and active calls from Firestore.
 */
export async function purgeAllFirebaseData(): Promise<{ incidentsDeleted: number; sessionsDeleted: number; callsDeleted: number }> {
  const result = { incidentsDeleted: 0, sessionsDeleted: 0, callsDeleted: 0 };
  if (!firestoreDb) return result;

  try {
    const collectionsToPurge = [
      { name: 'incident_reports', key: 'incidentsDeleted' as const },
      { name: 'safety_sessions', key: 'sessionsDeleted' as const },
      { name: 'calls', key: 'callsDeleted' as const },
    ];

    for (const { name, key } of collectionsToPurge) {
      const snap = await firestoreDb.collection(name).get();
      if (!snap.empty) {
        const batch = firestoreDb.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        result[key] = snap.size;
        console.log(`[Firebase Purge] Deleted ${snap.size} docs from '${name}'.`);
      }
    }
  } catch (err) {
    console.error('[Firebase Purge] Error wiping collections:', err);
  }

  return result;
}

