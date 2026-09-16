import { Country, State, City, type ICountry, type IState, type ICity } from 'country-state-city';
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

// Global Metropolitan Subdivisions & Districts Registry
// Provides deep municipal coverage across major global capitals and metropolitan zones
const GLOBAL_METRO_SUBDIVISIONS: Record<string, { name: string; lat: number; lng: number }[]> = {
  // Kenya - Nairobi County (30)
  'KE:30': [
    { name: 'Nairobi Central Business District (CBD)', lat: -1.2864, lng: 36.8172 },
    { name: 'Westlands (Parklands / Sarit / Mpaka)', lat: -1.2650, lng: 36.8050 },
    { name: 'Kilimani & Kileleshwa', lat: -1.2910, lng: 36.7860 },
    { name: 'Karen & Langata', lat: -1.3320, lng: 36.7120 },
    { name: 'Upper Hill Financial District', lat: -1.2980, lng: 36.8180 },
    { name: 'Gigiri & Runda Diplomatic Sector', lat: -1.2330, lng: 36.8080 },
    { name: 'Muthaiga & Parklands', lat: -1.2580, lng: 36.8320 },
    { name: 'Kibra & Woodley', lat: -1.3130, lng: 36.7870 },
    { name: 'Kasarani & Roysambu (Thika Rd)', lat: -1.2220, lng: 36.8980 },
    { name: 'Embakasi & Airport (JKIA Corridor)', lat: -1.3190, lng: 36.9120 },
    { name: 'Dagoretti (Riruta / Waithaka)', lat: -1.2990, lng: 36.7320 },
    { name: 'Makadara & Industrial Area', lat: -1.3030, lng: 36.8520 },
    { name: 'Kamukunji & Eastleigh Commercial', lat: -1.2780, lng: 36.8480 },
    { name: 'Starehe (Ngara / Pangani)', lat: -1.2720, lng: 36.8310 },
  ],
  // Kenya - Mombasa County (28)
  'KE:28': [
    { name: 'Mombasa Island (Mvita / Old Town)', lat: -4.0547, lng: 39.6636 },
    { name: 'Nyali Coastal Sector', lat: -4.0320, lng: 39.7120 },
    { name: 'Changamwe Port Corridor', lat: -4.0180, lng: 39.6320 },
    { name: 'Likoni Ferry Sector', lat: -4.0820, lng: 39.6640 },
    { name: 'Kisauni & Bamburi Beach', lat: -3.9850, lng: 39.7210 },
    { name: 'Jomvu Industrial Sector', lat: -3.9820, lng: 39.6100 },
  ],
  // United Kingdom - Greater London (LND)
  'GB:LND': [
    { name: 'City of Westminster (Victoria / Soho)', lat: 51.4975, lng: -0.1357 },
    { name: 'City of London (Square Mile / Bank)', lat: 51.5155, lng: -0.0922 },
    { name: 'Camden Town & Kings Cross', lat: 51.5390, lng: -0.1426 },
    { name: 'Canary Wharf & Isle of Dogs', lat: 51.5054, lng: -0.0235 },
    { name: 'Kensington & Chelsea', lat: 51.4990, lng: -0.1938 },
    { name: 'Southwark & London Bridge', lat: 51.5035, lng: -0.0804 },
    { name: 'Lambeth & Waterloo', lat: 51.4964, lng: -0.1147 },
    { name: 'Hackney & Shoreditch', lat: 51.5450, lng: -0.0553 },
    { name: 'Islington & Angel', lat: 51.5416, lng: -0.1022 },
    { name: 'Greenwich Maritime Sector', lat: 51.4826, lng: -0.0077 },
  ],
  // United States - New York (NY)
  'US:NY': [
    { name: 'Manhattan (Times Square / Midtown)', lat: 40.7580, lng: -73.9855 },
    { name: 'Manhattan (Financial District / Wall St)', lat: 40.7075, lng: -74.0090 },
    { name: 'Brooklyn (Downtown / DUMBO)', lat: 40.6928, lng: -73.9903 },
    { name: 'Brooklyn (Williamsburg / Bushwick)', lat: 40.7081, lng: -73.9571 },
    { name: 'Queens (Long Island City / Astoria)', lat: 40.7447, lng: -73.9485 },
    { name: 'The Bronx (South Bronx / Grand Concourse)', lat: 40.8262, lng: -73.9225 },
    { name: 'Staten Island (St George / Ferry Terminal)', lat: 40.6438, lng: -74.0736 },
  ],
  // United States - California (CA)
  'US:CA': [
    { name: 'San Francisco (Financial District / SoMa)', lat: 37.7880, lng: -122.4000 },
    { name: 'Los Angeles (Downtown / Bunker Hill)', lat: 34.0522, lng: -118.2437 },
    { name: 'Los Angeles (Hollywood / West Hollywood)', lat: 34.0928, lng: -118.3287 },
    { name: 'Los Angeles (Santa Monica & Venice)', lat: 34.0195, lng: -118.4912 },
    { name: 'Silicon Valley (San Jose / Santa Clara)', lat: 37.3382, lng: -121.8863 },
    { name: 'Silicon Valley (Palo Alto / Stanford)', lat: 37.4419, lng: -122.1430 },
    { name: 'San Diego (Downtown / Gaslamp Quarter)', lat: 32.7157, lng: -117.1611 },
  ],
  // Nigeria - Lagos State (LA)
  'NG:LA': [
    { name: 'Lekki Phase 1 / Ikate', lat: 6.4698, lng: 3.4752 },
    { name: 'Victoria Island & Oniru', lat: 6.4281, lng: 3.4219 },
    { name: 'Ikoyi & Banana Island', lat: 6.4549, lng: 3.4357 },
    { name: 'Ikeja Capital Sector', lat: 6.6018, lng: 3.3515 },
    { name: 'Yaba / Lagos Mainland', lat: 6.5180, lng: 3.3780 },
    { name: 'Surulere Central', lat: 6.4975, lng: 3.3540 },
    { name: 'Lagos Island (Marina / CMS / Isale Eko)', lat: 6.4550, lng: 3.3940 },
    { name: 'Apapa Port Corridor', lat: 6.4488, lng: 3.3590 },
    { name: 'Maryland / Mende / Anthony', lat: 6.5714, lng: 3.3688 },
    { name: 'Alimosho / Egbeda / Igando', lat: 6.6095, lng: 3.2642 },
    { name: 'Oshodi-Isolo Interchange', lat: 6.5372, lng: 3.3370 },
    { name: 'Kosofe / Ogudu / Ketu', lat: 6.5898, lng: 3.3934 },
    { name: 'Magodo / Shangisha / CMD', lat: 6.6214, lng: 3.3812 },
    { name: 'Ajah / Sangotedo / Abraham Adesanya', lat: 6.4678, lng: 3.5684 },
    { name: 'Lekki Phase 2 / Chevron / VGC', lat: 6.4452, lng: 3.5284 },
    { name: 'Festac Town / Amuwo Odofin', lat: 6.4647, lng: 3.2842 },
    { name: 'Ikorodu Metro Zone', lat: 6.6194, lng: 3.5105 },
    { name: 'Badagry Historic District', lat: 6.4253, lng: 2.8813 },
    { name: 'Epe Waterfront Hub', lat: 6.5841, lng: 3.9834 },
  ],
  // Nigeria - Abuja Federal Capital Territory (FC)
  'NG:FC': [
    { name: 'Maitama Diplomatic Sector', lat: 9.0880, lng: 7.4980 },
    { name: 'Wuse Zone 1-7 Commercial', lat: 9.0600, lng: 7.4680 },
    { name: 'Garki Area 1-11 Core', lat: 9.0320, lng: 7.4850 },
    { name: 'Asokoro Presidential District', lat: 9.0450, lng: 7.5250 },
    { name: 'Central Business District (CBD)', lat: 9.0550, lng: 7.4920 },
    { name: 'Guzape & Asokoro Extension', lat: 9.0280, lng: 7.5180 },
    { name: 'Jabi Lake & Utako District', lat: 9.0730, lng: 7.4280 },
    { name: 'Gwarinpa Estate Core', lat: 9.1120, lng: 7.4120 },
    { name: 'Mabushi & Katampe Main', lat: 9.0910, lng: 7.4580 },
    { name: 'Kubwa Satellite District', lat: 9.1550, lng: 7.3320 },
    { name: 'Lugbe Airport Corridor', lat: 8.9800, lng: 7.3750 },
    { name: 'Apo & Lokogoma Districts', lat: 8.9950, lng: 7.4720 },
  ],
  // Nigeria - Rivers State (RI) / Port Harcourt
  'NG:RI': [
    { name: 'Port Harcourt Old GRA', lat: 4.8050, lng: 7.0080 },
    { name: 'Port Harcourt New GRA & Phase 2', lat: 4.8250, lng: 6.9980 },
    { name: 'Trans-Amadi Industrial Sector', lat: 4.8150, lng: 7.0350 },
    { name: 'D-Line Commercial District', lat: 4.8080, lng: 7.0010 },
    { name: 'Rumuokoro & Obio-Akpor Core', lat: 4.8650, lng: 6.9850 },
    { name: 'Peter Odili / Trans-Amadi Waterfront', lat: 4.8020, lng: 7.0480 },
    { name: 'Woji & Eliozu Districts', lat: 4.8320, lng: 7.0510 },
    { name: 'Ada George / Wimpey Corridor', lat: 4.8390, lng: 6.9620 },
    { name: 'Choba & UNIPORT Academic Hub', lat: 4.8960, lng: 6.9120 },
    { name: 'Bonny Island Oil & Gas Terminal', lat: 4.4510, lng: 7.1680 },
  ],
  // Nigeria - Oyo State (OY) / Ibadan
  'NG:OY': [
    { name: 'Bodija & Secretariat Core', lat: 7.4320, lng: 3.9050 },
    { name: 'Dugbe Commercial Central', lat: 7.3910, lng: 3.8790 },
    { name: 'Ring Road & Challenge Hub', lat: 7.3620, lng: 3.8680 },
    { name: 'Oluyole Industrial & Residential', lat: 7.3510, lng: 3.8550 },
    { name: 'Agodi GRA & Government House', lat: 7.4120, lng: 3.9180 },
    { name: 'Jericho & Eleyele Sector', lat: 7.4080, lng: 3.8620 },
    { name: 'UI & Samonda Tech Hub', lat: 7.4480, lng: 3.9010 },
    { name: 'Iwo Road Transit Interchange', lat: 7.4050, lng: 3.9420 },
    { name: 'Akobo & Ojoo North Corridor', lat: 7.4520, lng: 3.9280 },
  ],
  // Nigeria - Kano State (KN)
  'NG:KN': [
    { name: 'Kano Municipal & Emir Palace', lat: 11.9960, lng: 8.5270 },
    { name: 'Nassarawa GRA & Govt Sector', lat: 12.0120, lng: 8.5450 },
    { name: 'Sabon Gari Commercial Zone', lat: 12.0210, lng: 8.5310 },
    { name: 'Fagge & Bompai Industrial', lat: 12.0320, lng: 8.5520 },
    { name: 'Tarauni & Farm Centre Hub', lat: 11.9780, lng: 8.5410 },
    { name: 'Dala & Gwale Historic Hills', lat: 12.0080, lng: 8.5020 },
  ],
  // Nigeria - Kaduna State (KD)
  'NG:KD': [
    { name: 'Kaduna Central / Ahmadu Bello Way', lat: 10.5180, lng: 7.4380 },
    { name: 'Barnawa & Narayi Commercial', lat: 10.4850, lng: 7.4420 },
    { name: 'Malali & Ungwan Rimi GRA', lat: 10.5480, lng: 7.4650 },
    { name: 'Kakuri Industrial Corridor', lat: 10.4680, lng: 7.4180 },
    { name: 'Tudun Wada & Rigasa Sector', lat: 10.5250, lng: 7.4050 },
  ],
  // Nigeria - Edo State (ED) / Benin City
  'NG:ED': [
    { name: 'Ring Road / Oba Market Core', lat: 6.3380, lng: 5.6250 },
    { name: 'GRA Benin & Airport Road', lat: 6.3120, lng: 5.6180 },
    { name: 'Ugbowo & UNIBEN Corridor', lat: 6.3980, lng: 5.6120 },
    { name: 'Ikpoba Hill & Okha Sector', lat: 6.3450, lng: 5.6580 },
  ],
  // Nigeria - Delta State (DE)
  'NG:DE': [
    { name: 'Asaba Capital Core & Govt House', lat: 6.1980, lng: 6.7320 },
    { name: 'GRA Asaba & Okpanam Corridor', lat: 6.2180, lng: 6.7050 },
    { name: 'Warri Central Commercial Hub', lat: 5.5180, lng: 5.7510 },
    { name: 'Effurun & PTI Energy Corridor', lat: 5.5560, lng: 5.7820 },
    { name: 'Sapele Waterfront Port Sector', lat: 5.8920, lng: 5.6810 },
    { name: 'Ughelli Urban Center', lat: 5.4950, lng: 6.0020 },
  ],
  // Nigeria - Anambra State (AN)
  'NG:AN': [
    { name: 'Awka Capital Core & Aroma Hub', lat: 6.2130, lng: 7.0720 },
    { name: 'Onitsha Commercial & Main Market', lat: 6.1520, lng: 6.7860 },
    { name: 'GRA Onitsha & 3-3 Inland', lat: 6.1750, lng: 6.7980 },
    { name: 'Nnewi Industrial & Automotive Hub', lat: 6.0180, lng: 6.9150 },
  ],
  // Nigeria - Enugu State (EN)
  'NG:EN': [
    { name: 'Independence Layout & Govt House', lat: 6.4380, lng: 7.5180 },
    { name: 'New Haven & Ogui Commercial', lat: 6.4490, lng: 7.5050 },
    { name: 'GRA Enugu & Polo Park Sector', lat: 6.4580, lng: 7.4920 },
    { name: 'Abakpa Nike & Trans-Ekulu Hub', lat: 6.4780, lng: 7.5250 },
  ],
  // Nigeria - Ogun State (OG)
  'NG:OG': [
    { name: 'Abeokuta Central & Ibara GRA', lat: 7.1550, lng: 3.3480 },
    { name: 'Sagamu Interchange & Industrial', lat: 6.8420, lng: 3.6480 },
    { name: 'Ota / Canaanland Industrial Hub', lat: 6.6910, lng: 3.2380 },
    { name: 'Magboro & Arepo Expressway Corridor', lat: 6.6780, lng: 3.4120 },
    { name: 'Ijebu Ode Central Hub', lat: 6.8210, lng: 3.9180 },
  ],
  // Nigeria - Akwa Ibom State (AK)
  'NG:AK': [
    { name: 'Uyo Capital Core & Wellington Bassey', lat: 5.0380, lng: 7.9250 },
    { name: 'Ewet Housing Estate & Shelter Afrique', lat: 5.0210, lng: 7.9480 },
    { name: 'Eket Oil & Gas Corridor', lat: 4.6420, lng: 7.9280 },
    { name: 'Ikot Ekpene Commercial Zone', lat: 5.1820, lng: 7.7120 },
  ],
  // Nigeria - Imo State (IM)
  'NG:IM': [
    { name: 'Owerri Urban Core & Douglas Road', lat: 5.4850, lng: 7.0350 },
    { name: 'New Owerri & Concorde Boulevard', lat: 5.4680, lng: 7.0180 },
    { name: 'Aladinma & Ikenegbu Commercial', lat: 5.4950, lng: 7.0480 },
  ],
  // South Africa - Gauteng (GP)
  'ZA:GP': [
    { name: 'Johannesburg CBD & Marshalltown', lat: -26.2041, lng: 28.0473 },
    { name: 'Sandton Financial District & City', lat: -26.1076, lng: 28.0567 },
    { name: 'Rosebank & Parktown', lat: -26.1450, lng: 28.0410 },
    { name: 'Pretoria Central (Tshwane / Union Buildings)', lat: -25.7479, lng: 28.2293 },
    { name: 'Soweto (Vilakazi / Orlando / Diepkloof)', lat: -26.2678, lng: 27.8585 },
    { name: 'Centurion Business Hub', lat: -25.8603, lng: 28.1895 },
  ],
  // Ghana - Greater Accra (AA)
  'GH:AA': [
    { name: 'Accra Central (Osu / Oxford Street)', lat: 5.5560, lng: -0.1969 },
    { name: 'Airport Residential & East Legon', lat: 5.6037, lng: -0.1870 },
    { name: 'Cantonments Diplomatic Sector', lat: 5.5780, lng: -0.1740 },
    { name: 'Tema Port City & Industrial Zone', lat: 5.6698, lng: -0.0166 },
    { name: 'Labone & Ridge', lat: 5.5680, lng: -0.1790 },
  ],
  // France - Île-de-France (IDF)
  'FR:IDF': [
    { name: 'Paris Central (1er-4e Arrondissements)', lat: 48.8566, lng: 2.3522 },
    { name: 'Paris Champs-Élysées (8e Arrondissement)', lat: 48.8698, lng: 2.3075 },
    { name: 'Paris Le Marais & Bastille (3e-11e)', lat: 48.8570, lng: 2.3650 },
    { name: 'Paris Montmartre (18e Arrondissement)', lat: 48.8867, lng: 2.3431 },
    { name: 'La Défense Business District', lat: 48.8924, lng: 2.2370 },
  ],
};

