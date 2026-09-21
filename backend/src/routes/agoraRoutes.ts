import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { generateAgoraToken } from '../services/agoraService.js';

export const agoraRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /api/agora/token/:channelName
   * Generates dynamic RTC audio token for dispatcher or citizen distress room
   */
  fastify.get('/agora/token/:channelName', async (request, reply) => {
    const { channelName } = request.params as { channelName: string };
    const { uid = 0, role = 'publisher' } = request.query as any;

    if (!channelName) {
      return reply.status(400).send({ error: 'channelName is required' });
    }

    const tokenData = generateAgoraToken(
      channelName,
      Number(uid) || 0,
      role === 'subscriber' ? 'subscriber' : 'publisher'
    );

    return reply.send(tokenData);
  });
};
