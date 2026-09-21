import 'dart:math';
import 'package:latlong2/latlong.dart';

class LocationPoint {
  final double lat;
  final double lng;

  const LocationPoint({
    required this.lat,
    required this.lng,
  });

  factory LocationPoint.fromJson(Map<String, dynamic> json) {
    if (json.containsKey('coordinates') && json['coordinates'] is List) {
      final coords = json['coordinates'] as List;
      // GeoJSON [longitude, latitude]
      return LocationPoint(
        lng: (coords[0] as num).toDouble(),
        lat: (coords[1] as num).toDouble(),
      );
    }
    return LocationPoint(
      lat: (json['lat'] as num?)?.toDouble() ?? 0.0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lat': lat,
      'lng': lng,
    };
  }

  Map<String, dynamic> toGeoJson() {
    return {
      'type': 'Point',
      'coordinates': [lng, lat],
    };
  }

  LatLng toLatLng() {
    return LatLng(lat, lng);
  }

  /// Calculates distance in meters using Haversine formula
  double distanceTo(LocationPoint other) {
    const double earthRadius = 6371000; // in meters
    final dLat = _toRadians(other.lat - lat);
    final dLng = _toRadians(other.lng - lng);

    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRadians(lat)) *
            cos(_toRadians(other.lat)) *
            sin(dLng / 2) *
            sin(dLng / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));

    return earthRadius * c;
  }

  double _toRadians(double degrees) {
    return degrees * (pi / 180.0);
  }
}
