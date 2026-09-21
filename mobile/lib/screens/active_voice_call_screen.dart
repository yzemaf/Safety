import 'dart:async';
import 'dart:math' as math;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vibration/vibration.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import '../providers/auth_provider.dart';
import '../providers/safety_session_provider.dart';
import '../services/agora_service.dart';
import '../services/api_service.dart';
import '../services/firebase_firestore_service.dart';
import '../services/foreground_call_service.dart';
import '../services/overlay_service.dart';
import '../services/storage_service.dart';

enum VoiceCallUiState {
  ringing,
  connecting,
  connected,
  ended,
}

class ActiveVoiceCallScreen extends StatefulWidget {
  final String callerName;
  final String callerRole;
  final String channelName;
  final String? token;
  final String sessionId;
  final String userId;
  final bool autoAnswer;

  const ActiveVoiceCallScreen({
    super.key,
    required this.callerName,
    required this.callerRole,
    required this.channelName,
    this.token,
    required this.sessionId,
    required this.userId,
    this.autoAnswer = false,
  });

  static bool _isCallScreenActive = false;
  static String? _lastHandledChannelName;
  static DateTime? _lastHandledChannelTime;

  static Future<void> show({
    required String callerName,
    required String callerRole,
    required String channelName,
    String? token,
    required String sessionId,
    required String userId,
    bool fromNativeIntent = false,
    bool autoAnswer = false,
  }) async {
    final now = DateTime.now();
    if (_isCallScreenActive) {
      debugPrint('[Voice Call] Screen is already active. Ignoring duplicate call trigger.');
      return;
    }

    if (_lastHandledChannelName == channelName &&
        _lastHandledChannelTime != null &&
        now.difference(_lastHandledChannelTime!) < const Duration(seconds: 12)) {
      debugPrint('[Voice Call] Duplicate or late FCM/Firestore call trigger ignored for channel $channelName.');
      return;
    }

    _lastHandledChannelName = channelName;
    _lastHandledChannelTime = now;

    // Only invoke native bringAppToForeground if NOT already triggered from native intent
    if (!fromNativeIntent) {
      ForegroundCallService.bringAppToForeground(
        callerName: callerName,
        callerRole: callerRole,
        channelName: channelName,
        token: token,
        sessionId: sessionId,
        userId: userId,
      );
    }

    var navState = navigatorKey.currentState;
    if (navState == null) {
      await Future.delayed(const Duration(milliseconds: 300));
      navState = navigatorKey.currentState;
    }

    if (navState == null) {
      debugPrint('[Voice Call] Navigator state is null. Cannot show call screen.');
      return;
    }

    final effectiveAutoAnswer = autoAnswer ||
        (StorageService.loadUser().settings.callHandlingPreference == 'auto_answer_speaker');

    _isCallScreenActive = true;
    try {
      await navState.push(
        PageRouteBuilder(
          opaque: true,
          pageBuilder: (_, animation, secondaryAnimation) => ActiveVoiceCallScreen(
            callerName: callerName,
            callerRole: callerRole,
            channelName: channelName,
            token: token,
            sessionId: sessionId,
            userId: userId,
            autoAnswer: effectiveAutoAnswer,
          ),
          transitionsBuilder: (_, animation, __, child) {
            return FadeTransition(
              opacity: animation,
              child: child,
            );
          },
          transitionDuration: const Duration(milliseconds: 200),
        ),
      );

    } finally {
      _isCallScreenActive = false;
    }
  }

  @override
  State<ActiveVoiceCallScreen> createState() => _ActiveVoiceCallScreenState();
}

