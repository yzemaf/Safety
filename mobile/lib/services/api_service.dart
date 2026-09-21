import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/incident_report.dart';
import '../models/location_point.dart';
import '../models/safety_session.dart';
import '../models/user.dart';

class ApiService {
  static String _getLocalBaseUrl() {
    try {
      if (Platform.isAndroid) {
        return 'http://127.0.0.1:5000/api';
      }
    } catch (_) {}
    return 'http://localhost:5000/api';
  }

  /// Default API Base URL: in debug mode uses local machine/emulator, in release uses deployed endpoint.
  static String get defaultBaseUrl =>
      kDebugMode ? _getLocalBaseUrl() : AppConstants.defaultApiBaseUrl;

  final String baseUrl;
  final http.Client _client;

  ApiService({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = baseUrl ?? defaultBaseUrl,
        _client = client ?? http.Client();

  Future<http.Response> _post(
    String path, {
    Map<String, String>? headers,
    Object? body,
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    debugPrint('[Mobile ApiService] POST $uri');
    return await _client
        .post(
          uri,
          headers: headers ?? {'Content-Type': 'application/json'},
          body: body,
        )
        .timeout(timeout);
  }

  Future<http.Response> _get(
    String path, {
    Map<String, String>? headers,
    Map<String, String>? queryParameters,
    Duration timeout = const Duration(seconds: 10),
  }) async {
    var uri = Uri.parse('$baseUrl$path');
    if (queryParameters != null && queryParameters.isNotEmpty) {
      uri = uri.replace(queryParameters: queryParameters);
    }
    debugPrint('[Mobile ApiService] GET $uri');
    return await _client.get(uri, headers: headers).timeout(timeout);
  }

  Future<http.Response> _patch(
    String path, {
    Map<String, String>? headers,
    Object? body,
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    debugPrint('[Mobile ApiService] PATCH $uri');
    return await _client
        .patch(
          uri,
          headers: headers ?? {'Content-Type': 'application/json'},
          body: body,
        )
        .timeout(timeout);
  }

  // ─── AUTHENTICATION & SESSIONS ─────────────────────────────────────────────
  Future<User?> createGuestSession({String? deviceId, String? name}) async {
    try {
      final res = await _post(
        '/auth/guest-session',
        body: jsonEncode({'deviceId': deviceId, 'name': name}),
      );

      debugPrint('[Mobile ApiService] guestSession -> ${res.statusCode}');
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = jsonDecode(res.body);
        return User.fromJson(data['user']);
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] guestSession error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> login({required String email, required String password}) async {
    try {
      final res = await _post(
        '/auth/login',
        body: jsonEncode({'email': email, 'password': password}),
      );

      debugPrint('[Mobile ApiService] login -> ${res.statusCode}');
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] login error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    try {
      final res = await _post(
        '/auth/register',
        body: jsonEncode({
          'name': name,
          'email': email,
          'password': password,
          'phone': phone,
        }),
      );

      debugPrint('[Mobile ApiService] register -> ${res.statusCode}');
      if (res.statusCode == 200 || res.statusCode == 201) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] register error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> updateProfile({
    required String userId,
    String? name,
    String? phone,
    String? email,
  }) async {
    try {
      final res = await _post(
        '/auth/profile',
        body: jsonEncode({
          'userId': userId,
          'name': name,
          'phone': phone,
          'email': email,
        }),
      );

      debugPrint('[Mobile ApiService] updateProfile -> ${res.statusCode}');
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] updateProfile error: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> changePassword({
    required String userId,
    String? email,
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final res = await _post(
        '/auth/change-password',
        body: jsonEncode({
          'userId': userId,
          'email': email,
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        }),
      );

      debugPrint('[Mobile ApiService] changePassword -> ${res.statusCode}');
      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        return data;
      } else {
        return {'success': false, 'error': data['error'] ?? 'Password update failed'};
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] changePassword error: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  Future<Map<String, dynamic>?> updateSettings({
    required String userId,
    String? email,
    UserSettings? settings,
    List<EmergencyContact>? emergencyContacts,
    String? communityId,
  }) async {
    try {
      final Map<String, dynamic> body = {
        'userId': userId,
      };
      if (email != null) body['email'] = email;
      if (settings != null) body['settings'] = settings.toJson();
      if (emergencyContacts != null) {
        body['emergencyContacts'] = emergencyContacts.map((c) => c.toJson()).toList();
      }
      if (communityId != null) body['communityId'] = communityId;

      final res = await _post(
        '/auth/settings',
        body: jsonEncode(body),
      );

      debugPrint('[Mobile ApiService] updateSettings -> ${res.statusCode}');
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      debugPrint('[Mobile ApiService] updateSettings error: $e');
    }
    return null;
  }

  // ─── SAFETY WALK SESSIONS ──────────────────────────────────────────────────
  Future<SafetySession> startSafetySession({
    required User user,
    required LocationPoint initialLocation,
    int? batteryLevel,
    String? addressName,
    String? communityId,
    String? stateCode,
    String? countryCode,
  }) async {
    final effectivePhone = (user.phone != null && user.phone!.trim().isNotEmpty)
        ? user.phone!.trim()
        : (user.emergencyContacts.isNotEmpty && user.emergencyContacts.first.phone.trim().isNotEmpty
            ? user.emergencyContacts.first.phone.trim()
            : '');

    try {
      final response = await _post(
        '/sessions/start',
        body: jsonEncode({
          'userId': user.id,
          'userName': user.name,
          'userPhone': effectivePhone,
          'userEmail': user.email,
          'initialLocation': {
            'lat': initialLocation.lat,
            'lng': initialLocation.lng,
          },
          'batteryLevel': batteryLevel ?? 85,
          'intervalMinutes': user.settings.checkInIntervalMinutes,
          'addressName': addressName ?? '${initialLocation.lat.toStringAsFixed(4)}, ${initialLocation.lng.toStringAsFixed(4)}',
          'communityId': communityId ?? 'ikeja',
          'stateCode': stateCode ?? 'Lagos',
          'countryCode': countryCode ?? 'NG',
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return SafetySession.fromJson(data);
      }
    } catch (e) {
      debugPrint('ApiService startSafetySession fallback: $e');
    }

    final now = DateTime.now();
    final interval = user.settings.checkInIntervalMinutes;
    final defaultAddr = addressName ?? '${initialLocation.lat.toStringAsFixed(4)}, ${initialLocation.lng.toStringAsFixed(4)}';
    return SafetySession(
      id: 'sess_${DateTime.now().millisecondsSinceEpoch}',
      userId: user.id,
      userName: user.name,
      userPhone: user.phone,
      userEmail: user.email,
      status: SessionStatus.active,
      batteryLevel: 94,
      lastPingAt: now,
      nextPromptDueAt: now.add(Duration(minutes: interval)),
      currentLocation: initialLocation,
      addressName: defaultAddr,
      countryCode: countryCode ?? 'NG',
      stateCode: stateCode ?? 'Lagos',
      communityId: communityId ?? 'ikeja',
      breadcrumbs: [
        BreadcrumbPoint(location: initialLocation, recordedAt: now),
      ],
      agoraChannelName: 'safety_emergency_${user.id}',
    );
  }

  Future<Map<String, dynamic>?> pingSafetySession({
    required String sessionId,
    required LocationPoint location,
    int? batteryLevel,
    String? addressName,
  }) async {
    try {
      final res = await _post(
        '/sessions/ping',
        body: jsonEncode({
          'sessionId': sessionId,
          'lat': location.lat,
          'lng': location.lng,
          'batteryLevel': batteryLevel,
          if (addressName != null && addressName.isNotEmpty) 'addressName': addressName,
        }),
        timeout: const Duration(seconds: 4),
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      debugPrint('ApiService pingSafetySession error: $e');
    }
    return null;
  }

  Future<void> checkInSafetySession({
    required String sessionId,
    String? userId,
    int intervalMinutes = 5,
  }) async {
    try {
      await _post(
        '/sessions/check-in',
        body: jsonEncode({
          'sessionId': sessionId,
          if (userId != null && userId.isNotEmpty) 'userId': userId,
          'intervalMinutes': intervalMinutes,
        }),
        timeout: const Duration(seconds: 4),
      );
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> triggerSos({
    required String sessionId,
    String? incidentId,
    String? userId,
    String? reason,
    LocationPoint? location,
    String? addressName,
    String? communityId,
    String? stateCode,
    String? countryCode,
    String? userName,
    String? userPhone,
  }) async {
    try {
      final res = await _post(
        '/sessions/trigger-sos',
        body: jsonEncode({
          'sessionId': sessionId,
          if (incidentId != null && incidentId.isNotEmpty) 'incidentId': incidentId,
          if (userId != null && userId.isNotEmpty) 'userId': userId,
          'reason': reason,
          if (location != null) 'location': location.toJson(),
          if (addressName != null && addressName.isNotEmpty) 'addressName': addressName,
          if (communityId != null && communityId.isNotEmpty) 'communityId': communityId,
          if (stateCode != null && stateCode.isNotEmpty) 'stateCode': stateCode,
          if (countryCode != null && countryCode.isNotEmpty) 'countryCode': countryCode,
          if (userName != null && userName.isNotEmpty) 'userName': userName,
          if (userPhone != null && userPhone.isNotEmpty) 'userPhone': userPhone,
        }),
        timeout: const Duration(seconds: 5),
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
    } catch (e) {
      debugPrint('ApiService triggerSos error: $e');
    }
    return null;
  }

  Future<void> resolveSafetySession({
    required String sessionId,
    String? userId,
    String status = 'resolved',
  }) async {
    try {
      await _post(
        '/sessions/resolve',
        body: jsonEncode({
          'sessionId': sessionId,
          if (userId != null && userId.isNotEmpty) 'userId': userId,
          'status': status,
        }),
        timeout: const Duration(seconds: 4),
      );
    } catch (_) {}
  }

  // ─── INCIDENTS & REPORTS ─────────────────────────────────────────────────
  Future<List<IncidentReport>> fetchIncidents({
    String? communityId,
    LocationPoint? center,
    double radiusKm = 10.0,
  }) async {
    try {
      final queryParams = <String, String>{
        'radiusKm': radiusKm.toString(),
      };
      if (communityId != null && communityId.isNotEmpty && communityId.toLowerCase() != 'all') {
        queryParams['communityId'] = communityId;
      }
      if (center != null) {
        queryParams['lat'] = center.lat.toString();
        queryParams['lng'] = center.lng.toString();
      }

      final response = await _get(
        '/incidents',
        queryParameters: queryParams,
        timeout: const Duration(seconds: 5),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as List;
        return data.map((e) => IncidentReport.fromJson(e)).toList();
      }
    } catch (e) {
      debugPrint('ApiService fetchIncidents fallback: $e');
    }

    return [];
  }

  Future<IncidentReport> submitIncident(IncidentReport report) async {
    try {
      final response = await _post(
        '/incidents',
        body: jsonEncode(report.toJson()),
        timeout: const Duration(seconds: 5),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return IncidentReport.fromJson(data);
      }
    } catch (e) {
      debugPrint('ApiService submitIncident fallback: $e');
    }
    return report;
  }

  Future<IncidentReport?> updateIncident({
    required String incidentId,
    required Map<String, dynamic> updateData,
  }) async {
    try {
      final response = await _patch(
        '/incidents/$incidentId',
        body: jsonEncode(updateData),
        timeout: const Duration(seconds: 5),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return IncidentReport.fromJson(data);
      }
    } catch (e) {
      debugPrint('ApiService updateIncident error: $e');
    }
    return null;
  }

  // ─── AI INTELLIGENCE ─────────────────────────────────────────────────────
  /// Fetch community AI safety summary from the backend Gemini service.
  /// Returns a parsed map with at least a 'markdownReport' and 'executiveSummary'.
  Future<Map<String, dynamic>?> getCommunityAiSummary({
    required String communityId,
    required String stateCode,
    required String countryCode,
    double? lat,
    double? lng,
    List<Map<String, dynamic>>? incidents,
  }) async {
    try {
      final body = <String, dynamic>{
        'communityId': communityId,
        'stateCode': stateCode,
        'countryCode': countryCode,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (incidents != null && incidents.isNotEmpty) 'incidents': incidents,
      };
      final response = await _post(
        '/incidents/ai-summary',
        body: jsonEncode(body),
        timeout: const Duration(seconds: 30),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
      debugPrint('[ApiService] getCommunityAiSummary failed: ${response.statusCode}');
    } catch (e) {
      debugPrint('[ApiService] getCommunityAiSummary error: $e');
    }
    return null;
  }

  // ─── AGORA RTC TOKEN & CALL ACTIONS ─────────────────────────────────────
  Future<String?> fetchAgoraToken(String channelName) async {
    try {
      final res = await _get(
        '/agora/token/$channelName',
        timeout: const Duration(seconds: 4),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['token'] as String?;
      }
    } catch (_) {}
    return null;
  }

  Future<bool> respondToCall({
    required String sessionId,
    required String status,
    String? userId,
  }) async {
    if (sessionId.isEmpty) return false;
    try {
      final res = await _post(
        '/sessions/$sessionId/call-response',
        body: jsonEncode({
          'status': status,
          if (userId != null && userId.isNotEmpty) 'userId': userId,
        }),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> endCall({
    required String sessionId,
    String? userId,
  }) async {
    if (sessionId.isEmpty) return false;
    try {
      final res = await _post(
        '/sessions/$sessionId/end-call',
        body: jsonEncode({
          if (userId != null && userId.isNotEmpty) 'userId': userId,
        }),
      );
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ─── SAFETY PIN ACTIONS ────────────────────────────────────────────────
  Future<Map<String, dynamic>?> setSafetyPin({
    required String pin,
    String? userId,
  }) async {
    try {
      final res = await _post(
        '/auth/safety-pin',
        body: jsonEncode({
          'pin': pin.trim(),
          if (userId != null && userId.isNotEmpty) 'userId': userId,
        }),
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
      return jsonDecode(res.body) as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[ApiService] setSafetyPin error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> verifySafetyPin({
    required String pin,
    String? userId,
  }) async {
    try {
      final res = await _post(
        '/auth/safety-pin/verify',
        body: jsonEncode({
          'pin': pin.trim(),
          if (userId != null && userId.isNotEmpty) 'userId': userId,
        }),
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
      return jsonDecode(res.body) as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[ApiService] verifySafetyPin error: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>?> changeSafetyPin({
    required String currentPin,
    required String newPin,
    String? userId,
  }) async {
    try {
      final res = await _post(
        '/auth/safety-pin/change',
        body: jsonEncode({
          'currentPin': currentPin.trim(),
          'newPin': newPin.trim(),
          if (userId != null && userId.isNotEmpty) 'userId': userId,
        }),
      );
      if (res.statusCode == 200) {
        return jsonDecode(res.body) as Map<String, dynamic>;
      }
      return jsonDecode(res.body) as Map<String, dynamic>?;
    } catch (e) {
      debugPrint('[ApiService] changeSafetyPin error: $e');
      return null;
    }
  }
}

