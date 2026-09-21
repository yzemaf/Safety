import { Country, State, City, type ICountry, type IState } from 'country-state-city';
import type { AdminJurisdictionSettings, BoundaryPolygonPoint, LocationPoint } from '../types';
import { generatePerimeterPolygon } from './boundaryService';

export interface CommunityData {
  id: string;
  name: string;
  stateCode: string;
  countryCode: string;
  center: LocationPoint;
  zoom: number;
  boundary?: BoundaryPolygonPoint[];
}

export interface StateData {
  code: string;
  name: string;
  countryCode: string;
  center: LocationPoint;
  zoom: number;
  boundary?: BoundaryPolygonPoint[];
  communities?: CommunityData[];
}

export interface CountryData {
  code: string;
  name: string;
  flag: string;
  center: LocationPoint;
  zoom: number;
  boundary?: BoundaryPolygonPoint[];
  states?: StateData[];
}

export interface ResolvedPerimeter {
  title: string;
  scopeLabel: string;
  level: 'global' | 'country' | 'state' | 'community';
  center: LocationPoint;
  zoom: number;
  boundary: BoundaryPolygonPoint[];
  countryCode?: string;
  countryName?: string;
  countryFlag?: string;
  stateName?: string;
  communityName?: string;
}

export const DEFAULT_JURISDICTION_SETTINGS: AdminJurisdictionSettings = {
  mode: 'global',
  countryCode: 'ALL',
  stateCode: 'ALL',
  communityId: 'ALL',
  communityName: 'All Communities',
};

// Country zoom level presets based on landmass / geographic spread
const COUNTRY_ZOOM_OVERRIDES: Record<string, number> = {
  RU: 3.5,
  CA: 3.8,
  US: 4.2,
  CN: 4.0,
  BR: 4.2,
  AU: 4.2,
  IN: 5.0,
  NG: 6.0,
  GB: 6.2,
  DE: 6.2,
  FR: 6.0,
  JP: 5.8,
  KE: 6.2,
  ZA: 5.8,
  SG: 11.5,
  HK: 11.5,
  MC: 14.0,
  VA: 15.0,
};

// Dynamic in-memory caches for maximum responsiveness (sub-millisecond lookups)
let cachedCountries: CountryData[] | null = null;
const stateCache = new Map<string, StateData[]>();
const communityCache = new Map<string, CommunityData[]>();

// Convert country-state-city ICountry to CountryData
function mapCountry(c: ICountry): CountryData {
  const lat = c.latitude ? parseFloat(c.latitude) || 0 : 0;
  const lng = c.longitude ? parseFloat(c.longitude) || 0 : 0;
  const zoom = COUNTRY_ZOOM_OVERRIDES[c.isoCode] || (Math.abs(lat) > 50 ? 4.5 : 5.5);

  return {
    code: c.isoCode,
    name: c.name,
    flag: c.flag || '🌐',
    center: { lat, lng },
    zoom,
  };
}

// Convert country-state-city IState to StateData
function mapState(s: IState): StateData {
  const lat = s.latitude ? parseFloat(s.latitude) || 0 : 0;
  const lng = s.longitude ? parseFloat(s.longitude) || 0 : 0;

  return {
    code: s.isoCode,
    name: s.name,
    countryCode: s.countryCode,
    center: { lat, lng },
    zoom: 9.0,
  };
}



/**
 * Get all 250 countries in the world with official ISO codes, names, emoji flags, and coordinates
 */
export function getAllCountries(): CountryData[] {
  if (cachedCountries) {
    return cachedCountries;
  }

  const all = Country.getAllCountries();
  cachedCountries = all.map(mapCountry);
  return cachedCountries;
}

/**
 * Find a country by ISO code or country name
 */
export function getCountryByCode(countryCode: string): CountryData | undefined {
  if (!countryCode || countryCode === 'ALL') return undefined;
  const upper = countryCode.toUpperCase();
  const countries = getAllCountries();
  return countries.find((c) => c.code === upper || c.name.toLowerCase() === countryCode.toLowerCase());
}

