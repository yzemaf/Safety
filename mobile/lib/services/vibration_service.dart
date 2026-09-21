import 'dart:async';
import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';

/// Centralized service for warning and emergency hardware vibration patterns
class VibrationService {
  static bool? _hasVibrator;
  static bool? _hasCustomVibrations;

  static Future<void> _checkCapabilities() async {
    if (_hasVibrator != null) return;
    try {
      _hasVibrator = await Vibration.hasVibrator();
      _hasCustomVibrations = await Vibration.hasCustomVibrationsSupport();
    } catch (_) {
      _hasVibrator = false;
      _hasCustomVibrations = false;
    }
  }


  /// Distinct double-pulse warning vibration for safety check-in warning / grace period
  static Future<void> vibrateWarning() async {
    try {
      await _checkCapabilities();
      if (_hasVibrator == true) {
        if (_hasCustomVibrations == true) {
          await Vibration.vibrate(
            pattern: [0, 350, 150, 350],
            intensities: [0, 200, 0, 255],
          );
        } else {
          await Vibration.vibrate(duration: 450);
        }
      } else {
        HapticFeedback.heavyImpact();
      }
    } catch (_) {
      HapticFeedback.heavyImpact();
    }
  }

  /// High-urgency distress alarm vibration pattern for emergency mode
  static Future<void> vibrateEmergency() async {
    try {
      await _checkCapabilities();
      if (_hasVibrator == true) {
        if (_hasCustomVibrations == true) {
          await Vibration.vibrate(
            pattern: [0, 350, 120, 350, 120, 700, 150, 700],
            intensities: [0, 255, 0, 255, 0, 255, 0, 255],
          );
        } else {
          await Vibration.vibrate(duration: 900);
        }
      } else {
        HapticFeedback.heavyImpact();
      }
    } catch (_) {
      HapticFeedback.heavyImpact();
    }
  }

  /// Short single alert pulse
  static Future<void> vibratePulse() async {
    try {
      await _checkCapabilities();
      if (_hasVibrator == true) {
        await Vibration.vibrate(duration: 250);
      } else {
        HapticFeedback.mediumImpact();
      }
    } catch (_) {
      HapticFeedback.mediumImpact();
    }
  }

  /// Cancels all active vibrations immediately
  static Future<void> cancel() async {
    try {
      await Vibration.cancel();
    } catch (_) {}
  }
}
