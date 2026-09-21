import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../models/location_point.dart';
import '../models/safety_session.dart';

class FirebaseFirestoreService {
  static FirebaseFirestore get _db => FirebaseFirestore.instance;
  static StreamSubscription<DocumentSnapshot>? _callSubscription;

  /// Update active safety session in Cloud Firestore collection `safety_sessions/{sessionId}`
  static Future<void> syncSession({
    required String sessionId,
    required String userId,
    required String userName,
    required String userPhone,
    required String userEmail,
    required String status,
    required LocationPoint currentLocation,
    required int batteryLevel,
    required String addressName,
    required String communityId,
    required String stateCode,
    required String countryCode,
    required String agoraChannelName,
    required List<BreadcrumbPoint> breadcrumbs,
    DateTime? emergencyTriggeredAt,
  }) async {
    try {
      final formattedBreadcrumbs = breadcrumbs.map((b) => {
        'lat': b.location.lat,
        'lng': b.location.lng,
        'recordedAt': b.recordedAt.toIso8601String(),
        'batteryLevel': batteryLevel,
      }).toList();

      final data = {
        'id': sessionId,
        'userId': userId,
        'userName': userName,
        'userPhone': userPhone,
        'userEmail': userEmail,
        'status': status,
        'batteryLevel': batteryLevel,
        'currentLocation': {
          'lat': currentLocation.lat,
          'lng': currentLocation.lng,
        },
        'addressName': addressName,
        'communityId': communityId,
        'stateCode': stateCode,
        'countryCode': countryCode,
        'agoraChannelName': agoraChannelName,
        'breadcrumbs': formattedBreadcrumbs,
        'lastPingAt': DateTime.now().toIso8601String(),
        'emergencyTriggeredAt': emergencyTriggeredAt?.toIso8601String(),
        'updatedAt': DateTime.now().toIso8601String(),
      };

      await _db.collection('safety_sessions').doc(sessionId).set(data, SetOptions(merge: true));
      debugPrint('[Firebase Firestore] Synced session $sessionId to safety_sessions collection.');
    } catch (e) {
      debugPrint('[Firebase Firestore] syncSession error: $e');
    }
  }

  /// Direct Instant Cloud Firestore emergency incident report sync
  static Future<void> syncIncidentReport({
    required String id,
    required String reportedBy,
    required String reporterName,
    required String category,
    required String title,
    required String description,
    required LocationPoint location,
    required String addressName,
    required String communityId,
    required String stateCode,
    required String countryCode,
    required String status,
    required String urgency,
  }) async {
    try {
      final data = {
        'id': id,
        'reportedBy': reportedBy,
        'reporterName': reporterName,
        'isAnonymous': false,
        'source': 'safety_mode_emergency',
        'category': category,
        'title': title,
        'description': description,
        'location': {
          'lat': location.lat,
          'lng': location.lng,
        },
        'addressName': addressName,
        'communityId': communityId,
        'stateCode': stateCode,
        'countryCode': countryCode,
        'status': status,
        'urgency': urgency,
        'staffComments': [],
        'createdAt': DateTime.now().toIso8601String(),
        'updatedAt': DateTime.now().toIso8601String(),
      };

      await _db.collection('incident_reports').doc(id).set(data, SetOptions(merge: true));
      debugPrint('[Firebase Firestore] Directly synced emergency incident $id to Firestore.');
    } catch (e) {
      debugPrint('[Firebase Firestore] syncIncidentReport error: $e');
    }
  }

  /// Resolve an emergency incident report in Cloud Firestore
  static Future<void> resolveIncidentReport({required String incidentId}) async {
    if (incidentId.isEmpty) return;
    try {
      final updateData = <String, dynamic>{
        'status': 'resolved',
        'updatedAt': DateTime.now().toIso8601String(),
      };
      await _db.collection('incident_reports').doc(incidentId).set(updateData, SetOptions(merge: true));
      debugPrint('[Firebase Firestore] Resolved emergency incident $incidentId');
    } catch (e) {
      debugPrint('[Firebase Firestore] resolveIncidentReport error: $e');
    }
  }

  /// Auto-resolves all open emergency distress incidents for a user in Cloud Firestore
  static Future<void> resolveAllUserEmergencyIncidents({required String userId}) async {
    if (userId.isEmpty) return;
    try {
      final snap = await _db.collection('incident_reports')
          .where('reportedBy', isEqualTo: userId)
          .where('status', isEqualTo: 'open')
          .get();
      for (final doc in snap.docs) {
        await doc.reference.set({
          'status': 'resolved',
          'updatedAt': DateTime.now().toIso8601String(),
        }, SetOptions(merge: true));
      }
    } catch (e) {
      debugPrint('[Firebase Firestore] resolveAllUserEmergencyIncidents error: $e');
    }
  }

  /// Update session status in Cloud Firestore (e.g. 'active', 'distress_pending', 'emergency', 'resolved')
  static Future<void> updateSessionStatus({
    required String sessionId,
    required String status,
    DateTime? emergencyTriggeredAt,
  }) async {
    try {
      final updateData = <String, dynamic>{
        'status': status,
        'updatedAt': DateTime.now().toIso8601String(),
      };
      if (emergencyTriggeredAt != null) {
        updateData['emergencyTriggeredAt'] = emergencyTriggeredAt.toIso8601String();
      }
      await _db.collection('safety_sessions').doc(sessionId).set(updateData, SetOptions(merge: true));
      debugPrint('[Firebase Firestore] Updated session $sessionId status to $status');
    } catch (e) {
      debugPrint('[Firebase Firestore] updateSessionStatus error: $e');
    }
  }

