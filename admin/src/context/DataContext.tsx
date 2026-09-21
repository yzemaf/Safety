import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  SafetySession, 
  IncidentReport, 
  IncidentStatus, 
  SystemConfig, 
  AdminJurisdictionSettings,
  StaffMember,
  StaffStatus
} from '../types';
import { loadSystemConfig } from '../services/configService';
import { apiService } from '../services/apiService';
import { 
  initFirebase, 
  subscribeToActiveSessions, 
  subscribeToIncidentReports,
  updateIncidentInFirestore,
  addCommentInFirestore
} from '../services/firebaseService';
import { 
  resolveActivePerimeter, 
  getStateByCode, 
  DEFAULT_JURISDICTION_SETTINGS,
  type ResolvedPerimeter 
} from '../services/jurisdictionData';
import { useAuth } from './AuthContext';

const STAFF_STORAGE_KEY = 'safety_staff_members_registry';

interface DataContextType {
  config: SystemConfig;
  sessions: SafetySession[];
  filteredSessions: SafetySession[];
  reports: IncidentReport[];
  filteredReports: IncidentReport[];
  callingSession: SafetySession | null;
  setCallingSession: (session: SafetySession | null) => void;
  addComment: (reportId: string, text: string) => Promise<boolean>;
  updateReportStatus: (reportId: string, status: IncidentStatus) => Promise<boolean>;
  resolveSession: (sessionId: string) => void;
  refreshData: () => Promise<void>;
  emergencyCount: number;
  globalEmergencyCount: number;
  purgeAllData: () => Promise<{ success: boolean; message?: string; deleted?: any; error?: string }>;
  
  // Staff & Team Management
  staffMembers: StaffMember[];
  addStaffMember: (staffData: Omit<StaffMember, 'id' | 'createdAt' | 'lastActiveAt'>) => void;
  updateStaffStatus: (staffId: string, status: StaffStatus) => void;
  deleteStaffMember: (staffId: string) => void;

  // Global Header Search
  globalSearch: string;
  setGlobalSearch: (term: string) => void;

  // Jurisdiction & Per-Admin Persistence
  jurisdictionSettings: AdminJurisdictionSettings;
  updateJurisdictionSettings: (settings: Partial<AdminJurisdictionSettings>) => void;
  activePerimeter: ResolvedPerimeter;
  resetToGlobal: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { adminUser, isAuthenticated } = useAuth();
  const [config] = useState<SystemConfig>(loadSystemConfig);
  const [sessions, setSessions] = useState<SafetySession[]>([]);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [callingSession, setCallingSession] = useState<SafetySession | null>(null);

  // Unified, stable storage key to guarantee persistence across reloads
  const storageKey = 'safety_admin_jurisdiction_active';

  // Persistent Jurisdiction Settings
  const [jurisdictionSettings, setJurisdictionSettings] = useState<AdminJurisdictionSettings>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_JURISDICTION_SETTINGS;
  });

  // Re-sync settings whenever admin user changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setJurisdictionSettings(JSON.parse(stored));
      } else {
        setJurisdictionSettings(DEFAULT_JURISDICTION_SETTINGS);
      }
    } catch {
      setJurisdictionSettings(DEFAULT_JURISDICTION_SETTINGS);
    }
  }, [storageKey]);

  // Update & Persist Jurisdiction Settings
  const updateJurisdictionSettings = useCallback((newSettings: Partial<AdminJurisdictionSettings>) => {
    setJurisdictionSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to persist admin jurisdiction settings:', err);
      }
      return updated;
    });
  }, [storageKey]);

  const resetToGlobal = useCallback(() => {
    updateJurisdictionSettings(DEFAULT_JURISDICTION_SETTINGS);
  }, [updateJurisdictionSettings]);

  // Resolved Perimeter details (Coordinates, Zoom, Label, Level)
  const activePerimeter = useMemo(() => {
    return resolveActivePerimeter(jurisdictionSettings);
  }, [jurisdictionSettings]);

  // ─── FASTIFY BACKEND DATA SYNC ──────────────────────────────────────────
  const syncFromBackend = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [backendIncidents, backendSessions, backendStaff] = await Promise.all([
        apiService.fetchIncidents(),
        apiService.fetchActiveSessions(),
        apiService.fetchStaff(),
      ]);

      if (Array.isArray(backendIncidents)) {
        setReports(
          backendIncidents.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      }
      if (Array.isArray(backendSessions)) {
        setSessions(backendSessions);
      }
      if (Array.isArray(backendStaff)) {
        persistStaff(backendStaff);
      }
    } catch (err) {
      console.warn('[Admin] Sync from backend error:', err);
    }
  }, [isAuthenticated]);

  // Initial load only on login/mount
  useEffect(() => {
    if (!isAuthenticated) {
      setReports([]);
      setSessions([]);
      return;
    }
    syncFromBackend();
  }, [syncFromBackend, isAuthenticated]);

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
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

