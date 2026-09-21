export type SessionStatus = 'active' | 'distress_pending' | 'emergency' | 'resolved' | 'cancelled';

export type IncidentCategory = 'harassment' | 'theft' | 'physical_threat' | 'hazard' | 'emergency' | 'other';

export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export type JurisdictionMode = 'global' | 'community';

export interface AdminJurisdictionSettings {
  mode: JurisdictionMode;
  countryCode: string; // 'ALL' or ISO-2 code like 'US', 'GB', 'CA', 'DE'
  stateCode: string;   // 'ALL' or state identifier like 'CA', 'NY', 'TX'
  communityId: string; // 'ALL' or community identifier like 'manhattan', 'brooklyn'
  communityName?: string; // Human-readable community name like 'Akowonjo', 'Isheri Olofin'
}

export interface BoundaryPolygonPoint {
  lat: number;
  lng: number;
}

export interface JurisdictionEntity {
  id: string;
  name: string;
  code: string;
  type: 'country' | 'state' | 'community';
  center: LocationPoint;
  zoom: number;
  boundary: BoundaryPolygonPoint[];
}

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface BreadcrumbPoint {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  batteryLevel?: number;
  settings: {
    checkInIntervalMinutes: number;
    timeoutDurationSeconds: number;
    callHandlingPreference: 'standard_ring' | 'auto_answer_speaker';
    defaultLandingTab: 'safety_mode' | 'awareness' | 'settings';
  };
}

export interface SafetySession {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail: string;
  status: SessionStatus;
  batteryLevel: number;
  lastPingAt: string;
  nextPromptDueAt: string;
  emergencyTriggeredAt?: string;
  currentLocation: LocationPoint;
  addressName?: string;
  countryCode?: string;
  stateCode?: string;
  communityId?: string;
  breadcrumbs: BreadcrumbPoint[];
  agoraChannelName?: string;
}

export interface StaffComment {
  id: string;
  staffName: string;
  staffRole: string;
  comment: string;
  createdAt: string;
}

export interface IncidentReport {
  id: string;
  reportedBy?: string;
  reporterName?: string;
  isAnonymous: boolean;
  source: 'community_report' | 'safety_mode_emergency';
  category: IncidentCategory;
  title: string;
  description: string;
  location: LocationPoint;
  addressName?: string;
  countryCode?: string;
  stateCode?: string;
  communityId?: string;
  status: IncidentStatus;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  staffComments: StaffComment[];
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfig {
  googleMapsApiKey: string;
  agoraAppId: string;
  firebaseConfigJson: string;
}

export type StaffRole = 'super_admin' | 'dispatch_officer' | 'field_responder' | 'support_lead';

export type StaffStatus = 'active' | 'on_duty' | 'offline' | 'suspended';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: StaffRole;
  status: StaffStatus;
  countryCode?: string;
  assignedJurisdiction?: string;
  avatar?: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface LocationThreatPoint {
  name: string;
  incidentCount: number;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

export interface CitizenSafetyTip {
  title: string;
  recommendation: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export interface CommunityAiReport {
  community: string;
  jurisdiction: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'Severe';
  riskScore: number;
  executiveSummary: string;
  locationsCovered: LocationThreatPoint[];
  citizenAdvice: CitizenSafetyTip[];
  commandCenterRecommendations: string[];
  markdownReport: string;
  metadata: {
    totalIncidentsAnalyzed: number;
    totalSafetySessionsAnalyzed: number;
    emergencyBeaconsCount: number;
    unrespondedOrEscalatedCount: number;
    generatedAt: string;
    modelUsed: string;
  };
}


