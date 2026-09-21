import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, 
  Battery, 
  Clock, 
  MapPin, 
  CheckCircle, 
  Footprints, 
  Globe, 
  Crosshair, 
  Compass, 
  Plus, 
  Minus, 
  PhoneCall,
  Copy,
  ChevronLeft,
  ChevronRight,
  Users,
  User,
} from 'lucide-react';
import type { SafetySession, IncidentReport } from '../types';
import { useData } from '../context/DataContext';
import { Select, notification } from 'antd';
import { TbDeviceLandlinePhone } from 'react-icons/tb';
import { CountryFlag } from './CountryFlag';
import { 
  getAllCountries, 
  getCountryByCode, 
  getStatesForCountry, 
  getStateByCode, 
  getCommunitiesForState, 
  registerDynamicCommunity, 
  prettifySlug, 
  findJurisdictionForSession, 
  type CommunityData 
} from '../services/jurisdictionData';
import { 
  buildJurisdictionQuery, 
  fetchRealBoundaryGeoJson, 
  geoJsonToPolygonPaths 
} from '../services/boundaryService';
import { searchOsmPlaces } from '../services/osmLocationService';

// ============================================================================
// TOP-LEVEL MAP ENGINE TOGGLE
// Set to 'osm' for OpenStreetMap (zero API keys required)
// Set to 'googlemaps' for Google Maps JavaScript API
// ============================================================================
export type MapEngineMode = 'osm' | 'googlemaps';
export const ACTIVE_MAP_ENGINE: MapEngineMode = 'osm';

// Custom Minimalist Light Silver / Pastel Google Maps Style
const LIGHT_SILVER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F7F8FA' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#758A99' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#E2E8F0' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#CBD5E1' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#F2F4F7' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#ECEFF3' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E2E8F0' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#E0F2FE' }],
  },
];

interface LiveRadarMapProps {
  sessions: SafetySession[];
  reports: IncidentReport[];
  googleMapsApiKey?: string;
  engine?: MapEngineMode;
  onInitiateAgoraCall: (session: SafetySession) => void;
  onResolveSession: (sessionId: string) => void;
}