function isPointInPolygon(
  point: { lat: number; lng: number },
  vs: Array<{ lat: number; lng: number }>
): boolean {
  if (!vs || vs.length < 3) return false;
  const x = point.lat, y = point.lng;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lat, yi = vs[i].lng;
    const xj = vs[j].lat, yj = vs[j].lng;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function checkCommunityScopeMatch(
  itemCommunityId: string | undefined,
  itemLocation: { lat: number; lng: number },
  targetCommunityId: string,
  perimeter: ResolvedPerimeter | null
): boolean {
  if (!targetCommunityId || targetCommunityId === 'ALL') return true;

  const rawTarget = targetCommunityId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawItem = (itemCommunityId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Direct ID / Slug string match
  if (rawItem.length > 0 && rawTarget.length > 0) {
    if (rawItem === rawTarget || rawItem.includes(rawTarget) || rawTarget.includes(rawItem)) {
      return true;
    }
  }

  // 2. Spatial perimeter match
  if (perimeter && perimeter.level === 'community') {
    // If perimeter polygon is defined with >= 3 vertices, check polygon containment
    if (perimeter.boundary && perimeter.boundary.length >= 3) {
      if (isPointInPolygon(itemLocation, perimeter.boundary)) {
        return true;
      }
    }
    // Proximity to community center (max 4.5km radius for neighbourhood scope)
    const distKm = getDistanceKm(
      itemLocation.lat,
      itemLocation.lng,
      perimeter.center.lat,
      perimeter.center.lng
    );
    if (distKm <= 4.5) {
      return true;
    }
  }

  return false;
}

  // Filtered Sessions matching active jurisdiction
  const filteredSessions = useMemo(() => {
    if (jurisdictionSettings.mode === 'global' || jurisdictionSettings.countryCode === 'ALL') {
      return sessions;
    }
    const cTarget = jurisdictionSettings.countryCode.toUpperCase();
    const sTarget = jurisdictionSettings.stateCode.toUpperCase();

    return sessions.filter((s) => {
      if (s.countryCode && s.countryCode.toUpperCase() !== cTarget) return false;
      if (jurisdictionSettings.stateCode !== 'ALL' && s.stateCode) {
        const sCode = s.stateCode.toUpperCase();
        const stateObj = getStateByCode(cTarget, jurisdictionSettings.stateCode);
        const matchesState = sCode === sTarget || (stateObj && (sCode === stateObj.code.toUpperCase() || s.stateCode.toLowerCase() === stateObj.name.toLowerCase()));
        if (!matchesState) return false;
      }
      if (jurisdictionSettings.communityId !== 'ALL') {
        return checkCommunityScopeMatch(
          s.communityId,
          s.currentLocation,
          jurisdictionSettings.communityId,
          activePerimeter
        );
      }
      return true;
    });
  }, [sessions, jurisdictionSettings, activePerimeter]);

  // Filtered Reports matching active jurisdiction
  const filteredReports = useMemo(() => {
    if (jurisdictionSettings.mode === 'global' || jurisdictionSettings.countryCode === 'ALL') {
      return reports;
    }
    const cTarget = jurisdictionSettings.countryCode.toUpperCase();
    const sTarget = jurisdictionSettings.stateCode.toUpperCase();

    return reports.filter((r) => {
      if (r.countryCode && r.countryCode.toUpperCase() !== cTarget) return false;
      if (jurisdictionSettings.stateCode !== 'ALL' && r.stateCode) {
        const sCode = r.stateCode.toUpperCase();
        const stateObj = getStateByCode(cTarget, jurisdictionSettings.stateCode);
        const matchesState = sCode === sTarget || (stateObj && (sCode === stateObj.code.toUpperCase() || r.stateCode.toLowerCase() === stateObj.name.toLowerCase()));
        if (!matchesState) return false;
      }
      if (jurisdictionSettings.communityId !== 'ALL') {
        return checkCommunityScopeMatch(
          r.communityId,
          r.location,
          jurisdictionSettings.communityId,
          activePerimeter
        );
      }
      return true;
    });
  }, [reports, jurisdictionSettings, activePerimeter]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (config.firebaseConfigJson) {
      const isInit = initFirebase(config.firebaseConfigJson);
      if (isInit) {
        const unsubSessions = subscribeToActiveSessions((remoteSessions) => {
          if (Array.isArray(remoteSessions)) {
            setSessions(remoteSessions);
          }
        });
        const unsubReports = subscribeToIncidentReports((remoteReports) => {
          if (Array.isArray(remoteReports)) {
            setReports(
              remoteReports.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
            );
          }
        });
        return () => {
          unsubSessions();
          unsubReports();
        };
      }
    }
  }, [config.firebaseConfigJson, isAuthenticated]);

  const addComment = useCallback(async (reportId: string, text: string): Promise<boolean> => {
    const staffName = adminUser?.name || 'Admin Dispatcher';
    const staffRole = 'Control Room Officer';
    
    const newComment = {
      id: `comm-${Date.now()}`,
      staffName,
      staffRole,
      comment: text,
      createdAt: new Date().toISOString(),
    };

    // Optimistic UI update
    setReports((prev) =>
      prev.map((rep) => {
        if (rep.id === reportId) {
          return {
            ...rep,
            staffComments: [...(rep.staffComments || []), newComment],
            updatedAt: new Date().toISOString(),
          };
        }
        return rep;
      })
    );

    try {
      // Parallel sync to both Firestore (realtime) and Backend API (MongoDB)
      const [fsResult, apiResult] = await Promise.allSettled([
        addCommentInFirestore(reportId, newComment),
        apiService.addComment(reportId, text, staffName, staffRole),
      ]);

      const fsSuccess = fsResult.status === 'fulfilled';
      const apiSuccess = apiResult.status === 'fulfilled' && apiResult.value === true;

      if (!fsSuccess && !apiSuccess) {
        // Rollback optimistic state if both networks failed
        setReports((prev) =>
          prev.map((rep) => {
            if (rep.id === reportId) {
              return {
                ...rep,
                staffComments: (rep.staffComments || []).filter((c) => c.id !== newComment.id),
              };
            }
            return rep;
          })
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to sync comment:', err);
      return false;
    }
  }, [adminUser?.name]);

  const updateReportStatus = useCallback(async (reportId: string, newStatus: IncidentStatus): Promise<boolean> => {
    let prevStatus: IncidentStatus = 'open';
    setReports((prev) =>
      prev.map((rep) => {
        if (rep.id === reportId) {
          prevStatus = rep.status;
          return { ...rep, status: newStatus, updatedAt: new Date().toISOString() };
        }
        return rep;
      })
    );

    try {
      // Parallel sync to both Firestore (realtime) and Backend API (MongoDB)
      const [fsResult, apiResult] = await Promise.allSettled([
        updateIncidentInFirestore(reportId, { status: newStatus }),
        apiService.updateReportStatus(reportId, newStatus),
      ]);

      const fsSuccess = fsResult.status === 'fulfilled';
      const apiSuccess = apiResult.status === 'fulfilled' && apiResult.value === true;

      if (!fsSuccess && !apiSuccess) {
        // Rollback optimistic state if both networks failed
        setReports((prev) =>
          prev.map((rep) => (rep.id === reportId ? { ...rep, status: prevStatus } : rep))
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('Failed to sync status update:', err);
      return false;
    }
  }, []);

  const resolveSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'resolved' as const } : s))
    );
    apiService.resolveSession(sessionId).catch((err) => {
      console.warn('Backend session resolve error:', err);
    });
  }, []);

  const purgeAllData = useCallback(async () => {
    const res = await apiService.purgeAllTestData();
    if (res.success) {
      setReports([]);
      setSessions([]);
    }
    return res;
  }, []);

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() => {
    try {
      const stored = localStorage.getItem(STAFF_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const dummyIds = new Set(['stf-001', 'stf-002', 'stf-003', 'stf-004', 'stf-005', 'stf-006']);
          const clean = parsed.filter(
            (s: StaffMember) =>
              !dummyIds.has(s.id) &&
              s.name !== 'Sarah Jenkins' &&
              s.name !== 'Officer David Miller' &&
              s.name !== 'Inspector James Ochieng' &&
              s.name !== 'Sergeant Marcus Holloway' &&
              s.name !== 'Elena Rostova' &&
              s.name !== 'Officer Lucas Weber' &&
              s.name !== 'Control Room Dispatcher 1' &&
              s.name !== 'Nairobi Regional Lead' &&
              s.name !== 'London Support Lead'
          );
          return clean;
        }
      }
    } catch {
      // ignore parse errors
    }
    return [];
  });

  const persistStaff = (newList: StaffMember[]) => {
    setStaffMembers(newList);
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(newList));
    } catch (err) {
      console.warn('Failed to persist staff members:', err);
    }
  };

  const addStaffMember = useCallback(async (staffData: Omit<StaffMember, 'id' | 'createdAt' | 'lastActiveAt'>) => {
    const created = await apiService.createStaff(staffData);
    if (created) {
      persistStaff([created, ...staffMembers]);
    } else {
      const newMember: StaffMember = {
        ...staffData,
        id: `stf-${Date.now()}`,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      persistStaff([newMember, ...staffMembers]);
    }
  }, [staffMembers]);

  const updateStaffStatus = useCallback((staffId: string, status: StaffStatus) => {
    const updated = staffMembers.map((m) =>
      m.id === staffId ? { ...m, status, lastActiveAt: new Date().toISOString() } : m
    );
    persistStaff(updated);
    apiService.updateStaffStatus(staffId, status).catch((err) => {
      console.warn('Backend staff status sync error:', err);
    });
  }, [staffMembers]);

  const deleteStaffMember = useCallback(async (staffId: string) => {
    const updated = staffMembers.filter((m) => m.id !== staffId);
    persistStaff(updated);
    apiService.deleteStaff(staffId).catch((err) => {
      console.warn('Backend staff delete error:', err);
    });
  }, [staffMembers]);

  const [globalSearch, setGlobalSearch] = useState('');
  const emergencyCount = filteredSessions.filter((s) => s.status === 'emergency').length;
  const globalEmergencyCount = sessions.filter((s) => s.status === 'emergency').length;

  return (
    <DataContext.Provider
      value={{
        config,
        sessions,
        filteredSessions,
        reports,
        filteredReports,
        callingSession,
        setCallingSession,
        addComment,
        updateReportStatus,
        resolveSession,
        refreshData: syncFromBackend,
        emergencyCount,
        globalEmergencyCount,
        staffMembers,
        addStaffMember,
        updateStaffStatus,
        deleteStaffMember,
        globalSearch,
        setGlobalSearch,
        jurisdictionSettings,
        updateJurisdictionSettings,
        activePerimeter,
        resetToGlobal,
        purgeAllData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