// Known corrections for external library data anomalies (e.g. Delta State, Nigeria coordinates in country-state-city)
const STATE_CENTER_OVERRIDES: Record<string, { lat: number; lng: number }> = {
  'NG:DE': { lat: 5.7040, lng: 5.9339 }, // Delta State, Nigeria (correcting Mississippi USA coordinates)
};

// In-memory caches for maximum responsiveness (sub-millisecond lookups)
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
  const key = `${s.countryCode.toUpperCase()}:${s.isoCode.toUpperCase()}`;
  const override = STATE_CENTER_OVERRIDES[key];
  const lat = override ? override.lat : (s.latitude ? parseFloat(s.latitude) || 0 : 0);
  const lng = override ? override.lng : (s.longitude ? parseFloat(s.longitude) || 0 : 0);

  return {
    code: s.isoCode,
    name: s.name,
    countryCode: s.countryCode,
    center: { lat, lng },
    zoom: 9.0,
  };
}

// Convert country-state-city ICity to CommunityData
function mapCity(c: ICity): CommunityData {
  const lat = c.latitude ? parseFloat(c.latitude) || 0 : 0;
  const lng = c.longitude ? parseFloat(c.longitude) || 0 : 0;
  const id = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `city-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    name: c.name,
    stateCode: c.stateCode,
    countryCode: c.countryCode,
    center: { lat, lng },
    zoom: 13.5,
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

/**
 * Get all communities / cities for any state in the world
 */
export function getCommunitiesForState(countryCode: string, stateCode: string): CommunityData[] {
  if (!countryCode || !stateCode || countryCode === 'ALL' || stateCode === 'ALL') return [];

  const cCode = countryCode.toUpperCase();
  const sCode = stateCode.toUpperCase();
  const cacheKey = `${cCode}:${sCode}`;

  if (communityCache.has(cacheKey)) {
    return communityCache.get(cacheKey)!;
  }

  // Find exact state code from input (in case stateCode was a name like 'Nairobi' instead of '30')
  const matchedState = getStateByCode(cCode, sCode);
  const effectiveStateCode = matchedState ? matchedState.code.toUpperCase() : sCode;
  const effectiveKey = `${cCode}:${effectiveStateCode}`;

  const communities: CommunityData[] = [];
  const seenNames = new Set<string>();

  // 1. Check if metropolitan district subdivisions are registered
  const metroDistricts = GLOBAL_METRO_SUBDIVISIONS[effectiveKey] || GLOBAL_METRO_SUBDIVISIONS[`${cCode}:${sCode}`];
  if (metroDistricts && metroDistricts.length > 0) {
    for (const dist of metroDistricts) {
      const id = dist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      seenNames.add(dist.name.toLowerCase().trim());
      communities.push({
        id,
        name: dist.name,
        stateCode: effectiveStateCode,
        countryCode: cCode,
        center: { lat: dist.lat, lng: dist.lng },
        zoom: 13.8,
        boundary: generatePerimeterPolygon({ lat: dist.lat, lng: dist.lng }, 3.8, 24),
      });
    }
  }

  // 2. Fetch all standard GeoNames cities for that state
  const rawCities = City.getCitiesOfState(cCode, effectiveStateCode) || [];
  for (const raw of rawCities) {
    const key = raw.name.toLowerCase().trim();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      const mapped = mapCity(raw);
      mapped.boundary = generatePerimeterPolygon(mapped.center, 3.8, 24);
      communities.push(mapped);
    }
  }

  // 3. Fallback: if no cities exist in dataset for this state, synthesize regional administrative sectors
  if (communities.length === 0 && matchedState) {
    const center = matchedState.center;
    const offsets = [
      { name: `${matchedState.name} Central Core`, dLat: 0, dLng: 0 },
      { name: `${matchedState.name} North Sector`, dLat: 0.10, dLng: 0 },
      { name: `${matchedState.name} South Sector`, dLat: -0.10, dLng: 0 },
      { name: `${matchedState.name} East Sector`, dLat: 0, dLng: 0.10 },
      { name: `${matchedState.name} West Sector`, dLat: 0, dLng: -0.10 },
    ];

    for (const off of offsets) {
      const pt = { lat: center.lat + off.dLat, lng: center.lng + off.dLng };
      const id = off.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      communities.push({
        id,
        name: off.name,
        stateCode: effectiveStateCode,
        countryCode: cCode,
        center: pt,
        zoom: 13.0,
        boundary: generatePerimeterPolygon(pt, 4.0, 24),
      });
    }
  }

  // Sort alphabetically for clean UI dropdown navigation
  communities.sort((a, b) => a.name.localeCompare(b.name));

  communityCache.set(cacheKey, communities);
  return communities;
}

/**
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
  const community = communities.find(
    (c) =>
      c.id === settings.communityId ||
      c.id.toLowerCase() === settings.communityId.toLowerCase() ||
      c.name.toLowerCase() === settings.communityId.toLowerCase()
  );

  if (!community) {
    const stateBoundary = generatePerimeterPolygon(state.center, 45, 28);
    return {
      title: `${state.name}, ${country.name}`,
      scopeLabel: state.name,
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

/**
 * Match any incoming session to the closest country, state, and community in the world dataset
 */
export function findJurisdictionForSession(session: {
  countryCode?: string;
  stateCode?: string;
  communityId?: string;
  currentLocation: LocationPoint;
}): { countryCode: string; stateCode: string; communityId: string } | null {
  const { lat, lng } = session.currentLocation;

  // 1. Direct match if session already specifies valid jurisdiction codes
  if (session.countryCode) {
    const country = getCountryByCode(session.countryCode);
    if (country) {
      if (session.stateCode) {
        const state = getStateByCode(country.code, session.stateCode);
        if (state) {
          const communities = getCommunitiesForState(country.code, state.code);
          if (session.communityId) {
            const rawId = session.communityId.toLowerCase().replace(/[^a-z0-9]/g, '');
            const comm = communities.find((c) => {
              const cId = c.id.toLowerCase().replace(/[^a-z0-9]/g, '');
              const cName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              return cId === rawId || cId.includes(rawId) || rawId.includes(cId) || cName.includes(rawId) || rawId.includes(cName);
            });
            if (comm) {
              return {
                countryCode: country.code,
                stateCode: state.code,
                communityId: comm.id,
              };
            }
          }

          // If communityId did not match directly, find closest community in this state by GPS coordinates
          if (communities.length > 0) {
            let closestComm: CommunityData | null = null;
            let closestCommDist = Infinity;
            for (const comm of communities) {
              const dLat = comm.center.lat - lat;
              const dLng = comm.center.lng - lng;
              const dist = dLat * dLat + dLng * dLng;
              if (dist < closestCommDist) {
                closestCommDist = dist;
                closestComm = comm;
              }
            }
            if (closestComm) {
              return {
                countryCode: country.code,
                stateCode: state.code,
                communityId: closestComm.id,
              };
            }
          }

          return {
            countryCode: country.code,
            stateCode: state.code,
            communityId: 'ALL',
          };
        }
      }
      return {
        countryCode: country.code,
        stateCode: 'ALL',
        communityId: 'ALL',
      };
    }
  }

  // 2. Proximity GPS match to closest country & state
  const countries = getAllCountries();
  let closestCountry: CountryData | null = null;
  let closestDist = Infinity;

  for (const c of countries) {
    const dLat = c.center.lat - lat;
    const dLng = c.center.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < closestDist) {
      closestDist = dist;
      closestCountry = c;
    }
  }

  if (closestCountry) {
    const states = getStatesForCountry(closestCountry.code);
    let closestState: StateData | null = null;
    let closestStateDist = Infinity;

    for (const s of states) {
      const dLat = s.center.lat - lat;
      const dLng = s.center.lng - lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < closestStateDist) {
        closestStateDist = dist;
        closestState = s;
      }
    }

    if (closestState) {
      const communities = getCommunitiesForState(closestCountry.code, closestState.code);
      let closestComm: CommunityData | null = null;
      let closestCommDist = Infinity;

      for (const comm of communities) {
        const dLat = comm.center.lat - lat;
        const dLng = comm.center.lng - lng;
        const dist = dLat * dLat + dLng * dLng;
        if (dist < closestCommDist) {
          closestCommDist = dist;
          closestComm = comm;
        }
      }

      return {
        countryCode: closestCountry.code,
        stateCode: closestState.code,
        communityId: closestComm ? closestComm.id : 'ALL',
      };
    }

    return {
      countryCode: closestCountry.code,
      stateCode: 'ALL',
      communityId: 'ALL',
    };
  }

  return null;
}
