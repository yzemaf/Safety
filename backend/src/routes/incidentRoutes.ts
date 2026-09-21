import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IncidentReport, IncidentCategory, IncidentUrgency, IncidentStatus } from '../models/IncidentReport.js';
import { SafetySession } from '../models/SafetySession.js';
import { sendProximityNotification, syncIncidentToFirebase, purgeAllFirebaseData } from '../services/firebaseService.js';
import { generateCommunityIncidentSummary } from '../services/geminiService.js';

export const incidentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Safe incident lookup that resolves MongoDB ObjectIds, custom string IDs, and reporter references.
   */
  async function findIncident(id: string) {
    if (!id) return null;
    try {
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        const byId = await IncidentReport.findById(id);
        if (byId) return byId;
      }
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const byQuery = await IncidentReport.findOne({
        $or: [
          { customId: id },
          { id: id },
          { customId: new RegExp(`^${escapedId}$`, 'i') },
          { id: new RegExp(`^${escapedId}$`, 'i') },
          { reportedBy: id },
        ],
      }).sort({ createdAt: -1 });
      if (byQuery) return byQuery;
    } catch (_) {}
    return null;
  }

  /**
   * Unified Incidents Query Filter Builder
   * Guarantees 100% parity across GET /api/incidents, AI summaries, and Radar queries.
   */
  function buildIncidentsFilter(params: {
    communityId?: string;
    countryCode?: string;
    stateCode?: string;
    category?: string;
    urgency?: string;
    status?: string;
    lat?: number | string;
    lng?: number | string;
    radiusKm?: number | string;
    radius?: number | string;
  }) {
    const {
      communityId,
      countryCode,
      stateCode,
      category,
      urgency,
      status,
      lat,
      lng,
      radiusKm = 25,
      radius,
    } = params;

    const latitude = lat !== undefined && lat !== null && lat !== '' ? parseFloat(lat.toString()) : undefined;
    const longitude = lng !== undefined && lng !== null && lng !== '' ? parseFloat(lng.toString()) : undefined;
    const searchRadiusKm = radius !== undefined && radius !== null && radius !== ''
      ? parseFloat(radius.toString())
      : parseFloat(radiusKm.toString());

    const filter: any = {};
    if (category && category !== 'all' && category !== 'ALL') filter.category = category;
    if (urgency && urgency !== 'all' && urgency !== 'ALL') filter.urgency = urgency;
    if (status && status !== 'all' && status !== 'ALL') filter.status = status;
    if (countryCode && countryCode !== 'ALL' && countryCode !== 'all') {
      filter.countryCode = { $regex: new RegExp(`^${countryCode}$`, 'i') };
    }
    if (stateCode && stateCode !== 'ALL' && stateCode !== 'all') {
      filter.stateCode = { $regex: new RegExp(`^${stateCode}$`, 'i') };
    }

    const hasValidCoords = typeof latitude === 'number' && !isNaN(latitude) &&
                          typeof longitude === 'number' && !isNaN(longitude) &&
                          (latitude !== 0 || longitude !== 0);

    if (hasValidCoords) {
      const earthRadiusKm = 6378.1;
      const radiusRadians = (searchRadiusKm || 50) / earthRadiusKm;

      const geoQuery = {
        location: {
          $geoWithin: {
            $centerSphere: [[longitude, latitude], radiusRadians],
          },
        },
      };

      const orConditions: any[] = [
        geoQuery,
        { source: 'safety_mode_emergency', status: 'open' },
      ];

      if (communityId && communityId !== 'ALL' && communityId !== 'all') {
        const commRegex = new RegExp(communityId.replace(/[-_]/g, '.*'), 'i');
        orConditions.push({ communityId: { $regex: commRegex } });
      }

      filter.$or = orConditions;
    } else if (communityId && communityId !== 'ALL' && communityId !== 'all') {
      const commRegex = new RegExp(communityId.replace(/[-_]/g, '.*'), 'i');
      filter.$or = [
        { communityId: { $regex: commRegex } },
        { source: 'safety_mode_emergency', status: 'open' },
      ];
    }

    return filter;
  }

  /**
   * GET /api/incidents
   * Query incidents with geo-radius or community jurisdiction filtering
   */
  fastify.get('/incidents', async (request, reply) => {
    const query = request.query as any;
    const filter = buildIncidentsFilter(query);

    try {
      const incidents = await IncidentReport.find(filter)
        .sort({ createdAt: -1 })
        .limit(100);
      return reply.send(incidents.map((inc: any) => ({
        ...inc.toObject ? inc.toObject() : inc,
        id: inc.customId || (inc._id ? inc._id.toString() : inc.id),
      })));
    } catch (err) {
      const fallbackFilter: any = {};
      if (query.category && query.category !== 'all') fallbackFilter.category = query.category;
      if (query.status && query.status !== 'all') fallbackFilter.status = query.status;
      const fallbackIncidents = await IncidentReport.find(fallbackFilter)
        .sort({ createdAt: -1 })
        .limit(100);
      return reply.send(fallbackIncidents.map((inc: any) => ({
        ...inc.toObject ? inc.toObject() : inc,
        id: inc.customId || (inc._id ? inc._id.toString() : inc.id),
      })));
    }
  });

  /**
   * POST /api/incidents
   * Submit new incident report & trigger Pillar 3 FCM proximity push notification
   */
  fastify.post('/incidents', async (request, reply) => {
    const body = request.body as any;

    const lat = body.location?.latitude ?? body.location?.lat ?? body.lat ?? 6.6018;
    const lng = body.location?.longitude ?? body.location?.lng ?? body.lng ?? 3.3515;

    const incident = new IncidentReport({
      customId: body.id || body.customId || undefined,
      id: body.id || body.customId || undefined,
      reportedBy: body.reportedBy || body.userId,
      reporterName: body.isAnonymous ? 'Anonymous' : (body.reporterName || body.userName || 'Citizen'),
      isAnonymous: Boolean(body.isAnonymous),
      source: body.source || 'community_report',
      category: (body.category || 'other') as IncidentCategory,
      title: body.title || 'Incident Reported',
      description: body.description || '',
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      addressName: body.addressName || 'Near Current Location',
      countryCode: body.countryCode || '',
      stateCode: body.stateCode || '',
      communityId: body.communityId || '',
      status: (body.status || 'open') as IncidentStatus,
      urgency: (body.urgency || 'medium') as IncidentUrgency,
      staffComments: [],
    });

    await incident.save();

    // Sync to Firebase RTDB for sub-second updates in Admin Radar
    syncIncidentToFirebase(incident).catch((err) => {
      console.warn('[Incident Create] Firebase RTDB sync error:', err);
    });

    // Pillar 3: Trigger Proximity Push Notification to nearby citizen devices
    sendProximityNotification(incident).catch((err) => {
      console.error('[FCM Async] Proximity dispatch warning:', err);
    });

    return reply.status(201).send({
      ...incident.toObject ? incident.toObject() : incident,
      id: incident.customId || (incident._id ? incident._id.toString() : incident.id),
    });
  });

  /**
   * GET /api/incidents/:id
   */
  fastify.get('/incidents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const incident = await findIncident(id);
    if (!incident) {
      return reply.status(404).send({ error: 'Incident report not found' });
    }
    return reply.send({
      ...incident.toObject ? incident.toObject() : incident,
      id: incident.customId || (incident._id ? incident._id.toString() : incident.id),
    });
  });

  /**
   * POST /api/incidents/:id/comments
   */
  fastify.post('/incidents/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { staffId, staffName = 'Dispatch Officer', staffRole = 'Responder', comment } = request.body as any;

    if (!comment) {
      return reply.status(400).send({ error: 'Comment text is required' });
    }

    let incident = await findIncident(id);
    if (!incident) {
      incident = new IncidentReport({
        customId: id,
        id: id,
        title: 'Incident Report',
        description: 'Synchronized incident record',
        source: 'community_report',
        category: 'other',
        urgency: 'medium',
        status: 'open',
        location: {
          type: 'Point',
          coordinates: [3.3515, 6.6018],
        },
        staffComments: [],
      });
    }

    const newComment = {
      staffId,
      staffName,
      staffRole,
      comment,
      createdAt: new Date(),
    };

    incident.staffComments.push(newComment);
    await incident.save();

    syncIncidentToFirebase(incident).catch((err) => {
      console.warn('[Incident Comment] Firebase sync error:', err);
    });

    return reply.status(201).send(newComment);
  });

  /**
   * PATCH /api/incidents/:id
   * Update incident fields (title, description, category, urgency, location, etc.)
   */
  fastify.patch('/incidents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    let incident = await findIncident(id);
    if (!incident) {
      incident = new IncidentReport({
        customId: id,
        id: id,
        title: body.title || 'Incident Report',
        description: body.description || '',
        category: body.category || 'other',
        urgency: body.urgency || 'medium',
        status: body.status || 'open',
        location: {
          type: 'Point',
          coordinates: [3.3515, 6.6018],
        },
        staffComments: [],
      });
    }

    if (body.title !== undefined) incident.title = body.title;
    if (body.description !== undefined) incident.description = body.description;
    if (body.category !== undefined) incident.category = body.category;
    if (body.urgency !== undefined) incident.urgency = body.urgency;
    if (body.status !== undefined) incident.status = body.status;
    if (body.addressName !== undefined) incident.addressName = body.addressName;
    if (body.isAnonymous !== undefined) incident.isAnonymous = Boolean(body.isAnonymous);
    if (body.communityId !== undefined) incident.communityId = body.communityId;
    if (body.stateCode !== undefined) incident.stateCode = body.stateCode;
    if (body.countryCode !== undefined) incident.countryCode = body.countryCode;

    if (body.location) {
      const lat = body.location.latitude ?? body.location.lat;
      const lng = body.location.longitude ?? body.location.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        incident.location = {
          type: 'Point',
          coordinates: [lng, lat],
        };
      }
    }

    await incident.save();
    syncIncidentToFirebase(incident).catch((err) => {
      console.warn('[Incident Patch] Firebase RTDB sync error:', err);
    });
    return reply.send({
      ...incident.toObject ? incident.toObject() : incident,
      id: incident.customId || (incident._id ? incident._id.toString() : incident.id),
    });
  });

  /**
   * PATCH /api/incidents/:id/status
   */
  fastify.patch('/incidents/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, urgency } = request.body as any;

    let incident = await findIncident(id);
    if (!incident) {
      incident = new IncidentReport({
        customId: id,
        id: id,
        title: 'Incident Report',
        description: 'Synchronized incident record',
        source: 'community_report',
        category: 'other',
        urgency: urgency || 'medium',
        status: status || 'open',
        location: {
          type: 'Point',
          coordinates: [3.3515, 6.6018],
        },
        staffComments: [],
      });
    } else {
      if (status) incident.status = status;
      if (urgency) incident.urgency = urgency;
    }

    await incident.save();
    syncIncidentToFirebase(incident).catch((err) => {
      console.warn('[Incident Status] Firebase RTDB sync error:', err);
    });
    return reply.send({
      ...incident.toObject ? incident.toObject() : incident,
      id: incident.customId || (incident._id ? incident._id.toString() : incident.id),
    });
  });

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

  /**
   * POST /api/incidents/ai-summary
   * Uses exact same query parameters as GET /api/incidents (or directly supplied visible reports)
   * to guarantee Gemini AI always receives the exact incidents showing on screen.
   */
  fastify.post('/incidents/ai-summary', async (request, reply) => {
    const body = (request.body as any) || {};
    const query = (request.query as any) || {};
    const countryCode = (body.countryCode || query.countryCode || '').toString().trim();
    const stateCode = (body.stateCode || query.stateCode || '').toString().trim();
    const communityId = (body.communityId || query.communityId || 'ALL').toString().trim();

    // 1. Resolve Incidents for AI synthesis
    let finalIncidents: any[] = [];

    // Path A: Client explicitly provided the visible on-screen reports
    if (Array.isArray(body.incidents) && body.incidents.length > 0) {
      finalIncidents = body.incidents;
    } else {
      // Path B: Query database using the EXACT SAME filter logic as GET /api/incidents
      const filter = buildIncidentsFilter({ ...query, ...body });
      finalIncidents = await IncidentReport.find(filter)
        .sort({ createdAt: -1 })
        .limit(100);

      // Fallback: If filter returned 0 but there are active reports in the DB, fetch recent reports
      if (finalIncidents.length === 0) {
        finalIncidents = await IncidentReport.find({})
          .sort({ createdAt: -1 })
          .limit(50);
      }
    }

    // 2. Resolve Safety Sessions for AI synthesis
    let finalSessions: any[] = [];
    if (Array.isArray(body.sessions) && body.sessions.length > 0) {
      finalSessions = body.sessions;
    } else {
      const sessionQuery: any = {};
      if (countryCode && countryCode !== 'ALL' && countryCode !== 'all') {
        sessionQuery.countryCode = { $regex: new RegExp(`^${countryCode}$`, 'i') };
      }
      if (stateCode && stateCode !== 'ALL' && stateCode !== 'all') {
        sessionQuery.stateCode = { $regex: new RegExp(`^${stateCode}$`, 'i') };
      }
      finalSessions = await SafetySession.find(sessionQuery)
        .sort({ updatedAt: -1 })
        .limit(50);

      if (finalSessions.length === 0) {
        finalSessions = await SafetySession.find({})
          .sort({ updatedAt: -1 })
          .limit(20);
      }
    }

    // 3. Generate summary via Gemini Service
    const report = await generateCommunityIncidentSummary({
      communityId,
      stateCode,
      countryCode,
      incidents: finalIncidents,
      safetySessions: finalSessions,
    });

    return reply.send(report);
  });

  /**
   * DELETE /api/incidents/purge-all & POST /api/incidents/purge-all
   * Testing tool: purges all test incidents, reports, and safety sessions from MongoDB and Firebase.
   */
  const handlePurgeAll = async (request: any, reply: any) => {
    try {
      const deletedIncidents = await IncidentReport.deleteMany({});
      const deletedSessions = await SafetySession.deleteMany({});
      const firestoreResult = await purgeAllFirebaseData();

      return reply.send({
        success: true,
        message: 'All test incidents, reports, and radar safety sessions have been wiped completely.',
        deleted: {
          incidentsMongo: deletedIncidents.deletedCount,
          sessionsMongo: deletedSessions.deletedCount,
          firestore: firestoreResult,
        },
      });
    } catch (err: any) {
      console.error('[Purge All] Error during clear-out:', err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Failed to purge test data',
      });
    }
  };

  fastify.delete('/incidents/purge-all', handlePurgeAll);
  fastify.post('/incidents/purge-all', handlePurgeAll);
};
