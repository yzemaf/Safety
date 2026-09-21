import 'package:flutter/material.dart';
import 'location_point.dart';

enum IncidentCategory {
  harassment,
  theft,
  physicalThreat,
  hazard,
  emergency,
  other;

  String get value {
    switch (this) {
      case IncidentCategory.harassment:
        return 'harassment';
      case IncidentCategory.theft:
        return 'theft';
      case IncidentCategory.physicalThreat:
        return 'physical_threat';
      case IncidentCategory.hazard:
        return 'hazard';
      case IncidentCategory.emergency:
        return 'emergency';
      case IncidentCategory.other:
        return 'other';
    }
  }

  String get label {
    switch (this) {
      case IncidentCategory.harassment:
        return 'Harassment';
      case IncidentCategory.theft:
        return 'Theft / Robbery';
      case IncidentCategory.physicalThreat:
        return 'Physical Threat';
      case IncidentCategory.hazard:
        return 'Hazard / Unsafe';
      case IncidentCategory.emergency:
        return 'Active Emergency';
      case IncidentCategory.other:
        return 'Other Incident';
    }
  }

  IconData get icon {
    switch (this) {
      case IncidentCategory.harassment:
        return Icons.record_voice_over_rounded;
      case IncidentCategory.theft:
        return Icons.shopping_bag_outlined;
      case IncidentCategory.physicalThreat:
        return Icons.warning_amber_rounded;
      case IncidentCategory.hazard:
        return Icons.report_problem_outlined;
      case IncidentCategory.emergency:
        return Icons.emergency_rounded;
      case IncidentCategory.other:
        return Icons.info_outline_rounded;
    }
  }

  Color get color {
    switch (this) {
      case IncidentCategory.harassment:
        return const Color(0xFFF59E0B); // Amber
      case IncidentCategory.theft:
        return const Color(0xFFFB923C); // Orange
      case IncidentCategory.physicalThreat:
        return const Color(0xFFEF4444); // Crimson
      case IncidentCategory.hazard:
        return const Color(0xFFFACC15); // Yellow
      case IncidentCategory.emergency:
        return const Color(0xFFDC2626); // Deep Red
      case IncidentCategory.other:
        return const Color(0xFF94A3B8); // Slate
    }
  }

  static IncidentCategory fromString(String? val) {
    switch (val) {
      case 'harassment':
        return IncidentCategory.harassment;
      case 'theft':
        return IncidentCategory.theft;
      case 'physical_threat':
        return IncidentCategory.physicalThreat;
      case 'hazard':
        return IncidentCategory.hazard;
      case 'emergency':
        return IncidentCategory.emergency;
      default:
        return IncidentCategory.other;
    }
  }
}

enum IncidentStatus {
  open,
  investigating,
  resolved;

  String get value {
    switch (this) {
      case IncidentStatus.open:
        return 'open';
      case IncidentStatus.investigating:
        return 'investigating';
      case IncidentStatus.resolved:
        return 'resolved';
    }
  }

  String get label {
    switch (this) {
      case IncidentStatus.open:
        return 'Open';
      case IncidentStatus.investigating:
        return 'Investigating';
      case IncidentStatus.resolved:
        return 'Resolved';
    }
  }

  static IncidentStatus fromString(String? val) {
    switch (val) {
      case 'open':
        return IncidentStatus.open;
      case 'investigating':
        return IncidentStatus.investigating;
      case 'resolved':
        return IncidentStatus.resolved;
      default:
        return IncidentStatus.open;
    }
  }
}

enum IncidentUrgency {
  low,
  medium,
  high,
  critical;

  String get value {
    switch (this) {
      case IncidentUrgency.low:
        return 'low';
      case IncidentUrgency.medium:
        return 'medium';
      case IncidentUrgency.high:
        return 'high';
      case IncidentUrgency.critical:
        return 'critical';
    }
  }

  Color get color {
    switch (this) {
      case IncidentUrgency.low:
        return const Color(0xFF1B8529);
      case IncidentUrgency.medium:
        return const Color(0xFFF59E0B);
      case IncidentUrgency.high:
        return const Color(0xFFF97316);
      case IncidentUrgency.critical:
        return const Color(0xFFEF4444);
    }
  }

  static IncidentUrgency fromString(String? val) {
    switch (val) {
      case 'low':
        return IncidentUrgency.low;
      case 'medium':
        return IncidentUrgency.medium;
      case 'high':
        return IncidentUrgency.high;
      case 'critical':
        return IncidentUrgency.critical;
      default:
        return IncidentUrgency.medium;
    }
  }
}

