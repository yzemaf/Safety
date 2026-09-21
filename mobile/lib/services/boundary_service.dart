import 'dart:convert';
import 'dart:math' as math;
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/location_point.dart';

// Boundary Service for fetching and caching real-world GeoJSON administrative boundaries
// Direct port of admin/src/services/boundaryService.ts
// Uses OpenStreetMap / Nominatim API with fallback high-fidelity boundary polygons worldwide.

class GeoJsonFeature {
  final String name;
  final String? displayName;
  final String? category;
  final String? type;
  final String geometryType; // 'Polygon' | 'MultiPolygon' | 'Point'
  final dynamic coordinates;

  const GeoJsonFeature({
    required this.name,
    this.displayName,
    this.category,
    this.type,
    required this.geometryType,
    required this.coordinates,
  });
}

class GeoJsonFeatureCollection {
  final List<GeoJsonFeature> features;

  const GeoJsonFeatureCollection({required this.features});
}

class ResolvedCommunityBoundary {
  final String communityName;
  final String? stateName;
  final String? countryName;
  final String? countryCode;
  final List<LocationPoint> boundary;
  final bool isFromOsm;

  const ResolvedCommunityBoundary({
    required this.communityName,
    this.stateName,
    this.countryName,
    this.countryCode,
    required this.boundary,
    this.isFromOsm = false,
  });
}

class BoundaryService {
  static final Map<String, GeoJsonFeatureCollection> _boundaryCache = {};
  static final Map<String, ResolvedCommunityBoundary> _communityCache = {};

  /// Categories that represent single buildings, points of interest, or micro-nodes
  /// rather than geographical communities or administrative areas.
  static final Set<String> disallowedOsmCategories = {
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
  };


  /// Cleans and sanitizes names for precise OpenStreetMap Nominatim administrative matching
  static String sanitizePlaceName(String name) {
    if (name.isEmpty) return '';
    return name
        .replaceAll(RegExp(r'\s*\([^)]*\)'), '') // Remove parenthetical info
        .replaceAll(RegExp(r'\s*/\s*.*'), '') // Remove everything after slash
        .replaceAll(RegExp(r'\s*&.*'), '') // Remove everything after ampersand
        .replaceAll(
          RegExp(
            r'\b(Capital Sector|Commercial Core|Commercial Zone|Historic District|Financial District|Presidential District|Sports & Culture Hub|Express Corridor|Central Business|Midtown & Times Square|DUMBO & Heights|Central|Old GRA|Sector Landmark|Metro Zone|Area Council|LGA|Diplomatic Sector|Waterfront Hub|Satellite District|Airport Corridor|Port Corridor|Energy Hub|Industrial Zone|Industrial Sector|Marina Sector|Island Sector|Forest Sector|Military Zone|City Center|Capital Core|University Sector|Raffia City|Oil & Gas Sector|Sub-County|Sub County|Borough|Arrondissement)\b',
            caseSensitive: false,
          ),
          '',
        )
        .trim();
  }

  /// Builds an optimal, deduplicated search query string for OSM Nominatim administrative polygon matching
  static String buildJurisdictionQuery({
    String? countryName,
    String? stateName,
    String? communityName,
  }) {
    final List<String> parts = [];
    final Set<String> seen = {};

    void addPart(String? raw) {
      if (raw == null || raw.isEmpty) return;
      final clean = sanitizePlaceName(raw);
      if (clean.isEmpty) return;
      final normalized = clean
          .toLowerCase()
          .replaceAll(
            RegExp(r'\s*(city|state|county|province|district|region|division|republic|federal|territory)\b',
                caseSensitive: false),
            '',
          )
          .trim();
      if (normalized.isNotEmpty && !seen.contains(normalized)) {
        seen.add(normalized);
        parts.push(clean);
      }
    }

    addPart(communityName);
    addPart(stateName);
    if (countryName != null) {
      final cleanCountry = countryName.replaceAll(RegExp(r'[^\w\s]'), '').trim();
      final normCountry = cleanCountry.toLowerCase().trim();
      if (normCountry.isNotEmpty && !seen.contains(normCountry)) {
        seen.add(normCountry);
        parts.add(cleanCountry);
      }
    }

    return parts.join(', ');
  }