  /// Update location only (high-frequency streaming during walking)
  static Future<void> streamLocation({
    required String sessionId,
    required LocationPoint location,
    required int batteryLevel,
    String? addressName,
    String? status,
  }) async {
    try {
      final updateData = <String, dynamic>{
        'currentLocation': {
          'lat': location.lat,
          'lng': location.lng,
        },
        'batteryLevel': batteryLevel,
        'lastPingAt': DateTime.now().toIso8601String(),
        if (addressName != null && addressName.isNotEmpty) 'addressName': addressName,
        if (status != null && status.isNotEmpty) 'status': status,
        'updatedAt': DateTime.now().toIso8601String(),
      };

      await _db.collection('safety_sessions').doc(sessionId).set(updateData, SetOptions(merge: true));
    } catch (e) {
      debugPrint('[Firebase Firestore] streamLocation error: $e');
    }
  }


  static String? _lastHandledChannel;
  static int _lastHandledCallTime = 0;

  /// Listen for incoming calls on document `calls/{userId}`
  static void listenForIncomingCalls({
    required String userId,
    String? sessionId,
    required void Function(Map<String, dynamic> callData) onIncomingCall,
  }) {
    _callSubscription?.cancel();
    _callSubscription = null;

    if (userId.isEmpty) return;

    try {
      final docRef = _db.collection('calls').doc(userId);
      _callSubscription = docRef.snapshots().listen((snapshot) {
        if (!snapshot.exists || snapshot.data() == null) {
          _lastHandledChannel = null;
          return;
        }

        final data = Map<String, dynamic>.from(snapshot.data() as Map);
        final status = data['status'];
        final channelName = data['channelName']?.toString();
        final now = DateTime.now().millisecondsSinceEpoch;

        final updatedAtStr = data['updatedAt']?.toString() ?? data['initiatedAt']?.toString();
        DateTime? updatedAt;
        if (updatedAtStr != null) {
          try {
            updatedAt = DateTime.parse(updatedAtStr);
          } catch (_) {}
        }

        // Ignore stale call signals older than 20 seconds
        if (updatedAt != null && DateTime.now().difference(updatedAt).inSeconds > 20) {
          debugPrint('[Firebase Firestore] Ignoring stale incoming call signal (age > 20s)');
          return;
        }

        if (status == 'ringing') {
          if (_lastHandledChannel != channelName || (now - _lastHandledCallTime) > 12000) {
            _lastHandledChannel = channelName;
            _lastHandledCallTime = now;
            debugPrint('[Firebase Firestore] New incoming call received for user $userId (channel: $channelName)');
            onIncomingCall(data);
          }
        } else {
          _lastHandledChannel = null;
        }
      });
    } catch (e) {
      debugPrint('[Firebase Firestore] listenForIncomingCalls error: $e');
    }
  }

  /// Respond to incoming call in Cloud Firestore
  static Future<void> respondToCall({
    required String sessionId,
    required String userId,
    required String status, // 'accepted' | 'declined' | 'ended'
  }) async {
    try {
      if (status == 'ended' || status == 'declined') {
        _lastHandledChannel = null;
      }
      final update = {
        'status': status,
        'updatedAt': DateTime.now().toIso8601String(),
      };

      if (userId.isNotEmpty) {
        await _db.collection('calls').doc(userId).set(update, SetOptions(merge: true));
      }
      if (sessionId.isNotEmpty) {
        await _db.collection('safety_sessions').doc(sessionId).set({
          'incomingCall': update,
          'activeCall': update,
        }, SetOptions(merge: true));
        await _db.collection('calls').doc(sessionId).set(update, SetOptions(merge: true));
      }
      debugPrint('[Firebase Firestore] Call response set to $status for user $userId (session $sessionId)');

      // Auto-purge stale call documents after brief notification window
      if (status == 'ended' || status == 'declined') {
        Future.delayed(const Duration(milliseconds: 1500), () async {
          try {
            if (userId.isNotEmpty) await _db.collection('calls').doc(userId).delete();
            if (sessionId.isNotEmpty) {
              await _db.collection('calls').doc(sessionId).delete();
              await _db.collection('safety_sessions').doc(sessionId).set({
                'incomingCall': FieldValue.delete(),
                'activeCall': FieldValue.delete(),
              }, SetOptions(merge: true));
            }
          } catch (_) {}
        });
      }
    } catch (e) {
      debugPrint('[Firebase Firestore] respondToCall error: $e');
    }
  }

  /// Clean up call listeners
  static void stopListeningCalls() {
    _callSubscription?.cancel();
    _callSubscription = null;
  }

  /// Remove session from Cloud Firestore when safety mode ends
  static Future<void> removeSession({required String sessionId}) async {
    try {
      await _db.collection('safety_sessions').doc(sessionId).delete();
      debugPrint('[Firebase Firestore] Removed session $sessionId');
    } catch (e) {
      debugPrint('[Firebase Firestore] removeSession error: $e');
    }
  }
}