class _ActiveVoiceCallScreenState extends State<ActiveVoiceCallScreen>
    with TickerProviderStateMixin {
  VoiceCallUiState _uiState = VoiceCallUiState.ringing;
  Timer? _vibrationTimer;
  Timer? _ringTimeoutTimer;
  Timer? _uiDurationTimer;
  int _uiDurationSeconds = 0;
  StreamSubscription<CallStatus>? _agoraStatusSub;
  StreamSubscription<DocumentSnapshot>? _firebaseCallSub;
  bool _isProcessingAction = false;
  bool _canPop = false;

  // ── Animation controllers ──────────────────────────────────────────────────
  late AnimationController _pulseController;
  late AnimationController _acceptBounceController;
  late Animation<double> _acceptBounceAnim;
  late AnimationController _declineBounceController;
  late Animation<double> _declineBounceAnim;

  // ── Drag state ─────────────────────────────────────────────────────────────
  double _acceptDragOffsetY = 0;
  bool _acceptDragActive = false;
  double _declineDragOffsetY = 0;
  bool _declineDragActive = false;
  static const double _dragThreshold = -80.0;

  @override
  void initState() {
    super.initState();

    // ── Pulse ring around avatar ───────────────────────────────────────────
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    // ── Accept button bounce ──────────────────────────────────────────────
    _acceptBounceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _acceptBounceAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _acceptBounceController, curve: Curves.elasticOut),
    );
    _acceptBounceController.repeat(period: const Duration(milliseconds: 1600));

    // ── Decline button bounce (phase-offset) ─────────────────────────────
    _declineBounceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _declineBounceAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _declineBounceController, curve: Curves.elasticOut),
    );
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        _declineBounceController.repeat(period: const Duration(milliseconds: 1600));
      }
    });

    // Dismiss system call notification and stop external ringtone now that Flutter UI is mounted
    ForegroundCallService.dismissCallNotification();

    final bool shouldAutoAnswer = widget.autoAnswer ||
        (StorageService.loadUser().settings.callHandlingPreference == 'auto_answer_speaker');

    if (shouldAutoAnswer) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _acceptCall(auto: true);
      });
    } else {
      _startVibrationPattern();
    }


    // 1. Listen directly to Cloud Firestore for Remote Call Status (Admin Hangup/Decline)
    try {
      final targetDocId = widget.userId.isNotEmpty ? widget.userId : widget.sessionId;
      if (targetDocId.isNotEmpty) {
        _firebaseCallSub = FirebaseFirestore.instance
            .collection('calls')
            .doc(targetDocId)
            .snapshots()
            .listen((snapshot) {
          if (!mounted || !snapshot.exists || snapshot.data() == null) return;

          final val = Map<String, dynamic>.from(snapshot.data() as Map);
          final status = val['status']?.toString();

          if (status == 'ended' || status == 'declined' || status == 'missed') {
            if (_uiState != VoiceCallUiState.ended) {
              debugPrint('[Voice Call] Remote call status updated to $status — ending call UI');
              _handleRemoteCallEnded();
            }
          }
        });
      }
    } catch (e) {
      debugPrint('[Voice Call] Firestore call sub error: $e');
    }

    // 2. Listen to Agora engine status changes (e.g. remote user ended active connected call)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final sessionProv = context.read<SafetySessionProvider>();
      _agoraStatusSub = sessionProv.agoraService.onStatusChanged.listen((status) {
        if (!mounted) return;
        debugPrint('[Voice Call Screen] Agora status update: $status');
        // Only react to Agora CallStatus.ended AFTER user has connected/accepted call (not while ringing)
        if (status == CallStatus.ended && _uiState != VoiceCallUiState.ringing) {
          _handleRemoteCallEnded();
        } else if (status == CallStatus.inCall) {
          // Agora confirmed join — configure audio routing and ensure UI is connected
          sessionProv.agoraService.configureAudioAfterJoin();
          if (_uiState != VoiceCallUiState.connected) {
            setState(() {
              _uiState = VoiceCallUiState.connected;
            });
          }
        } else if (status == CallStatus.error && _uiState != VoiceCallUiState.ended) {
          setState(() {
            _uiState = VoiceCallUiState.connected;
          });
        }
      });

      // Check for auto-answer preference
      try {
        final user = context.read<AuthProvider>().user;
        if (user.settings.callHandlingPreference == 'auto_answer_speaker') {
          _acceptCall(auto: true);
        }
      } catch (_) {}
    });

    // Ringing timeout (45 seconds)
    _ringTimeoutTimer = Timer(const Duration(seconds: 45), () {
      if (mounted && _uiState == VoiceCallUiState.ringing) {
        _declineCall();
      }
    });
  }

  void _closeScreen() {
    if (!mounted) return;
    _canPop = true;
    ForegroundCallService.dismissCallNotification();
    final nav = Navigator.of(context, rootNavigator: true);
    if (nav.canPop()) {
      nav.pop();
    }
    try {
      final sessionProv = context.read<SafetySessionProvider>();
      OverlayService.dismissIncomingCallOverlay(
        secondsRemaining: sessionProv.secondsRemaining,
        mode: sessionProv.isGracePeriodActive ? OverlayStateMode.graceWarning : OverlayStateMode.active,
      );
    } catch (_) {}
  }

  void _handleRemoteCallEnded() {
    if (_uiState == VoiceCallUiState.ended) return;
    _stopVibration();
    _ringTimeoutTimer?.cancel();
    if (mounted) {
      setState(() {
        _uiState = VoiceCallUiState.ended;
      });
      Future.delayed(const Duration(milliseconds: 400), () {
        _closeScreen();
      });
    }
  }

  /// Fires 3 quick vibration bursts then pauses — repeats every 2.4 s.
  void _startVibrationPattern() {
    _fireTripleBurst();
    _vibrationTimer = Timer.periodic(const Duration(milliseconds: 2400), (_) {
      if (_uiState == VoiceCallUiState.ringing) {
        _fireTripleBurst();
      }
    });
  }

  Future<void> _fireTripleBurst() async {
    try {
      final hasVibrator = await Vibration.hasVibrator();
      if (hasVibrator == true) {
        Vibration.vibrate(pattern: [0, 220, 180, 220, 180, 220]);
        return;
      }
    } catch (e) {
      debugPrint('[Voice Call] Vibration error: $e');
    }
    // Strong system vibration fallback sequence
    try {
      HapticFeedback.vibrate();
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      HapticFeedback.vibrate();
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      HapticFeedback.vibrate();
    } catch (_) {}
  }

  void _stopVibration() {
    _vibrationTimer?.cancel();
    _vibrationTimer = null;
    try {
      Vibration.cancel();
    } catch (_) {}
  }

  Future<void> _acceptCall({bool auto = false}) async {
    if (_isProcessingAction) return;
    _isProcessingAction = true;
    _stopVibration();
    String effectiveUserId = widget.userId;
    if (effectiveUserId.isEmpty && mounted) {
      try {
        effectiveUserId = context.read<AuthProvider>().user.id;
      } catch (_) {}
    }

    String effectiveSessionId = widget.sessionId;
    if (effectiveSessionId.isEmpty && mounted) {
      try {
        effectiveSessionId = context.read<SafetySessionProvider>().currentSession?.id ?? '';
      } catch (_) {}
    }

    setState(() {
      _uiState = VoiceCallUiState.connecting;
    });

    // 1. Dual Signaling: Instant Firestore update & Backend API sync
    FirebaseFirestoreService.respondToCall(
      sessionId: effectiveSessionId,
      userId: effectiveUserId,
      status: 'accepted',
    );
    if (effectiveSessionId.isNotEmpty) {
      ApiService().respondToCall(
        sessionId: effectiveSessionId,
        status: 'accepted',
        userId: effectiveUserId,
      );
    }

    // 2. Join Agora Voice Channel
    // UI timer starts immediately so the clock ticks from 0:00 during connection
    // The Agora onJoinChannelSuccess callback will confirm actual audio is live
    if (mounted) {
      final sessionProv = context.read<SafetySessionProvider>();
      final success = await sessionProv.agoraService.startEmergencyVoiceLink(
        channelName: widget.channelName,
        responderName: widget.callerName,
        token: widget.token,
        uid: 2,
        autoAnswer: auto,
      );

      if (mounted) {
        _isProcessingAction = false;
        // Always transition to connected UI after accept so user can manage the call
        setState(() {
          _uiState = VoiceCallUiState.connected;
        });
        // Start UI-level fallback duration timer immediately
        _startUiDurationTimer();
        if (!success) {
          debugPrint('[Voice Call Screen] ⚠️ startEmergencyVoiceLink returned false — check Agora logs');
        }
      }
    }
  }

  void _startUiDurationTimer() {
    _uiDurationTimer?.cancel();
    _uiDurationSeconds = 0;
    _uiDurationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _uiDurationSeconds++;
        });
      }
    });
  }

  Future<void> _declineCall() async {
    if (_isProcessingAction) return;
    _isProcessingAction = true;
    _stopVibration();
    _ringTimeoutTimer?.cancel();

    final effectiveUserId = widget.userId.isNotEmpty
        ? widget.userId
        : (mounted ? context.read<AuthProvider>().user.id : '');
    final effectiveSessionId = widget.sessionId.isNotEmpty
        ? widget.sessionId
        : (mounted ? context.read<SafetySessionProvider>().currentSession?.id ?? '' : '');

    if (mounted) {
      setState(() {
        _uiState = VoiceCallUiState.ended;
      });
    }

    // Dual Signaling: Instant Firestore update & Backend API sync
    FirebaseFirestoreService.respondToCall(
      sessionId: effectiveSessionId,
      userId: effectiveUserId,
      status: 'declined',
    );
    if (effectiveSessionId.isNotEmpty) {
      ApiService().respondToCall(
        sessionId: effectiveSessionId,
        status: 'declined',
        userId: effectiveUserId,
      );
    }

    _closeScreen();
  }

  Future<void> _endActiveCall() async {
    if (_isProcessingAction) return;
    _isProcessingAction = true;
    _stopVibration();
    _ringTimeoutTimer?.cancel();

    final effectiveUserId = widget.userId.isNotEmpty
        ? widget.userId
        : (mounted ? context.read<AuthProvider>().user.id : '');
    final effectiveSessionId = widget.sessionId.isNotEmpty
        ? widget.sessionId
        : (mounted ? context.read<SafetySessionProvider>().currentSession?.id ?? '' : '');

    if (mounted) {
      setState(() {
        _uiState = VoiceCallUiState.ended;
      });
    }

    if (mounted) {
      final sessionProv = context.read<SafetySessionProvider>();
      await sessionProv.agoraService.endCall();
    }

    // Dual Signaling: Instant Firestore update & Backend API sync
    FirebaseFirestoreService.respondToCall(
      sessionId: effectiveSessionId,
      userId: effectiveUserId,
      status: 'ended',
    );
    if (effectiveSessionId.isNotEmpty) {
      ApiService().endCall(
        sessionId: effectiveSessionId,
        userId: effectiveUserId,
      );
    }

    _closeScreen();
  }

  String _formatDuration(int totalSeconds) {
    final mins = totalSeconds ~/ 60;
    final secs = totalSeconds % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  // ── Drag helpers ────────────────────────────────────────────────────────
  double _dragTranslation(double dy) {
    if (dy >= 0) return 0;
    return math.max(dy, _dragThreshold * 1.3);
  }

  double _dragProgress(double dy) {
    if (dy >= 0) return 0;
    return (dy / _dragThreshold).clamp(0.0, 1.0);
  }

  @override
  void dispose() {
    ActiveVoiceCallScreen._isCallScreenActive = false;
    ActiveVoiceCallScreen._lastHandledChannelName = null;
    ActiveVoiceCallScreen._lastHandledChannelTime = null;
    _firebaseCallSub?.cancel();
    _agoraStatusSub?.cancel();
    _uiDurationTimer?.cancel();
    _stopVibration();
    _ringTimeoutTimer?.cancel();
    _pulseController.dispose();
    _acceptBounceController.dispose();
    _declineBounceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Watch SafetySessionProvider so mute/speaker state changes rebuild this widget
    final agora = context.watch<SafetySessionProvider>().agoraService;

    return PopScope(
      canPop: _canPop,
      onPopInvoked: (didPop) {
        if (!didPop) {
          if (_uiState == VoiceCallUiState.ringing) {
            _declineCall();
          } else {
            _endActiveCall();
          }
        }
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              children: [
                // Top Header Bar with Brand Badge
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Dismiss Button
                    GestureDetector(
                      onTap: () {
                        if (_uiState == VoiceCallUiState.ringing) {
                          _declineCall();
                        } else {
                          _endActiveCall();
                        }
                      },
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFFF1F5F9),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: const Icon(
                          Icons.keyboard_arrow_down_rounded,
                          color: Color(0xFF64748B),
                          size: 22,
                        ),
                      ),
                    ),

                    // Brand Pill
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFFA5D6A7)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: Image.asset(
                              'assets/images/safety.jpg',
                              width: 14,
                              height: 14,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.shield_rounded,
                                size: 13,
                                color: Color(0xFF1B8529),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'SAFETY VOICE LINK',
                            style: GoogleFonts.plusJakartaSans(
                              color: const Color(0xFF1B8529),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(width: 36),
                  ],
                ),

                const Spacer(flex: 2),

                // Avatar with pulse ring during ringing
                Center(
                  child: AnimatedBuilder(
                    animation: _pulseController,
                    builder: (context, child) {
                      final isRinging = _uiState == VoiceCallUiState.ringing;
                      final val = isRinging ? _pulseController.value : 0.0;
                      return Stack(
                        alignment: Alignment.center,
                        children: [
                          // Outer pulse ring
                          if (isRinging)
                            Container(
                              width: 96 + (val * 40),
                              height: 96 + (val * 40),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFF1B8529)
                                    .withOpacity((1.0 - val) * 0.10),
                                border: Border.all(
                                  color: const Color(0xFFA5D6A7)
                                      .withOpacity((1.0 - val) * 0.45),
                                  width: 1.5,
                                ),
                              ),
                            ),
                          // Avatar circle
                          Container(
                            width: 96,
                            height: 96,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                              border: Border.all(
                                color: _uiState == VoiceCallUiState.connected
                                    ? const Color(0xFF1B8529)
                                    : _uiState == VoiceCallUiState.ended
                                        ? const Color(0xFFEF4444)
                                        : const Color(0xFFA5D6A7),
                                width: 2.5,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: (_uiState == VoiceCallUiState.ended
                                          ? const Color(0xFFEF4444)
                                          : const Color(0xFF1B8529))
                                      .withOpacity(0.08),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: ClipOval(
                              child: Image.asset(
                                'assets/images/safety.jpg',
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(
                                    Icons.shield_rounded,
                                    size: 44,
                                    color: Color(0xFF1B8529),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),

                const SizedBox(height: 24),

                // Caller Information
                Text(
                  widget.callerName,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: const Color(0xFF0F172A),
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${widget.callerRole} • Safety Command Center',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: const Color(0xFF64748B),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),

                const SizedBox(height: 16),

                // Minimalist Call Status Badge
                if (_uiState == VoiceCallUiState.connected)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F5E9),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: const Color(0xFFA5D6A7),
                        width: 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Color(0xFF1B8529),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatDuration(_uiDurationSeconds),
                          style: GoogleFonts.jetBrainsMono(
                            color: const Color(0xFF1B8529),
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ],
                    ),
                  )
                else if (_uiState == VoiceCallUiState.connecting)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF0F9FF),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFBAE6FD)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF0284C7),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Connecting voice link...',
                          style: GoogleFonts.plusJakartaSans(
                            color: const Color(0xFF0284C7),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  )
                else if (_uiState == VoiceCallUiState.ended)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFFECACA)),
                    ),
                    child: Text(
                      'Call Ended',
                      style: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFFDC2626),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F5E9),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFA5D6A7)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.phone_in_talk_rounded,
                          size: 13,
                          color: Color(0xFF1B8529),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Incoming Dispatch Call...',
                          style: GoogleFonts.plusJakartaSans(
                            color: const Color(0xFF1B8529),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),

                const Spacer(flex: 3),

                // Minimalist Bottom Controls
                if (_uiState == VoiceCallUiState.connected) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      // Mute Toggle
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () => agora.toggleMute(),
                            child: Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: agora.isMuted
                                    ? const Color(0xFFFFF7ED)
                                    : const Color(0xFFF8FAFC),
                                border: Border.all(
                                  color: agora.isMuted
                                      ? const Color(0xFFFED7AA)
                                      : const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: Icon(
                                agora.isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                                color: agora.isMuted
                                    ? const Color(0xFFC2410C)
                                    : const Color(0xFF334155),
                                size: 22,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            agora.isMuted ? 'Muted' : 'Mute',
                            style: GoogleFonts.plusJakartaSans(
                              color: const Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),

                      // End Call Button
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: _endActiveCall,
                            child: Container(
                              width: 64,
                              height: 64,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: const Color(0xFFEF4444),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFEF4444).withOpacity(0.25),
                                    blurRadius: 12,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.call_end_rounded,
                                color: Colors.white,
                                size: 28,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'End',
                            style: GoogleFonts.plusJakartaSans(
                              color: const Color(0xFFEF4444),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),

                      // Speaker Toggle
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () => agora.toggleSpeaker(),
                            child: Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: agora.isSpeakerOn
                                    ? const Color(0xFFE8F5E9)
                                    : const Color(0xFFF8FAFC),
                                border: Border.all(
                                  color: agora.isSpeakerOn
                                      ? const Color(0xFFA5D6A7)
                                      : const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: Icon(
                                agora.isSpeakerOn
                                    ? Icons.volume_up_rounded
                                    : Icons.volume_off_rounded,
                                color: agora.isSpeakerOn
                                    ? const Color(0xFF1B8529)
                                    : const Color(0xFF334155),
                                size: 22,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            agora.isSpeakerOn ? 'Speaker' : 'Earpiece',
                            style: GoogleFonts.plusJakartaSans(
                              color: const Color(0xFF64748B),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ] else if (_uiState == VoiceCallUiState.ringing) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // ── Decline button ──────────────────────────────────
                      GestureDetector(
                        onTap: _declineCall,
                        onVerticalDragStart: (_) {
                          setState(() {
                            _declineDragActive = true;
                            _declineDragOffsetY = 0;
                          });
                          _declineBounceController.stop();
                        },
                        onVerticalDragUpdate: (d) {
                          setState(() {
                            _declineDragOffsetY =
                                (_declineDragOffsetY + d.delta.dy).clamp(-200.0, 60.0);
                          });
                        },
                        onVerticalDragEnd: (_) {
                          if (_declineDragOffsetY <= _dragThreshold) {
                            HapticFeedback.heavyImpact();
                            _declineCall();
                          } else {
                            setState(() {
                              _declineDragOffsetY = 0;
                              _declineDragActive = false;
                            });
                            _declineBounceController.repeat(
                              period: const Duration(milliseconds: 1600),
                            );
                          }
                        },
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedOpacity(
                              opacity: _dragProgress(_declineDragOffsetY).clamp(0.0, 1.0),
                              duration: Duration.zero,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Text(
                                  'Release to Decline',
                                  style: GoogleFonts.plusJakartaSans(
                                    color: const Color(0xFFDC2626),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            AnimatedBuilder(
                              animation: _declineBounceAnim,
                              builder: (context, child) {
                                final bounceY = _declineDragActive
                                    ? 0.0
                                    : -8.0 *
                                        math.sin(_declineBounceAnim.value * math.pi).abs();
                                final dragY = _dragTranslation(_declineDragOffsetY);
                                final progress = _dragProgress(_declineDragOffsetY);
                                return Transform.translate(
                                  offset: Offset(0, bounceY + dragY),
                                  child: Transform.scale(
                                    scale: 1.0 + progress * 0.15,
                                    child: child,
                                  ),
                                );
                              },
                              child: Container(
                                width: 62,
                                height: 62,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFFFEF2F2),
                                  border: Border.all(
                                      color: const Color(0xFFFECACA), width: 1.5),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFFEF4444).withOpacity(0.12),
                                      blurRadius: 12,
                                      offset: const Offset(0, 3),
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.call_end_rounded,
                                  color: Color(0xFFDC2626),
                                  size: 26,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Decline',
                              style: GoogleFonts.plusJakartaSans(
                                color: const Color(0xFF64748B),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            AnimatedOpacity(
                              opacity: _declineDragActive ? 0.0 : 1.0,
                              duration: const Duration(milliseconds: 200),
                              child: const Icon(
                                Icons.keyboard_arrow_up_rounded,
                                size: 18,
                                color: Color(0xFF94A3B8),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // ── Accept button ───────────────────────────────────
                      GestureDetector(
                        onTap: () => _acceptCall(),
                        onVerticalDragStart: (_) {
                          setState(() {
                            _acceptDragActive = true;
                            _acceptDragOffsetY = 0;
                          });
                          _acceptBounceController.stop();
                        },
                        onVerticalDragUpdate: (d) {
                          setState(() {
                            _acceptDragOffsetY =
                                (_acceptDragOffsetY + d.delta.dy).clamp(-200.0, 60.0);
                          });
                        },
                        onVerticalDragEnd: (_) {
                          if (_acceptDragOffsetY <= _dragThreshold) {
                            HapticFeedback.heavyImpact();
                            _acceptCall();
                          } else {
                            setState(() {
                              _acceptDragOffsetY = 0;
                              _acceptDragActive = false;
                            });
                            _acceptBounceController.repeat(
                              period: const Duration(milliseconds: 1600),
                            );
                          }
                        },
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AnimatedOpacity(
                              opacity: _dragProgress(_acceptDragOffsetY).clamp(0.0, 1.0),
                              duration: Duration.zero,
                              child: Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Text(
                                  'Release to Accept',
                                  style: GoogleFonts.plusJakartaSans(
                                    color: const Color(0xFF1B8529),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            AnimatedBuilder(
                              animation: _acceptBounceAnim,
                              builder: (context, child) {
                                final bounceY = _acceptDragActive
                                    ? 0.0
                                    : -8.0 *
                                        math.sin(_acceptBounceAnim.value * math.pi).abs();
                                final dragY = _dragTranslation(_acceptDragOffsetY);
                                final progress = _dragProgress(_acceptDragOffsetY);
                                return Transform.translate(
                                  offset: Offset(0, bounceY + dragY),
                                  child: Transform.scale(
                                    scale: 1.0 + progress * 0.15,
                                    child: child,
                                  ),
                                );
                              },
                              child: Container(
                                width: 62,
                                height: 62,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFF1B8529),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF1B8529).withOpacity(0.28),
                                      blurRadius: 16,
                                      offset: const Offset(0, 4),
                                    ),
                                    BoxShadow(
                                      color: const Color(0xFF1B8529).withOpacity(0.15),
                                      blurRadius: 30,
                                      spreadRadius: 4,
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.call_rounded,
                                  color: Colors.white,
                                  size: 26,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Accept',
                              style: GoogleFonts.plusJakartaSans(
                                color: const Color(0xFF1B8529),
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            AnimatedOpacity(
                              opacity: _acceptDragActive ? 0.0 : 1.0,
                              duration: const Duration(milliseconds: 200),
                              child: const Icon(
                                Icons.keyboard_arrow_up_rounded,
                                size: 18,
                                color: Color(0xFF1B8529),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Text(
                      'Call Ended',
                      style: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFF64748B),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
