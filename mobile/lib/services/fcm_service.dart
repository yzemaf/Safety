import 'dart:convert';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../firebase_options.dart';
import 'foreground_call_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    final data = message.data;
    if (data['type'] == 'incoming_call') {
      await ForegroundCallService.wakeLockScreen();
      await ForegroundCallService.bringAppToForeground(
        callerName: data['callerName'] ?? 'Safety Command Dispatcher',
        callerRole: data['callerRole'] ?? 'Control Room Officer',
        channelName: data['channelName'] ?? 'safety_channel',
        token: data['token'],
        sessionId: data['sessionId'] ?? '',
        userId: data['userId'] ?? '',
      );
    }
    await FcmService._showLocalNotification(message);
  } catch (e) {
    debugPrint('FCM background handler error: $e');
  }
}

/// Manages Firebase Cloud Messaging token registration, foreground/background
/// message handling, local notification dispatch, and real-time incoming call ringing.
class FcmService {
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const _channelIdAlerts = 'safety_alerts';
  static const _channelIdEmergency = 'safety_emergency_alerts';
  static const _channelIdCalls = 'safety_calls';

  static void Function(Map<String, dynamic> callData)? _onIncomingCallCallback;
  static void Function(Map<String, dynamic> alertData)? _onEmergencyAlertCallback;

  /// Call once from main() after Firebase.initializeApp().
  static Future<void> initialize({
    required void Function(RemoteMessage message) onNotificationTap,
    void Function(Map<String, dynamic> callData)? onIncomingCall,
    void Function(Map<String, dynamic> alertData)? onEmergencyAlert,
  }) async {
    _onIncomingCallCallback = onIncomingCall;
    _onEmergencyAlertCallback = onEmergencyAlert;

    // 1. Register background message handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 2. Create high-importance Android notification channels
    await _createNotificationChannels();

    // 3. Init flutter_local_notifications
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (details) {
        if (details.payload != null) {
          try {
            final data = jsonDecode(details.payload!);
            final type = data['type'];
            if (type == 'incoming_call' && _onIncomingCallCallback != null) {
              _onIncomingCallCallback!(Map<String, dynamic>.from(data));
            } else {
              final msg = RemoteMessage(data: Map<String, String>.from(data));
              onNotificationTap(msg);
            }
          } catch (_) {}
        }
      },
    );

    // 4. Request notification permission (Android 13+ / iOS)
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // 5. Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final data = message.data;
      final type = data['type'];

