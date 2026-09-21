import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../models/incident_report.dart';
import '../models/jurisdiction.dart';
import '../models/location_point.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

class ThreatRiskAssessment {
  final int score; // 0 to 100
  final String label; // 'Low Threat' | 'Moderate Risk' | 'High Caution' | 'Severe Hazard'
  final int nearbyCount;
  final double closestDistanceMeters;

  const ThreatRiskAssessment({
    required this.score,
    required this.label,
    required this.nearbyCount,
    required this.closestDistanceMeters,
  });
}

class IncidentProvider extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  List<IncidentReport> _incidents = [];
  IncidentCategory? _selectedCategory;
  bool _isLoading = false;
  late JurisdictionZone _activeCommunity;
  StreamSubscription<QuerySnapshot>? _firestoreIncidentsSub;

  IncidentProvider() {
    _activeCommunity = StorageService.loadActiveCommunity();
    refreshIncidents();
    _listenToFirestoreIncidents();
  }

  void _listenToFirestoreIncidents() {
    try {
      _firestoreIncidentsSub?.cancel();
      _firestoreIncidentsSub = FirebaseFirestore.instance
          .collection('incident_reports')
          .limit(100)
          .snapshots()
          .listen((snapshot) {
        final liveIncidents = snapshot.docs.map((doc) {
          final data = Map<String, dynamic>.from(doc.data() as Map);
          data['id'] = doc.id;
          return IncidentReport.fromJson(data);
        }).toList();

        _incidents = liveIncidents
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        notifyListeners();
      }, onError: (err) {
        debugPrint('[IncidentProvider] Firestore listener error: $err');
      });
    } catch (e) {
      debugPrint('[IncidentProvider] Firestore stream listener warning: $e');
    }
  }

  JurisdictionZone get activeCommunity => _activeCommunity;

  void setActiveCommunity(JurisdictionZone community) {
    _activeCommunity = community;
    StorageService.saveActiveCommunity(community);
    notifyListeners();
    refreshIncidents();
  }

  void addIncidentDirectly(IncidentReport report) {
    final idx = _incidents.indexWhere((i) => i.id == report.id);
    if (idx != -1) {
      _incidents[idx] = report;
    } else {
      _incidents.insert(0, report);
    }
    notifyListeners();
  }

  /// Distance-Based & Community-Scoped Incidents (with guaranteed emergency report inclusion)
  List<IncidentReport> get activeCommunityIncidents {
    if (_incidents.isEmpty) return [];

    final center = _activeCommunity.center;
    final commId = _activeCommunity.id.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    final commName = _activeCommunity.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

    final filtered = _incidents.where((i) {
      // Emergency distress reports are ALWAYS visible everywhere
      if (i.source == 'safety_mode_emergency' || 
          i.category == IncidentCategory.emergency || 
          i.urgency == IncidentUrgency.critical) {
        return true;
      }

      // 1. Primary: Geo-spatial distance check within 50km radius
      if (center.lat != 0.0 && center.lng != 0.0) {
        final dist = i.location.distanceTo(center);
        if (dist <= 50000) return true;
      }

      // 2. Secondary fallback: Community ID string matching
      if (i.communityId != null && i.communityId!.isNotEmpty) {
        final c = i.communityId!.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (c == commId || c.contains(commId) || commId.contains(c) || c.contains(commName) || commName.contains(c)) {
          return true;
        }
      }
      return false;
    }).toList();

    if (_selectedCategory == null) return filtered;
    return filtered.where((i) => i.category == _selectedCategory).toList();
  }

  List<IncidentReport> get incidents => activeCommunityIncidents;

  List<IncidentReport> get allIncidents => _incidents;
  IncidentCategory? get selectedCategory => _selectedCategory;
  bool get isLoading => _isLoading;

  void filterByCategory(IncidentCategory? category) {
    _selectedCategory = category;
    notifyListeners();
  }

  Future<void> refreshIncidents() async {
    _isLoading = true;
    notifyListeners();

    try {
      final fetched = await _apiService.fetchIncidents(
        communityId: _activeCommunity.id,
        center: (_activeCommunity.center.lat != 0.0 || _activeCommunity.center.lng != 0.0) 
            ? _activeCommunity.center 
            : null,
        radiusKm: 50.0,
      );
      
      final Map<String, IncidentReport> map = {};
      for (var item in fetched) {
        map[item.id] = item;
      }
      // Preserve any active open emergency reports that are in progress
      for (var item in _incidents) {
        if ((item.source == 'safety_mode_emergency' || item.category == IncidentCategory.emergency) &&
            item.status == IncidentStatus.open) {
          if (!map.containsKey(item.id)) {
            map[item.id] = item;
          }
        }
      }
      _incidents = map.values.toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    } catch (e) {
      debugPrint('[IncidentProvider] refreshIncidents error: $e');
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<IncidentReport> reportIncident({
    required User user,
    required String title,
    required String description,
    required IncidentCategory category,
    required LocationPoint location,
    required String addressName,
    required bool isAnonymous,
    IncidentUrgency urgency = IncidentUrgency.medium,
  }) async {
    final now = DateTime.now();
    final newReport = IncidentReport(
      id: 'inc_${const Uuid().v4().substring(0, 8)}',
      reportedBy: isAnonymous ? null : user.id,
      reporterName: isAnonymous ? 'Anonymous Citizen' : user.name,
      isAnonymous: isAnonymous,
      source: 'community_report',
      category: category,
      title: title,
      description: description,
      location: location,
      addressName: addressName,
      countryCode: _activeCommunity.countryCode,
      stateCode: _activeCommunity.code,
      communityId: _activeCommunity.id,
      status: IncidentStatus.open,
      urgency: urgency,
      staffComments: [],
      createdAt: now,
      updatedAt: now,
    );

    _incidents.insert(0, newReport);
    notifyListeners();

    await _apiService.submitIncident(newReport);
    return newReport;
  }

  Future<IncidentReport?> updateIncident({
    required String id,
    String? title,
    String? description,
    IncidentCategory? category,
    IncidentUrgency? urgency,
    LocationPoint? location,
    String? addressName,
    String? communityId,
    String? stateCode,
    String? countryCode,
  }) async {
    final updateData = <String, dynamic>{};
    if (title != null) updateData['title'] = title;
    if (description != null) updateData['description'] = description;
    if (category != null) updateData['category'] = category.value;
    if (urgency != null) updateData['urgency'] = urgency.value;
    if (addressName != null) updateData['addressName'] = addressName;
    if (location != null) updateData['location'] = location.toJson();
    if (communityId != null && communityId.isNotEmpty) updateData['communityId'] = communityId;
    if (stateCode != null && stateCode.isNotEmpty) updateData['stateCode'] = stateCode;
    if (countryCode != null && countryCode.isNotEmpty) updateData['countryCode'] = countryCode;

    final idx = _incidents.indexWhere((i) => i.id == id);
    if (idx != -1) {
      final existing = _incidents[idx];
      final updated = existing.copyWith(
        title: title ?? existing.title,
        description: description ?? existing.description,
        category: category ?? existing.category,
        urgency: urgency ?? existing.urgency,
        location: location ?? existing.location,
        addressName: addressName ?? existing.addressName,
        communityId: communityId ?? existing.communityId,
        stateCode: stateCode ?? existing.stateCode,
        countryCode: countryCode ?? existing.countryCode,
        updatedAt: DateTime.now(),
      );
      _incidents[idx] = updated;
      notifyListeners();
    }

    final result = await _apiService.updateIncident(
      incidentId: id,
      updateData: updateData,
    );

    if (result != null && idx != -1) {
      _incidents[idx] = result;
      notifyListeners();
    }
    return result;
  }


  ThreatRiskAssessment evaluateRiskForLocation(LocationPoint currentLocation) {
    final scopedIncidents = activeCommunityIncidents;
    if (scopedIncidents.isEmpty) {
      return const ThreatRiskAssessment(
        score: 12,
        label: 'Safe Zone',
        nearbyCount: 0,
        closestDistanceMeters: 9999,
      );
    }

    int nearbyCount = 0;
    double closestDistance = double.infinity;
    double totalWeight = 0;

    for (final inc in scopedIncidents) {
      final dist = currentLocation.distanceTo(inc.location);
      if (dist < closestDistance) {
        closestDistance = dist;
      }

      // Within 2km radius
      if (dist <= 2000) {
        nearbyCount++;
        double weight = 1.0;
        if (inc.urgency == IncidentUrgency.critical) weight = 3.0;
        if (inc.urgency == IncidentUrgency.high) weight = 2.0;

        // Distance attenuation
        final proximityFactor = (2000 - dist) / 2000;
        totalWeight += weight * proximityFactor * 25;
      }
    }

    final score = totalWeight.clamp(8.0, 95.0).round();

    String label = 'Safe Area';
    if (score > 75) {
      label = 'High Threat Alert';
    } else if (score > 50) {
      label = 'Caution Zone';
    } else if (score > 25) {
      label = 'Moderate Activity';
    }

    return ThreatRiskAssessment(
      score: score,
      label: label,
      nearbyCount: nearbyCount,
      closestDistanceMeters: closestDistance.isFinite ? closestDistance : 0.0,
    );
  }

  @override
  void dispose() {
    _firestoreIncidentsSub?.cancel();
    super.dispose();
  }
}
