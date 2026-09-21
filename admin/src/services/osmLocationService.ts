// OpenStreetMap Nominatim Location & Community Search Service
// Replaces Google Places & Google Geocoding with zero API key dependencies

export interface OsmPlaceResult {
  id: string;
  name: string;
  fullName: string;
  lat: number;
  lng: number;
  distanceKm?: number;
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export async function searchOsmPlaces(
  query: string,
  countryCode?: string,
  stateName?: string,
  userLoc?: { lat: number; lng: number }
): Promise<OsmPlaceResult[]> {
  if (!query || query.trim().length < 2) return [];

  const clean = query.trim();
  let searchTerms = clean;
  if (stateName && stateName !== 'ALL' && !clean.toLowerCase().includes(stateName.toLowerCase())) {
    searchTerms = `${clean}, ${stateName}`;
  }

  const countryParam = countryCode && countryCode !== 'ALL' ? `&countrycodes=${countryCode.toLowerCase()}` : '';

  // 1. Dynamic Regional Viewbox: ~400km bounding box around user's active GPS / perimeter center
  let viewboxParam = '';
  if (userLoc && (userLoc.lat !== 0 || userLoc.lng !== 0)) {
    const left = userLoc.lng - 4.0;
    const right = userLoc.lng + 4.0;
    const top = userLoc.lat + 4.0;
    const bottom = userLoc.lat - 4.0;
    viewboxParam = `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerms)}&format=jsonv2&addressdetails=1&limit=15${countryParam}${viewboxParam}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const results: OsmPlaceResult[] = [];

    for (const item of data) {
      const addr = item.address || {};
      const shortName =
        addr.city ||
        addr.town ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.village ||
        addr.road ||
        addr.county ||
        item.name ||
        item.display_name.split(',')[0].trim();
      const norm = shortName.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        let distanceKm: number | undefined;

        if (userLoc && !isNaN(lat) && !isNaN(lng) && (userLoc.lat !== 0 || userLoc.lng !== 0)) {
          distanceKm = calculateDistanceKm(userLoc.lat, userLoc.lng, lat, lng);
        }

        results.push({
          id: `osm-${item.place_id || item.osm_id || Math.random()}`,
          name: shortName,
          fullName: item.display_name,
          lat,
          lng,
          distanceKm,
        });
      }
    }

    // 2. Distance-Based Sorting: places closest to current location appear at the top
    if (userLoc && (userLoc.lat !== 0 || userLoc.lng !== 0)) {
      results.sort((a, b) => {
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm;
        }
        return 0;
      });
    }

    return results;
  } catch (err) {
    console.warn('OSM Nominatim search error:', err);
    return [];
  }
}
