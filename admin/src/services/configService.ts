import type { SystemConfig } from '../types';

const DEFAULT_GOOGLE_MAPS_API_KEY = 'AIzaSyBP11DmdxM24L5HsvicTslOON07zFwT-WE';
const DEFAULT_AGORA_APP_ID = '8f569e83852146788dc1137b90fbaf51';
const DEFAULT_FIREBASE_CONFIG = '{"apiKey":"AIzaSyBQsQgMeNJwJT40tMcfT9_m523ECGlXR5o","authDomain":"safety-711a9.firebaseapp.com","projectId":"safety-711a9","storageBucket":"safety-711a9.firebasestorage.app","messagingSenderId":"171668239587","appId":"1:171668239587:web:safety_admin_web_client","databaseURL":"https://safety-711a9-default-rtdb.europe-west1.firebasedatabase.app"}';

export const loadSystemConfig = (): SystemConfig => {
  return {
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || DEFAULT_GOOGLE_MAPS_API_KEY,
    agoraAppId: import.meta.env.VITE_AGORA_APP_ID || DEFAULT_AGORA_APP_ID,
    firebaseConfigJson: import.meta.env.VITE_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG,
  };
};