/**
 * Get all states/provinces for any country worldwide
 */
export function getStatesForCountry(countryCode: string): StateData[] {
  if (!countryCode || countryCode === 'ALL') return [];
  const upper = countryCode.toUpperCase();

  if (stateCache.has(upper)) {
    return stateCache.get(upper)!;
  }

  const rawStates = State.getStatesOfCountry(upper);
  let states: StateData[] = [];

  if (rawStates && rawStates.length > 0) {
    states = rawStates.map(mapState);
  } else {
    // If country is a microstate with no ISO subdivisions (e.g., Monaco, Singapore, Vatican City),
    // provide the country territory itself as a state division
    const country = getCountryByCode(upper);
    if (country) {
      states = [{
        code: `${country.code}-MAIN`,
        name: `${country.name} (National)`,
        countryCode: country.code,
        center: country.center,
        zoom: country.zoom + 2,
      }];
    }
  }

  stateCache.set(upper, states);
  return states;
}

/**
 * Find a specific state by countryCode and stateCode (supports ISO code or state name)
 */
export function getStateByCode(countryCode: string, stateCode: string): StateData | undefined {
  if (!countryCode || !stateCode || stateCode === 'ALL') return undefined;
  const states = getStatesForCountry(countryCode);
  const upper = stateCode.toUpperCase();
  const lower = stateCode.toLowerCase();

  return states.find(
    (s) =>
      s.code.toUpperCase() === upper ||
      s.name.toLowerCase() === lower ||
      s.name.toLowerCase().includes(lower) ||
      lower.includes(s.name.toLowerCase())
  );
}

const DYNAMIC_COMMUNITIES_KEY = 'safety_admin_dynamic_communities';

