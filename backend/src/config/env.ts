import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/safety',
  jwtSecret: process.env.JWT_SECRET || 'safety_jwt_secret_dev_key',
  agora: {
    appId: process.env.AGORA_APP_ID || '',
    appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'safety-711a9',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json',
    databaseUrl: process.env.FIREBASE_DATABASE_URL || 'https://safety-711a9-default-rtdb.firebaseio.com',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },
};
