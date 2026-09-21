import 'dart:io';
import 'package:flutter/services.dart';
import '../screens/active_voice_call_screen.dart';

/// Handles platform-specific foregrounding, Android Full-Screen Intent dispatch, and screen wake locks
class ForegroundCallService {
  static const MethodChannel _channel =
      MethodChannel('com.yzemaf.safety/call_foreground');

  static bool _initialized = false;

  /// Initialize listener for native call intents (when activity is launched via Full Screen Intent)
  static void initialize() async {
    if (_initialized || !Platform.isAndroid) return;
    _initialized = true;

    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onCallIntentReceived') {
        _handleCallData(call.arguments);
      }
    });

    // Fetch any pending call intent captured before Dart initialized
    try {
      final pending = await _channel.invokeMethod('getPendingCallIntent');
      if (pending != null) {
        _handleCallData(pending);
      }
    } catch (_) {}
  }

  static void _handleCallData(dynamic rawData) {
    if (rawData == null) return;
    final data = Map<String, dynamic>.from(rawData);
    final bool autoAnswer = data['autoAnswer'] == true;
    ActiveVoiceCallScreen.show(
      callerName: data['callerName'] ?? 'Safety Command Dispatcher',
      callerRole: data['callerRole'] ?? 'Control Room Officer',
      channelName: data['channelName'] ?? 'safety_channel',
      token: data['token'],
      sessionId: data['sessionId'] ?? '',
      userId: data['userId'] ?? '',
      fromNativeIntent: true,
      autoAnswer: autoAnswer,
    );
  }

  /// Brings the Android app from background to foreground and launches full-screen call intent
  static Future<void> bringAppToForeground({
    String callerName = 'Safety Command Dispatcher',
    String callerRole = 'Control Room Officer',
    String channelName = 'safety_channel',
    String? token,
    String sessionId = '',
    String userId = '',
  }) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('bringToForeground', {
        'callerName': callerName,
        'callerRole': callerRole,
        'channelName': channelName,
        'token': token,
        'sessionId': sessionId,
        'userId': userId,
      });
    } catch (_) {
      // Ignored if platform method channel fails
    }
  }

  /// Dismisses any active full-screen call notification after call answered/declined/ended
  static Future<void> dismissCallNotification() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('dismissCallNotification');
    } catch (_) {}
  }

  /// Wakes the screen and allows displaying over the lockscreen
  static Future<void> wakeLockScreen() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('wakeLockScreen');
    } catch (_) {}
  }

  /// Brings the Android app to the foreground and wakes the screen for safety warning or emergency states
  static Future<void> wakeAndForeground({
    required String type, // 'warning' or 'emergency'
    required String title,
    required String message,
  }) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('wakeAndForeground', {
        'type': type,
        'title': title,
        'message': message,
      });
    } catch (_) {}
  }

  /// Dismisses any active warning or emergency heads-up notification once user checks in or cancels
  static Future<void> dismissSafetyAlert() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod('dismissSafetyAlert');
    } catch (_) {}
  }
}

