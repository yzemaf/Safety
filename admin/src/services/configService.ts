import type { SystemConfig } from '../types';

export const loadSystemConfig = (): SystemConfig => {
  return {
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    agoraAppId: import.meta.env.VITE_AGORA_APP_ID || '',
    firebaseConfigJson: import.meta.env.VITE_FIREBASE_CONFIG || '',
  };
};
