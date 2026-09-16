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
import { INITIAL_SESSIONS, INITIAL_REPORTS, INITIAL_STAFF } from '../services/mockData';
import { loadSystemConfig } from '../services/configService';
import { 
  initFirebase, 
  subscribeToActiveSessions, 
  subscribeToIncidentReports 
} from '../services/firebaseService';
import { resolveActivePerimeter, getStateByCode, type ResolvedPerimeter } from '../services/jurisdictionData';
import { useAuth } from './AuthContext';

const JURISDICTION_STORAGE_PREFIX = 'safety_admin_jurisdiction_';
const STAFF_STORAGE_KEY = 'safety_staff_members_registry';

export const DEFAULT_JURISDICTION_SETTINGS: AdminJurisdictionSettings = {
  mode: 'global',
  countryCode: 'ALL',
  stateCode: 'ALL',
  communityId: 'ALL',
};

interface DataContextType {
  config: SystemConfig;
  sessions: SafetySession[];
  filteredSessions: SafetySession[];
  reports: IncidentReport[];
  filteredReports: IncidentReport[];
  callingSession: SafetySession | null;
  setCallingSession: (session: SafetySession | null) => void;
  addComment: (reportId: string, text: string) => void;
  updateReportStatus: (reportId: string, status: IncidentStatus) => void;
  resolveSession: (sessionId: string) => void;
  emergencyCount: number;
  globalEmergencyCount: number;
  
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
  const { adminUser } = useAuth();
  const [config] = useState<SystemConfig>(loadSystemConfig);
  const [sessions, setSessions] = useState<SafetySession[]>(INITIAL_SESSIONS);
  const [reports, setReports] = useState<IncidentReport[]>(INITIAL_REPORTS);
  const [callingSession, setCallingSession] = useState<SafetySession | null>(null);

  // Storage key specific to current admin user (persists per admin)
  const storageKey = adminUser?.email 
    ? `${JURISDICTION_STORAGE_PREFIX}${adminUser.email}` 
    : `${JURISDICTION_STORAGE_PREFIX}default`;

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