export function getStoredDynamicCommunities(): CommunityData[] {
  try {
    const raw = localStorage.getItem(DYNAMIC_COMMUNITIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load dynamic communities from storage:', e);
  }
  return [];
}

export function saveStoredDynamicCommunity(comm: CommunityData): void {
  try {
    const list = getStoredDynamicCommunities();
    const idx = list.findIndex(
      (c) =>
        c.countryCode === comm.countryCode &&
        c.stateCode === comm.stateCode &&
        (c.id === comm.id || c.name.toLowerCase() === comm.name.toLowerCase())
    );
    if (idx >= 0) {
      list[idx] = comm;
    } else {
      list.push(comm);
    }
    localStorage.setItem(DYNAMIC_COMMUNITIES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to persist dynamic community to storage:', e);
  }
}

/**
 * Converts a raw slug or identifier into a clean, capitalized Title Case name.
 * e.g. "akowonjo" -> "Akowonjo"
 * e.g. "isheri-olofin" -> "Isheri Olofin"
 * e.g. "midtown_manhattan" -> "Midtown Manhattan"
 */
export function prettifySlug(slug: string): string {
  if (!slug || slug === 'ALL' || slug === 'all') return 'All Communities';
  return slug
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Retrieves in-memory cached cities/communities for a state from standard ISO library
 * and merges any saved dynamic communities from Google Places searches.
 */
export function getCommunitiesForState(countryCode: string, stateCode: string): CommunityData[] {
  if (!countryCode || !stateCode || countryCode === 'ALL' || stateCode === 'ALL') return [];

  const cCode = countryCode.toUpperCase();
  const sCode = stateCode.toUpperCase();
  const stateObj = getStateByCode(cCode, sCode);
  const isoStateCode = stateObj?.code?.toUpperCase() || sCode;
  const cacheKey = `${cCode}:${isoStateCode}`;

  if (communityCache.has(cacheKey)) {
    return communityCache.get(cacheKey)!;
  }

  const list: CommunityData[] = [];
  const seen = new Set<string>();

  const addComm = (name: string, center: LocationPoint, boundary?: BoundaryPolygonPoint[], idOverride?: string) => {
    const norm = name.toLowerCase().trim();
    if (!seen.has(norm)) {
      seen.add(norm);
      const id = idOverride || norm.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `comm-${Math.random().toString(36).slice(2, 7)}`;
      list.push({
        id,
        name,
        stateCode: isoStateCode,
        countryCode: cCode,
        center,
        zoom: 13.8,
        boundary: boundary && boundary.length >= 3 ? boundary : generatePerimeterPolygon(center, 3.8, 24),
      });
    }
  };

  // 1. Merge any user-searched / session-registered dynamic communities for this state FIRST (real GPS coords take precedence)
  const stored = getStoredDynamicCommunities().filter(
    (c) => c.countryCode === cCode && (c.stateCode === isoStateCode || c.stateCode === sCode)
  );
  for (const c of stored) {
    addComm(c.name, c.center, c.boundary, c.id);
  }

  // 2. Fetch official cities for this state/province worldwide
  const rawCities = City.getCitiesOfState(cCode, isoStateCode) || [];
  for (const c of rawCities) {
    const lat = c.latitude ? parseFloat(c.latitude) : (stateObj?.center.lat || 0);
    const lng = c.longitude ? parseFloat(c.longitude) : (stateObj?.center.lng || 0);
    addComm(c.name, { lat, lng });
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  communityCache.set(cacheKey, list);
  return list;
}

/**
 * Dynamically registers a Google Places / Geocoded community in memory and persists it
 */
export function registerDynamicCommunity(
  countryCode: string,
  stateCode: string,
  name: string,
  center: LocationPoint,
  boundary?: BoundaryPolygonPoint[]
): CommunityData {
  const cCode = countryCode.toUpperCase();
  const sCode = stateCode.toUpperCase();
  const stateObj = getStateByCode(cCode, sCode);
  const isoStateCode = stateObj?.code?.toUpperCase() || sCode;
  const cacheKey = `${cCode}:${isoStateCode}`;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `comm-${Math.random().toString(36).slice(2, 7)}`;

  const newComm: CommunityData = {
    id,
    name,
    stateCode: isoStateCode,
    countryCode: cCode,
    center,
    zoom: 13.8,
    boundary: boundary && boundary.length >= 3 ? boundary : generatePerimeterPolygon(center, 3.8, 24),
  };

  const list = communityCache.get(cacheKey) || getCommunitiesForState(cCode, isoStateCode);
  const existingIdx = list.findIndex((c) => c.id === id || c.name.toLowerCase() === name.toLowerCase());
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...newComm };
  } else {
    list.unshift(newComm);
  }
  communityCache.set(cacheKey, list);
  if (cacheKey !== `${cCode}:${sCode}`) {
    communityCache.set(`${cCode}:${sCode}`, list);
  }

  // Persist to localStorage so it survives page reloads
  saveStoredDynamicCommunity(newComm);

  return newComm;
}

/**it
 * Resolves active jurisdiction perimeter (camera center, zoom, scope label, level, place names, and boundary coordinates)
 */
export function resolveActivePerimeter(settings: AdminJurisdictionSettings): ResolvedPerimeter {
  // 1. Global Mode
  if (settings.mode === 'global' || settings.countryCode === 'ALL') {
    return {
      title: 'Global Operations Network',
      scopeLabel: 'Global Scope • All Regions',
      level: 'global',
      center: { lat: 20.0, lng: 10.0 },
      zoom: 2.5,
      boundary: [],
    };
  }

  // 2. Country Lookup
  const country = getCountryByCode(settings.countryCode);
  if (!country) {
    return {
      title: 'Global Operations Network',
      scopeLabel: 'Global Scope',
      level: 'global',
      center: { lat: 20.0, lng: 10.0 },
      zoom: 2.5,
      boundary: [],
    };
  }

  // 3. Country Level Selected (All States)
  if (settings.stateCode === 'ALL') {
    const countryBoundary = generatePerimeterPolygon(country.center, 220, 32);
    return {
      title: `${country.name} Nationwide Grid`,
      scopeLabel: `${country.name} (Nationwide)`,
      level: 'country',
      center: country.center,
      zoom: country.zoom,
      boundary: countryBoundary,
      countryCode: country.code,
      countryName: country.name,
      countryFlag: country.flag,
    };
  }

  // 4. State Lookup
  const state = getStateByCode(country.code, settings.stateCode);
  if (!state) {
    const countryBoundary = generatePerimeterPolygon(country.center, 220, 32);
    return {
      title: country.name,
      scopeLabel: country.name,
      level: 'country',
      center: country.center,
      zoom: country.zoom,
      boundary: countryBoundary,
      countryCode: country.code,
      countryName: country.name,
      countryFlag: country.flag,
    };
  }

  // 5. State Level Selected (All Communities)
  if (settings.communityId === 'ALL') {
    const stateBoundary = generatePerimeterPolygon(state.center, 45, 28);
    return {
      title: `${state.name}, ${country.name}`,
      scopeLabel: `${state.name} (Metro Zone)`,
      level: 'state',
      center: state.center,
      zoom: state.zoom,
      boundary: stateBoundary,
      countryCode: country.code,
      countryName: country.name,
      countryFlag: country.flag,
      stateName: state.name,
    };
  }

  // 6. Community Lookup
  const communities = getCommunitiesForState(country.code, state.code);
  let community = communities.find(
    (c) =>
      c.id === settings.communityId ||
      c.id.toLowerCase() === settings.communityId.toLowerCase() ||
      c.name.toLowerCase() === settings.communityId.toLowerCase()
  );

  if (!community) {
    const stored = getStoredDynamicCommunities().find(
      (c) =>
        c.countryCode === country.code &&
        (c.id === settings.communityId || c.name.toLowerCase() === settings.communityId.toLowerCase())
    );
    if (stored) {
      community = stored;
    } else {
      const commName = settings.communityName || prettifySlug(settings.communityId);
      community = {
        id: settings.communityId,
        name: commName,
        stateCode: state.code,
        countryCode: country.code,
        center: state.center,
        zoom: 13.8,
        boundary: generatePerimeterPolygon(state.center, 3.8, 24),
      };
    }
  }

  // 7. Community Level Selected
  const commBoundary = (community.boundary && community.boundary.length >= 3)
    ? community.boundary
    : generatePerimeterPolygon(community.center, 3.8, 24);

  return {
    title: `${community.name} • ${state.name}`,
    scopeLabel: `${community.name} • ${state.name}`,
    level: 'community',
    center: community.center,
    zoom: community.zoom,
    boundary: commBoundary,
    countryCode: country.code,
    countryName: country.name,
    countryFlag: country.flag,
    stateName: state.name,
    communityName: community.name,
  };
}

export function extractCommunityFromAddress(addressName?: string): string | null {
  if (!addressName || !addressName.trim()) return null;
  const clean = addressName.trim();
  if (clean.toLowerCase().startsWith('my location') || clean.toLowerCase().startsWith('current area')) return null;

  // Split by commas, semicolons
  const parts = clean.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  // Common non-neighborhood exclusions
  const nonGeoExclusions = /^(nigeria|lagos|abuja|united states|uk|england|kenya|ghana|\d{3,})/i;

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (nonGeoExclusions.test(part)) continue;

    // Handle slash formats like "Idimu/Isheri Olofin"
    if (part.includes('/')) {
      const subParts = part.split('/').map((s) => s.trim()).filter(Boolean);
      const subMatch = subParts.find((sp) => !nonGeoExclusions.test(sp) && sp.length >= 3);
      if (subMatch) {
        part = subMatch;
      }
    }

    // Skip street numbers / house addresses like "10 Oluwabukunmi Cl", "15 Liberty Rd", "No 4 ..."
    if (
      /^(\d+|no\s*\d+|plot\s*\d+)/i.test(part) ||
      /\b(close|cl|street|st|road|rd|avenue|ave|crescent|cres|way|lane|ln|drive|dr|boulevard|blvd)\b/i.test(part)
    ) {
      continue;
    }

    // Clean any trailing postal code or numbers (e.g. "Isheri Olofin 102213" -> "Isheri Olofin")
    const cleanedPart = part.replace(/\s+\d{3,}.*$/, '').trim();
    if (cleanedPart.length >= 3 && !nonGeoExclusions.test(cleanedPart)) {
      return cleanedPart;
    }
  }

  // Fallback: examine all parts
  for (const part of parts) {
    const cleaned = part.replace(/\s+\d{3,}.*$/, '').trim();
    if (cleaned.length >= 3 && !nonGeoExclusions.test(cleaned) && !/^\d+/.test(cleaned)) {
      return cleaned;
    }
  }

  return null;
}

/**
 * Match any incoming session to the exact country, state, and community based on address and GPS coordinates
 */
export function findJurisdictionForSession(session: {
  countryCode?: string;
  stateCode?: string;
  communityId?: string;
  addressName?: string;
  currentLocation: LocationPoint;
}): { countryCode: string; stateCode: string; communityId: string; communityName: string } | null {
  const { lat, lng } = session.currentLocation;

  // 1. Resolve Country
  let country = session.countryCode ? getCountryByCode(session.countryCode) : null;
  if (!country && session.addressName) {
    const addrLower = session.addressName.toLowerCase();
    const countries = getAllCountries();
    country = countries.find((c) => addrLower.includes(c.name.toLowerCase()) || addrLower.includes(c.code.toLowerCase())) || null;
  }
  if (!country) {
    const countries = getAllCountries();
    let closestDist = Infinity;
    for (const c of countries) {
      const dLat = c.center.lat - lat;
      const dLng = c.center.lng - lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < closestDist) {
        closestDist = dist;
        country = c;
      }
    }
  }
  if (!country) return null;

  // 2. Resolve State
  let state = session.stateCode ? getStateByCode(country.code, session.stateCode) : null;
  if (!state && session.addressName) {
    const addrLower = session.addressName.toLowerCase();
    const states = getStatesForCountry(country.code);
    state = states.find((s) => addrLower.includes(s.name.toLowerCase()) || addrLower.includes(s.code.toLowerCase())) || null;
  }
  if (!state) {
    const states = getStatesForCountry(country.code);
    let closestDist = Infinity;
    for (const s of states) {
      const dLat = s.center.lat - lat;
      const dLng = s.center.lng - lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < closestDist) {
        closestDist = dist;
        state = s;
      }
    }
  }
  if (!state) {
    return {
      countryCode: country.code,
      stateCode: 'ALL',
      communityId: 'ALL',
      communityName: '',
    };
  }

  // 3. Resolve Community
  const extractedName = extractCommunityFromAddress(session.addressName);
  let communityName = extractedName || '';
  let commId = '';

  if (extractedName) {
    commId = extractedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    communityName = extractedName;
  } else if (session.communityId && session.communityId !== 'ALL' && !/^\d+$/.test(session.communityId)) {
    commId = session.communityId;
    communityName = prettifySlug(session.communityId);
  }

  if (communityName && commId) {
    const reg = registerDynamicCommunity(country.code, state.code, communityName, { lat, lng });

    return {
      countryCode: country.code,
      stateCode: state.code,
      communityId: reg.id,
      communityName: reg.name,
    };
  }

  // Fallback: check if close to an existing community in the state (< 3.5km)
  const existingComms = getCommunitiesForState(country.code, state.code);
  let closestComm: CommunityData | null = null;
  let closestCommDist = Infinity;
  for (const comm of existingComms) {
    const dLat = comm.center.lat - lat;
    const dLng = comm.center.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    // Within ~3.5km (approx 0.001 square degrees)
    if (dist < 0.001 && dist < closestCommDist) {
      closestCommDist = dist;
      closestComm = comm;
    }
  }

  if (closestComm) {
    return {
      countryCode: country.code,
      stateCode: state.code,
      communityId: closestComm.id,
      communityName: closestComm.name,
    };
  }

  // If no specific community was extracted or matched, register a localized area at the user's GPS
  const fallbackAreaName = 'Citizen Area';
  const dynamicComm = registerDynamicCommunity(country.code, state.code, fallbackAreaName, { lat, lng });
  return {
    countryCode: country.code,
    stateCode: state.code,
    communityId: dynamicComm.id,
    communityName: dynamicComm.name,
  };
}
