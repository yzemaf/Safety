import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { SafetySession } from '../models/SafetySession.js';
import { generateAgoraToken } from '../services/agoraService.js';
import {
  sendIncomingCallPush,
  updateCallStateInFirebase,
} from '../services/firebaseService.js';
import { config } from '../config/env.js';

/**
 * Looks up a User document by ObjectId, guestDeviceId, or email.
 * Never throws a CastError — gracefully handles any string format.
 */
async function findUserById(userId: string) {
  if (!userId) return null;
  const str = userId.trim();

  if (mongoose.Types.ObjectId.isValid(str)) {
    const byId = await User.findById(str);
    if (byId) return byId;
  }

  const byGuestId = await User.findOne({ guestDeviceId: str });
  if (byGuestId) return byGuestId;

  const byEmail = await User.findOne({ email: str.toLowerCase() });
  return byEmail ?? null;
}

export const userRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /api/users/:userId/call
   *
   * Admin-initiated voice call directly to a citizen or guest by their user ID.
   * This route is session-independent — it works even when the session document
   * has a synthetic/offline ID (e.g. `sess_<timestamp>`).
   *
   * Flow:
   *  1. Resolve the user (by ObjectId / guestDeviceId / email).
   *  2. Optionally find their most-recent active session (for sessionId metadata only).
   *  3. Generate a fresh Agora channel + tokens for admin (uid=1) and citizen (uid=2).
   *  4. Write call state to Firestore `calls/{userId}` so mobile listener fires.
   *  5. Dispatch FCM push notification to the user's registered device.
   *  6. Return all channel credentials to the admin.
   */
  fastify.post('/users/:userId/call', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const {
      callerName = 'Safety Command Dispatcher',
      callerRole = 'Control Room Officer',
      sessionId: hintSessionId,
    } = (request.body || {}) as {
      callerName?: string;
      callerRole?: string;
      sessionId?: string;
    };

    // 1. Resolve user document — gracefully handles all ID formats
    const user = await findUserById(userId);
    if (!user) {
      console.warn(`[User Call] User not found for id: ${userId}`);
      return reply.status(404).send({ error: 'User not found. Cannot initiate call.' });
    }

    const resolvedUserId = (user._id as mongoose.Types.ObjectId).toString();

    // 2. Optionally locate the most-recent active/emergency session for metadata
    let resolvedSessionId = hintSessionId || '';
    if (!resolvedSessionId || !/^[0-9a-fA-F]{24}$/.test(resolvedSessionId)) {
      const session = await SafetySession
        .findOne({ userId: resolvedUserId, status: { $in: ['active', 'distress_pending', 'emergency'] } })
        .sort({ createdAt: -1 });
      if (session) {
        resolvedSessionId = (session._id as mongoose.Types.ObjectId).toString();
      }
    }

    // 3. Generate a fresh Agora channel name for this exact call attempt
    const channelName = `safety_call_${resolvedUserId}_${Date.now()}`;
    const adminToken = generateAgoraToken(channelName, 1, 'publisher', 7200);
    const userToken  = generateAgoraToken(channelName, 2, 'publisher', 7200);

    // 4. Write call state to Firestore (triggers mobile Firestore listener immediately)
    await updateCallStateInFirebase(resolvedSessionId, resolvedUserId, 'ringing', {
      callerName,
      callerRole,
      channelName,
      token: userToken.token,
      appId: config.agora.appId,
      sessionId: resolvedSessionId,
      userId: resolvedUserId,
    });

    // 5. Dispatch FCM push to the user's registered device
    sendIncomingCallPush({
      userId: resolvedUserId,
      callerName,
      callerRole,
      channelName,
      token: userToken.token,
      appId: config.agora.appId,
      sessionId: resolvedSessionId,
    }).catch((err) => {
      console.warn('[User Call] FCM push error (non-fatal):', err);
    });

    console.log(`[User Call] ✅ Call dispatched to user ${user.name || resolvedUserId} on channel ${channelName}`);

    return reply.send({
      success: true,
      userId: resolvedUserId,
      sessionId: resolvedSessionId,
      channelName,
      appId: config.agora.appId,
      adminToken: adminToken.token,
      adminUid: 1,
      userToken: userToken.token,
      userUid: 2,
    });
  });

  /**
   * POST /api/users/:userId/end-call
   * Ends an active voice call for a user (called by admin or mobile).
   */
  fastify.post('/users/:userId/end-call', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { sessionId } = (request.body || {}) as { sessionId?: string };

    const user = await findUserById(userId);
    const resolvedUserId = user
      ? (user._id as mongoose.Types.ObjectId).toString()
      : userId;

    let resolvedSessionId = sessionId || '';
    if (!resolvedSessionId || !/^[0-9a-fA-F]{24}$/.test(resolvedSessionId)) {
      const session = await SafetySession
        .findOne({ userId: resolvedUserId })
        .sort({ createdAt: -1 });
      if (session) resolvedSessionId = (session._id as mongoose.Types.ObjectId).toString();
    }

    await updateCallStateInFirebase(resolvedSessionId, resolvedUserId, 'ended');

    return reply.send({ success: true, status: 'ended' });
  });
};
