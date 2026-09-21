import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';

class SafetyOverlayWidget extends StatefulWidget {
  const SafetyOverlayWidget({super.key});

  @override
  State<SafetyOverlayWidget> createState() => _SafetyOverlayWidgetState();
}

class _SafetyOverlayWidgetState extends State<SafetyOverlayWidget>
    with SingleTickerProviderStateMixin {
  int _secondsRemaining = 300;
  String _mode = 'active'; // 'active' | 'graceWarning' | 'emergency' | 'incomingCall'
  String _callerName = 'Safety Command Dispatcher';
  String _callerRole = 'Control Room Officer';
  String _channelName = 'safety_channel';
  String? _token;
  String _sessionId = '';
  String _userId = '';

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    debugPrint('[SafetyOverlayWidget] initState initialized with remaining: $_secondsRemaining, mode: $_mode');
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Listen to live data stream from main app isolate
    FlutterOverlayWindow.overlayListener.listen((data) {
      if (data != null && mounted) {
        try {
          final decoded = jsonDecode(data.toString());
          debugPrint('[SafetyOverlayWidget] Data received: $decoded');
          setState(() {
            _secondsRemaining = decoded['secondsRemaining'] ?? _secondsRemaining;
            _mode = decoded['mode'] ?? _mode;
            if (decoded['callerName'] != null) _callerName = decoded['callerName'];
            if (decoded['callerRole'] != null) _callerRole = decoded['callerRole'];
            if (decoded['channelName'] != null) _channelName = decoded['channelName'];
            if (decoded['token'] != null) _token = decoded['token'];
            if (decoded['sessionId'] != null) _sessionId = decoded['sessionId'];
            if (decoded['userId'] != null) _userId = decoded['userId'];
          });
        } catch (_) {}
      }
    });
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  String _formatTime(int totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    final minutes = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final seconds = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  void _onCheckInTap() {
    HapticFeedback.mediumImpact();
    // Send check-in event back to main app isolate
    FlutterOverlayWindow.shareData(jsonEncode({'action': 'checkIn'}));
  }

  void _onSosTap() {
    HapticFeedback.heavyImpact();
    // Send SOS escalation event to main app
    FlutterOverlayWindow.shareData(jsonEncode({'action': 'emergencySos'}));
  }

  void _onAcceptCallTap() {
    HapticFeedback.heavyImpact();
    FlutterOverlayWindow.shareData(jsonEncode({
      'action': 'acceptCall',
      'callerName': _callerName,
      'callerRole': _callerRole,
      'channelName': _channelName,
      'token': _token,
      'sessionId': _sessionId,
      'userId': _userId,
    }));
  }

  void _onDeclineCallTap() {
    HapticFeedback.mediumImpact();
    setState(() {
      _mode = 'active';
    });
    FlutterOverlayWindow.shareData(jsonEncode({'action': 'declineCall'}));
  }

  @override
  Widget build(BuildContext context) {
    if (_mode == 'incomingCall') {
      return _buildIncomingCallCard();
    }

    final isEmergency = _mode == 'emergency';
    final isGrace = _mode == 'graceWarning';

    final Color bgColor = isEmergency
        ? const Color(0xFF450A0A)
        : (isGrace ? const Color(0xFF7C2D12) : const Color(0xFF0F172A));

    final Color accentColor = isEmergency
        ? const Color(0xFFEF4444)
        : (isGrace ? const Color(0xFFF97316) : const Color(0xFF10B981));

    return Material(
      color: Colors.transparent,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: bgColor.withOpacity(0.96),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: accentColor.withOpacity(0.6), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: accentColor.withOpacity(0.25),
                blurRadius: 16,
                spreadRadius: 2,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              // Glowing Live Status Indicator
              ScaleTransition(
                scale: _pulseAnimation,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: accentColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: accentColor,
                        blurRadius: 6,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Mode Label & Countdown Timer
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        isEmergency
                            ? '🚨 EMERGENCY SOS'
                            : (isGrace ? '⚠️ CHECK IN REQUIRED' : 'SAFETY WALK ACTIVE'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: accentColor,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                          height: 1.1,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        isEmergency
                            ? 'Help Requested'
                            : _formatTime(_secondsRemaining),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          height: 1.1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Action Buttons
              if (isGrace || !isEmergency)
                InkWell(
                  onTap: _onCheckInTap,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: isGrace ? const Color(0xFFF97316) : const Color(0xFF10B981),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      isGrace ? "I'M SAFE" : "Check In",
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),

              if (!isGrace && !isEmergency) const SizedBox(width: 8),

              if (!isEmergency)
                InkWell(
                  onTap: _onSosTap,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withOpacity(0.2),
                      border: Border.all(color: const Color(0xFFEF4444), width: 1.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Text(
                      'SOS',
                      style: TextStyle(
                        color: Color(0xFFEF4444),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Sleek minimalist incoming call presentation in floating overlay
  Widget _buildIncomingCallCard() {
    return Material(
      color: Colors.transparent,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFF10B981), width: 2),
            boxShadow: const [
              BoxShadow(
                color: Color(0x33000000),
                blurRadius: 20,
                spreadRadius: 3,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              // Official Safety Logo / Avatar
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                ),
                child: ClipOval(
                  child: Image.asset(
                    'assets/images/safety.jpg',
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: const Color(0xFFECFDF5),
                      child: const Icon(Icons.call, color: Color(0xFF10B981), size: 22),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),

              // Caller Details
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      '📞 INCOMING CALL',
                      style: TextStyle(
                        color: Color(0xFF10B981),
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _callerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF0F172A),
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      _callerRole,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),

              // Decline Button
              InkWell(
                onTap: _onDeclineCallTap,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFFEF4444), width: 1.5),
                  ),
                  child: const Icon(Icons.call_end, color: Color(0xFFEF4444), size: 18),
                ),
              ),
              const SizedBox(width: 8),

              // Answer Button
              InkWell(
                onTap: _onAcceptCallTap,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(
                    color: Color(0xFF10B981),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.call, color: Colors.white, size: 18),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