      if (type == 'incoming_call') {
        if (_onIncomingCallCallback != null) {
          _onIncomingCallCallback!(Map<String, dynamic>.from(data));
        }
      } else if (type == 'emergency_sos') {
        _showLocalNotification(message);
      } else {
        _showLocalNotification(message);
      }
    });

    // 6. Handle taps when app is in background (not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      final data = message.data;
      final type = data['type'];
      if (type == 'incoming_call' && _onIncomingCallCallback != null) {
        _onIncomingCallCallback!(Map<String, dynamic>.from(data));
      } else if (type == 'emergency_sos' && _onEmergencyAlertCallback != null) {
        _onEmergencyAlertCallback!(Map<String, dynamic>.from(data));
      } else {
        onNotificationTap(message);
      }
    });

    // 7. Handle tap from terminated state
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      final data = initial.data;
      final type = data['type'];
      if (type == 'incoming_call' && _onIncomingCallCallback != null) {
        _onIncomingCallCallback!(Map<String, dynamic>.from(data));
      } else if (type == 'emergency_sos' && _onEmergencyAlertCallback != null) {
        _onEmergencyAlertCallback!(Map<String, dynamic>.from(data));
      } else {
        onNotificationTap(initial);
      }
    }
  }

  /// Sets or updates the incoming call callback handler
  static void setIncomingCallHandler(void Function(Map<String, dynamic> callData) handler) {
    _onIncomingCallCallback = handler;
  }

  /// Sets or updates the emergency SOS callback handler
  static void setEmergencyAlertHandler(void Function(Map<String, dynamic> alertData) handler) {
    _onEmergencyAlertCallback = handler;
  }

  /// Fetches current device FCM token
  static Future<String?> getToken() async {
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }

  /// Registers device token + GPS + communityId with backend
  static Future<void> registerDeviceToken({
    required String userId,
    required double lat,
    required double lng,
    required String communityId,
  }) async {
    try {
      final token = await getToken();
      if (token == null || token.isEmpty) return;

      await http.post(
        Uri.parse('${AppConstants.defaultApiBaseUrl}/users/device-token'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'fcmToken': token,
          'lastKnownLocation': {'lat': lat, 'lng': lng},
          'communityId': communityId,
          'platform': Platform.isAndroid ? 'android' : 'ios',
        }),
      ).timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  /// Listen for FCM token refreshes
  static void listenForTokenRefresh({
    required String userId,
    required double lat,
    required double lng,
    required String communityId,
  }) {
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
      registerDeviceToken(
        userId: userId,
        lat: lat,
        lng: lng,
        communityId: communityId,
      );
    });
  }

  /// Displays local heads-up notification with custom channel importance & sound
  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final data = message.data;
    final type = data['type'];

    // We do not display incoming call notifications in status bar — app is foregrounded & overlay handles presentation
    if (type == 'incoming_call') {
      return;
    }

    final notification = message.notification;

    String channelId = _channelIdAlerts;
    String title = notification?.title ?? data['title'] ?? '⚠️ Safety Alert';
    String body = notification?.body ?? data['body'] ?? 'An alert was received near you.';
    Color color = const Color(0xFF1B8529);

    if (type == 'emergency_sos') {
      channelId = _channelIdEmergency;
      title = notification?.title ?? '🚨 EMERGENCY DISTRESS ALERT: ${data['userName'] ?? 'Citizen'}';
      body = notification?.body ?? 'Distress beacon activated nearby in ${data['communityId'] ?? 'your community'}.';
      color = const Color(0xFFDC2626);
    }

    final androidDetails = AndroidNotificationDetails(
      channelId,
      channelId == _channelIdCalls
          ? 'Safety Emergency Calls'
          : (channelId == _channelIdEmergency ? 'Emergency SOS Distress Alerts' : 'Safety Threat Alerts'),
      importance: Importance.max,
      priority: type == 'incoming_call' ? Priority.max : Priority.high,
      ticker: title,
      color: color,
      enableLights: true,
      enableVibration: true,
      playSound: true,
      fullScreenIntent: type == 'incoming_call',
      category: type == 'incoming_call' ? AndroidNotificationCategory.call : AndroidNotificationCategory.alarm,
      visibility: NotificationVisibility.public,
      ongoing: type == 'incoming_call',
      autoCancel: true,
      styleInformation: BigTextStyleInformation(body),
    );

    final details = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      message.hashCode,
      title,
      body,
      details,
      payload: jsonEncode(data),
    );
  }

  /// Creates Android notification channels
  static Future<void> _createNotificationChannels() async {
    final plugin = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    if (plugin == null) return;

    // 1. General Safety Alerts
    await plugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelIdAlerts,
        'Safety Threat Alerts',
        description: 'Proximity alerts for incidents reported near you',
        importance: Importance.max,
        playSound: true,
        enableLights: true,
        enableVibration: true,
        ledColor: Color(0xFF1B8529),
      ),
    );

    // 2. Emergency SOS Beacon Alerts
    await plugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelIdEmergency,
        'Emergency SOS Distress Alerts',
        description: 'High-urgency distress alerts when citizens activate emergency SOS',
        importance: Importance.max,
        playSound: true,
        enableLights: true,
        enableVibration: true,
        ledColor: Color(0xFFDC2626),
      ),
    );

    // 3. Incoming Admin Voice Calls
    await plugin.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelIdCalls,
        'Safety Emergency Calls',
        description: 'Incoming voice calls from Safety Control Room dispatchers',
        importance: Importance.max,
        playSound: true,
        enableLights: true,
        enableVibration: true,
        ledColor: Color(0xFF1B8529),
      ),
    );
  }
}
