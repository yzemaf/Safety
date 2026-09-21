import 'location_point.dart';

enum SessionStatus {
  active,
  distressPending,
  emergency,
  resolved,
  cancelled;

  String get value {
    switch (this) {
      case SessionStatus.active:
        return 'active';
      case SessionStatus.distressPending:
        return 'distress_pending';
      case SessionStatus.emergency:
        return 'emergency';
      case SessionStatus.resolved:
        return 'resolved';
      case SessionStatus.cancelled:
        return 'cancelled';
    }
  }

  static SessionStatus fromString(String? val) {
    switch (val) {
      case 'active':
        return SessionStatus.active;
      case 'distress_pending':
        return SessionStatus.distressPending;
      case 'emergency':
        return SessionStatus.emergency;
      case 'resolved':
        return SessionStatus.resolved;
      case 'cancelled':
        return SessionStatus.cancelled;
      default:
        return SessionStatus.active;
    }
  }
}

class BreadcrumbPoint {
  final LocationPoint location;
  final DateTime recordedAt;

  const BreadcrumbPoint({
    required this.location,
    required this.recordedAt,
  });

  factory BreadcrumbPoint.fromJson(Map<String, dynamic> json) {
    return BreadcrumbPoint(
      location: LocationPoint.fromJson(json),
      recordedAt: json['recordedAt'] != null
          ? DateTime.tryParse(json['recordedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lat': location.lat,
      'lng': location.lng,
      'recordedAt': recordedAt.toIso8601String(),
    };
  }
}

class SafetySession {
  final String id;
  final String userId;
  final String userName;
  final String? userPhone;
  final String? userEmail;
  final SessionStatus status;
  final int batteryLevel;
  final DateTime lastPingAt;
  final DateTime nextPromptDueAt;
  final DateTime? emergencyTriggeredAt;
  final LocationPoint currentLocation;
  final String? addressName;
  final String? countryCode;
  final String? stateCode;
  final String? communityId;
  final List<BreadcrumbPoint> breadcrumbs;
  final String? agoraChannelName;

  const SafetySession({
    required this.id,
    required this.userId,
    required this.userName,
    this.userPhone,
    this.userEmail,
    required this.status,
    this.batteryLevel = 100,
    required this.lastPingAt,
    required this.nextPromptDueAt,
    this.emergencyTriggeredAt,
    required this.currentLocation,
    this.addressName,
    this.countryCode,
    this.stateCode,
    this.communityId,
    this.breadcrumbs = const [],
    this.agoraChannelName,
  });

  factory SafetySession.fromJson(Map<String, dynamic> json) {
    return SafetySession(
      id: json['id'] ?? json['_id'] ?? '',
      userId: json['userId'] ?? '',
      userName: json['userName'] ?? 'Citizen',
      userPhone: json['userPhone'],
      userEmail: json['userEmail'],
      status: SessionStatus.fromString(json['status']),
      batteryLevel: json['batteryLevel'] ?? 100,
      lastPingAt: json['lastPingAt'] != null
          ? DateTime.tryParse(json['lastPingAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      nextPromptDueAt: json['nextPromptDueAt'] != null
          ? DateTime.tryParse(json['nextPromptDueAt'].toString()) ?? DateTime.now()
          : DateTime.now().add(const Duration(minutes: 5)),
      emergencyTriggeredAt: json['emergencyTriggeredAt'] != null
          ? DateTime.tryParse(json['emergencyTriggeredAt'].toString())
          : null,
      currentLocation: LocationPoint.fromJson(json['currentLocation'] ?? {'lat': 0.0, 'lng': 0.0}),
      addressName: json['addressName'],
      countryCode: json['countryCode'],
      stateCode: json['stateCode'],
      communityId: json['communityId'],
      breadcrumbs: (json['breadcrumbs'] as List<dynamic>?)
              ?.map((e) => BreadcrumbPoint.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      agoraChannelName: json['agoraChannelName'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'userName': userName,
      'userPhone': userPhone,
      'userEmail': userEmail,
      'status': status.value,
      'batteryLevel': batteryLevel,
      'lastPingAt': lastPingAt.toIso8601String(),
      'nextPromptDueAt': nextPromptDueAt.toIso8601String(),
      'emergencyTriggeredAt': emergencyTriggeredAt?.toIso8601String(),
      'currentLocation': currentLocation.toJson(),
      'addressName': addressName,
      'countryCode': countryCode,
      'stateCode': stateCode,
      'communityId': communityId,
      'breadcrumbs': breadcrumbs.map((e) => e.toJson()).toList(),
      'agoraChannelName': agoraChannelName,
    };
  }

  SafetySession copyWith({
    String? id,
    String? userId,
    String? userName,
    String? userPhone,
    String? userEmail,
    SessionStatus? status,
    int? batteryLevel,
    DateTime? lastPingAt,
    DateTime? nextPromptDueAt,
    DateTime? emergencyTriggeredAt,
    LocationPoint? currentLocation,
    String? addressName,
    String? countryCode,
    String? stateCode,
    String? communityId,
    List<BreadcrumbPoint>? breadcrumbs,
    String? agoraChannelName,
  }) {
    return SafetySession(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      userPhone: userPhone ?? this.userPhone,
      userEmail: userEmail ?? this.userEmail,
      status: status ?? this.status,
      batteryLevel: batteryLevel ?? this.batteryLevel,
      lastPingAt: lastPingAt ?? this.lastPingAt,
      nextPromptDueAt: nextPromptDueAt ?? this.nextPromptDueAt,
      emergencyTriggeredAt: emergencyTriggeredAt ?? this.emergencyTriggeredAt,
      currentLocation: currentLocation ?? this.currentLocation,
      addressName: addressName ?? this.addressName,
      countryCode: countryCode ?? this.countryCode,
      stateCode: stateCode ?? this.stateCode,
      communityId: communityId ?? this.communityId,
      breadcrumbs: breadcrumbs ?? this.breadcrumbs,
      agoraChannelName: agoraChannelName ?? this.agoraChannelName,
    );
  }
}
