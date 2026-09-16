import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
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
  getStatesForCountry, 
  getCommunitiesForState,
  findJurisdictionForSession
} from '../services/jurisdictionData';
import { 
  buildJurisdictionQuery, 
  fetchRealBoundaryGeoJson, 
  geoJsonToPolygonPaths 
} from '../services/boundaryService';

// Custom Minimalist Light Silver / Pastel Google Maps Style matching reference image
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
  onInitiateAgoraCall: (session: SafetySession) => void;
  onResolveSession: (sessionId: string) => void;
}

export const LiveRadarMap: React.FC<LiveRadarMapProps> = ({
  googleMapsApiKey,
  onInitiateAgoraCall,
  onResolveSession,
}) => {
  const { 
    filteredSessions, 
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
  
  // Currently inspected session
  const [selectedSession, setSelectedSession] = useState<SafetySession | null>(
    filteredSessions.find((s) => s.status === 'emergency') || filteredSessions[0] || null
  );

  const [isGoogleMapLoaded, setIsGoogleMapLoaded] = useState(false);
  const mapType = 'roadmap' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleMapInstanceRef = useRef<any>(null);

  // Synchronize inspected session when filtered list changes
  useEffect(() => {
    if (filteredSessions.length > 0) {
      if (!selectedSession || !filteredSessions.some((s) => s.id === selectedSession.id)) {
        setSelectedSession(filteredSessions.find((s) => s.status === 'emergency') || filteredSessions[0]);
      }
    } else {
      setSelectedSession(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSessions]);

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
  const communities = useMemo(
    () => (jurisdictionSettings.countryCode !== 'ALL' && jurisdictionSettings.stateCode !== 'ALL')
      ? getCommunitiesForState(jurisdictionSettings.countryCode, jurisdictionSettings.stateCode)
      : [],
    [jurisdictionSettings.countryCode, jurisdictionSettings.stateCode]
  );

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

  const communityOptions = useMemo(() => [
    { value: 'ALL', searchValue: 'All Communities Cities Sectors', label: 'All Communities / Cities' },
    ...communities.map((cm) => ({
      value: cm.id,
      searchValue: `${cm.name}`,
      label: cm.name,
    })),
  ], [communities]);

  // Trigger Google Maps resize recalculation whenever container dimensions change or panels toggle
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleObj = (window as any).google;
    if (!googleMapInstanceRef.current || !googleObj?.maps?.event) return;

    const triggerResize = () => {
      if (googleMapInstanceRef.current && googleObj?.maps?.event) {
        googleObj.maps.event.trigger(googleMapInstanceRef.current, 'resize');
      }
    };

    // Debounce to one animation frame — avoids layout thrash during sidebar slide animation
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
  }, [isQueueCollapsed, isInspectorCollapsed, isGoogleMapLoaded]);

  // Ref to the FloatingLocationChip class — created once after map loads, never re-defined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chipClassRef = useRef<any>(null);
  // Tracks the last boundary query sent to Nominatim to avoid duplicate fetches
  const lastBoundaryQueryRef = useRef<string>('');

  // Load Google Maps with Custom Light Silver Minimalist Palette
  useEffect(() => {
    if (!googleMapsApiKey || !mapContainerRef.current) {
      setIsGoogleMapLoaded(false);
      return;
    }

    let isMounted = true;

    async function initMap() {
      try {
        setOptions({
          key: googleMapsApiKey,
          v: 'weekly',
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { Map } = (await importLibrary('maps')) as any;

        if (!isMounted || !mapContainerRef.current) return;

        const initialCenter = activePerimeter.center || { lat: 20.0, lng: 10.0 };

        const map = new Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: activePerimeter.zoom || 3,
          mapTypeId: mapType,
          styles: LIGHT_SILVER_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: false,
          // Enable fractional zoom for silky-smooth camera interpolation between levels
          isFractionalZoomEnabled: true,
        });

        googleMapInstanceRef.current = map;
        setIsGoogleMapLoaded(true);
      } catch (err: unknown) {
        console.warn('Google Maps loader error (using fallback radar view):', err);
        if (isMounted) setIsGoogleMapLoaded(false);
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [googleMapsApiKey]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeHandlesRef = useRef<Map<string, { marker: any; overlay: any; update: (s: SafetySession, sel: boolean) => void; destroy: () => void }>>(new Map());
  const cameraAnimRef = useRef<number | null>(null);

  // Continuous 60fps Cinematic Camera Flight Engine (Zero Jumps / Zero Skips)
  const smoothFlyTo = (targetCenter: { lat: number; lng: number }, targetZoom: number) => {
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

    // If already at target coordinates and zoom, return
    if (dist < 0.0001 && Math.abs(startZoom - targetZoom) === 0) return;

    // Dynamically scale duration based on geographic distance
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
        // Fractional zoom — no Math.round, lets isFractionalZoomEnabled interpolate tiles smoothly
        let curZoomVal = startZoom + (targetZoom - startZoom) * ease;
        if (dist > 1.2 && progress > 0.15 && progress < 0.85) {
          const altitudeLift = Math.sin(progress * Math.PI) * Math.min(2.5, dist * 0.35);
          curZoomVal = Math.max(2.5, curZoomVal - altitudeLift);
        }
        map.setZoom(curZoomVal); // fractional — no rounding, no equality guard
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
  };

  const handleSelectSession = useCallback((sess: SafetySession) => {
    setSelectedSession(sess);

    // 1. Automatically re-open the Citizen Details inspector panel
    setIsInspectorCollapsed(false);

    // 2. Auto-set the jurisdiction view to become focused on their community (if not already focused)
    const targetJur = findJurisdictionForSession(sess);
    if (targetJur) {
      const isAlreadyFocused =
        jurisdictionSettings.mode === 'community' &&
        jurisdictionSettings.countryCode === targetJur.countryCode &&
        jurisdictionSettings.stateCode === targetJur.stateCode &&
        jurisdictionSettings.communityId === targetJur.communityId;

      if (!isAlreadyFocused) {
        updateJurisdictionSettings({
          mode: 'community',
          countryCode: targetJur.countryCode,
          stateCode: targetJur.stateCode,
          communityId: targetJur.communityId,
        });
      }
    }

    // 3. Smooth fly camera to citizen's GPS coordinates
    smoothFlyTo({ lat: sess.currentLocation.lat, lng: sess.currentLocation.lng }, 15);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jurisdictionSettings, updateJurisdictionSettings]);

  // SMOOTH CINEMATIC CAMERA FLIGHT ON JURISDICTION SWITCH
  useEffect(() => {
    if (!isGoogleMapLoaded || !googleMapInstanceRef.current) return;
    const targetCenter = activePerimeter.center || { lat: 20.0, lng: 10.0 };
    const targetZoom = Math.round(activePerimeter.zoom || (activePerimeter.level === 'global' ? 3 : 6));
    smoothFlyTo(targetCenter, targetZoom);

    return () => {
      if (cameraAnimRef.current) {
        cancelAnimationFrame(cameraAnimRef.current);
        cameraAnimRef.current = null;
      }
    };
  }, [isGoogleMapLoaded, activePerimeter]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boundaryLayersRef = useRef<any[]>([]);

  // REAL-WORLD GEOGRAPHIC ADMINISTRATIVE BOUNDARY OVERLAY (GEOJSON + DOTTED PERIMETER)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleObj = (window as any).google;
    if (!isGoogleMapLoaded || !googleMapInstanceRef.current || !googleObj?.maps) return;

    const map = googleMapInstanceRef.current;

    // Only render boundary outline if in community focus mode or country/state selected
    if (jurisdictionSettings.mode === 'global' || activePerimeter.level === 'global') {
      // Clear any existing boundary layers when switching to global
      boundaryLayersRef.current.forEach((layer) => {
        if (layer && typeof layer.setMap === 'function') layer.setMap(null);
      });
      boundaryLayersRef.current = [];
      lastBoundaryQueryRef.current = '';
      return;
    }

    const query = buildJurisdictionQuery(
      activePerimeter.countryName,
      activePerimeter.stateName,
      activePerimeter.communityName
    );

    // Clean up previous boundary layers before drawing new ones
    boundaryLayersRef.current.forEach((layer) => {
      if (layer && typeof layer.setMap === 'function') layer.setMap(null);
    });
    boundaryLayersRef.current = [];

    let isMounted = true;

    const lineSymbol = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 1,
      scale: 3.5,
      strokeColor: '#059669',
    };

    // Helper to render boundary polygon and dotted perimeter onto Google Maps
    const renderBoundaryLayers = (paths: { lat: number; lng: number }[][]) => {
      if (!isMounted || paths.length === 0) return;

      // Clean up previous layers
      boundaryLayersRef.current.forEach((layer) => {
        if (layer && typeof layer.setMap === 'function') layer.setMap(null);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newLayers: any[] = [];

      // 1. Semi-transparent emerald tint polygon
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

      // 2. Dotted/dashed SVG polyline along the geographical perimeter contour
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

      boundaryLayersRef.current = newLayers;
    };

    // 1. Instantly render pre-calculated local boundary (0ms latency, guaranteed visible border)
    if (activePerimeter.boundary && activePerimeter.boundary.length >= 3) {
      renderBoundaryLayers([activePerimeter.boundary]);
    }

    // 2. Asynchronously fetch high-detail administrative polygon from OpenStreetMap
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

    return () => { isMounted = false; };
  }, [isGoogleMapLoaded, activePerimeter, jurisdictionSettings.mode]);

  // Build FloatingLocationChip class ONCE after map loads — stored in chipClassRef so it's
  // never re-declared on subsequent renders, preventing prototype churn and GC pressure.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleObj = (window as any).google;
    if (!isGoogleMapLoaded || !googleObj?.maps) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class FloatingLocationChip extends googleObj.maps.OverlayView {
      private div: HTMLDivElement | null = null;
      private session: SafetySession;
      private isSelected: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      private onSelect: (s: SafetySession) => void;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          const chip = this.div.querySelector('.gmap-chip-tag') as HTMLElement | null;
          if (chip) {
            chip.style.borderColor = isSelected ? 'var(--primary)' : isEmergency ? 'var(--alert-red)' : 'var(--border-hairline)';
            chip.style.boxShadow = isSelected ? '0 6px 22px rgba(16, 185, 129, 0.25)' : '0 4px 18px rgba(15, 23, 42, 0.12)';
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [isGoogleMapLoaded]);

  // IN-PLACE RECONCILIATION OF MARKERS, PULSING RADAR RINGS & PROFILE AVATARS (ZERO FLICKER)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleObj = (window as any).google;
    if (!isGoogleMapLoaded || !googleMapInstanceRef.current || !googleObj?.maps) return;
    if (!chipClassRef.current) return; // chip class not yet built

    const map = googleMapInstanceRef.current;
    const ChipClass = chipClassRef.current;

    const currentIds = new Set(filteredSessions.map((s) => s.id));
    const handles = activeHandlesRef.current;

    // 1. Cleanly remove markers no longer in current filtered scope
    handles.forEach((handle, id) => {
      if (!currentIds.has(id)) {
        handle.destroy();
        handles.delete(id);
      }
    });

    // 2. Add or seamlessly update active markers & overlays in-place
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

  }, [isGoogleMapLoaded, filteredSessions, selectedSession, handleSelectSession]);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    if (!googleMapInstanceRef.current) return;
    const currentZoom = googleMapInstanceRef.current.getZoom() || 13;
    const center = googleMapInstanceRef.current.getCenter()?.toJSON() ?? (activePerimeter.center || { lat: 20, lng: 10 });
    // Route through smoothFlyTo so zoom uses fractional interpolation rather than a hard snap
    smoothFlyTo(center, currentZoom + (direction === 'in' ? 1 : -1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePerimeter.center]);

  const handleRecenter = useCallback(() => {
    if (selectedSession) {
      smoothFlyTo({ lat: selectedSession.currentLocation.lat, lng: selectedSession.currentLocation.lng }, 15);
    } else if (activePerimeter.center) {
      smoothFlyTo(activePerimeter.center, activePerimeter.zoom || 11);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession, activePerimeter]);

  const handleCopyDirections = useCallback((session: SafetySession) => {
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${session.currentLocation.lat},${session.currentLocation.lng}`;
    navigator.clipboard.writeText(directionsUrl)
      .then(() => {
        notification.success({
          message: 'Directions Copied',
          description: 'Google Maps directions link has been copied to your clipboard.',
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
  }, []);

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
                    {/* Card Header: Avatar + User Name & Single Status Badge */}
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
                          {isEmergency ? 'Emergency' : isDistress ? 'Warning' : 'Active'}
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
                            {sess.addressName?.split(',')[0] || 'Start Location'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', fontWeight: 400, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {new Date(sess.lastPingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {/* Current Live GPS Node */}
                      <div className="route-node">
                        <div className="route-node-icon-end" style={{ left: '-1.2rem', width: '13px', height: '13px' }}>
                          <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: isEmergency ? 'var(--alert-red)' : isDistress ? 'var(--alert-amber)' : 'var(--primary)' }} />
                        </div>
                        <div style={{ overflow: 'hidden', paddingRight: '0.25rem' }}>
                          <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {sess.addressName || `${currentPoint.lat.toFixed(4)}, ${currentPoint.lng.toFixed(4)}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Phone Number & Direct Quick Action Triggers */}
                    <div style={{
                      marginTop: '0.35rem',
                      paddingTop: '0.35rem',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-sub)', fontWeight: 500 }}>
                        {sess.userPhone}
                      </div>

                      {/* Direct Quick Action Buttons (Telephone Dial & In-App Call) */}
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        <a
                          href={`tel:${sess.userPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '5px',
                            backgroundColor: 'var(--bg-subtle)',
                            border: '1px solid var(--border-hairline)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-main)',
                            textDecoration: 'none',
                          }}
                          title={`Dial ${sess.userPhone}`}
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
          zIndex: 25,
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
                {/* 1. Country Selector (Antd Searchable Single-Select) */}
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

                {/* 2. State Selector (Antd Searchable Single-Select) */}
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

                {/* 3. Community / Sector Selector (Antd Searchable Single-Select) */}
                <Select
                  showSearch
                  size="small"
                  variant="borderless"
                  filterOption={(input, option) =>
                    ((option as any)?.searchValue || '').toLowerCase().includes(input.toLowerCase())
                  }
                  disabled={jurisdictionSettings.countryCode === 'ALL' || jurisdictionSettings.stateCode === 'ALL'}
                  value={jurisdictionSettings.communityId}
                  onChange={(val) => updateJurisdictionSettings({
                    communityId: val,
                  })}
                  options={communityOptions}
                  style={{ width: 175, fontWeight: 700, fontSize: '0.75rem' }}
                  popupMatchSelectWidth={260}
                  placeholder="All Communities"
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

        {/* Google Maps Viewport */}
        <div 
          ref={mapContainerRef} 
          style={{ width: '100%', height: '100%', display: isGoogleMapLoaded ? 'block' : 'none' }} 
        />

        {/* Fallback Clean Radar Grid when Google Maps key is not present */}
        {!isGoogleMapLoaded && (
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

              {/* Active Community Perimeter Scope Highlight on Radar Scope */}
              {activePerimeter && activePerimeter.level === 'community' && (
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.94)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--accent-green-border-subtle)',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--accent-green-dark)',
                  zIndex: 15,
                }}>
                  <CountryFlag code={activePerimeter?.countryCode} size={12} />
                  <span>{activePerimeter.scopeLabel} • Area Selected ({activePerimeter.center.lat.toFixed(4)}, {activePerimeter.center.lng.toFixed(4)})</span>
                </div>
              )}

              {filteredSessions.map((sess, idx) => {
                const isEmergency = sess.status === 'emergency';
                const isDistress = sess.status === 'distress_pending';
                const isSelected = selectedSession?.id === sess.id;
                const initials = sess.userName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'US';

                // Offsets for the radar scope pins
                const xOffsets = [-120, 90, -40, 130, -100, 50];
                const yOffsets = [-80, -60, 80, 70, 30, -110];
                const x = xOffsets[idx % xOffsets.length];
                const y = yOffsets[idx % yOffsets.length];

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess)}
                    style={{
                      position: 'absolute',
                      transform: `translate(${x}px, ${y}px)`,
                      cursor: 'pointer',
                      zIndex: isSelected ? 20 : 10,
                      transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
                    }}
                  >
                    {/* Radar Ring */}
                    <div
                      className={
                        isEmergency
                          ? 'radar-ring radar-ring-red'
                          : isDistress
                          ? 'radar-ring radar-ring-amber'
                          : 'radar-ring radar-ring-green'
                      }
                      style={{
                        width: isEmergency ? '64px' : '48px',
                        height: isEmergency ? '64px' : '48px',
                        top: isEmergency ? '-32px' : '-24px',
                        left: isEmergency ? '-32px' : '-24px',
                      }}
                    />

                    {/* Floating Location Chip with Profile Avatar */}
                    <div
                      className="gmap-chip-tag"
                      style={{
                        position: 'relative',
                        transform: 'none',
                        borderColor: isSelected
                          ? 'var(--primary)'
                          : isEmergency
                          ? 'var(--alert-red)'
                          : 'var(--border-hairline)',
                        boxShadow: isSelected
                          ? '0 6px 22px rgba(16, 185, 129, 0.25)'
                          : '0 4px 18px rgba(15, 23, 42, 0.12)',
                      }}
                    >
                      <div
                        className={`profile-avatar ${
                          isEmergency
                            ? 'profile-avatar-emergency'
                            : isDistress
                            ? 'profile-avatar-distress'
                            : ''
                        }`}
                      >
                        {initials}
                        {isEmergency && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '-2px',
                              right: '-2px',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#EF4444',
                              border: '1.5px solid #FFFFFF',
                            }}
                          />
                        )}
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isEmergency ? '#DC2626' : '#0F172A',
                            lineHeight: 1.15,
                          }}
                        >
                          {sess.userName} {isEmergency ? '• Emergency' : ''}
                        </div>
                        <div
                          style={{
                            fontSize: '9.5px',
                            fontWeight: 400,
                            color: '#64748B',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '1px',
                          }}
                        >
                          {sess.addressName || 'Current Location'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                <span>Phone</span>
                <a href={`tel:${selectedSession.userPhone}`} style={{ color: 'var(--accent-green-dark)', fontWeight: 600, textDecoration: 'none' }}>
                  {selectedSession.userPhone}
                </a>
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
                href={`tel:${selectedSession.userPhone}`}
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center', padding: '0.4rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', color: 'var(--text-main)' }}
              >
                <TbDeviceLandlinePhone size={15} strokeWidth={2} />
                <span>Dial Number</span>
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
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSession.currentLocation.lat},${selectedSession.currentLocation.lng}`}
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
                  onClick={() => onResolveSession(selectedSession.id)}
                  className="btn btn-outline-green"
                  style={{ width: '100%', justifyContent: 'center', padding: '0.38rem 0.75rem', fontSize: '0.68rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <CheckCircle size={12} strokeWidth={2.2} />
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