  // Filtered Sessions matching active jurisdiction
  const filteredSessions = useMemo(() => {
    if (jurisdictionSettings.mode === 'global' || jurisdictionSettings.countryCode === 'ALL') {
      return sessions;
    }
    const cTarget = jurisdictionSettings.countryCode.toUpperCase();
    const sTarget = jurisdictionSettings.stateCode.toUpperCase();
    const commTarget = jurisdictionSettings.communityId.toLowerCase();

    return sessions.filter((s) => {
      if (s.countryCode && s.countryCode.toUpperCase() !== cTarget) return false;
      if (jurisdictionSettings.stateCode !== 'ALL' && s.stateCode) {
        const sCode = s.stateCode.toUpperCase();
        const stateObj = getStateByCode(cTarget, jurisdictionSettings.stateCode);
        const matchesState = sCode === sTarget || (stateObj && (sCode === stateObj.code.toUpperCase() || s.stateCode.toLowerCase() === stateObj.name.toLowerCase()));
        if (!matchesState) return false;
      }
      if (jurisdictionSettings.communityId !== 'ALL') {
        const rawS = (s.communityId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rawTarget = commTarget.replace(/[^a-z0-9]/g, '');
        const matches = rawS === rawTarget || rawS.includes(rawTarget) || rawTarget.includes(rawS);
        if (!matches) {
          if (activePerimeter && activePerimeter.level === 'community') {
            const dLat = s.currentLocation.lat - activePerimeter.center.lat;
            const dLng = s.currentLocation.lng - activePerimeter.center.lng;
            if (dLat * dLat + dLng * dLng > 0.04) return false;
          } else {
            return false;
          }
        }
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
    const commTarget = jurisdictionSettings.communityId.toLowerCase();

    return reports.filter((r) => {
      if (r.countryCode && r.countryCode.toUpperCase() !== cTarget) return false;
      if (jurisdictionSettings.stateCode !== 'ALL' && r.stateCode) {
        const sCode = r.stateCode.toUpperCase();
        const stateObj = getStateByCode(cTarget, jurisdictionSettings.stateCode);
        const matchesState = sCode === sTarget || (stateObj && (sCode === stateObj.code.toUpperCase() || r.stateCode.toLowerCase() === stateObj.name.toLowerCase()));
        if (!matchesState) return false;
      }
      if (jurisdictionSettings.communityId !== 'ALL') {
        const rawR = (r.communityId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rawTarget = commTarget.replace(/[^a-z0-9]/g, '');
        const matches = rawR === rawTarget || rawR.includes(rawTarget) || rawTarget.includes(rawR);
        if (!matches) {
          if (activePerimeter && activePerimeter.level === 'community') {
            const dLat = r.location.lat - activePerimeter.center.lat;
            const dLng = r.location.lng - activePerimeter.center.lng;
            if (dLat * dLat + dLng * dLng > 0.04) return false;
          } else {
            return false;
          }
        }
      }
      return true;
    });
  }, [reports, jurisdictionSettings, activePerimeter]);

  useEffect(() => {
    if (config.firebaseConfigJson) {
      const isInit = initFirebase(config.firebaseConfigJson);
      if (isInit) {
        const unsubSessions = subscribeToActiveSessions((remoteSessions) => {
          if (remoteSessions && remoteSessions.length > 0) {
            setSessions(remoteSessions);
          }
        });
        const unsubReports = subscribeToIncidentReports((remoteReports) => {
          if (remoteReports && remoteReports.length > 0) {
            setReports(remoteReports);
          }
        });
        return () => {
          unsubSessions();
          unsubReports();
        };
      }
    }
  }, [config.firebaseConfigJson]);

  const addComment = useCallback((reportId: string, text: string) => {
    setReports((prev) =>
      prev.map((rep) => {
        if (rep.id === reportId) {
          const newComment = {
            id: `comm-${Date.now()}`,
            staffName: adminUser?.name || 'Admin Dispatcher',
            staffRole: 'Control Room Officer',
            comment: text,
            createdAt: new Date().toISOString(),
          };
          return {
            ...rep,
            staffComments: [...rep.staffComments, newComment],
            updatedAt: new Date().toISOString(),
          };
        }
        return rep;
      })
    );
  }, [adminUser?.name]);

  const updateReportStatus = useCallback((reportId: string, newStatus: IncidentStatus) => {
    setReports((prev) =>
      prev.map((rep) =>
        rep.id === reportId ? { ...rep, status: newStatus, updatedAt: new Date().toISOString() } : rep
      )
    );
  }, []);

  const resolveSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'resolved' as const } : s))
    );
  }, []);

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() => {
    try {
      const stored = localStorage.getItem(STAFF_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore parse errors
    }
    return INITIAL_STAFF;
  });

  const persistStaff = (newList: StaffMember[]) => {
    setStaffMembers(newList);
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(newList));
    } catch (err) {
      console.warn('Failed to persist staff members:', err);
    }
  };

  const addStaffMember = useCallback((staffData: Omit<StaffMember, 'id' | 'createdAt' | 'lastActiveAt'>) => {
    const newMember: StaffMember = {
      ...staffData,
      id: `stf-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    persistStaff([newMember, ...staffMembers]);
  }, [staffMembers]);

  const updateStaffStatus = useCallback((staffId: string, status: StaffStatus) => {
    const updated = staffMembers.map((m) =>
      m.id === staffId ? { ...m, status, lastActiveAt: new Date().toISOString() } : m
    );
    persistStaff(updated);
  }, [staffMembers]);

  const deleteStaffMember = useCallback((staffId: string) => {
    const updated = staffMembers.filter((m) => m.id !== staffId);
    persistStaff(updated);
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
