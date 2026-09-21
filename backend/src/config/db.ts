import mongoose from 'mongoose';
import dns from 'dns';
import { config } from './env.js';

// Configure reliable DNS servers for MongoDB Atlas SRV query resolution on Windows
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // Ignore if unable to override DNS servers
}

export async function connectDB(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongodbUri);
    console.log(`[MongoDB] Connected successfully to Atlas/database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('[MongoDB] Disconnected');
}