  /// Generates an organic, multi-vertex administrative boundary polygon around any GPS centroid
  /// using 3-lobe (12%) and 5-lobe (8%) harmonic geometric modulation matching admin/boundaryService.ts
  static List<LocationPoint> generatePerimeterPolygon({
    required LocationPoint center,
    double radiusKm = 3.5,
    int points = 24,
  }) {
    final List<LocationPoint> coords = [];
    const earthRadius = 6371.0; // km
    final latRad = (center.lat * math.pi) / 180.0;
    final lngRad = (center.lng * math.pi) / 180.0;

    for (int i = 0; i <= points; i++) {
      final angle = (i * 2.0 * math.pi) / points;
      // Organic geometric modulation (12% 3-lobe harmonic + 8% 5-lobe harmonic)
      // creates a realistic natural administrative contour rather than a plain circle
      final r = radiusKm * (1.0 + 0.12 * math.sin(3.0 * angle) + 0.08 * math.cos(5.0 * angle));
      final distRatio = r / earthRadius;

      final pLat = math.asin(
        math.sin(latRad) * math.cos(distRatio) +
            math.cos(latRad) * math.sin(distRatio) * math.cos(angle),
      );
      final pLng = lngRad +
          math.atan2(
            math.sin(angle) * math.sin(distRatio) * math.cos(latRad),
            math.cos(distRatio) - math.sin(latRad) * math.sin(pLat),
          );

      coords.add(
        LocationPoint(
          lat: (pLat * 180.0) / math.pi,
          lng: (pLng * 180.0) / math.pi,
        ),
      );
    }
    return coords;
  }

  /// Converts a Nominatim bounding box [minLat, maxLat, minLng, maxLng] into a smooth, organic boundary contour polygon
  /// (eliminates blocky squares, sharp chamfers, and rectangular artifacts)
  static List<LocationPoint> smoothBoundingPolygon(List<dynamic> bbox, {int points = 36}) {
    final minLat = double.tryParse(bbox[0].toString()) ?? 0.0;
    final maxLat = double.tryParse(bbox[1].toString()) ?? 0.0;
    final minLng = double.tryParse(bbox[2].toString()) ?? 0.0;
    final maxLng = double.tryParse(bbox[3].toString()) ?? 0.0;

    final centerLat = (minLat + maxLat) / 2.0;
    final centerLng = (minLng + maxLng) / 2.0;
    final rLatKm = math.max(1.2, haversineDistanceKm(centerLat, centerLng, maxLat, centerLng));
    final rLngKm = math.max(1.2, haversineDistanceKm(centerLat, centerLng, centerLat, maxLng));

    final List<LocationPoint> coords = [];
    for (int i = 0; i <= points; i++) {
      final angle = (i * 2.0 * math.pi) / points;
      final rMod = 1.0 + 0.08 * math.sin(3.0 * angle) + 0.05 * math.cos(5.0 * angle);
      final dLatKm = rLatKm * rMod * math.sin(angle);
      final dLngKm = rLngKm * rMod * math.cos(angle);
      final pLat = centerLat + (dLatKm / 110.574);
      final pLng = centerLng + (dLngKm / (111.320 * math.cos((centerLat * math.pi) / 180.0)));
      coords.add(LocationPoint(lat: pLat, lng: pLng));
    }
    return coords;
  }

  /// Backwards-compatible alias for smooth bounding polygon
  static List<LocationPoint> boundingBoxToPolygon(List<dynamic> bbox) => smoothBoundingPolygon(bbox);

  /// Calculates great-circle distance in kilometers between two GPS coordinates
  static double haversineDistanceKm(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const r = 6371.0; // Earth's radius in km
    final dLat = ((lat2 - lat1) * math.pi) / 180.0;
    final dLon = ((lon2 - lon1) * math.pi) / 180.0;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos((lat1 * math.pi) / 180.0) *
            math.cos((lat2 * math.pi) / 180.0) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return r * c;
  }

  /// Computes the centroid of a polygon (list of [lng, lat] coordinate pairs)
  static ({double lat, double lng}) _polygonCentroid(List coords) {
    double sumLat = 0, sumLng = 0;
    int count = 0;
    for (final pt in coords) {
      if (pt is List && pt.length >= 2) {
        sumLng += (pt[0] as num).toDouble();
        sumLat += (pt[1] as num).toDouble();
        count++;
      }
    }
    if (count == 0) return (lat: 0.0, lng: 0.0);
    return (lat: sumLat / count, lng: sumLng / count);
  }