class StaffComment {
  final String id;
  final String staffName;
  final String staffRole;
  final String comment;
  final DateTime createdAt;

  const StaffComment({
    required this.id,
    required this.staffName,
    required this.staffRole,
    required this.comment,
    required this.createdAt,
  });

  factory StaffComment.fromJson(Map<String, dynamic> json) {
    return StaffComment(
      id: json['id'] ?? json['_id'] ?? '',
      staffName: json['staffName'] ?? 'Responder',
      staffRole: json['staffRole'] ?? 'Field Officer',
      comment: json['comment'] ?? '',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'staffName': staffName,
      'staffRole': staffRole,
      'comment': comment,
      'createdAt': createdAt.toIso8601String(),
    };
  }
}

class IncidentReport {
  final String id;
  final String? reportedBy;
  final String reporterName;
  final bool isAnonymous;
  final String source; // 'community_report' | 'safety_mode_emergency'
  final IncidentCategory category;
  final String title;
  final String description;
  final LocationPoint location;
  final String? addressName;
  final String? countryCode;
  final String? stateCode;
  final String? communityId;
  final IncidentStatus status;
  final IncidentUrgency urgency;
  final List<StaffComment> staffComments;
  final DateTime createdAt;
  final DateTime updatedAt;

  const IncidentReport({
    required this.id,
    this.reportedBy,
    this.reporterName = 'Anonymous Citizen',
    this.isAnonymous = false,
    this.source = 'community_report',
    required this.category,
    required this.title,
    required this.description,
    required this.location,
    this.addressName,
    this.countryCode,
    this.stateCode,
    this.communityId,
    this.status = IncidentStatus.open,
    this.urgency = IncidentUrgency.medium,
    this.staffComments = const [],
    required this.createdAt,
    required this.updatedAt,
  });

  factory IncidentReport.fromJson(Map<String, dynamic> json) {
    return IncidentReport(
      id: json['id'] ?? json['_id'] ?? '',
      reportedBy: json['reportedBy'],
      reporterName: json['reporterName'] ?? (json['isAnonymous'] == true ? 'Anonymous Citizen' : 'Verified User'),
      isAnonymous: json['isAnonymous'] ?? false,
      source: json['source'] ?? 'community_report',
      category: IncidentCategory.fromString(json['category']),
      title: json['title'] ?? 'Incident Report',
      description: json['description'] ?? '',
      location: LocationPoint.fromJson(json['location'] ?? {'lat': 0.0, 'lng': 0.0}),
      addressName: json['addressName'],
      countryCode: json['countryCode'],
      stateCode: json['stateCode'],
      communityId: json['communityId'],
      status: IncidentStatus.fromString(json['status']),
      urgency: IncidentUrgency.fromString(json['urgency']),
      staffComments: (json['staffComments'] as List<dynamic>?)
              ?.map((e) => StaffComment.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'reportedBy': reportedBy,
      'reporterName': reporterName,
      'isAnonymous': isAnonymous,
      'source': source,
      'category': category.value,
      'title': title,
      'description': description,
      'location': location.toJson(),
      'addressName': addressName,
      'countryCode': countryCode,
      'stateCode': stateCode,
      'communityId': communityId,
      'status': status.value,
      'urgency': urgency.value,
      'staffComments': staffComments.map((e) => e.toJson()).toList(),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  IncidentReport copyWith({
    String? id,
    String? reportedBy,
    String? reporterName,
    bool? isAnonymous,
    String? source,
    IncidentCategory? category,
    String? title,
    String? description,
    LocationPoint? location,
    String? addressName,
    String? countryCode,
    String? stateCode,
    String? communityId,
    IncidentStatus? status,
    IncidentUrgency? urgency,
    List<StaffComment>? staffComments,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return IncidentReport(
      id: id ?? this.id,
      reportedBy: reportedBy ?? this.reportedBy,
      reporterName: reporterName ?? this.reporterName,
      isAnonymous: isAnonymous ?? this.isAnonymous,
      source: source ?? this.source,
      category: category ?? this.category,
      title: title ?? this.title,
      description: description ?? this.description,
      location: location ?? this.location,
      addressName: addressName ?? this.addressName,
      countryCode: countryCode ?? this.countryCode,
      stateCode: stateCode ?? this.stateCode,
      communityId: communityId ?? this.communityId,
      status: status ?? this.status,
      urgency: urgency ?? this.urgency,
      staffComments: staffComments ?? this.staffComments,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

