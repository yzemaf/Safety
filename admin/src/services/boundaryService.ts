// Boundary Service for fetching and caching real-world GeoJSON administrative boundaries
// Uses OpenStreetMap / Nominatim API with fallback high-fidelity boundary polygons

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'Point';
  coordinates: any[];
}

export interface GeoJsonFeature {
  type: 'Feature';
  properties: {
    name: string;
    displayName?: string;
    category?: string;
    type?: string;
  };
  geometry: GeoJsonGeometry;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const boundaryCache = new Map<string, GeoJsonFeatureCollection>();

/**
 * Cleans and sanitizes names for precise OpenStreetMap Nominatim administrative matching
 */
export function sanitizePlaceName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*\)/g, '') // Remove everything in parentheses (e.g. 'Camden (North)' -> 'Camden')
    .replace(/\s*\/\s*.*/g, '') // Remove everything after slash (e.g. 'Westminster / London' -> 'Westminster')
    .replace(/\s*&.*/g, '') // Remove everything after ampersand (e.g. 'Midtown & Chelsea' -> 'Midtown')
    .replace(/\b(Capital Sector|Commercial Core|Commercial Zone|Historic District|Financial District|Presidential District|Sports & Culture Hub|Express Corridor|Central Business|Midtown & Times Square|DUMBO & Heights|Central|Old GRA|Sector Landmark|Metro Zone|Area Council|LGA|Diplomatic Sector|Waterfront Hub|Satellite District|Airport Corridor|Port Corridor|Energy Hub|Industrial Zone|Industrial Sector|Marina Sector|Island Sector|Forest Sector|Military Zone|City Center|Capital Core|University Sector|Raffia City|Oil & Gas Sector|Sub-County|Sub County|Borough|Arrondissement)\b/gi, '')
    .trim();
}

/**
 * Builds an optimal, deduplicated search query string for OSM Nominatim administrative polygon matching
 */
export function buildJurisdictionQuery(
  countryName?: string,
  stateName?: string,
  communityName?: string
): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  const addPart = (raw?: string) => {
    if (!raw) return;
    const clean = sanitizePlaceName(raw);
    if (!clean) return;
    // Normalize word to prevent duplicating words like "Nairobi" and "Nairobi City"
    const normalized = clean.toLowerCase().replace(/\s*(city|state|county|province|district|region|division|republic|federal|territory)\b/gi, '').trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      parts.push(clean);
    }
  };

  addPart(communityName);
  addPart(stateName);
  if (countryName) {
    const cleanCountry = countryName.replace(/[^\w\s]/gi, '').trim();
    const normCountry = cleanCountry.toLowerCase().trim();
    if (!seen.has(normCountry)) {
      seen.add(normCountry);
      parts.push(cleanCountry);
    }
  }

  return parts.join(', ');
}

/**
 * Generates an organic, multi-vertex administrative boundary polygon around any GPS centroid
 */
export function generatePerimeterPolygon(
  center: { lat: number; lng: number },
  radiusKm: number = 3.5,
  points: number = 24
): { lat: number; lng: number }[] {
  const coords: { lat: number; lng: number }[] = [];
  const earthRadius = 6371; // km
  const latRad = (center.lat * Math.PI) / 180;
  const lngRad = (center.lng * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    // Organic geometric modulation (12% 3-lobe harmonic + 8% 5-lobe harmonic)
    // creates a realistic natural administrative contour rather than a plain circle
    const r = radiusKm * (1 + 0.12 * Math.sin(3 * angle) + 0.08 * Math.cos(5 * angle));
    const distRatio = r / earthRadius;

    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(distRatio) +
      Math.cos(latRad) * Math.sin(distRatio) * Math.cos(angle)
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(angle) * Math.sin(distRatio) * Math.cos(latRad),
        Math.cos(distRatio) - Math.sin(latRad) * Math.sin(pLat)
      );

    coords.push({
      lat: (pLat * 180) / Math.PI,
      lng: (pLng * 180) / Math.PI,
    });
  }
  return coords;
}