  /// Ray-casting point-in-polygon test (2D)
  /// Returns true if (lat, lng) is inside the polygon whose vertices are [[lng, lat], ...]
  static bool _pointInPolygon(double lat, double lng, List ring) {
    bool inside = false;
    int n = ring.length;
    for (int i = 0, j = n - 1; i < n; j = i++) {
      final vi = ring[i];
      final vj = ring[j];
      if (vi is! List || vj is! List) continue;
      final xi = (vi[0] as num).toDouble(); // lng
      final yi = (vi[1] as num).toDouble(); // lat
      final xj = (vj[0] as num).toDouble();
      final yj = (vj[1] as num).toDouble();
      final intersects = ((yi > lat) != (yj > lat)) &&
          (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /// Fetches real administrative boundary GeoJSON from Nominatim OSM API with fallback polygon synthesis
  /// Matching exact query and filtering from admin boundaryService.ts
  static Future<GeoJsonFeatureCollection?> fetchRealBoundaryGeoJson({
    required String query,
    LocationPoint? fallbackCenter,
    String level = 'community',
  }) async {
    final cacheKey = '${query.toLowerCase().trim()}::$level';
    if (_boundaryCache.containsKey(cacheKey)) {
      return _boundaryCache[cacheKey];
    }

    // For community level: use tighter distance guard (8km) so Lagos city doesn't swallow a neighbourhood
    final maxDistanceKm = level == 'country' ? 800.0 : level == 'state' ? 180.0 : 8.0;
    final minSpanDegrees = level == 'country' ? 0.80 : level == 'state' ? 0.15 : 0.010;
    // community maxSpan raised slightly so dense African neighbourhoods are not rejected
    final maxSpanDegrees = level == 'country' ? 80.0 : level == 'state' ? 15.0 : 0.30;

    try {
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/search?q=${Uri.encodeComponent(query)}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.002&limit=8',
      );

      final res = await http.get(
        url,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Safety-Mobile-App/1.0',
        },
      ).timeout(const Duration(seconds: 4));

      if (res.statusCode == 200) {
        final List data = jsonDecode(res.body);
        if (data.isNotEmpty) {
          // PASS 1: Prioritize genuine official GeoJSON Polygon or MultiPolygon across all returned results
          for (final item in data) {
            final category = item['category']?.toString() ?? '';
            if (disallowedOsmCategories.contains(category)) continue;

            final itemLat = double.tryParse(item['lat']?.toString() ?? '');
            final itemLng = double.tryParse(item['lon']?.toString() ?? '');

            if (fallbackCenter != null && itemLat != null && itemLng != null) {
              final dist = haversineDistanceKm(fallbackCenter.lat, fallbackCenter.lng, itemLat, itemLng);
              if (dist > maxDistanceKm) continue;
            }

            final geojson = item['geojson'];
            final bbox = item['boundingbox'];

            if (geojson != null && (geojson['type'] == 'Polygon' || geojson['type'] == 'MultiPolygon')) {
              if (bbox is List && bbox.length == 4) {
                final spanLat = (double.tryParse(bbox[1].toString()) ?? 0) - (double.tryParse(bbox[0].toString()) ?? 0);
                final spanLng = (double.tryParse(bbox[3].toString()) ?? 0) - (double.tryParse(bbox[2].toString()) ?? 0);
                final span = math.max(spanLat.abs(), spanLng.abs());
                if (span < minSpanDegrees) continue;
              }

              final featureCollection = GeoJsonFeatureCollection(
                features: [
                  GeoJsonFeature(
                    name: item['name']?.toString() ?? query,
                    displayName: item['display_name']?.toString(),
                    category: category,
                    type: item['type']?.toString(),
                    geometryType: geojson['type'],
                    coordinates: geojson['coordinates'],
                  ),
                ],
              );
              _boundaryCache[cacheKey] = featureCollection;
              return featureCollection;
            }
          }

          // PASS 2: If no Polygon was available, construct smooth natural organic perimeter from bounding box
          for (final item in data) {
            final category = item['category']?.toString() ?? '';
            if (disallowedOsmCategories.contains(category)) continue;

            final itemLat = double.tryParse(item['lat']?.toString() ?? '');
            final itemLng = double.tryParse(item['lon']?.toString() ?? '');

            if (fallbackCenter != null && itemLat != null && itemLng != null) {
              final dist = haversineDistanceKm(fallbackCenter.lat, fallbackCenter.lng, itemLat, itemLng);
              if (dist > maxDistanceKm) continue;
            }

            final bbox = item['boundingbox'];
            if (bbox is List && bbox.length == 4) {
              final spanLat = (double.tryParse(bbox[1].toString()) ?? 0) - (double.tryParse(bbox[0].toString()) ?? 0);
              final spanLng = (double.tryParse(bbox[3].toString()) ?? 0) - (double.tryParse(bbox[2].toString()) ?? 0);
              final span = math.max(spanLat.abs(), spanLng.abs());
              if (span >= minSpanDegrees && span <= maxSpanDegrees) {
                final polyCoords = smoothBoundingPolygon(bbox, points: 36);
                final featureCollection = GeoJsonFeatureCollection(
                  features: [
                    GeoJsonFeature(
                      name: item['name']?.toString() ?? query,
                      displayName: item['display_name']?.toString(),
                      geometryType: 'Polygon',
                      coordinates: [polyCoords.map((pt) => [pt.lng, pt.lat]).toList()],
                    ),
                  ],
                );
                _boundaryCache[cacheKey] = featureCollection;
                return featureCollection;
              }
            }
          }
        }
      }
    } catch (_) {}

    // 3. Fallback: synthesize high-fidelity perimeter polygon if fallbackCenter provided
    if (fallbackCenter != null) {
      final radius = level == 'country' ? 220.0 : level == 'state' ? 45.0 : 3.8;
      final polyCoords = generatePerimeterPolygon(center: fallbackCenter, radiusKm: radius, points: 32);
      final featureCollection = GeoJsonFeatureCollection(
        features: [
          GeoJsonFeature(
            name: query,
            geometryType: 'Polygon',
            coordinates: [polyCoords.map((pt) => [pt.lng, pt.lat]).toList()],
          ),
        ],
      );
      _boundaryCache[cacheKey] = featureCollection;
      return featureCollection;
    }

    return null;
  }

  /// Extracts the first coordinate ring from a GeoJSON FeatureCollection as raw dynamic list
  static List? _extractFirstRing(GeoJsonFeatureCollection geoJson) {
    for (final feature in geoJson.features) {
      final type = feature.geometryType;
      final coords = feature.coordinates;
      if (type == 'Polygon' && coords is List && coords.isNotEmpty) {
        final ring = coords[0];
        if (ring is List && ring.length >= 3) return ring;
      } else if (type == 'MultiPolygon' && coords is List && coords.isNotEmpty) {
        final poly = coords[0];
        if (poly is List && poly.isNotEmpty) {
          final ring = poly[0];
          if (ring is List && ring.length >= 3) return ring;
        }
      }
    }
    return null;
  }

  /// Converts GeoJSON FeatureCollection coordinates to LocationPoint polygon paths
  static List<List<LocationPoint>> geoJsonToPolygonPaths(GeoJsonFeatureCollection geoJson) {
    final List<List<LocationPoint>> paths = [];
    for (final feature in geoJson.features) {
      final type = feature.geometryType;
      final coords = feature.coordinates;

      if (type == 'Polygon' && coords is List) {
        for (final ring in coords) {
          if (ring is List && ring.length >= 3) {
            final List<LocationPoint> ringPoints = [];
            for (final pt in ring) {
              if (pt is List && pt.length >= 2) {
                ringPoints.add(LocationPoint(
                  lng: (pt[0] as num).toDouble(),
                  lat: (pt[1] as num).toDouble(),
                ));
              }
            }
            if (ringPoints.length >= 3) paths.add(ringPoints);
          }
        }
      } else if (type == 'MultiPolygon' && coords is List) {
        for (final poly in coords) {
          if (poly is List) {
            for (final ring in poly) {
              if (ring is List && ring.length >= 3) {
                final List<LocationPoint> ringPoints = [];
                for (final pt in ring) {
                  if (pt is List && pt.length >= 2) {
                    ringPoints.add(LocationPoint(
                      lng: (pt[0] as num).toDouble(),
                      lat: (pt[1] as num).toDouble(),
                    ));
                  }
                }
                if (ringPoints.length >= 3) paths.add(ringPoints);
              }
            }
          }
        }
      }
    }
    return paths;
  }

  static void clearCache() {
    _boundaryCache.clear();
    _communityCache.clear();
  }

  /// Fully dynamic, universal worldwide community resolution for ANY latitude/longitude coordinate
  /// Extracts the genuine neighborhood / locality / administrative area anywhere on Earth.
  static Future<ResolvedCommunityBoundary> resolveCommunityForLocation(
    LocationPoint location, {
    String? communityHint,
    bool forceRefresh = false,
  }) async {
    final cacheKey = '${location.lat.toStringAsFixed(3)},${location.lng.toStringAsFixed(3)}';
    if (forceRefresh) {
      _communityCache.remove(cacheKey);
    } else if (communityHint == null && _communityCache.containsKey(cacheKey)) {
      return _communityCache[cacheKey]!;
    }

    String detectedCommunity = '';
    String detectedState = '';
    String detectedCountry = '';
    String detectedCountryCode = '';

    if (communityHint != null && communityHint.trim().isNotEmpty) {
      detectedCommunity = sanitizePlaceName(communityHint.trim());
    }

    // 1. Try Google Maps Reverse Geocoding first (100% precision & parity with Admin Google Places)
    if (AppConstants.googleMapsApiKey.isNotEmpty) {
      try {
        final googleUrl = Uri.parse(
          'https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${AppConstants.googleMapsApiKey}',
        );
        final res = await http.get(googleUrl).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final Map<String, dynamic> data = jsonDecode(res.body);
          final results = data['results'] as List? ?? [];
          if (results.isNotEmpty) {
            for (final r in results) {
              final formatted = (r['formatted_address'] as String? ?? '').toLowerCase();
              final components = (r['address_components'] as List? ?? []).cast<Map<String, dynamic>>();
              String? n;
              String? sub2;
              String? sub1;
              String? sub;
              String? admin3;
              String? lga;
              String? loc;

              for (final c in components) {
                final types = (c['types'] as List? ?? []).cast<String>();
                final longName = (c['long_name'] as String? ?? '').trim();
                final shortName = (c['short_name'] as String? ?? '').trim();

                if (types.contains('neighborhood') && n == null && longName.isNotEmpty) {
                  n = longName;
                } else if (types.contains('sublocality_level_2') && sub2 == null && longName.isNotEmpty) {
                  sub2 = longName;
                } else if (types.contains('sublocality_level_1') && sub1 == null && longName.isNotEmpty) {
                  sub1 = longName;
                } else if (types.contains('sublocality') && sub == null && longName.isNotEmpty) {
                  sub = longName;
                } else if (types.contains('administrative_area_level_3') && admin3 == null && longName.isNotEmpty) {
                  admin3 = longName;
                } else if (types.contains('administrative_area_level_2') && lga == null && longName.isNotEmpty) {
                  lga = longName;
                } else if (types.contains('locality') && loc == null && longName.isNotEmpty) {
                  loc = longName;
                }

                if (types.contains('administrative_area_level_1') && detectedState.isEmpty) {
                  detectedState = longName;
                }
                if (types.contains('country') && detectedCountry.isEmpty) {
                  detectedCountry = longName;
                  detectedCountryCode = shortName.toUpperCase();
                }
              }

              // Check if administrative_area_level_3 contains dual parts like "Idimu/Isheri Olofin"
              String? resolvedAdmin3;
              if (admin3 != null && admin3.isNotEmpty) {
                if (admin3.contains('/')) {
                  final parts = admin3.split('/').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
                  if (parts.length >= 2) {
                    // If address has the second part, choose it; otherwise preserve the combined or prominent part
                    final matched = parts.firstWhere(
                      (p) => formatted.contains(p.toLowerCase()),
                      orElse: () => parts.last,
                    );
                    resolvedAdmin3 = matched;
                  } else {
                    resolvedAdmin3 = admin3;
                  }
                } else {
                  resolvedAdmin3 = admin3;
                }
              }

              // Extract the most specific locality identifier from the highest precision result
              final specific = n ?? sub2 ?? resolvedAdmin3 ?? sub1 ?? sub ?? lga ?? loc;
              if (detectedCommunity.isEmpty && specific != null && specific.isNotEmpty) {
                detectedCommunity = specific;
                break; // Do NOT fall through to broader postal delivery zones
              }
            }
          }
        }
      } catch (_) {}
    }

    // 2. Fallback to OpenStreetMap Nominatim reverse geocode if needed
    if (detectedCommunity.isEmpty) {
      try {
        final osmRevUrl = Uri.parse(
          'https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=jsonv2',
        );
        final res = await http.get(
          osmRevUrl,
          headers: {'User-Agent': 'Safety-Mobile-App/1.0', 'Accept': 'application/json'},
        ).timeout(const Duration(seconds: 4));

        if (res.statusCode == 200) {
          final Map<String, dynamic> data = jsonDecode(res.body);
          final addr = data['address'] as Map<String, dynamic>? ?? {};

          detectedCommunity = addr['suburb'] ??
              addr['neighbourhood'] ??
              addr['residential'] ??
              addr['quarter'] ??
              addr['city_district'] ??
              addr['city'] ??
              addr['town'] ??
              addr['village'] ??
              '';
          if (detectedState.isEmpty) {
            detectedState = addr['state'] ?? addr['county'] ?? addr['province'] ?? '';
          }
          if (detectedCountry.isEmpty) {
            detectedCountry = addr['country'] ?? '';
            detectedCountryCode = (addr['country_code'] ?? '').toString().toUpperCase();
          }
        }
      } catch (_) {}
    }

    if (detectedCommunity.isEmpty) {
      detectedCommunity = 'My Community';
    }

    // Asynchronously query real OpenStreetMap administrative boundary polygon
    final query = buildJurisdictionQuery(
      countryName: detectedCountry,
      stateName: detectedState,
      communityName: detectedCommunity,
    );

    List<LocationPoint> boundary = [];
    bool isFromOsm = false;

    final geoJson = await fetchRealBoundaryGeoJson(
      query: query.isNotEmpty ? query : detectedCommunity,
      fallbackCenter: location,
      level: 'community',
    );

    if (geoJson != null) {
      // Find the raw ring from the original GeoJSON to run point-in-polygon tests
      final rawRing = _extractFirstRing(geoJson);
      final paths = geoJsonToPolygonPaths(geoJson);

      if (paths.isNotEmpty && paths[0].length >= 3 && rawRing != null) {
        // 1. Centroid must be within 8 km of the user's GPS position
        final centroid = _polygonCentroid(rawRing);
        final centroidDist = haversineDistanceKm(
            location.lat, location.lng, centroid.lat, centroid.lng);

        // 2. User's GPS point must actually be INSIDE the returned polygon
        //    (or centroid is very close meaning it's a tiny neighbourhood)
        final userInsidePoly = _pointInPolygon(location.lat, location.lng, rawRing);

        if (centroidDist <= 8.0 && (userInsidePoly || centroidDist <= 3.5)) {
          boundary = paths[0];
          isFromOsm = true;
        }
      }
    }

    if (boundary.isEmpty) {
      boundary = generatePerimeterPolygon(center: location, radiusKm: 3.5, points: 28);
    }

    final resolved = ResolvedCommunityBoundary(
      communityName: detectedCommunity,
      stateName: detectedState.isNotEmpty ? detectedState : null,
      countryName: detectedCountry.isNotEmpty ? detectedCountry : null,
      countryCode: detectedCountryCode.isNotEmpty ? detectedCountryCode : null,
      boundary: boundary,
      isFromOsm: isFromOsm,
    );

    _communityCache[cacheKey] = resolved;
    return resolved;
  }

  /// Instant synchronous fallback while async boundary loads
  static ResolvedCommunityBoundary getImmediatePerimeter(LocationPoint location, {bool forceRefresh = false}) {
    final cacheKey = '${location.lat.toStringAsFixed(3)},${location.lng.toStringAsFixed(3)}';
    if (!forceRefresh && _communityCache.containsKey(cacheKey)) {
      return _communityCache[cacheKey]!;
    }

    final boundary = generatePerimeterPolygon(center: location, radiusKm: 3.5, points: 28);
    return ResolvedCommunityBoundary(
      communityName: '${location.lat.toStringAsFixed(3)}, ${location.lng.toStringAsFixed(3)}',
      boundary: boundary,
    );
  }
}

extension<T> on List<T> {
  void push(T element) => add(element);
}
