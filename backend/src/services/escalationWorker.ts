import { SafetySession } from '../models/SafetySession.js';
import { User } from '../models/User.js';
import { IncidentReport } from '../models/IncidentReport.js';
import { syncSessionToFirebase, syncIncidentToFirebase, sendEmergencySosNotification } from './firebaseService.js';

let intervalTimer: NodeJS.Timeout | null = null;

async function getUserTimeoutSeconds(userId: string | any): Promise<number> {
  const idStr = userId ? userId.toString() : '';
  if (!idStr) return 60;
  try {
    let user = null;
    if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
      user = await User.findById(idStr).select('settings');
    }
    if (!user) {
      user = await User.findOne({ guestDeviceId: idStr }).select('settings');
    }
    if (!user) {
      user = await User.findOne({ email: idStr }).select('settings');
    }
    return user?.settings?.timeoutDurationSeconds ?? 60;
  } catch (_) {
    return 60;
  }
}


/**
 * Server-Side Offline Failsafe (Dead-Man Switch)
 * 
 * If a citizen's device is destroyed, runs out of battery, or loses network in an emergency:
 * 1. Automatically transitions overdue active sessions into 'distress_pending' (Warning) after check-in due time + buffer.
 * 2. Automatically escalates unattended distress_pending sessions into 'emergency' based on the user's custom timeoutDurationSeconds setting + buffer.
 * 3. Immediately synchronizes status to Cloud Firestore & creates an Emergency Incident Report so both Admin Radar & Community feeds are updated.
 */
export function startEscalationWorker(intervalMs: number = 5000): void {
  if (intervalTimer) return;

  console.log(`[EscalationWorker] Started server-side offline failsafe worker (interval: ${intervalMs}ms).`);

  intervalTimer = setInterval(async () => {
    try {
      const now = new Date();
      // 5-second network buffer before marking distress_pending to allow mobile client clock skew
      const pendingBufferThreshold = new Date(now.getTime() - 5000);

      // 1. Move active sessions past nextPromptDueAt into distress_pending
      const pendingSessions = await SafetySession.find({
        status: 'active',
        nextPromptDueAt: { $lt: pendingBufferThreshold },
      });

      for (const session of pendingSessions) {
        session.status = 'distress_pending';
        await session.save();
        await syncSessionToFirebase(session).catch(() => {});
        console.log(`[EscalationWorker] ⚠️ Failsafe: Session ${session._id} (${session.userName}) moved to 'distress_pending' (check-in overdue).`);
      }

      // 2. Escalate overdue distress_pending sessions into emergency accounting for user's custom settings
      const distressSessions = await SafetySession.find({
        status: 'distress_pending',
      });

      for (const session of distressSessions) {
        if (!session.nextPromptDueAt) continue;

        // Fetch user's actual configured timeout duration (e.g. 15s, 30s, 60s, 120s)
        const userTimeoutSeconds = await getUserTimeoutSeconds(session.userId);
        // Include 10s network grace buffer beyond the user's timeout
        const cutoffMs = (userTimeoutSeconds + 10) * 1000;
        const cutoffTime = new Date(session.nextPromptDueAt.getTime() + cutoffMs);

        if (now.getTime() >= cutoffTime.getTime()) {
          session.status = 'emergency';
          session.emergencyTriggeredAt = now;
          await session.save();

          console.log(
            `🚨 [EscalationWorker] Failsafe: AUTO-ESCALATED Session ${session._id} (${session.userName}) to 'emergency' (custom timeout: ${userTimeoutSeconds}s exceeded).`
          );

          // Sync emergency status directly to Cloud Firestore for Admin Radar
          await syncSessionToFirebase(session).catch(() => {});

          // Create or update open Emergency Incident Report
          try {
            let incident = await IncidentReport.findOne({
              reportedBy: session.userId,
              source: 'safety_mode_emergency',
              status: 'open',
            }).sort({ createdAt: -1 });

            if (!incident) {
              incident = new IncidentReport({
                reportedBy: session.userId,
                reporterName: session.userName || 'Citizen in Distress',
                isAnonymous: false,
                source: 'safety_mode_emergency',
                category: 'emergency',
                urgency: 'critical',
                title: `Emergency Distress SOS: ${session.userName || 'Citizen'}`,
                description: `Automated server failsafe escalation: Missed check-in timeout exceeded (${userTimeoutSeconds}s). Live Agora channel: ${session.agoraChannelName}.`,
                location: session.currentLocation,
                addressName: session.addressName || 'Live Location',
                countryCode: session.countryCode || '',
                stateCode: session.stateCode || '',
                communityId: session.communityId || '',
                status: 'open',
              });
              await incident.save();
            }

            await syncIncidentToFirebase(incident).catch(() => {});
            sendEmergencySosNotification(session).catch(() => {});
          } catch (incErr) {
            console.warn('[EscalationWorker] Incident creation warning:', incErr);
          }
        }
      }
    } catch (error) {
      console.error('[EscalationWorker] Error during failsafe check cycle:', error);
    }
  }, intervalMs);
}

export function stopEscalationWorker(): void {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    console.log('[EscalationWorker] Stopped background monitoring worker.');
  }
}