export const LiveRadarMap: React.FC<LiveRadarMapProps> = ({
  googleMapsApiKey,
  engine = ACTIVE_MAP_ENGINE,
  onInitiateAgoraCall,
  onResolveSession: _onResolveSession,
}) => {
  const navigate = useNavigate();
  const { 
    filteredSessions, 
    reports,
    jurisdictionSettings, 
    updateJurisdictionSettings, 
    activePerimeter,
    globalSearch
  } = useData();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  // Collapsible panels state
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  // Filter state for the dispatch queue
  const [queueFilter, setQueueFilter] = useState<'all' | 'emergency' | 'distress' | 'active'>('all');
  
  // Currently inspected session ID
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Derive inspected session reactively so changes to status (e.g. emergency) update live
  const selectedSession = useMemo(() => {
    if (selectedSessionId) {
      const match = filteredSessions.find((s) => s.id === selectedSessionId);
      if (match) return match;
    }
    return filteredSessions.find((s) => s.status === 'emergency') || filteredSessions[0] || null;
  }, [selectedSessionId, filteredSessions]);

  const matchingReport = useMemo(() => {
    if (!selectedSession || selectedSession.status !== 'emergency') return null;
    return (
      reports.find(
        (r) =>
          (r.reportedBy && (r.reportedBy === selectedSession.userId || r.reportedBy === selectedSession.id)) ||
          (r.reporterName && selectedSession.userName && r.reporterName.toLowerCase() === selectedSession.userName.toLowerCase()) ||
          (r.source === 'safety_mode_emergency' && selectedSession.userName && r.title.includes(selectedSession.userName))
      ) || null
    );
  }, [selectedSession, reports]);

  const [isMapReady, setIsMapReady] = useState(false);

  // --------------------------------------------------------------------------
  // GOOGLE MAPS ENGINE REFS
  // --------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleMapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chipClassRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeHandlesRef = useRef<Map<string, { marker: any; overlay: any; update: (s: SafetySession, sel: boolean) => void; destroy: () => void }>>(new Map());
  const cameraAnimRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleBoundaryLayersRef = useRef<any[]>([]);

  // --------------------------------------------------------------------------
  // OPENSTREETMAP LEAFLET ENGINE REFS
  // --------------------------------------------------------------------------
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const leafletBoundaryLayersRef = useRef<L.Layer[]>([]);

  // Memoized derived values (filters by global header search)
  const displayedQueue = useMemo(() => filteredSessions.filter((s) => {
    if (queueFilter === 'emergency' && s.status !== 'emergency') return false;
    if (queueFilter === 'distress' && s.status !== 'distress_pending') return false;
    if (queueFilter === 'active' && s.status !== 'active') return false;
    if (globalSearch && globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return (
        s.userName.toLowerCase().includes(q) ||
        s.userPhone.includes(q) ||
        (s.addressName && s.addressName.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q)
      );
    }
    return true;
  }), [filteredSessions, queueFilter, globalSearch]);

  const emergencyCount = useMemo(
    () => filteredSessions.filter((s) => s.status === 'emergency').length,
    [filteredSessions]
  );

  // Memoized cascaded dropdown options
  const countries = useMemo(() => getAllCountries(), []);
  const states = useMemo(
    () => jurisdictionSettings.countryCode !== 'ALL'
      ? getStatesForCountry(jurisdictionSettings.countryCode)
      : [],
    [jurisdictionSettings.countryCode]
  );

  const autocompleteServiceRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [communitySearchQuery, setCommunitySearchQuery] = useState('');
  const [dynamicCommunities, setDynamicCommunities] = useState<CommunityData[]>([]);
  const [placeSearchResults, setPlaceSearchResults] = useState<Array<{ id: string; name: string; fullName: string; lat?: number; lng?: number; placeId?: string }>>([]);

  useEffect(() => {
    if (jurisdictionSettings.countryCode !== 'ALL' && jurisdictionSettings.stateCode !== 'ALL') {
      const cached = getCommunitiesForState(jurisdictionSettings.countryCode, jurisdictionSettings.stateCode);
      setDynamicCommunities(cached);
    } else {
      setDynamicCommunities([]);
    }
  }, [jurisdictionSettings.countryCode, jurisdictionSettings.stateCode, jurisdictionSettings.communityId]);

  // LIVE COMMUNITY SEARCH (OPENSTREETMAP NOMINATIM OR GOOGLE PLACES)
  const handleCommunitySearch = useCallback((text: string) => {
    setCommunitySearchQuery(text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!text || text.trim().length < 2) {
      setPlaceSearchResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    const cleanInput = text.trim();
    setIsSearchingPlaces(true);

    searchTimeoutRef.current = setTimeout(async () => {
      const stateObj = getStateByCode(jurisdictionSettings.countryCode, jurisdictionSettings.stateCode);

      if (engine === 'osm') {
        // OpenStreetMap Nominatim Search with Dynamic Regional Viewbox & Distance Sorting
        const results = await searchOsmPlaces(
          cleanInput,
          jurisdictionSettings.countryCode,
          stateObj?.name,
          activePerimeter?.center
        );
        setIsSearchingPlaces(false);
        setPlaceSearchResults(results);
      } else {
        // Original Google Places Autocomplete Search
        const googleObj = (window as any).google;
        if (!autocompleteServiceRef.current && googleObj?.maps?.places?.AutocompleteService) {
          autocompleteServiceRef.current = new googleObj.maps.places.AutocompleteService();
        }
        if (!geocoderRef.current && googleObj?.maps?.Geocoder) {
          geocoderRef.current = new googleObj.maps.Geocoder();
        }

        const countryObj = getCountryByCode(jurisdictionSettings.countryCode);

        if (autocompleteServiceRef.current) {
          const req: any = { input: cleanInput };
          if (jurisdictionSettings.countryCode && jurisdictionSettings.countryCode !== 'ALL') {
            req.componentRestrictions = { country: jurisdictionSettings.countryCode.toLowerCase() };
          }

          autocompleteServiceRef.current.getPlacePredictions(req, (predictions: any[] | null, status: any) => {
            setIsSearchingPlaces(false);
            if (status === 'OK' && predictions && predictions.length > 0) {
              const seen = new Set<string>();
              const list: Array<{ id: string; name: string; fullName: string; placeId: string }> = [];
              for (const p of predictions) {
                const shortName = p.structured_formatting?.main_text || p.description.split(',')[0].trim();
                const norm = shortName.toLowerCase().trim();
                if (!seen.has(norm)) {
                  seen.add(norm);
                  list.push({
                    id: `gplace-${p.place_id}`,
                    name: shortName,
                    fullName: p.description,
                    placeId: p.place_id,
                  });
                }
              }
              setPlaceSearchResults(list);
            } else if (geocoderRef.current) {
              const geoQuery = stateObj ? `${cleanInput}, ${stateObj.name}, ${countryObj?.name || ''}` : cleanInput;
              geocoderRef.current.geocode(
                {
                  address: geoQuery,
                  componentRestrictions: jurisdictionSettings.countryCode !== 'ALL' ? { country: jurisdictionSettings.countryCode.toLowerCase() } : undefined,
                },
                (results: any[], gStatus: any) => {
                  if (gStatus === 'OK' && results && results.length > 0) {
                    const seen = new Set<string>();
                    const fallbackList: Array<{ id: string; name: string; fullName: string; placeId: string }> = [];
                    for (const r of results) {
                      const shortName = r.address_components?.[0]?.long_name || r.formatted_address.split(',')[0].trim();
                      const norm = shortName.toLowerCase().trim();
                      if (!seen.has(norm)) {
                        seen.add(norm);
                        fallbackList.push({
                          id: `gplace-${r.place_id}`,
                          name: shortName,
                          fullName: r.formatted_address,
                          placeId: r.place_id,
                        });
                      }
                    }
                    setPlaceSearchResults(fallbackList);
                  } else {
                    setPlaceSearchResults([]);
                  }
                }
              );
            } else {
              setPlaceSearchResults([]);
            }
          });
        } else {
          setIsSearchingPlaces(false);
          setPlaceSearchResults([]);
        }
      }
    }, 200);
  }, [engine, jurisdictionSettings.countryCode, jurisdictionSettings.stateCode, activePerimeter?.center]);

  const handleCommunitySelect = useCallback((val: string) => {
    const activeResults = [...placeSearchResults];
    setCommunitySearchQuery('');
    setPlaceSearchResults([]);

    if (val === 'ALL') {
      updateJurisdictionSettings({ communityId: 'ALL', communityName: 'All Communities' });
      return;
    }

    const stateObj = getStateByCode(jurisdictionSettings.countryCode, jurisdictionSettings.stateCode);
    const countryObj = getCountryByCode(jurisdictionSettings.countryCode);
    const fallbackCenter = stateObj?.center || countryObj?.center || { lat: 0, lng: 0 };

    if (val.startsWith('custom-')) {
      const cleanName = communitySearchQuery.trim() || prettifySlug(val.replace('custom-', ''));
      const reg = registerDynamicCommunity(
        jurisdictionSettings.countryCode,
        jurisdictionSettings.stateCode,
        cleanName,
        activePerimeter?.center || fallbackCenter
      );
      setDynamicCommunities((prev) => {
        if (prev.some((c) => c.id === reg.id)) return prev;
        return [...prev, reg].sort((a, b) => a.name.localeCompare(b.name));
      });
      updateJurisdictionSettings({ communityId: reg.id, communityName: reg.name });
      return;
    }

    const placeMatch = activeResults.find((p) => p.id === val);

    // OSM direct coordinates
    if (placeMatch && placeMatch.lat !== undefined && placeMatch.lng !== undefined) {
      const reg = registerDynamicCommunity(
        jurisdictionSettings.countryCode,
        jurisdictionSettings.stateCode,
        placeMatch.name,
        { lat: placeMatch.lat, lng: placeMatch.lng }
      );
      setDynamicCommunities((prev) => {
        if (prev.some((c) => c.id === reg.id)) return prev;
        return [...prev, reg].sort((a, b) => a.name.localeCompare(b.name));
      });
      updateJurisdictionSettings({ communityId: reg.id, communityName: reg.name });
      return;
    }

    // Google Geocoder lookup
    const googleObj = (window as any).google;
    if (!geocoderRef.current && googleObj?.maps?.Geocoder) {
      geocoderRef.current = new googleObj.maps.Geocoder();
    }

    if (placeMatch && placeMatch.placeId && geocoderRef.current) {
      geocoderRef.current.geocode({ placeId: placeMatch.placeId }, (results: any[], status: any) => {
        if (status === 'OK' && results && results.length > 0) {
          const loc = results[0].geometry?.location;
          if (loc) {
            const pt = { lat: loc.lat(), lng: loc.lng() };
            const reg = registerDynamicCommunity(
              jurisdictionSettings.countryCode,
              jurisdictionSettings.stateCode,
              placeMatch.name,
              pt
            );
            setDynamicCommunities((prev) => {
              if (prev.some((c) => c.id === reg.id)) return prev;
              return [...prev, reg].sort((a, b) => a.name.localeCompare(b.name));
            });
            updateJurisdictionSettings({ communityId: reg.id, communityName: reg.name });
          }
        }
      });
      return;
    }

    const found = dynamicCommunities.find((c) => c.id === val);
    const commName = found?.name || prettifySlug(val);
    updateJurisdictionSettings({ communityId: val, communityName: commName });
  }, [placeSearchResults, communitySearchQuery, dynamicCommunities, jurisdictionSettings.countryCode, jurisdictionSettings.stateCode, updateJurisdictionSettings, activePerimeter]);

  const countryOptions = useMemo(() => [
    {
      value: 'ALL',
      searchValue: 'All Countries Global Worldwide',
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CountryFlag code="ALL" size={13} />
          <span>All Countries</span>
        </div>
      ),
    },
    ...countries.map((c) => ({
      value: c.code,
      searchValue: `${c.name} ${c.code}`,
      label: (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <CountryFlag code={c.code} size={13} />
          <span>{c.name}</span>
        </div>
      ),
    })),
  ], [countries]);

  const stateOptions = useMemo(() => [
    { value: 'ALL', searchValue: 'All States Provinces', label: 'All States / Provinces' },
    ...states.map((s) => ({
      value: s.code,
      searchValue: `${s.name} ${s.code}`,
      label: s.name,
    })),
  ], [states]);

  const communityOptions = useMemo(() => {
    const isTyping = communitySearchQuery.trim().length > 0;
    const query = communitySearchQuery.trim().toLowerCase();

    const opts: Array<{ value: string; searchValue: string; label: React.ReactNode }> = [];

    if (!isTyping) {
      opts.push({ 
        value: 'ALL', 
        searchValue: 'All Communities Cities', 
        label: 'All Communities / Cities' 
      });
    }

    const seenNames = new Set<string>();

    for (const cm of dynamicCommunities) {
      const norm = cm.name.toLowerCase().trim();
      if (isTyping && !norm.includes(query)) {
        continue;
      }

      if (!seenNames.has(norm)) {
        seenNames.add(norm);
        opts.push({
          value: cm.id,
          searchValue: cm.name,
          label: (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{cm.name}</span>
            </div>
          ),
        });
      }
    }

    for (const p of placeSearchResults) {
      const norm = p.name.toLowerCase().trim();
      if (!seenNames.has(norm)) {
        seenNames.add(norm);
        const subAddress = p.fullName.split(',').slice(1, 3).join(',').trim();
        opts.push({
          value: p.id,
          searchValue: `${p.name} ${p.fullName}`,
          label: (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '260px', overflow: 'hidden' }}>
              <MapPin size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              {subAddress && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-sub)', opacity: 0.7, marginLeft: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ({subAddress})
                </span>
              )}
            </div>
          ),
        });
      }
    }

    if (jurisdictionSettings.communityId && jurisdictionSettings.communityId !== 'ALL') {
      const isAlreadyInOpts = opts.some((o) => o.value === jurisdictionSettings.communityId);
      if (!isAlreadyInOpts) {
        const found = dynamicCommunities.find((c) => c.id === jurisdictionSettings.communityId);
        const displayName = found?.name || jurisdictionSettings.communityName || prettifySlug(jurisdictionSettings.communityId);
        opts.unshift({
          value: jurisdictionSettings.communityId,
          searchValue: displayName,
          label: (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{displayName}</span>
            </div>
          ),
        });
      }
    }

    if (isTyping && query.length >= 1) {
      const hasMatch = opts.some((o) => o.searchValue.toLowerCase().includes(query));
      if (!hasMatch) {
        opts.push({
          value: `custom-${query.replace(/[^a-z0-9]+/g, '-')}`,
          searchValue: query,
          label: (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 700 }}>Select "{communitySearchQuery.trim()}"</span>
            </div>
          ),
        });
      }
    }

    return opts;
  }, [dynamicCommunities, placeSearchResults, communitySearchQuery, jurisdictionSettings.communityId]);

  // Trigger resize recalculation
  useEffect(() => {
    const triggerResize = () => {
      if (engine === 'osm' && leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      } else if (engine === 'googlemaps' && googleMapInstanceRef.current) {
        const googleObj = (window as any).google;
        if (googleObj?.maps?.event) {
          googleObj.maps.event.trigger(googleMapInstanceRef.current, 'resize');
        }
      }
    };

    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { triggerResize(); rafId = null; });
    };

    triggerResize();
    const t = setTimeout(triggerResize, 220);

    let observer: ResizeObserver | null = null;
    if (mapContainerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(t);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
    };
  }, [engine, isQueueCollapsed, isInspectorCollapsed, isMapReady]);

  // --------------------------------------------------------------------------
  // CONTINUOUS 60FPS CINEMATIC CAMERA FLIGHT ENGINE
  // --------------------------------------------------------------------------
  const smoothFlyTo = useCallback((targetCenter: { lat: number; lng: number }, targetZoom: number) => {
    if (engine === 'osm') {
      if (leafletMapRef.current) {
        leafletMapRef.current.flyTo([targetCenter.lat, targetCenter.lng], targetZoom, {
          duration: 0.8,
          easeLinearity: 0.25,
        });
      }
      return;
    }

    // Google Maps Continuous Flight Engine
    if (!googleMapInstanceRef.current) return;
    const map = googleMapInstanceRef.current;

    if (cameraAnimRef.current) {
      cancelAnimationFrame(cameraAnimRef.current);
      cameraAnimRef.current = null;
    }

    const startCenter = map.getCenter();
    if (!startCenter) {
      map.setCenter(targetCenter);
      map.setZoom(targetZoom);
      return;
    }

    const startLat = startCenter.lat();
    const startLng = startCenter.lng();
    const startZoom = map.getZoom() || targetZoom;

    const dLat = targetCenter.lat - startLat;
    const dLng = targetCenter.lng - startLng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);

    if (dist < 0.0001 && Math.abs(startZoom - targetZoom) === 0) return;

    const duration = Math.min(1000, Math.max(600, dist * 140 + 520));
    const startTime = performance.now();

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeInOutCubic(progress);

      const curLat = startLat + dLat * ease;
      const curLng = startLng + dLng * ease;
      map.setCenter({ lat: curLat, lng: curLng });

      if (startZoom !== targetZoom) {
        let curZoomVal = startZoom + (targetZoom - startZoom) * ease;
        if (dist > 1.2 && progress > 0.15 && progress < 0.85) {
          const altitudeLift = Math.sin(progress * Math.PI) * Math.min(2.5, dist * 0.35);
          curZoomVal = Math.max(2.5, curZoomVal - altitudeLift);
        }
        map.setZoom(curZoomVal);
      }

      if (progress < 1) {
        cameraAnimRef.current = requestAnimationFrame(frame);
      } else {
        map.setCenter(targetCenter);
        map.setZoom(targetZoom);
        cameraAnimRef.current = null;
      }
    };

    cameraAnimRef.current = requestAnimationFrame(frame);
  }, [engine]);

  const handleSelectSession = useCallback((sess: SafetySession) => {
    setSelectedSessionId(sess.id);
    setIsInspectorCollapsed(false);

    const targetJur = findJurisdictionForSession(sess);
    if (targetJur) {
      updateJurisdictionSettings({
        mode: 'community',
        countryCode: targetJur.countryCode,
        stateCode: targetJur.stateCode,
        communityId: targetJur.communityId,
        communityName: targetJur.communityName,
      });
    }

    smoothFlyTo({ lat: sess.currentLocation.lat, lng: sess.currentLocation.lng }, 15.5);
  }, [updateJurisdictionSettings, smoothFlyTo]);

  // Smooth camera flight on jurisdiction switch
  useEffect(() => {
    if (!isMapReady) return;
    const targetCenter = activePerimeter.center || { lat: 20.0, lng: 10.0 };
    const targetZoom = Math.round(activePerimeter.zoom || (activePerimeter.level === 'global' ? 3 : 6));
    smoothFlyTo(targetCenter, targetZoom);
  }, [isMapReady, activePerimeter, smoothFlyTo]);

  // --------------------------------------------------------------------------
  // INITIALIZE MAP (OSM LEAFLET VS GOOGLE MAPS)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isMounted = true;

    const initialCenter = activePerimeter.center || { lat: 20.0, lng: 10.0 };
    const initialZoom = activePerimeter.zoom || 3;

    if (engine === 'osm') {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: false,
      });

      // Standard OSM Tiles with CSS silver grayscale styling (zero watermarks)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'osm-silver-tiles',
      }).addTo(map);

      leafletMapRef.current = map;
      setIsMapReady(true);

      return () => {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
        }
        setIsMapReady(false);
      };
    } else {
      // Google Maps Initializer
      if (!googleMapsApiKey) {
        setIsMapReady(false);
        return;
      }

      async function initGoogleMap() {
        try {
          setOptions({
            key: googleMapsApiKey!,
            v: 'weekly',
          });

          const { Map } = (await importLibrary('maps')) as any;
          const placesLib = (await importLibrary('places')) as any;
          const geocodingLib = (await importLibrary('geocoding')) as any;

          if (placesLib?.AutocompleteService) {
            autocompleteServiceRef.current = new placesLib.AutocompleteService();
          }
          if (geocodingLib?.Geocoder) {
            geocoderRef.current = new geocodingLib.Geocoder();
          }

          if (!isMounted || !mapContainerRef.current) return;

          const map = new Map(mapContainerRef.current, {
            center: initialCenter,
            zoom: initialZoom,
            mapTypeId: 'roadmap',
            styles: LIGHT_SILVER_MAP_STYLE,
            disableDefaultUI: true,
            zoomControl: false,
            isFractionalZoomEnabled: true,
          });

          googleMapInstanceRef.current = map;
          setIsMapReady(true);
        } catch (err) {
          console.warn('Google Maps loader error:', err);
          if (isMounted) setIsMapReady(false);
        }
      }

      initGoogleMap();

      return () => {
        isMounted = false;
      };
    }
  }, [engine, googleMapsApiKey]);

  // --------------------------------------------------------------------------
  // GOOGLE MAPS OVERLAYVIEW CLASS SETUP
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'googlemaps' || !isMapReady) return;
    const googleObj = (window as any).google;
    if (!googleObj?.maps) return;

    class FloatingLocationChip extends googleObj.maps.OverlayView {
      private div: HTMLDivElement | null = null;
      private session: SafetySession;
      private isSelected: boolean;
      private onSelect: (s: SafetySession) => void;

      constructor(sess: SafetySession, isSelected: boolean, onSelect: (s: SafetySession) => void) {
        super();
        this.session = sess;
        this.isSelected = isSelected;
        this.onSelect = onSelect;
      }

      onAdd() {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.cursor = 'pointer';
        div.style.pointerEvents = 'auto';
        div.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease';

        const isEmergency = this.session.status === 'emergency';
        const isDistress = this.session.status === 'distress_pending';

        const ring = document.createElement('div');
        ring.className = isEmergency
          ? 'radar-ring radar-ring-red'
          : isDistress
          ? 'radar-ring radar-ring-amber'
          : 'radar-ring radar-ring-green';
        ring.style.width = isEmergency ? '64px' : '48px';
        ring.style.height = isEmergency ? '64px' : '48px';
        ring.style.top = isEmergency ? '-32px' : '-24px';
        ring.style.left = isEmergency ? '-32px' : '-24px';
        div.appendChild(ring);

        const chip = document.createElement('div');
        chip.className = 'gmap-chip-tag';
        chip.style.borderColor = this.isSelected ? 'var(--primary)' : isEmergency ? 'var(--alert-red)' : 'var(--border-hairline)';
        chip.style.boxShadow = this.isSelected ? '0 6px 22px rgba(16, 185, 129, 0.25)' : '0 4px 18px rgba(15, 23, 42, 0.12)';

        const initials = this.session.userName
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'US';

        chip.innerHTML = `
          <div class="profile-avatar ${isEmergency ? 'profile-avatar-emergency' : isDistress ? 'profile-avatar-distress' : ''}">
            ${initials}
            ${isEmergency ? '<span style="position: absolute; top: -2px; right: -2px; width: 7px; height: 7px; border-radius: 50%; background-color: #EF4444; border: 1.5px solid #FFFFFF;"></span>' : ''}
          </div>
          <div style="display: flex; flex-direction: column;">
            <div style="font-size: 11px; font-weight: 700; color: ${isEmergency ? '#DC2626' : '#0F172A'}; line-height: 1.15;">
              ${this.session.userName} ${isEmergency ? '• SOS' : ''}
            </div>
            <div style="font-size: 9.5px; font-weight: 400; color: #64748B; margin-top: 1px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${this.session.addressName || `${this.session.currentLocation.lat.toFixed(3)}, ${this.session.currentLocation.lng.toFixed(3)}`}
            </div>
          </div>
        `;

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSelect(this.session);
        });

        div.appendChild(chip);
        this.div = div;
        const panes = this.getPanes();
        if (panes?.overlayMouseTarget) {
          panes.overlayMouseTarget.appendChild(div);
        }
      }

      update(sess: SafetySession, isSelected: boolean, onSelect: (s: SafetySession) => void) {
        this.session = sess;
        this.isSelected = isSelected;
        this.onSelect = onSelect;
        if (this.div) {
          const isEmergency = sess.status === 'emergency';
          const isDistress = sess.status === 'distress_pending';
          const ring = this.div.querySelector('.radar-ring') as HTMLElement | null;
          if (ring) {
            ring.className = isEmergency
              ? 'radar-ring radar-ring-red'
              : isDistress
              ? 'radar-ring radar-ring-amber'
              : 'radar-ring radar-ring-green';
            ring.style.width = isEmergency ? '64px' : '48px';
            ring.style.height = isEmergency ? '64px' : '48px';
            ring.style.top = isEmergency ? '-32px' : '-24px';
            ring.style.left = isEmergency ? '-32px' : '-24px';
          }
          const chip = this.div.querySelector('.gmap-chip-tag') as HTMLElement | null;
          if (chip) {
            chip.style.borderColor = isSelected ? 'var(--primary)' : isEmergency ? 'var(--alert-red)' : 'var(--border-hairline)';
            chip.style.boxShadow = isSelected ? '0 6px 22px rgba(16, 185, 129, 0.25)' : '0 4px 18px rgba(15, 23, 42, 0.12)';

            const initials = sess.userName
              ? sess.userName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
              : 'U';

            chip.innerHTML = `
              <div class="profile-avatar ${isEmergency ? 'profile-avatar-emergency' : isDistress ? 'profile-avatar-distress' : ''}">
                ${initials}
                ${isEmergency ? '<span style="position: absolute; top: -2px; right: -2px; width: 7px; height: 7px; border-radius: 50%; background-color: #EF4444; border: 1.5px solid #FFFFFF;"></span>' : ''}
              </div>
              <div style="display: flex; flex-direction: column;">
                <div style="font-size: 11px; font-weight: 700; color: ${isEmergency ? '#DC2626' : '#0F172A'}; line-height: 1.15;">
                  ${sess.userName} ${isEmergency ? '• SOS' : ''}
                </div>
                <div style="font-size: 9.5px; font-weight: 400; color: #64748B; margin-top: 1px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${sess.addressName || `${sess.currentLocation.lat.toFixed(3)}, ${sess.currentLocation.lng.toFixed(3)}`}
                </div>
              </div>
            `;
          }
          this.draw();
        }
      }

      draw() {
        if (!this.div) return;
        const overlayProjection = this.getProjection();
        if (!overlayProjection) return;
        try {
          const pos = overlayProjection.fromLatLngToDivPixel(
            new (googleObj as any).maps.LatLng(this.session.currentLocation.lat, this.session.currentLocation.lng)
          );
          if (pos) {
            this.div.style.left = `${pos.x}px`;
            this.div.style.top = `${pos.y}px`;
          }
        } catch {
          // ignore layout resize reflows
        }
      }

      onRemove() {
        if (this.div?.parentNode) {
          this.div.parentNode.removeChild(this.div);
        }
        this.div = null;
      }
    }

    chipClassRef.current = FloatingLocationChip;
  }, [engine, isMapReady]);

  // --------------------------------------------------------------------------
  // RENDER MARKERS (GOOGLE MAPS OR OPENSTREETMAP)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isMapReady) return;

    if (engine === 'osm') {
      // OSM Leaflet Markers
      const map = leafletMapRef.current;
      if (!map) return;
      const currentMarkers = leafletMarkersRef.current;
      const activeIds = new Set(filteredSessions.map((s) => s.id));

      currentMarkers.forEach((marker, id) => {
        if (!activeIds.has(id)) {
          marker.remove();
          currentMarkers.delete(id);
        }
      });

      filteredSessions.forEach((sess) => {
        const isEmergency = sess.status === 'emergency';
        const isDistress = sess.status === 'distress_pending';
        const isSelected = selectedSession?.id === sess.id;
        const initials = sess.userName
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'US';

        const ringClass = isEmergency
          ? 'radar-ring radar-ring-red'
          : isDistress
          ? 'radar-ring radar-ring-amber'
          : 'radar-ring radar-ring-green';

        const ringSize = isEmergency ? 64 : 48;
        const ringOffset = isEmergency ? -32 : -24;

        const html = `
          <div style="position: relative; width: 0; height: 0; pointer-events: auto; cursor: pointer;">
            <div class="${ringClass}" style="width: ${ringSize}px; height: ${ringSize}px; top: ${ringOffset}px; left: ${ringOffset}px;"></div>
            <div class="gmap-chip-tag" style="
              border-color: ${isSelected ? 'var(--primary)' : isEmergency ? 'var(--alert-red)' : 'var(--border-hairline)'};
              box-shadow: ${isSelected ? '0 6px 22px rgba(16, 185, 129, 0.25)' : '0 4px 18px rgba(15, 23, 42, 0.12)'};
              display: flex;
              align-items: center;
              gap: 6px;
              background: #FFFFFF;
              padding: 4px 8px;
              border-radius: 9999px;
              border-width: 1.5px;
              border-style: solid;
              white-space: nowrap;
              transform: translate(-50%, -50%);
            ">
              <div class="profile-avatar ${isEmergency ? 'profile-avatar-emergency' : isDistress ? 'profile-avatar-distress' : ''}">
                ${initials}
                ${isEmergency ? '<span style="position: absolute; top: -2px; right: -2px; width: 7px; height: 7px; border-radius: 50%; background-color: #EF4444; border: 1.5px solid #FFFFFF;"></span>' : ''}
              </div>
              <div style="display: flex; flex-direction: column;">
                <div style="font-size: 11px; font-weight: 700; color: ${isEmergency ? '#DC2626' : '#0F172A'}; line-height: 1.15;">
                  ${sess.userName} ${isEmergency ? '• SOS' : ''}
                </div>
                <div style="font-size: 9.5px; font-weight: 400; color: #64748B; margin-top: 1px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${sess.addressName || `${sess.currentLocation.lat.toFixed(3)}, ${sess.currentLocation.lng.toFixed(3)}`}
                </div>
              </div>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'leaflet-custom-radar-marker',
          html,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const existing = currentMarkers.get(sess.id);
        if (existing) {
          existing.setLatLng([sess.currentLocation.lat, sess.currentLocation.lng]);
          existing.setIcon(icon);
          existing.setZIndexOffset(isEmergency ? 1000 : isDistress ? 500 : 100);
        } else {
          const marker = L.marker([sess.currentLocation.lat, sess.currentLocation.lng], {
            icon,
            zIndexOffset: isEmergency ? 1000 : isDistress ? 500 : 100,
          }).addTo(map);

          marker.on('click', () => handleSelectSession(sess));
          currentMarkers.set(sess.id, marker);
        }
      });
    } else {
      // Google Maps Markers & OverlayView
      const googleObj = (window as any).google;
      if (!googleMapInstanceRef.current || !googleObj?.maps || !chipClassRef.current) return;

      const map = googleMapInstanceRef.current;
      const ChipClass = chipClassRef.current;
      const currentIds = new Set(filteredSessions.map((s) => s.id));
      const handles = activeHandlesRef.current;

      handles.forEach((handle, id) => {
        if (!currentIds.has(id)) {
          handle.destroy();
          handles.delete(id);
        }
      });

      filteredSessions.forEach((sess) => {
        const isEmergency = sess.status === 'emergency';
        const isDistress = sess.status === 'distress_pending';
        const isSelected = selectedSession?.id === sess.id;

        const existing = handles.get(sess.id);
        if (existing) {
          existing.marker.setPosition({ lat: sess.currentLocation.lat, lng: sess.currentLocation.lng });
          existing.marker.setIcon({
            path: googleObj.maps.SymbolPath.CIRCLE,
            scale: isSelected ? 8 : isEmergency ? 7 : 6,
            fillColor: isEmergency ? '#EF4444' : isDistress ? '#F59E0B' : '#10B981',
            fillOpacity: 1,
            strokeWeight: 2.5,
            strokeColor: '#FFFFFF',
          });
          existing.update(sess, isSelected);
        } else {
          const marker = new googleObj.maps.Marker({
            position: { lat: sess.currentLocation.lat, lng: sess.currentLocation.lng },
            map,
            title: `${sess.userName} (${sess.status})`,
            zIndex: isEmergency ? 100 : isDistress ? 50 : 30,
            icon: {
              path: googleObj.maps.SymbolPath.CIRCLE,
              scale: isSelected ? 8 : isEmergency ? 7 : 6,
              fillColor: isEmergency ? '#EF4444' : isDistress ? '#F59E0B' : '#10B981',
              fillOpacity: 1,
              strokeWeight: 2.5,
              strokeColor: '#FFFFFF',
            },
          });

          marker.addListener('click', () => handleSelectSession(sess));

          const chip = new ChipClass(sess, isSelected, handleSelectSession);
          chip.setMap(map);

          handles.set(sess.id, {
            marker,
            overlay: chip,
            update: (s: SafetySession, sel: boolean) => chip.update(s, sel, handleSelectSession),
            destroy: () => {
              marker.setMap(null);
              chip.setMap(null);
            },
          });
        }
      });
    }
  }, [engine, isMapReady, filteredSessions, selectedSession, handleSelectSession]);

  // --------------------------------------------------------------------------
  // RENDER JURISDICTION BOUNDARIES (GOOGLE MAPS OR OPENSTREETMAP)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isMapReady) return;

    if (engine === 'osm') {
      const map = leafletMapRef.current;
      if (!map) return;

      leafletBoundaryLayersRef.current.forEach((layer) => layer.remove());
      leafletBoundaryLayersRef.current = [];

      if (jurisdictionSettings.mode === 'global' || activePerimeter.level === 'global') return;

      const renderPaths = (paths: { lat: number; lng: number }[][]) => {
        leafletBoundaryLayersRef.current.forEach((layer) => layer.remove());
        const newLayers: L.Layer[] = [];

        paths.forEach((ring) => {
          if (ring.length >= 3) {
            const latLngs: L.LatLngExpression[] = ring.map((p) => [p.lat, p.lng]);
            const polygon = L.polygon(latLngs, {
              color: '#10B981',
              weight: 2,
              opacity: 0.75,
              fillColor: '#10B981',
              fillOpacity: 0.12,
              dashArray: '4, 8',
            }).addTo(map);

            newLayers.push(polygon);
          }
        });

        leafletBoundaryLayersRef.current = newLayers;
      };

      if (activePerimeter.boundary && activePerimeter.boundary.length >= 3) {
        renderPaths([activePerimeter.boundary]);
      }

      let isMounted = true;
      const query = buildJurisdictionQuery(
        activePerimeter.countryName,
        activePerimeter.stateName,
        activePerimeter.communityName
      );

      async function loadOsmBoundary() {
        if (!query.trim()) return;
        const level = activePerimeter.level === 'country' ? 'country' : activePerimeter.level === 'state' ? 'state' : 'community';
        const geoJson = await fetchRealBoundaryGeoJson(query, activePerimeter.center, level);
        if (isMounted && geoJson) {
          const osmPaths = geoJsonToPolygonPaths(geoJson);
          if (osmPaths.length > 0 && osmPaths[0].length >= 3) {
            renderPaths(osmPaths);
          }
        }
      }

      loadOsmBoundary();

      return () => {
        isMounted = false;
      };
    } else {
      // Google Maps Boundary Overlays
      const googleObj = (window as any).google;
      if (!googleMapInstanceRef.current || !googleObj?.maps) return;
      const map = googleMapInstanceRef.current;

      if (jurisdictionSettings.mode === 'global' || activePerimeter.level === 'global') {
        googleBoundaryLayersRef.current.forEach((layer) => {
          if (layer && typeof layer.setMap === 'function') layer.setMap(null);
        });
        googleBoundaryLayersRef.current = [];
        return;
      }

      const query = buildJurisdictionQuery(
        activePerimeter.countryName,
        activePerimeter.stateName,
        activePerimeter.communityName
      );

      googleBoundaryLayersRef.current.forEach((layer) => {
        if (layer && typeof layer.setMap === 'function') layer.setMap(null);
      });
      googleBoundaryLayersRef.current = [];

      let isMounted = true;
      const lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 3.5,
        strokeColor: '#059669',
      };

      const renderBoundaryLayers = (paths: { lat: number; lng: number }[][]) => {
        if (!isMounted || paths.length === 0) return;

        googleBoundaryLayersRef.current.forEach((layer) => {
          if (layer && typeof layer.setMap === 'function') layer.setMap(null);
        });
        const newLayers: any[] = [];

        const polygon = new googleObj.maps.Polygon({
          paths,
          strokeColor: '#10B981',
          strokeOpacity: 0.65,
          strokeWeight: 2,
          fillColor: '#10B981',
          fillOpacity: 0.12,
          map,
          clickable: false,
          zIndex: 10,
        });
        newLayers.push(polygon);

        paths.forEach((ring) => {
          if (Array.isArray(ring) && ring.length >= 3) {
            const polyline = new googleObj.maps.Polyline({
              path: ring,
              strokeOpacity: 0,
              icons: [{ icon: lineSymbol, offset: '0', repeat: '12px' }],
              map,
              clickable: false,
              zIndex: 12,
            });
            newLayers.push(polyline);
          }
        });

        googleBoundaryLayersRef.current = newLayers;
      };

      if (activePerimeter.boundary && activePerimeter.boundary.length >= 3) {
        renderBoundaryLayers([activePerimeter.boundary]);
      }

      async function loadOsmBoundary() {
        if (!query.trim()) return;
        const level = activePerimeter.level === 'country' ? 'country' : activePerimeter.level === 'state' ? 'state' : 'community';
        const geoJson = await fetchRealBoundaryGeoJson(query, activePerimeter.center, level);
        if (isMounted && geoJson) {
          const osmPaths = geoJsonToPolygonPaths(geoJson);
          if (osmPaths.length > 0 && osmPaths[0].length >= 3) {
            renderBoundaryLayers(osmPaths);
          }
        }
      }

      loadOsmBoundary();

      return () => {
        isMounted = false;
      };
    }
  }, [engine, isMapReady, activePerimeter, jurisdictionSettings.mode]);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    if (engine === 'osm' && leafletMapRef.current) {
      if (direction === 'in') leafletMapRef.current.zoomIn();
      else leafletMapRef.current.zoomOut();
    } else if (engine === 'googlemaps' && googleMapInstanceRef.current) {
      const currentZoom = googleMapInstanceRef.current.getZoom() || 13;
      const center = googleMapInstanceRef.current.getCenter()?.toJSON() ?? (activePerimeter.center || { lat: 20, lng: 10 });
      smoothFlyTo(center, currentZoom + (direction === 'in' ? 1 : -1));
    }
  }, [engine, activePerimeter.center, smoothFlyTo]);

  const handleRecenter = useCallback(() => {
    if (selectedSession) {
      smoothFlyTo({ lat: selectedSession.currentLocation.lat, lng: selectedSession.currentLocation.lng }, 15.5);
    } else if (activePerimeter.center) {
      smoothFlyTo(activePerimeter.center, activePerimeter.zoom || 11);
    }
  }, [selectedSession, activePerimeter, smoothFlyTo]);

  const handleCopyDirections = useCallback((session: SafetySession) => {
    const directionsUrl = engine === 'osm'
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${session.currentLocation.lat}%2C${session.currentLocation.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${session.currentLocation.lat},${session.currentLocation.lng}`;

    navigator.clipboard.writeText(directionsUrl)
      .then(() => {
        notification.success({
          message: 'Directions Copied',
          description: 'Directions link has been copied to your clipboard.',
          placement: 'topRight',
          duration: 3,
        });
      })
      .catch(() => {
        notification.error({
          message: 'Copy Failed',
          description: 'Could not copy directions link to clipboard.',
          placement: 'topRight',
          duration: 3,
        });
      });
  }, [engine]);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      padding: '1.25rem 1.75rem',
      gap: '1.25rem',
      backgroundColor: 'var(--bg-app)',
      overflow: 'hidden',
    }}>
      
      {/* 1. Left Dispatch Card Feed (Collapsible with smooth animation, Width: 285px) */}
      <div 
        className="map-side-panel"
        style={{
          width: isQueueCollapsed ? '0px' : '285px',
          opacity: isQueueCollapsed ? 0 : 1,
          transform: isQueueCollapsed ? 'translateX(-12px)' : 'translateX(0)',
          pointerEvents: isQueueCollapsed ? 'none' : 'auto',
          marginRight: isQueueCollapsed ? '-0.75rem' : '0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          width: '285px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          overflow: 'hidden',
        }}>
          
          {/* Filter Pills Header & Collapse Queue Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={() => setQueueFilter('all')}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.45rem',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  backgroundColor: queueFilter === 'all' ? 'var(--text-main)' : '#FFFFFF',
                  color: queueFilter === 'all' ? '#FFFFFF' : 'var(--text-sub)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                All ({filteredSessions.length})
              </button>
              <button
                onClick={() => setQueueFilter('emergency')}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.45rem',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  backgroundColor: queueFilter === 'emergency' ? 'var(--alert-red)' : '#FFFFFF',
                  color: queueFilter === 'emergency' ? '#FFFFFF' : 'var(--alert-red)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                Emergency ({emergencyCount})
              </button>
              <button
                onClick={() => setQueueFilter('active')}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.45rem',
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  backgroundColor: queueFilter === 'active' ? 'var(--primary)' : '#FFFFFF',
                  color: queueFilter === 'active' ? '#FFFFFF' : 'var(--text-sub)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                Active
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <button
                onClick={() => setIsQueueCollapsed(true)}
                className="btn btn-outline"
                style={{ 
                  width: '28px', 
                  height: '28px', 
                  padding: 0, 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'var(--text-sub)',
                }}
                title="Minimize Users Panel"
              >
                <ChevronLeft size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Scrollable Dispatch Cards List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            paddingRight: '2px',
          }}>
            {displayedQueue.length === 0 ? (
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem 0.85rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.68rem',
                border: '1px dashed var(--border-hairline)',
              }}>
                {globalSearch ? 'No matching users found.' : 'No active users in current view.'}
              </div>
            ) : (
              displayedQueue.map((sess) => {
                const isSelected = selectedSession?.id === sess.id;
                const isEmergency = sess.status === 'emergency';
                const isDistress = sess.status === 'distress_pending';
                const currentPoint = sess.currentLocation;

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess)}
                    className={`dispatch-card ${isEmergency ? 'dispatch-card-emergency' : isDistress ? 'dispatch-card-distress' : ''} ${isSelected ? 'dispatch-card-active' : ''}`}
                    style={{ padding: '0.6rem 0.7rem' }}
                  >
                    {/* Card Header: Avatar + User Name & Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
                        <div
                          className={`profile-avatar ${
                            isEmergency
                              ? 'profile-avatar-emergency'
                              : isDistress
                              ? 'profile-avatar-distress'
                              : ''
                          }`}
                          style={{ width: '24px', height: '24px', fontSize: '9px', fontWeight: 700, flexShrink: 0 }}
                        >
                          {sess.userName
                            .split(' ')
                            .map((n: string) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase() || 'US'}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sess.userName}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                        <span className={`badge ${
                          isEmergency ? 'badge-emergency' : isDistress ? 'badge-distress' : 'badge-active'
                        }`} style={{ fontSize: '0.55rem', padding: '0.08rem 0.4rem', fontWeight: 700 }}>
                          {isEmergency ? 'Emergency' : isDistress ? 'Needs Attention' : 'Active'}
                        </span>
                      </div>
                    </div>

                    {/* Route Timeline Waypoints */}
                    <div className="route-timeline" style={{ margin: '0.35rem 0', paddingLeft: '1.2rem' }}>
                      <div className="route-timeline-line" style={{ left: '5px', top: '7px', bottom: '7px' }} />

                      {/* Origin / Start Node */}
                      <div className="route-node" style={{ marginBottom: '0.3rem' }}>
                        <div className="route-node-icon-start" style={{ left: '-1.2rem', width: '13px', height: '13px', borderRadius: '3px' }}>
                          <Footprints size={7} />
                        </div>
                        <div style={{ overflow: 'hidden', paddingRight: '0.25rem' }}>
                          <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sess.addressName && !sess.addressName.toLowerCase().startsWith('my location')
                              ? sess.addressName.split(',')[0]
                              : `${currentPoint.lat.toFixed(4)}, ${currentPoint.lng.toFixed(4)}`}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', fontWeight: 400, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {new Date(sess.lastPingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {/* Current Live GPS Node */}
                      <div className="route-node">
                        <div
                          className="route-node-icon-end"
                          style={{
                            left: '-1.2rem',
                            width: '13px',
                            height: '13px',
                            borderColor: isEmergency ? 'var(--alert-red)' : isDistress ? 'var(--alert-amber)' : 'var(--primary)',
                            backgroundColor: isEmergency ? 'rgba(239, 68, 68, 0.15)' : isDistress ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          }}
                        >
                          <div
                            style={{
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              backgroundColor: isEmergency ? 'var(--alert-red)' : isDistress ? 'var(--alert-amber)' : 'var(--primary)',
                              boxShadow: isEmergency ? '0 0 5px rgba(239, 68, 68, 0.7)' : isDistress ? '0 0 5px rgba(245, 158, 11, 0.7)' : 'none',
                            }}
                          />
                        </div>
                        <div style={{ overflow: 'hidden', paddingRight: '0.25rem' }}>
                          <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sess.addressName && !sess.addressName.toLowerCase().startsWith('my location')
                              ? sess.addressName
                              : `${currentPoint.lat.toFixed(4)}, ${currentPoint.lng.toFixed(4)}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Phone Number & Direct Action Buttons */}
                    <div style={{
                      marginTop: '0.35rem',
                      paddingTop: '0.35rem',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontSize: '0.64rem', color: sess.userPhone ? 'var(--text-sub)' : 'var(--text-muted)', fontWeight: 500 }}>
                        {sess.userPhone || 'No contact set'}
                      </div>

                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        <a
                          href={sess.userPhone ? `tel:${sess.userPhone}` : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!sess.userPhone) e.preventDefault();
                          }}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '5px',
                            backgroundColor: 'var(--bg-subtle)',
                            border: '1px solid var(--border-hairline)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: sess.userPhone ? 'var(--text-main)' : 'var(--text-muted)',
                            textDecoration: 'none',
                            opacity: sess.userPhone ? 1 : 0.45,
                            cursor: sess.userPhone ? 'pointer' : 'default',
                          }}
                          title={sess.userPhone ? `Dial ${sess.userPhone}` : 'No emergency phone configured'}
                        >
                          <TbDeviceLandlinePhone size={14} strokeWidth={2} />
                        </a>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInitiateAgoraCall(sess);
                          }}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '5px',
                            backgroundColor: 'var(--accent-green-light)',
                            border: '1px solid var(--accent-green-border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-green-dark)',
                            cursor: 'pointer',
                          }}
                          title="Call in app"
                        >
                          <PhoneCall size={12} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>

      {/* 2. Middle: Full-Height Map Canvas & Floating Controls */}
      <div style={{
        flex: 1,
        height: '100%',
        minWidth: 0,
        position: 'relative',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        backgroundColor: '#F7F8FA',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--border-hairline)',
      }}>
        
        {/* Top Floating Bar: Jurisdiction Switcher & Mode Dropdowns */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          right: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          
          {/* Left: Re-open Queue button + Mode Toggle & Cascaded Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto', flexWrap: 'wrap' }}>
            {isQueueCollapsed && (
              <button
                onClick={() => setIsQueueCollapsed(false)}
                className="btn btn-outline"
                style={{
                  padding: '0.42rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                title="Open Active Users"
              >
                <Users size={15} strokeWidth={2.2} color="var(--primary)" />
                <span>Users ({filteredSessions.length})</span>
              </button>
            )}

            <div style={{
              display: 'flex',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-pill)',
              padding: '3px',
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
              border: '1px solid var(--border-hairline)',
            }}>
              <button
                onClick={() => updateJurisdictionSettings({ mode: 'global', countryCode: 'ALL', stateCode: 'ALL', communityId: 'ALL' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  backgroundColor: jurisdictionSettings.mode === 'global' ? 'var(--text-main)' : 'transparent',
                  color: jurisdictionSettings.mode === 'global' ? '#FFFFFF' : 'var(--text-sub)',
                  cursor: 'pointer',
                }}
              >
                <Globe size={13} />
                <span>Worldwide</span>
              </button>

              <button
                onClick={() => updateJurisdictionSettings({ mode: 'community', countryCode: 'NG', stateCode: 'ALL', communityId: 'ALL' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-pill)',
                  border: 'none',
                  backgroundColor: jurisdictionSettings.mode === 'community' ? 'var(--primary)' : 'transparent',
                  color: jurisdictionSettings.mode === 'community' ? '#FFFFFF' : 'var(--text-sub)',
                  cursor: 'pointer',
                }}
              >
                <Crosshair size={13} />
                <span>Community</span>
              </button>
            </div>

            {/* Cascaded Selectors in Community Mode */}
            {jurisdictionSettings.mode === 'community' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: '#FFFFFF',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--accent-green-border-subtle)',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
              }}>
                {/* 1. Country Selector */}
                <Select
                  showSearch
                  size="small"
                  variant="borderless"
                  filterOption={(input, option) =>
                    ((option as any)?.searchValue || '').toLowerCase().includes(input.toLowerCase())
                  }
                  value={jurisdictionSettings.countryCode}
                  onChange={(val) => updateJurisdictionSettings({
                    countryCode: val,
                    stateCode: 'ALL',
                    communityId: 'ALL',
                  })}
                  options={countryOptions}
                  style={{ width: 150, fontWeight: 700, fontSize: '0.75rem' }}
                  popupMatchSelectWidth={220}
                />

                <span style={{ color: 'var(--border-hairline)' }}>|</span>

                {/* 2. State Selector */}
                <Select
                  showSearch
                  size="small"
                  variant="borderless"
                  filterOption={(input, option) =>
                    ((option as any)?.searchValue || '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={jurisdictionSettings.countryCode === 'ALL'}
                  value={jurisdictionSettings.stateCode}
                  onChange={(val) => updateJurisdictionSettings({
                    stateCode: val,
                    communityId: 'ALL',
                  })}
                  options={stateOptions}
                  style={{ width: 150, fontWeight: 700, fontSize: '0.75rem' }}
                  popupMatchSelectWidth={230}
                  placeholder="All States"
                />

                <span style={{ color: 'var(--border-hairline)' }}>|</span>

                {/* 3. Community / Sector Selector */}
                <Select
                  showSearch
                  size="small"
                  variant="borderless"
                  filterOption={false}
                  onSearch={handleCommunitySearch}
                  onDropdownVisibleChange={(open) => {
                    if (!open) {
                      setCommunitySearchQuery('');
                      setPlaceSearchResults([]);
                      setIsSearchingPlaces(false);
                    }
                  }}
                  notFoundContent={
                    isSearchingPlaces
                      ? `Searching ${engine === 'osm' ? 'OpenStreetMap' : 'Google Places'}...`
                      : communitySearchQuery.trim().length >= 1
                      ? 'No matching locations found'
                      : 'Type city or neighborhood...'
                  }
                  disabled={jurisdictionSettings.countryCode === 'ALL'}
                  value={jurisdictionSettings.communityId}
                  onChange={handleCommunitySelect}
                  options={communityOptions}
                  style={{ width: 220, fontWeight: 700, fontSize: '0.75rem' }}
                  popupMatchSelectWidth={290}
                  placeholder="Search community (e.g. Egbeda)..."
                />
              </div>
            )}
          </div>

          {/* Right Floating Controls: Re-open Inspector pill + Zoom & Recenter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', pointerEvents: 'auto' }}>
            {isInspectorCollapsed && selectedSession && (
              <button
                onClick={() => setIsInspectorCollapsed(false)}
                className="btn btn-outline"
                style={{
                  padding: '0.42rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-pill)',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                title="Open User Details"
              >
                <User size={15} strokeWidth={2.2} color="var(--primary)" />
                <span>User Details</span>
              </button>
            )}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
              border: '1px solid var(--border-hairline)',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => handleZoom('in')}
                style={{ width: '32px', height: '32px', border: 'none', backgroundColor: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Zoom In"
              >
                <Plus size={14} />
              </button>
              <div style={{ height: '1px', backgroundColor: 'var(--border-hairline)' }} />
              <button
                onClick={() => handleZoom('out')}
                style={{ width: '32px', height: '32px', border: 'none', backgroundColor: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Zoom Out"
              >
                <Minus size={14} />
              </button>
            </div>

            <button
              onClick={handleRecenter}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-hairline)',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Recenter Map on Target Jurisdiction"
            >
              <Compass size={14} color="var(--primary)" />
            </button>
          </div>

        </div>

        {/* Map Viewport Container */}
        <div 
          ref={mapContainerRef} 
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: isMapReady ? 'block' : 'none' }} 
        />

        {/* Radar Fallback Grid if Map is loading/waiting */}
        {!isMapReady && (
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            backgroundColor: '#F7F8FA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: '420px',
              height: '420px',
              borderRadius: '50%',
              border: '1px solid #E2E8F0',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ width: '280px', height: '280px', borderRadius: '50%', border: '1px solid #E2E8F0', position: 'absolute' }} />
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', border: '1px solid #E2E8F0', position: 'absolute' }} />
            </div>
          </div>
        )}

      </div>

      {/* 3. Right: Minimal Collapsible Session Overview & User Data Panel */}
      <div 
        className="map-side-panel"
        style={{
          width: (isInspectorCollapsed || !selectedSession) ? '0px' : '275px',
          opacity: (isInspectorCollapsed || !selectedSession) ? 0 : 1,
          transform: (isInspectorCollapsed || !selectedSession) ? 'translateX(12px)' : 'translateX(0)',
          pointerEvents: (isInspectorCollapsed || !selectedSession) ? 'none' : 'auto',
          marginLeft: (isInspectorCollapsed || !selectedSession) ? '-0.75rem' : '0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedSession && (
          <div style={{
            width: '275px',
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-xl)',
            padding: '0.85rem',
            boxShadow: 'var(--shadow-card)',
            border: '1px solid var(--border-hairline)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            overflowY: 'auto',
          }}>
            
            {/* Header with Avatar, Name & Collapse Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.45rem', borderBottom: '1px solid var(--border-hairline)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
                <div 
                  className={`profile-avatar ${
                    selectedSession.status === 'emergency' 
                      ? 'profile-avatar-emergency' 
                      : selectedSession.status === 'distress_pending' 
                      ? 'profile-avatar-distress' 
                      : ''
                  }`}
                  style={{ width: '28px', height: '28px', fontSize: '10.5px', fontWeight: 600 }}
                >
                  {selectedSession.userName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || 'US'}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedSession.userName}
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    <span className={`badge ${
                      selectedSession.status === 'emergency'
                        ? 'badge-emergency'
                        : selectedSession.status === 'distress_pending'
                        ? 'badge-distress'
                        : 'badge-active'
                    }`} style={{ fontSize: '0.55rem', padding: '0.06rem 0.35rem', fontWeight: 600 }}>
                      {selectedSession.status === 'emergency' ? 'Emergency Alert' : selectedSession.status === 'distress_pending' ? 'Needs Attention' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsInspectorCollapsed(true)}
                className="btn btn-outline"
                style={{ 
                  width: '28px', 
                  height: '28px', 
                  padding: 0, 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--text-sub)',
                }}
                title="Minimize User Details"
              >
                <ChevronRight size={18} strokeWidth={2.4} />
              </button>
            </div>

            {/* Quick Activity 2-Tile Grid (Battery & Last Ping) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
              <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '0.45rem 0.4rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <Battery size={12} color={selectedSession.batteryLevel < 25 ? 'var(--alert-red)' : 'var(--accent-green-dark)'} />
                  <span>Battery</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: selectedSession.batteryLevel < 25 ? 'var(--alert-red)' : 'var(--accent-green-dark)', marginTop: '2px' }}>
                  {selectedSession.batteryLevel}%
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '0.45rem 0.4rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <Clock size={12} color="#B45309" />
                  <span>Updated</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                  {new Date(selectedSession.lastPingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Location Card */}
            <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-green-dark)', fontWeight: 600, fontSize: '0.62rem', marginBottom: '0.2rem' }}>
                <MapPin size={11} />
                <span>Current Location</span>
              </div>
              <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-main)', lineHeight: 1.3 }}>
                {selectedSession.addressName || 'Current Location'}
              </div>
              <div style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '3px' }}>
                {selectedSession.currentLocation.lat.toFixed(5)}, {selectedSession.currentLocation.lng.toFixed(5)}
              </div>
            </div>

            {/* Contact Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.66rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-sub)' }}>
                <span>Emergency Contact</span>
                {selectedSession.userPhone ? (
                  <a href={`tel:${selectedSession.userPhone}`} style={{ color: 'var(--accent-green-dark)', fontWeight: 600, textDecoration: 'none' }}>
                    {selectedSession.userPhone}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not configured</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-sub)' }}>
                <span>Email</span>
                <span style={{ fontWeight: 500, color: 'var(--text-main)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSession.userEmail}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: 'auto' }}>
              <button
                onClick={() => onInitiateAgoraCall(selectedSession)}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '0.42rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <PhoneCall size={12} strokeWidth={2.2} />
                <span>Call in App</span>
              </button>

              <a
                href={selectedSession.userPhone ? `tel:${selectedSession.userPhone}` : undefined}
                className="btn btn-outline"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  textDecoration: 'none',
                  color: selectedSession.userPhone ? 'var(--text-main)' : 'var(--text-muted)',
                  pointerEvents: selectedSession.userPhone ? 'auto' : 'none',
                  opacity: selectedSession.userPhone ? 1 : 0.45,
                  cursor: selectedSession.userPhone ? 'pointer' : 'default',
                }}
                title={selectedSession.userPhone ? `Dial ${selectedSession.userPhone}` : 'No emergency contact configured'}
              >
                <TbDeviceLandlinePhone size={15} strokeWidth={2} />
                <span>Dial Contact</span>
              </a>

              <button
                onClick={() => handleCopyDirections(selectedSession)}
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', padding: '0.4rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Copy size={12} strokeWidth={2.2} />
                <span>Copy Directions</span>
              </button>

              <a
                href={engine === 'osm'
                  ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=%3B${selectedSession.currentLocation.lat}%2C${selectedSession.currentLocation.lng}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${selectedSession.currentLocation.lat},${selectedSession.currentLocation.lng}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', padding: '0.38rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--text-main)' }}
              >
                <Navigation size={12} strokeWidth={2.2} />
                <span>Get Directions</span>
              </a>

              {selectedSession.status === 'emergency' && (
                <button
                  onClick={() => {
                    if (matchingReport) {
                      navigate(`/admin/incidents/${matchingReport.id}`);
                    } else {
                      navigate('/admin/incidents');
                    }
                  }}
                  className="btn btn-outline-green"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '0.45rem 0.75rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                  }}
                >
                  <CheckCircle size={14} strokeWidth={2.2} />
                  <span>Resolve Emergency</span>
                </button>
              )}
            </div>

          </div>
        )}
      </div>

    </div>
  );
};