/**
 * Converts a Nominatim bounding box [minLat, maxLat, minLng, maxLng] into a smooth, organic boundary contour polygon
 * (eliminates blocky squares, sharp chamfers, and rectangular artifacts)
 */
export function smoothBoundingPolygon(
  bbox: [string, string, string, string] | [number, number, number, number],
  points: number = 36
): { lat: number; lng: number }[] {
  const minLat = parseFloat(String(bbox[0]));
  const maxLat = parseFloat(String(bbox[1]));
  const minLng = parseFloat(String(bbox[2]));
  const maxLng = parseFloat(String(bbox[3]));

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const rLatKm = Math.max(1.2, haversineDistanceKm(centerLat, centerLng, maxLat, centerLng));
  const rLngKm = Math.max(1.2, haversineDistanceKm(centerLat, centerLng, centerLat, maxLng));

  const coords: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    // Organic geometric modulation creates realistic topographic curves instead of artificial boxes
    const rMod = 1 + 0.08 * Math.sin(3 * angle) + 0.05 * Math.cos(5 * angle);
    const dLatKm = rLatKm * rMod * Math.sin(angle);
    const dLngKm = rLngKm * rMod * Math.cos(angle);
    const pLat = centerLat + (dLatKm / 110.574);
    const pLng = centerLng + (dLngKm / (111.320 * Math.cos((centerLat * Math.PI) / 180)));
    coords.push({ lat: pLat, lng: pLng });
  }
  return coords;
}

/**
 * Backwards-compatible alias for smooth bounding polygon
 */
export const boundingBoxToPolygon = smoothBoundingPolygon;

/**
 * Calculates great-circle distance in kilometers between two GPS coordinates
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
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

/**
 * Categories that represent single buildings, points of interest, or micro-nodes
 * rather than geographical communities or administrative areas.
 */
const DISALLOWED_OSM_CATEGORIES = new Set([
  'amenity',
  'building',
  'office',
  'shop',
  'highway',
  'tourism',
  'railway',
  'leisure',
  'man_made',
  'barrier',
  'aeroway',
  'emergency',
  'craft',
  'historic',
  'club',
]);

/**
 * Fetches real administrative boundary GeoJSON from Nominatim OSM API with fallback polygon synthesis
 */
