import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SafetySession, SessionStatus } from '../models/SafetySession.js';
import { User } from '../models/User.js';
import {
  syncSessionToFirebase,
  syncIncidentToFirebase,
  sendEmergencySosNotification,
  sendIncomingCallPush,
  updateCallStateInFirebase,
} from '../services/firebaseService.js';
import { IncidentReport } from '../models/IncidentReport.js';
import { generateAgoraToken } from '../services/agoraService.js';
import { config } from '../config/env.js';

export const sessionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Safe session lookup that never throws a CastError.
   * Tries findById (only for valid ObjectIds), then falls back to a
   * string match on agoraChannelName, and finally on userId — so that
   * custom IDs like `sess_<timestamp>` produced by the mobile offline
   * fallback path can still resolve to a real MongoDB document.
   */
  async function findSession(id: string) {
    // 1. Standard MongoDB ObjectId lookup
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      const s = await SafetySession.findById(id);
      if (s) return s;
    }
    // 2. Fallback: match agoraChannelName (always stored, always a clean string)
    const byChannel = await SafetySession.findOne({ agoraChannelName: id });
    if (byChannel) return byChannel;
    // 3. Last resort: most-recent active session for this userId string
    const byUser = await SafetySession.findOne({ userId: id }).sort({ createdAt: -1 });
    return byUser ?? null;
  }

  /**
   * POST /api/sessions/start
   * Starts an active safety walk session and syncs immediately to Firebase Realtime Database
   */
  fastify.post('/sessions/start', async (request, reply) => {
    const {
      userId,
      userName,
      userPhone,
      userEmail,
      initialLocation,
      intervalMinutes = 5,
      batteryLevel = 100,
      addressName,
      countryCode = '',
      stateCode = '',
      communityId = '',
    } = request.body as any;

    if (!userId) {
      return reply.status(400).send({ error: 'userId is required to start a safety session' });
    }

    // Auto-resolve any existing active / distress sessions for this user so only 1 active session exists
    await SafetySession.updateMany(
      { userId, status: { $in: ['active', 'distress_pending'] } },
      { $set: { status: 'resolved', resolvedAt: new Date() } }
    );

    let phoneToUse = userPhone || '';
    let nameToUse = userName || 'Citizen';
    let emailToUse = userEmail || '';

    if (!phoneToUse || nameToUse === 'Citizen' || !emailToUse) {
      try {
        const u = await User.findById(userId);
        if (u) {
          if (!nameToUse || nameToUse === 'Citizen') nameToUse = u.name;
          if (!emailToUse) emailToUse = u.email || '';
          if (!phoneToUse) {
            phoneToUse = u.phone || (u.emergencyContacts && u.emergencyContacts.length > 0 ? u.emergencyContacts[0].phone : '');
          }
        }
      } catch (_) {}
    }

    const lat = Number(initialLocation?.latitude ?? initialLocation?.lat ?? 6.6018);
    const lng = Number(initialLocation?.longitude ?? initialLocation?.lng ?? 3.3515);
    const coordStr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const isCleanAddress = addressName && 
      addressName.trim() && 
      addressName !== 'Starting Location' && 
      addressName !== 'My Location' && 
      !addressName.toLowerCase().startsWith('my location') && 
      !addressName.toLowerCase().startsWith('current area');

    const effectiveAddress = isCleanAddress
      ? addressName.trim()
      : (communityId && communityId !== 'ALL' && communityId !== 'ikeja' && communityId !== 'mylocation' ? `${communityId} (${coordStr})` : coordStr);

    const now = new Date();
    const nextPrompt = new Date(now.getTime() + intervalMinutes * 60 * 1000);
    const agoraChannel = `safety_emergency_${userId}_${Date.now()}`;

    const session = new SafetySession({
      userId,
      userName: nameToUse,
      userPhone: phoneToUse,
      userEmail: emailToUse,
      status: 'active',
      batteryLevel,
      lastPingAt: now,
      nextPromptDueAt: nextPrompt,
      agoraChannelName: agoraChannel,
      currentLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      addressName: effectiveAddress,
      countryCode,
      stateCode,
      communityId,
      breadcrumbs: [
        {
          coordinates: [lng, lat],
          recordedAt: now,
          batteryLevel,
        },
      ],
    });

    await session.save();

    // Sync immediately to Firebase RTDB for sub-second Admin Radar visualization
    syncSessionToFirebase(session).catch((err) => {
      console.warn('[Session Start] Firebase RTDB sync error:', err);
    });

    // Also update User's lastKnownLocation and communityId
    await User.findByIdAndUpdate(userId, {
      lastKnownLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      communityId,
    });

    return reply.status(201).send(session);
  });

  /**
   * POST /api/sessions/ping
   * High-throughput background GPS telemetry ping & real-time Firebase sync
   */
  fastify.post('/sessions/ping', async (request, reply) => {
    const {
      sessionId,
      userId,
      lat,
      lng,
      location,
      batteryLevel,
      addressName,
    } = request.body as any;

    const latitude = lat ?? location?.latitude ?? location?.lat;
    const longitude = lng ?? location?.longitude ?? location?.lng;

    let query: any = {};
    if (sessionId && /^[0-9a-fA-F]{24}$/.test(sessionId)) {
      query._id = sessionId;
    } else if (userId) {
      query.userId = userId;
      query.status = { $in: ['active', 'distress_pending', 'emergency'] };
    } else {
      return reply.status(400).send({ error: 'sessionId or userId required for ping' });
    }

    const session = await SafetySession.findOne(query).sort({ createdAt: -1 });
    if (!session) {
      return reply.status(404).send({ error: 'Active session not found' });
    }

    const now = new Date();
    session.lastPingAt = now;
    if (typeof batteryLevel === 'number') session.batteryLevel = batteryLevel;
    
    const isCleanAddress = addressName && 
      addressName.trim() && 
      addressName !== 'Starting Location' && 
      addressName !== 'My Location' && 
      !addressName.toLowerCase().startsWith('my location') && 
      !addressName.toLowerCase().startsWith('current area');

    if (isCleanAddress) {
      session.addressName = addressName.trim();
    } else if (!session.addressName || session.addressName === 'Starting Location' || session.addressName.toLowerCase().startsWith('my location')) {
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        session.addressName = `${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`;
      }
    }

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      session.currentLocation = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
      session.breadcrumbs.push({
        coordinates: [longitude, latitude],
        recordedAt: now,
        batteryLevel: session.batteryLevel,
      });

      // Keep user's lastKnownLocation updated for proximity lookups
      await User.findByIdAndUpdate(session.userId, {
        lastKnownLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
      });
    }

    await session.save();

    // Real-time Firebase RTDB sync for dynamic Admin Radar movement
    syncSessionToFirebase(session).catch((err) => {
      console.warn('[Session Ping] Firebase RTDB sync error:', err);
    });

    return reply.send({
      success: true,
      status: session.status,
      lastPingAt: session.lastPingAt,
      activeCall: session.activeCall,
    });
  });

  /**
   * POST /api/sessions/check-in
   * Citizen confirms safe — resets next check-in countdown
   */
  fastify.post('/sessions/check-in', async (request, reply) => {
    const { sessionId, userId, intervalMinutes = 5 } = request.body as any;

    let query: any = {};
    if (sessionId && /^[0-9a-fA-F]{24}$/.test(sessionId)) {
      query._id = sessionId;
    } else if (userId) {
      query.userId = userId;
      query.status = { $in: ['active', 'distress_pending', 'emergency'] };
    }

    let session = await SafetySession.findOne(query).sort({ createdAt: -1 });
    if (!session && userId) {
      // Fallback: search for any open/recent session for this user
      session = await SafetySession.findOne({ userId }).sort({ createdAt: -1 });
    }
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const now = new Date();
    session.status = 'active';
    session.nextPromptDueAt = new Date(now.getTime() + intervalMinutes * 60 * 1000);
    await session.save();

    syncSessionToFirebase(session).catch((err) => {
      console.warn('[Session Check-in] Firebase RTDB sync error:', err);
    });

    // Auto-resolve any open emergency incident reports for this user
    try {
      const openIncidents = await IncidentReport.find({
        $or: [
          { reportedBy: session.userId },
          { reportedBy: session.userId ? session.userId.toString() : '' },
        ],
        source: 'safety_mode_emergency',
        status: 'open',
      });
      for (const inc of openIncidents) {
        inc.status = 'resolved';
        await inc.save();
        syncIncidentToFirebase(inc).catch(() => {});
      }
    } catch (err) {
      console.warn('[Session Check-in] Auto-resolve emergency incidents error:', err);
    }

    return reply.send({
      success: true,
      status: session.status,
      nextPromptDueAt: session.nextPromptDueAt,
    });
  });

  /**
   * POST /api/sessions/trigger-sos
   * Instant manual or automatic emergency distress escalation
   */
  fastify.post('/sessions/trigger-sos', async (request, reply) => {
    const {
      sessionId,
      userId,
      reason,
      location: clientLoc,
      addressName,
      communityId,
      stateCode,
      countryCode,
      userName: clientName,
      userPhone: clientPhone,
    } = request.body as any;

    let query: any = {};
    if (sessionId && /^[0-9a-fA-F]{24}$/.test(sessionId)) {
      query._id = sessionId;
    } else if (userId) {
      query.userId = userId;
    }

    let session = await SafetySession.findOne(query).sort({ createdAt: -1 });
    if (!session && userId) {
      session = await SafetySession.findOne({ userId }).sort({ createdAt: -1 });
    }

    const now = new Date();

    let parsedLoc: { type: 'Point'; coordinates: [number, number] } | null = null;
    if (clientLoc) {
      const lat = clientLoc.latitude ?? clientLoc.lat;
      const lng = clientLoc.longitude ?? clientLoc.lng;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        parsedLoc = { type: 'Point', coordinates: [lng, lat] };
      }
    }

    // If no existing session found, create an emergency safety session on the fly
    if (!session) {
      let userName = clientName || 'Citizen in Distress';
      let userPhone = clientPhone || '';
      let userEmail = '';
      let location = parsedLoc || { type: 'Point', coordinates: [3.3515, 6.6018] };
      let finalCountryCode = countryCode || 'NG';
      let finalStateCode = stateCode || 'Lagos';
      let finalCommunityId = communityId || 'ikeja';

      if (userId) {
        try {
          const userDoc = await User.findById(userId) || await User.findOne({ guestDeviceId: userId });
          if (userDoc) {
            userName = clientName || userDoc.name || userName;
            userPhone = clientPhone || userDoc.phone || userPhone;
            userEmail = userDoc.email || userEmail;
            if (!parsedLoc && userDoc.lastKnownLocation?.coordinates) {
              location = { type: 'Point', coordinates: userDoc.lastKnownLocation.coordinates as [number, number] };
            }
            if (!communityId && userDoc.communityId) {
              finalCommunityId = userDoc.communityId;
            }
          }
        } catch (_) {}
      }

      session = new SafetySession({
        userId: userId || 'anonymous_user',
        userName,
        userPhone,
        userEmail,
        status: 'emergency',
        emergencyTriggeredAt: now,
        currentLocation: location,
        batteryLevel: 100,
        addressName: addressName || 'Live Emergency Location',
        communityId: finalCommunityId,
        stateCode: finalStateCode,
        countryCode: finalCountryCode,
        agoraChannelName: `safety_emergency_${userId || Date.now()}`,
        breadcrumbs: [{ location, recordedAt: now }],
      });
      await session.save();
    } else {
      session.status = 'emergency';
      session.emergencyTriggeredAt = now;
      if (parsedLoc) session.currentLocation = parsedLoc;
      if (addressName) session.addressName = addressName;
      if (communityId) session.communityId = communityId;
      if (stateCode) session.stateCode = stateCode;
      if (countryCode) session.countryCode = countryCode;
      if (clientName) session.userName = clientName;
      if (clientPhone) session.userPhone = clientPhone;
      await session.save();
    }

    // 1. Sync emergency status to Firebase RTDB & Firestore instantly (Admin Radar sees it in real-time)
    syncSessionToFirebase(session).catch((err) => {
      console.warn('[SOS] Firebase RTDB sync error:', err);
    });

    // 2. Dispatch push notification alerts to emergency contacts & nearby community
    sendEmergencySosNotification(session).catch((err) => {
      console.error('[SOS] FCM notification error:', err);
    });

    // 3. Create or reuse open generic Emergency Incident Report
    const clientIncidentId = (request.body as any)?.incidentId;
    let incident = null;

    if (clientIncidentId) {
      incident = await IncidentReport.findOne({
        $or: [
          { customId: clientIncidentId },
          { id: clientIncidentId },
          ...(/^[0-9a-fA-F]{24}$/.test(clientIncidentId) ? [{ _id: clientIncidentId }] : []),
        ],
      });
    }

    if (!incident) {
      incident = await IncidentReport.findOne({
        reportedBy: session.userId,
        source: 'safety_mode_emergency',
        status: 'open',
      }).sort({ createdAt: -1 });
    }

    if (!incident) {
      incident = new IncidentReport({
        customId: clientIncidentId || undefined,
        id: clientIncidentId || undefined,
        reportedBy: session.userId,
        reporterName: session.userName || 'Citizen in Distress',
        isAnonymous: false,
        source: 'safety_mode_emergency',
        category: 'emergency',
        urgency: 'critical',
        title: `Emergency Distress SOS: ${session.userName || 'Citizen'}`,
        description: reason || `Emergency SOS beacon triggered. Live Agora channel: ${session.agoraChannelName}.`,
        location: session.currentLocation,
        addressName: session.addressName || 'Live Emergency Location',
        countryCode: session.countryCode || '',
        stateCode: session.stateCode || '',
        communityId: session.communityId || '',
        status: 'open',
      });
      await incident.save();
    } else {
      if (clientIncidentId && !incident.customId) {
        incident.customId = clientIncidentId;
        incident.id = clientIncidentId;
      }
      if (reason) {
        incident.description = reason;
      }
      incident.location = session.currentLocation;
      if (session.addressName) incident.addressName = session.addressName;
      if (session.communityId) incident.communityId = session.communityId;
      if (session.stateCode) incident.stateCode = session.stateCode;
      if (session.countryCode) incident.countryCode = session.countryCode;
      await incident.save();
    }

    // Sync emergency incident to Firestore so Admin Radar & Community Page update in real time
    syncIncidentToFirebase(incident).catch((err: any) => {
      console.warn('[SOS Incident] Firestore sync warning:', err);
    });

    return reply.send({
      success: true,
      status: session.status,
      agoraChannelName: session.agoraChannelName,
      emergencyTriggeredAt: session.emergencyTriggeredAt,
      incidentId: incident.customId || incident._id.toString(),
    });
  });

  /**
   * POST /api/sessions/resolve
   * Complete or cancel walk cleanly
   */
  fastify.post('/sessions/resolve', async (request, reply) => {
    const { sessionId, userId, status = 'resolved' } = request.body as any;

    let query: any = {};
    if (sessionId && /^[0-9a-fA-F]{24}$/.test(sessionId)) {
      query._id = sessionId;
    } else if (userId) {
      query.userId = userId;
    }

    let session = await SafetySession.findOne(query).sort({ createdAt: -1 });
    if (!session && userId) {
      session = await SafetySession.findOne({ userId }).sort({ createdAt: -1 });
    }
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    session.status = status as SessionStatus;
    await session.save();

    syncSessionToFirebase(session).catch((err) => {
      console.warn('[Session Resolve] Firebase RTDB sync error:', err);
    });

    // Auto-resolve any open emergency incident reports for this user
    try {
      const openIncidents = await IncidentReport.find({
        $or: [
          { reportedBy: session.userId },
          { reportedBy: session.userId ? session.userId.toString() : '' },
        ],
        source: 'safety_mode_emergency',
        status: 'open',
      });
      for (const inc of openIncidents) {
        inc.status = 'resolved';
        await inc.save();
        syncIncidentToFirebase(inc).catch(() => {});
      }
    } catch (err) {
      console.warn('[Session Resolve] Auto-resolve emergency incidents error:', err);
    }

    return reply.send({ success: true, status: session.status });
  });

  /**
   * POST /api/sessions/:id/call
   * Admin initiates in-app Agora voice call to mobile user.
   * Generates Agora tokens for both parties, updates Firebase RTDB call state, and dispatches FCM push.
   */
  fastify.post('/sessions/:id/call', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { callerName = 'Safety Command Dispatcher', callerRole = 'Dispatcher' } = (request.body || {}) as any;

    const session = await findSession(id);
    if (!session) {
      return reply.status(404).send({ error: 'Safety session not found' });
    }

    // Fresh distinct channel name for each call attempt to prevent collision with past calls
    const channelName = `safety_call_${session.userId || session._id}_${Date.now()}`;
    session.agoraChannelName = channelName;

    // Generate Agora tokens (0 for auto UID or specific numeric UIDs)
    const adminToken = generateAgoraToken(channelName, 1, 'publisher', 7200);
    const userToken = generateAgoraToken(channelName, 2, 'publisher', 7200);

    // Save activeCall on MongoDB session
    session.activeCall = {
      status: 'ringing',
      callerName,
      callerRole,
      channelName,
      token: userToken.token,
      initiatedAt: new Date(),
    };
    await session.save();

    // Update Firebase Realtime Database immediately so Admin and Mobile sync
    await updateCallStateInFirebase(id, session.userId.toString(), 'ringing', {
      callerName,
      callerRole,
      channelName,
      token: userToken.token,
      appId: config.agora.appId,
      sessionId: session._id.toString(),
    });

    // Dispatch ringing call push notification via FCM
    sendIncomingCallPush({
      userId: session.userId.toString(),
      callerName,
      callerRole,
      channelName,
      token: userToken.token,
      appId: config.agora.appId,
      sessionId: session._id.toString(),
    }).catch((err) => {
      console.warn('[Admin Call Dispatch] FCM error:', err);
    });

    return reply.send({
      success: true,
      sessionId: session._id.toString(),
      channelName,
      appId: config.agora.appId,
      adminToken: adminToken.token,
      adminUid: 1,
      userToken: userToken.token,
      userUid: 2,
    });
  });

  /**
   * POST /api/sessions/:id/call-response
   * Mobile client responds to incoming call (accepted / declined / missed)
   */
  fastify.post('/sessions/:id/call-response', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, userId } = request.body as { status: 'accepted' | 'declined' | 'missed'; userId?: string };

    const session = await findSession(id);

    if (session && session.activeCall) {
      session.activeCall.status = status;
      await session.save();
    }

    const userToUse = userId || (session ? session.userId.toString() : '');
    await updateCallStateInFirebase(id, userToUse, status);

    return reply.send({ success: true, status });
  });

  /**
   * POST /api/sessions/:id/end-call
   * Either Admin or Mobile ends the active voice call
   */
  fastify.post('/sessions/:id/end-call', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = (request.body || {}) as { userId?: string };

    const session = await findSession(id);

    if (session) {
      session.activeCall = undefined;
      await session.save();
    }

    const userToUse = userId || (session ? session.userId.toString() : '');
    await updateCallStateInFirebase(id, userToUse, 'ended');

    return reply.send({ success: true, status: 'ended' });
  });

  /**
   * GET /api/sessions/:id/call-status
   * Poll current call status (ringing / accepted / declined / ended)
   */
  fastify.get('/sessions/:id/call-status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await findSession(id);
    return reply.send({
      status: session?.activeCall?.status || 'idle',
      activeCall: session?.activeCall || null,
    });
  });

  /**
   * GET /api/sessions/active
   * Query all active / emergency sessions for the admin radar map
   */
  fastify.get('/sessions/active', async (request, reply) => {
    const { countryCode, stateCode, communityId, status } = request.query as any;

    const filter: any = {};
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['active', 'distress_pending', 'emergency'] };
    }

    if (countryCode && countryCode !== 'ALL') filter.countryCode = countryCode;
    if (stateCode && stateCode !== 'ALL') filter.stateCode = stateCode;
    if (communityId && communityId !== 'ALL' && communityId !== 'all') filter.communityId = communityId;

    const sessions = await SafetySession.find(filter).sort({ updatedAt: -1 }).limit(100);
    return reply.send(sessions);
  });

  /**
   * GET /api/sessions/:id
   */
  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await findSession(id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return reply.send(session);
  });
};
