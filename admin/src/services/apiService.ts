import type { 
  IncidentReport, 
  IncidentStatus, 
  SafetySession, 
  StaffMember, 
  StaffStatus,
  StaffRole,
  CommunityAiReport
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://safetyyzemaf-ejfyeqb7b2d4a4e5.westus3-01.azurewebsites.net/api';
const TOKEN_KEY = 'safety_admin_token';
const USER_KEY = 'safety_admin_user';

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const apiService = {
  // ─── AUTHENTICATION ───────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      return {
        success: true,
        user: data.user,
        token: data.token,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Connection error to backend server' };
    }
  },

  async getMe(): Promise<any | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  // ─── SESSIONS & RADAR ────────────────────────────────────────────────────
  async fetchActiveSessions(params?: { countryCode?: string; stateCode?: string; communityId?: string }): Promise<SafetySession[]> {
    try {
      const query = new URLSearchParams();
      if (params?.countryCode && params.countryCode !== 'ALL') query.set('countryCode', params.countryCode);
      if (params?.stateCode && params.stateCode !== 'ALL') query.set('stateCode', params.stateCode);
      if (params?.communityId && params.communityId !== 'ALL') query.set('communityId', params.communityId);

      const res = await fetch(`${API_BASE_URL}/sessions/active?${query.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) return [];
      const data = await res.json();

      return data.map((s: any): SafetySession => ({
        id: s._id || s.id,
        userId: s.userId,
        userName: s.userName || 'Citizen',
        userPhone: s.userPhone || '',
        userEmail: s.userEmail || '',
        status: s.status,
        batteryLevel: s.batteryLevel ?? 100,
        lastPingAt: s.lastPingAt || s.createdAt,
        nextPromptDueAt: s.nextPromptDueAt,
        emergencyTriggeredAt: s.emergencyTriggeredAt,
        agoraChannelName: s.agoraChannelName || `safety_channel_${s._id}`,
        currentLocation: {
          lat: s.currentLocation?.coordinates ? s.currentLocation.coordinates[1] : 6.6018,
          lng: s.currentLocation?.coordinates ? s.currentLocation.coordinates[0] : 3.3515,
        },
        addressName: s.addressName || 'Active Session Route',
        countryCode: s.countryCode || '',
        stateCode: s.stateCode || '',
        communityId: s.communityId || '',
        breadcrumbs: (s.breadcrumbs || []).map((b: any) => ({
          lat: b.coordinates ? b.coordinates[1] : 0,
          lng: b.coordinates ? b.coordinates[0] : 0,
          recordedAt: b.recordedAt,
          batteryLevel: b.batteryLevel,
        })),
      }));
    } catch {
      return [];
    }
  },

  async resolveSession(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/resolve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId, status: 'resolved' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ─── INCIDENTS & REPORTS ─────────────────────────────────────────────────
  async fetchIncidents(params?: { countryCode?: string; stateCode?: string; communityId?: string; category?: string; status?: string }): Promise<IncidentReport[]> {
    try {
      const query = new URLSearchParams();
      if (params?.countryCode && params.countryCode !== 'ALL') query.set('countryCode', params.countryCode);
      if (params?.stateCode && params.stateCode !== 'ALL') query.set('stateCode', params.stateCode);
      if (params?.communityId && params.communityId !== 'ALL' && params.communityId !== 'all') query.set('communityId', params.communityId);
      if (params?.category && params.category !== 'all') query.set('category', params.category);
      if (params?.status && params.status !== 'all') query.set('status', params.status);

      const res = await fetch(`${API_BASE_URL}/incidents?${query.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) return [];
      const data = await res.json();

      return data.map((inc: any): IncidentReport => ({
        id: inc.customId || (inc._id ? inc._id.toString() : inc.id),
        reporterName: inc.reporterName || 'Anonymous',
        isAnonymous: Boolean(inc.isAnonymous),
        source: inc.source || 'community_report',
        category: inc.category || 'other',
        title: inc.title || 'Incident Report',
        description: inc.description || '',
        location: {
          lat: inc.location?.coordinates ? inc.location.coordinates[1] : 0,
          lng: inc.location?.coordinates ? inc.location.coordinates[0] : 0,
        },
        addressName: inc.addressName || 'Community Jurisdiction',
        countryCode: inc.countryCode || '',
        stateCode: inc.stateCode || '',
        communityId: inc.communityId || '',
        status: inc.status || 'open',
        urgency: inc.urgency || 'medium',
        staffComments: (inc.staffComments || []).map((c: any) => ({
          id: c._id || `cmt_${Date.now()}`,
          staffName: c.staffName || 'Staff',
          staffRole: c.staffRole || 'Responder',
          comment: c.comment || '',
          createdAt: c.createdAt || new Date().toISOString(),
        })),
        createdAt: inc.createdAt || new Date().toISOString(),
        updatedAt: inc.updatedAt || inc.createdAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  },

  async addComment(reportId: string, comment: string, staffName: string = 'Control Room Dispatcher', staffRole: string = 'Dispatch Officer'): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/${reportId}/comments`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ comment, staffName, staffRole }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async updateReportStatus(reportId: string, status: IncidentStatus): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/${reportId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ─── AI INTELLIGENCE & DEV PURGE TOOLS ────────────────────────────────────
  async getCommunityAiSummary(params: {
    communityId?: string;
    stateCode?: string;
    countryCode?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    incidents?: any[];
    sessions?: any[];
  }): Promise<CommunityAiReport | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/ai-summary`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        console.warn('AI summary request failed with status:', res.status);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('AI summary fetch error:', err);
      return null;
    }
  },

  async purgeAllTestData(): Promise<{
    success: boolean;
    message?: string;
    deleted?: { incidentsMongo: number; sessionsMongo: number; firestore: any };
    error?: string;
  }> {
    try {
      const res = await fetch(`${API_BASE_URL}/incidents/purge-all`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      console.error('Purge all data error:', err);
      return { success: false, error: err.message || 'Failed to connect to backend' };
    }
  },

  // ─── STAFF MANAGEMENT ────────────────────────────────────────────────────
  async fetchStaff(params?: { role?: string; status?: string; countryCode?: string }): Promise<StaffMember[]> {
    try {
      const query = new URLSearchParams();
      if (params?.role && params.role !== 'ALL') query.set('role', params.role);
      if (params?.status && params.status !== 'ALL') query.set('status', params.status);
      if (params?.countryCode && params.countryCode !== 'ALL') query.set('countryCode', params.countryCode);

      const res = await fetch(`${API_BASE_URL}/staff?${query.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) return [];
      const data = await res.json();

      return data.map((s: any): StaffMember => ({
        id: s._id || s.id,
        name: s.name,
        email: s.email,
        phone: s.phone || '',
        role: s.role as StaffRole,
        status: s.status as StaffStatus,
        countryCode: s.countryCode || 'ALL',
        assignedJurisdiction: s.assignedJurisdiction || 'Global Command',
        createdAt: s.createdAt || new Date().toISOString(),
        lastActiveAt: s.lastActiveAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  },

  async createStaff(staffData: { name: string; email: string; phone?: string; password?: string; role: StaffRole; countryCode?: string; assignedJurisdiction?: string }): Promise<StaffMember | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/staff`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...staffData,
          countryCode: staffData.countryCode || 'ALL',
          assignedJurisdiction: staffData.assignedJurisdiction || 'Global Command',
          password: staffData.password || 'safety2026',
        }),
      });

      if (!res.ok) return null;
      const s = await res.json();
      return {
        id: s.id || s._id,
        name: s.name,
        email: s.email,
        phone: s.phone || '',
        role: s.role as StaffRole,
        status: s.status as StaffStatus,
        countryCode: s.countryCode || 'ALL',
        assignedJurisdiction: s.assignedJurisdiction || 'Global Command',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },

  async updateStaffStatus(staffId: string, status: StaffStatus): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/staff/${staffId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteStaff(staffId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ─── AGORA RTC TOKEN & CALL SIGNALING ─────────────────────────────────────
  async getAgoraToken(channelName: string, uid: number = 0): Promise<{ token: string; appId: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/agora/token/${channelName}?uid=${uid}`);
      if (!res.ok) return { token: '', appId: '' };
      return await res.json();
    } catch {
      return { token: '', appId: '' };
    }
  },

  /**
   * Initiates a voice call directly to a user (session-independent).
   * Uses /api/users/:userId/call which resolves the user by ObjectId or guestDeviceId.
   */
  async initiateCall(userId: string, callerName = 'Safety Command Dispatcher', callerRole = 'Control Room Officer'): Promise<{
    success: boolean;
    channelName?: string;
    appId?: string;
    adminToken?: string;
    adminUid?: number;
    error?: string;
  }> {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/call`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ callerName, callerRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to initiate call' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Call connection error' };
    }
  },

  async endCall(userId: string, sessionId?: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/end-call`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async getCallStatus(sessionId: string): Promise<{ status: string; activeCall?: any }> {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/call-status`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return { status: 'idle' };
      return await res.json();
    } catch {
      return { status: 'idle' };
    }
  },
};