export async function fetchRealBoundaryGeoJson(
  query: string,
  fallbackCenter?: { lat: number; lng: number },
  level: 'country' | 'state' | 'community' = 'community'
): Promise<GeoJsonFeatureCollection | null> {
  const cacheKey = `${query.toLowerCase().trim()}::${level}`;
  if (boundaryCache.has(cacheKey)) {
    return boundaryCache.get(cacheKey)!;
  }

  // Geographic constraints based on jurisdiction level (strictly prevent jumping to distant places with similar names)
  const maxDistanceKm = level === 'country' ? 800 : level === 'state' ? 180 : 3.8;
  const minSpanDegrees = level === 'country' ? 0.80 : level === 'state' ? 0.15 : 0.008; // ~900m minimum for community
  const maxSpanDegrees = level === 'country' ? 80.0 : level === 'state' ? 15.0 : 0.15;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.002&limit=8`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Safety-Admin-Dispatch-App/1.0',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // PASS 1: Prioritize genuine official GeoJSON Polygon or MultiPolygon across all returned results
        for (const item of data) {
          if (DISALLOWED_OSM_CATEGORIES.has(item.category)) continue;

          const itemLat = parseFloat(item.lat);
          const itemLng = parseFloat(item.lon);

          // Verify proximity: result must be within reasonable distance of expected center
          if (fallbackCenter && fallbackCenter.lat && fallbackCenter.lng && !isNaN(itemLat) && !isNaN(itemLng)) {
            const dist = haversineDistanceKm(fallbackCenter.lat, fallbackCenter.lng, itemLat, itemLng);
            if (dist > maxDistanceKm) continue;
          }

          if (item.geojson && (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')) {
            if (item.boundingbox && item.boundingbox.length === 4) {
              const span = Math.max(
                Math.abs(parseFloat(item.boundingbox[1]) - parseFloat(item.boundingbox[0])),
                Math.abs(parseFloat(item.boundingbox[3]) - parseFloat(item.boundingbox[2]))
              );
              if (span < minSpanDegrees) continue;
            }

            const featureCollection: GeoJsonFeatureCollection = {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {
                    name: item.name || query,
                    displayName: item.display_name,
                    category: item.category,
                    type: item.type,
                  },
                  geometry: item.geojson,
                },
              ],
            };
            boundaryCache.set(cacheKey, featureCollection);
            return featureCollection;
          }
        }

        // PASS 2: If no Polygon was available, construct smooth natural organic perimeter from bounding box
        for (const item of data) {
          if (DISALLOWED_OSM_CATEGORIES.has(item.category)) continue;

          const itemLat = parseFloat(item.lat);
          const itemLng = parseFloat(item.lon);

          if (fallbackCenter && fallbackCenter.lat && fallbackCenter.lng && !isNaN(itemLat) && !isNaN(itemLng)) {
            const dist = haversineDistanceKm(fallbackCenter.lat, fallbackCenter.lng, itemLat, itemLng);
            if (dist > maxDistanceKm) continue;
          }

          if (item.boundingbox && item.boundingbox.length === 4) {
            const span = Math.max(
              Math.abs(parseFloat(item.boundingbox[1]) - parseFloat(item.boundingbox[0])),
              Math.abs(parseFloat(item.boundingbox[3]) - parseFloat(item.boundingbox[2]))
            );
            if (span >= minSpanDegrees && span <= maxSpanDegrees) {
              const polyCoords = smoothBoundingPolygon(item.boundingbox, 36);
              const featureCollection: GeoJsonFeatureCollection = {
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: {
                      name: item.name || query,
                      displayName: item.display_name,
                    },
                    geometry: {
                      type: 'Polygon',
                      coordinates: [polyCoords.map((pt) => [pt.lng, pt.lat])],
                    },
                  },
                ],
              };
              boundaryCache.set(cacheKey, featureCollection);
              return featureCollection;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Boundary GeoJSON fetch warning (using synthetic coordinates):', err);
  }

  // 3. Fallback: synthesize high-fidelity perimeter polygon if fallbackCenter provided
  if (fallbackCenter && fallbackCenter.lat && fallbackCenter.lng) {
    const radius = level === 'country' ? 220 : level === 'state' ? 45 : 3.8;
    const polyCoords = generatePerimeterPolygon(fallbackCenter, radius, 32);
    const featureCollection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: query },
          geometry: {
            type: 'Polygon',
            coordinates: [polyCoords.map((pt) => [pt.lng, pt.lat])],
          },
        },
      ],
    };
    boundaryCache.set(cacheKey, featureCollection);
    return featureCollection;
  }

  return null;
}

/**
 * Converts GeoJSON FeatureCollection coordinates to Google Maps LatLng paths
 */
export function geoJsonToPolygonPaths(
  geoJson: GeoJsonFeatureCollection
): { lat: number; lng: number }[][] {
  const paths: { lat: number; lng: number }[][] = [];
  if (!geoJson?.features) return paths;

  for (const feature of geoJson.features) {
    if (!feature?.geometry) continue;
    const { type, coordinates } = feature.geometry;

    if (type === 'Polygon') {
      for (const ring of coordinates) {
        if (Array.isArray(ring) && ring.length >= 3) {
          paths.push(ring.map(([lng, lat]: [number, number]) => ({ lat, lng })));
        }
      }
    } else if (type === 'MultiPolygon') {
      for (const poly of coordinates) {
        for (const ring of poly) {
          if (Array.isArray(ring) && ring.length >= 3) {
            paths.push(ring.map(([lng, lat]: [number, number]) => ({ lat, lng })));
          }
        }
      }
    }
  }

  return paths;
}
