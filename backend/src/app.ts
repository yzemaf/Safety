import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import { config } from './config/env.js';
import { initFirebase } from './services/firebaseService.js';
import { authRoutes } from './routes/authRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { incidentRoutes } from './routes/incidentRoutes.js';
import { staffRoutes } from './routes/staffRoutes.js';
import { agoraRoutes } from './routes/agoraRoutes.js';
import { userRoutes } from './routes/userRoutes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
  });

  // 1. CORS plugin (allow Mobile + React Admin Vite dev server)
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // 2. JWT Plugin
  await app.register(jwt, {
    secret: config.jwtSecret,
  });

  // 3. Sensible defaults
  await app.register(sensible);

  // Allow empty JSON bodies without throwing FST_ERR_CTP_EMPTY_JSON_BODY
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      if (!body || (typeof body === 'string' && body.trim() === '')) {
        return done(null, {});
      }
      const json = JSON.parse(body as string);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Request & Response Logging Hooks
  app.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
    const time = new Date().toLocaleTimeString();
    console.log(`\n\x1b[36m[${time}] 📡 [API REQ]\x1b[0m \x1b[1m${request.method}\x1b[0m ${request.url} from ${request.ip}`);
  });

  app.addHook('preHandler', async (request) => {
    if (request.body && typeof request.body === 'object') {
      const sanitizedBody = { ...(request.body as Record<string, any>) };
      if (sanitizedBody.password) sanitizedBody.password = '********';
      if (sanitizedBody.token) sanitizedBody.token = '***';
      console.log(`\x1b[34m[API BODY]\x1b[0m`, JSON.stringify(sanitizedBody));
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - ((request as any).startTime || Date.now());
    const statusCode = reply.statusCode;
    const time = new Date().toLocaleTimeString();
    const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}[${time}] 🏁 [API RES]\x1b[0m \x1b[1m${request.method}\x1b[0m ${request.url} ➔ \x1b[1m${statusCode}\x1b[0m (${duration}ms)`);
  });

  app.addHook('onError', async (request, reply, error) => {
    console.error(`\x1b[31m[API ERROR]\x1b[0m ${request.method} ${request.url}:`, error.message);
  });

  // 4. Initialize Firebase Admin SDK
  initFirebase();

  // 5. Health Check
  app.get('/api/health', async () => {
    return {
      status: 'healthy',
      service: 'safety-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    };
  });

  // 6. Register API Routes
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(sessionRoutes, { prefix: '/api' });
  await app.register(incidentRoutes, { prefix: '/api' });
  await app.register(staffRoutes, { prefix: '/api' });
  await app.register(agoraRoutes, { prefix: '/api' });
  await app.register(userRoutes, { prefix: '/api' });

  return app;
}
