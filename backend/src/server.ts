import { buildApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { config } from './config/env.js';
import { startEscalationWorker, stopEscalationWorker } from './services/escalationWorker.js';

async function start() {
  try {
    // 1. Connect to MongoDB Atlas
    await connectDB();

    // 2. Build Fastify app
    const app = await buildApp();

    // 3. Start automated missed check-in background worker
    startEscalationWorker(10000);

    // 4. Start listening on configured host and port
    const address = await app.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`\n🚀 Safety Fastify Backend is running at: ${address}`);
    console.log(`📋 Health Check endpoint: ${address}/api/health`);
    console.log(`📡 Ready for Flutter Mobile, Admin Portal, and FCM Proximity Broadcasts.\n`);

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        stopEscalationWorker();
        await app.close();
        await disconnectDB();
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

start();
