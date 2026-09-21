import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';

enum OverlayStateMode {
  inactive,
  active,
  graceWarning,
  emergency,
  incomingCall,
}

class OverlayService {
  static bool _isOverlayVisible = false;
  static bool get isOverlayVisible => _isOverlayVisible;

  /// Check if the device has granted "Display Over Other Apps" permission
  static Future<bool> isPermissionGranted() async {
    try {
      return await FlutterOverlayWindow.isPermissionGranted();
    } catch (_) {
      return false;
    }
  }

  /// Request the "Display Over Other Apps" permission from Android Settings
  static Future<bool> requestPermission() async {
    try {
      final granted = await FlutterOverlayWindow.requestPermission();
      return granted ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Show the floating safety overlay window over other apps
  static Future<void> showSafetyOverlay({
    required int secondsRemaining,
    required OverlayStateMode mode,
  }) async {
    try {
      final hasPerm = await isPermissionGranted();
      debugPrint('[OverlayService] showSafetyOverlay called. hasPerm: $hasPerm');
      if (!hasPerm) {
        final granted = await requestPermission();
        debugPrint('[OverlayService] requestPermission result: $granted');
        if (!granted) return;
      }

      final isActive = await FlutterOverlayWindow.isActive();
      debugPrint('[OverlayService] FlutterOverlayWindow.isActive: $isActive');
      if (!isActive) {
        debugPrint('[OverlayService] Calling FlutterOverlayWindow.showOverlay...');
        await FlutterOverlayWindow.showOverlay(
          enableDrag: true,
          overlayTitle: "Safety Mode Active",
          overlayContent: "Continuous protection & check-in countdown",
          flag: OverlayFlag.defaultFlag,
          alignment: OverlayAlignment.topCenter,
          visibility: NotificationVisibility.visibilityPublic,
          positionGravity: PositionGravity.auto,
          width: WindowSize.matchParent,
          height: 380,
        );
        _isOverlayVisible = true;
        debugPrint('[OverlayService] FlutterOverlayWindow.showOverlay completed.');
      }

      // Send initial state data to overlay isolate
      await updateOverlayData(
        secondsRemaining: secondsRemaining,
        mode: mode,
      );
    } catch (e, stack) {
      debugPrint('[OverlayService] showSafetyOverlay ERROR: $e\n$stack');
    }
  }

  /// Send state updates (countdown, mode shift) to the floating overlay window
  static Future<void> updateOverlayData({
    required int secondsRemaining,
    required OverlayStateMode mode,
  }) async {
    try {
      final isActive = await FlutterOverlayWindow.isActive();
      if (isActive) {
        await FlutterOverlayWindow.shareData(jsonEncode({
          'secondsRemaining': secondsRemaining,
          'mode': mode.name,
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
      }
    } catch (_) {}
  }

  /// Send incoming call presentation to the floating overlay window
  static Future<void> showIncomingCallOverlay({
    required String callerName,
    required String callerRole,
    required String channelName,
    String? token,
    required String sessionId,
    required String userId,
  }) async {
    try {
      final isActive = await FlutterOverlayWindow.isActive();
      if (isActive) {
        try {
          await FlutterOverlayWindow.resizeOverlay(WindowSize.matchParent, 560, false);
        } catch (_) {}
        await FlutterOverlayWindow.shareData(jsonEncode({
          'mode': OverlayStateMode.incomingCall.name,
          'callerName': callerName,
          'callerRole': callerRole,
          'channelName': channelName,
          'token': token,
          'sessionId': sessionId,
          'userId': userId,
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }));
      }
    } catch (_) {}
  }

  /// Restore normal overlay size and mode after call ends or declines
  static Future<void> dismissIncomingCallOverlay({
    required int secondsRemaining,
    required OverlayStateMode mode,
  }) async {
    try {
      final isActive = await FlutterOverlayWindow.isActive();
      if (isActive) {
        try {
          await FlutterOverlayWindow.resizeOverlay(WindowSize.matchParent, 480, true);
        } catch (_) {}
        await updateOverlayData(
          secondsRemaining: secondsRemaining,
          mode: mode,
        );
      }
    } catch (_) {}
  }

  /// Close and dismiss the floating overlay window
  static Future<void> closeOverlay() async {
    try {
      final isActive = await FlutterOverlayWindow.isActive();
      if (isActive) {
        await FlutterOverlayWindow.closeOverlay();
      }
      _isOverlayVisible = false;
    } catch (_) {}
  }
}
