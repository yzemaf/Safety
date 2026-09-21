import 'location_point.dart';

class JurisdictionZone {
  final String id;
  final String name;
  final String code;
  final String countryCode;
  final String type; // 'country' | 'state' | 'community'
  final LocationPoint center;
  final double defaultZoom;

  const JurisdictionZone({
    required this.id,
    required this.name,
    required this.code,
    required this.countryCode,
    required this.type,
    required this.center,
    this.defaultZoom = 13.0,
  });

  factory JurisdictionZone.fromJson(Map<String, dynamic> json) {
    return JurisdictionZone(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      code: json['code'] ?? '',
      countryCode: json['countryCode'] ?? 'ALL',
      type: json['type'] ?? 'community',
      center: LocationPoint.fromJson(json['center'] ?? {'lat': 0.0, 'lng': 0.0}),
      defaultZoom: (json['zoom'] as num?)?.toDouble() ?? 13.0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'code': code,
      'countryCode': countryCode,
      'type': type,
      'center': center.toJson(),
      'zoom': defaultZoom,
    };
  }
}
