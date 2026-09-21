import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:showcaseview/showcaseview.dart';
import '../config/constants.dart';
import '../models/incident_report.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/incident_provider.dart';
import '../providers/safety_session_provider.dart';
import '../providers/settings_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/overlay_service.dart';
import '../services/storage_service.dart';
import '../services/firebase_firestore_service.dart';
import '../widgets/app_loader.dart';
import '../widgets/in_app_notification.dart';
import '../widgets/safety_pin_sheet.dart';

class SafetyModeScreen extends StatefulWidget {
  const SafetyModeScreen({super.key});

  @override
  State<SafetyModeScreen> createState() => SafetyModeScreenState();
}

class SafetyModeScreenState extends State<SafetyModeScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late AnimationController _scaleController;
  late Animation<double> _scaleAnimation;
  double _previousProgress = 0.0;

  final GlobalKey _powerButtonKey = GlobalKey();
  final GlobalKey _checkInKey = GlobalKey();
  final GlobalKey _endModeKey = GlobalKey();
  final GlobalKey _reportEmergencyKey = GlobalKey();

  bool _isTourActive = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 130),
      lowerBound: 0.0,
      upperBound: 0.05,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _scaleController, curve: Curves.easeInOut),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkAndShowFirstTimeTour();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scaleController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      final sessionProv = context.read<SafetySessionProvider>();
      sessionProv.checkLocationHealth().then((_) {
        if (sessionProv.consumeLocationDisabledNotification() && mounted) {
          AppNotification.show(
            context,
            message: "Safety Mode was automatically turned off because location was disabled.",
            type: NotificationType.warning,
          );
        }
      });
    }
  }

  void startTourFromExternal() {
    if (!mounted) return;
    setState(() {
      _isTourActive = true;
    });
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) {
        ShowcaseView.get().startShowCase([
          _powerButtonKey,
          _checkInKey,
          _endModeKey,
          _reportEmergencyKey,
        ]);
      }
    });
  }

  Future<void> _checkAndShowFirstTimeTour() async {
    final prefs = await SharedPreferences.getInstance();
    final hasSeenTour =
        prefs.getBool(AppConstants.keyHasSeenSafetyModeTour) ?? false;
    if (!hasSeenTour && mounted) {
      await Future.delayed(const Duration(milliseconds: 450));
      if (mounted) {
        setState(() {
          _isTourActive = true;
        });
        ShowcaseView.get().startShowCase([
          _powerButtonKey,
          _checkInKey,
          _endModeKey,
          _reportEmergencyKey,
        ]);
      }
    }
  }

  Future<void> _checkAndPromptSafetyPinAfterTour() async {
    if (!mounted) return;
    final authProv = context.read<AuthProvider>();
    final hasPin = authProv.user.hasSafetyPin || StorageService.hasSafetyPin();
    if (!hasPin) {
      await Future.delayed(const Duration(milliseconds: 350));
      if (!mounted) return;
      await SafetyPinSheet.showSetup(
        context,
        title: 'Set Safety PIN',
        subtitle: 'Create a 4-digit PIN to secure your emergency actions and safety sessions.',
      );
    }
  }

  Future<void> _dismissTour(BuildContext showcaseCtx) async {
    ShowcaseView.get().dismiss();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.keyHasSeenSafetyModeTour, true);
    if (mounted) {
      setState(() {
        _isTourActive = false;
      });
      _checkAndPromptSafetyPinAfterTour();
    }
  }

  void _onReportEmergencyTap(SafetySessionProvider sessionProv, dynamic user) {
    HapticFeedback.heavyImpact();
    // Auto-activate emergency mode
    sessionProv.triggerEmergency(
      user: user,
      reason: 'Self-Reported Emergency Threat',
      incidentProvider: context.read<IncidentProvider>(),
    );

    if (mounted) {
      AppNotification.show(
        context,
        message: "Emergency mode activated, help is on the way.",
        type: NotificationType.error,
      );
      // Bring up the minimalistic threat report bottom sheet right after
      _showSelfTriggeredThreatSheet(context, sessionProv, user);
    }
  }

  Future<bool> _showOverlayPermissionDialog(BuildContext context) async {
    return await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1B8529).withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.picture_in_picture_alt_rounded, color: Color(0xFF1B8529), size: 24),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Text(
                      'Enable Floating Protection',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'Safety uses "Display over other apps" so your live check-in countdown, grace period warnings, and emergency SOS buttons stay floating and accessible if you minimize the app or use other apps.',
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF64748B),
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text(
                        'Not Now',
                        style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1B8529),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text(
                        'Allow Overlay',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ) ?? false;
  }

  Future<void> _handleCancelEmergencyWithPin(
    SafetySessionProvider sessionProv,
    dynamic user, {
    VoidCallback? onDone,
  }) async {
    final authProv = context.read<AuthProvider>();
    final settingsProv = context.read<SettingsProvider>();
    final User effectiveUser = (user is User)
        ? user.copyWith(
            settings: settingsProv.settings,
            emergencyContacts: settingsProv.emergencyContacts,
          )
        : StorageService.loadUser().copyWith(
            settings: settingsProv.settings,
            emergencyContacts: settingsProv.emergencyContacts,
          );

    final hasPin = authProv.user.hasSafetyPin || StorageService.hasSafetyPin();
    if (hasPin) {
      final verified = await SafetyPinSheet.showVerify(
        context,
        title: 'Turn Off Emergency',
        subtitle: 'Enter your 4-digit Safety PIN to deactivate emergency mode.',
      );
      if (!verified || !mounted) return;
    }

    sessionProv.cancelEmergency(effectiveUser);
    onDone?.call();
    if (mounted) {
      AppNotification.show(
        context,
        message: "Emergency cancelled, you are safe.",
        type: NotificationType.info,
      );
    }
  }

  void _onPowerButtonTap(SafetySessionProvider sessionProv, dynamic user) async {
    if (sessionProv.isActivating) return;
    final authProv = context.read<AuthProvider>();
    final settingsProv = context.read<SettingsProvider>();
    final User effectiveUser = (user is User)
        ? user.copyWith(
            settings: settingsProv.settings,
            emergencyContacts: settingsProv.emergencyContacts,
          )
        : StorageService.loadUser().copyWith(
            settings: settingsProv.settings,
            emergencyContacts: settingsProv.emergencyContacts,
          );

    await _scaleController.forward();
    await _scaleController.reverse();

    if (sessionProv.isEmergency) {
      await _handleCancelEmergencyWithPin(sessionProv, effectiveUser);
    } else if (sessionProv.isGracePeriodActive) {
      sessionProv.confirmSafeCheckIn(effectiveUser);
      if (mounted) {
        AppNotification.show(
          context,
          message: "Emergency check-in confirmed! You are safe.",
          type: NotificationType.success,
        );
      }
    } else if (!sessionProv.isActive) {
      // First-time PIN check: If user hasn't configured a safety PIN yet, prompt them first
      final hasPin = authProv.user.hasSafetyPin || StorageService.hasSafetyPin();
      if (!hasPin) {
        if (!mounted) return;
        final pinSet = await SafetyPinSheet.showSetup(
          context,
          title: 'Set Safety PIN',
          subtitle: 'Create a 4-digit PIN to secure your safety sessions and emergency deactivations.',
        );
        if (!pinSet || !mounted) return;
      }

      // Request microphone permission upfront so audio links connect with 0 delay
      try {
        await Permission.microphone.request();
      } catch (_) {}

      // Check overlay permission before launching safety mode
      final hasOverlayPerm = await OverlayService.isPermissionGranted();
      if (!hasOverlayPerm && mounted) {
        final allow = await _showOverlayPermissionDialog(context);
        if (allow) {
          await OverlayService.requestPermission();
        }
      }

      final success = await sessionProv.startSafetyMode(user: effectiveUser);
      if (mounted) {
        if (success) {
          AppNotification.show(
            context,
            message: "Safety mode activated.",
            type: NotificationType.success,
          );
        } else {
          AppNotification.show(
            context,
            message: "Location access is a must to enable Safety Mode and track your walk.",
            type: NotificationType.error,
          );
        }
      }
    } else {
      sessionProv.confirmSafeCheckIn(effectiveUser);
      if (mounted) {
        AppNotification.show(
          context,
          message: "Check-in confirmed.",
          type: NotificationType.success,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionProv = context.watch<SafetySessionProvider>();
    final authProv = context.watch<AuthProvider>();

    if (sessionProv.locationDisabledNotificationPending) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (sessionProv.consumeLocationDisabledNotification() && mounted) {
          AppNotification.show(
            context,
            message: "Safety Mode was automatically turned off because location was disabled.",
            type: NotificationType.warning,
          );
        }
      });
    }

    final user = authProv.user;
    final isActive = sessionProv.isActive;
    final isGrace = sessionProv.isGracePeriodActive;
    final isEmergency = sessionProv.isEmergency;
    final isTimeout = isGrace;
    final battery = sessionProv.locationService.currentBatteryLevel;

    // Minimal Theme Colors
    const Color brandGreen = Color(0xFF1B8529);
    const Color timeoutOrange = Color(0xFFC2410C); // Deep rich burnt orange matching #1B8529
    const Color emergencyDarkRed = Color(0xFF450A0A); // Deep dark red for whole-app emergency

    final Color statusColor = isEmergency
        ? Colors.white
        : (isTimeout
            ? timeoutOrange
            : (isActive ? brandGreen : const Color(0xFF94A3B8)));

    final String userName;
    if (user.isGuest || user.name.trim().isEmpty || user.name == 'Guest') {
      userName = 'Guest';
    } else {
      userName = user.name.trim().split(' ').first;
    }

    final String statusText;
    if (isEmergency) {
      statusText = "Hi $userName, You're now in Emergency mode";
    } else if (isTimeout) {
      statusText = "Hi $userName, please check in to confirm you're safe";
    } else if (isActive) {
      statusText = "Hi $userName, Safety mode is on";
    } else {
      statusText = "Hi $userName, Safety mode is turned off";
    }

    // Both normal walk and warning period have smooth countdown progress!
    final double targetProgress = isEmergency
        ? 0.0
        : (isActive || isTimeout
            ? sessionProv.progressFraction
            : 0.0);

    final bool isResetOrStart = targetProgress > _previousProgress;
    final Duration animDuration = isResetOrStart
        ? const Duration(milliseconds: 350)
        : const Duration(seconds: 1);
    final Curve animCurve = isResetOrStart
        ? Curves.easeOutCubic
        : Curves.linear;

    _previousProgress = targetProgress;

    return ShowCaseWidget(
      onFinish: () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(AppConstants.keyHasSeenSafetyModeTour, true);
        if (mounted) {
          setState(() {
            _isTourActive = false;
          });
          _checkAndPromptSafetyPinAfterTour();
        }
      },
      builder: (showcaseContext) => Scaffold(
          backgroundColor: isEmergency ? emergencyDarkRed : Colors.white,
          body: AnimatedContainer(
            duration: const Duration(milliseconds: 450),
            curve: Curves.easeInOutCubic,
            color: isEmergency ? emergencyDarkRed : Colors.white,
            child: SafeArea(
              child: Column(
                children: [
                  // 1. Discreet Minimal Top Bar
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    child: Row(
                      children: [
                        Image.asset(
                          'assets/images/safety_nobg.png',
                          height: 50,
                          fit: BoxFit.contain,
                          color: isEmergency ? Colors.white : null,
                          errorBuilder: (_, __, ___) => Icon(
                            Icons.shield_rounded,
                            color: isEmergency ? Colors.white : const Color(0xFF1B8529),
                            size: 32,
                          ),
                        ),
                        const Spacer(),
                        // Outlined question mark tooltip trigger icon
                        IconButton(
                          onPressed: () {
                            HapticFeedback.selectionClick();
                            startTourFromExternal();
                          },
                          icon: Icon(
                            Icons.help_outline_rounded,
                            size: 18,
                            color: isEmergency ? Colors.white : const Color(0xFF1B8529),
                          ),
                          tooltip: 'Feature tour',
                          padding: const EdgeInsets.all(4),
                          constraints: const BoxConstraints(),
                          splashRadius: 20,
                        ),
                        // iPhone-style 90-degree Sleeping Battery with Info Popup on Tap
                        GestureDetector(
                          onTap: () => _showBatteryInfoModal(context, battery, isEmergency),
                          behavior: HitTestBehavior.opaque,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                            child: _buildIPhoneSleepingBattery(battery, isEmergency: isEmergency),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // 2. Main Minimal Center Viewport
                  Expanded(
                    child: Center(
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            // Smoothly animated status title / prompt
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 320),
                              switchInCurve: Curves.easeOutCubic,
                              switchOutCurve: Curves.easeInCubic,
                              transitionBuilder: (Widget child, Animation<double> animation) {
                                return FadeTransition(
                                  opacity: animation,
                                  child: SlideTransition(
                                    position: Tween<Offset>(
                                      begin: const Offset(0, 0.12),
                                      end: Offset.zero,
                                    ).animate(animation),
                                    child: child,
                                  ),
                                );
                              },
                              child: Text(
                                statusText,
                                key: ValueKey('${userName}_${isActive}_${isTimeout}_$isEmergency'),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: statusColor,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.1,
                                  height: 1.35,
                                ),
                              ),
                            ),

                            const SizedBox(height: 54),

                            // 3. The Minimalist Power Button with Continuous Smooth Countdown Border
                            Showcase.withWidget(
                              key: _powerButtonKey,
                              targetShapeBorder: const CircleBorder(),
                              targetPadding: const EdgeInsets.all(12),
                              overlayColor: Colors.black,
                              overlayOpacity: 0.72,
                              container: _MinimalTourTooltip(
                                stepIndex: 0,
                                totalSteps: 4,
                                title: 'Check-in Ring',
                                description:
                                    'Tap anytime while active to confirm you are safe and reset the timer. Works exactly the same as the Check-in button.',
                                onNext: () => ShowcaseView.get().next(),
                                onSkip: () => _dismissTour(showcaseContext),
                              ),
                              child: GestureDetector(
                                onTap: () => _onPowerButtonTap(sessionProv, user),
                                child: AnimatedBuilder(
                                  animation: _scaleAnimation,
                                  builder: (context, child) => Transform.scale(
                                    scale: _scaleAnimation.value,
                                    child: child,
                                  ),
                                  child: TweenAnimationBuilder<double>(
                                    tween: Tween<double>(
                                      begin: targetProgress,
                                      end: targetProgress,
                                    ),
                                    duration: animDuration,
                                    curve: animCurve,
                                    builder: (context, smoothProgress, _) {
                                      return _buildCountdownPowerButton(
                                        isActive: isActive,
                                        isTimeout: isTimeout,
                                        isEmergency: isEmergency,
                                        isActivating: sessionProv.isActivating,
                                        progress: smoothProgress,
                                        brandGreen: brandGreen,
                                        timeoutOrange: timeoutOrange,
                                      );
                                    },
                                  ),
                                ),
                              ),
                            ),

                            const SizedBox(height: 48),

                            // 4. Session Controls (End walk / Confirm safe / Cancel Emergency / Report Emergency)
                            if (isEmergency) ...[
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text(
                                    "Help will reach you soon, emergency tracking is active",
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                      letterSpacing: 0.1,
                                    ),
                                  ),
                                  const SizedBox(height: 16),
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: Colors.white.withOpacity(0.35),
                                  ),
                                  const SizedBox(height: 6),
                                  TextButton(
                                    onPressed: () => _handleCancelEmergencyWithPin(sessionProv, user),
                                    child: const Text(
                                      "I'm safe, cancel emergency",
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.1,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: Colors.white.withOpacity(0.35),
                                  ),
                                ],
                              ),
                            ] else if (isTimeout) ...[
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: const Color(0xFFE2E8F0),
                                  ),
                                  const SizedBox(height: 6),
                                  TextButton(
                                    onPressed: () => sessionProv.confirmSafeCheckIn(user),
                                    child: Text(
                                      "I'm safe, confirm check-in (${sessionProv.graceSecondsRemaining}s)",
                                      style: const TextStyle(
                                        color: timeoutOrange,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 0.1,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: const Color(0xFFE2E8F0),
                                  ),
                                ],
                              ),
                            ] else if (isActive || _isTourActive) ...[
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Showcase.withWidget(
                                    key: _checkInKey,
                                    targetShapeBorder: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    targetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                    overlayColor: Colors.black,
                                    overlayOpacity: 0.72,
                                    container: _MinimalTourTooltip(
                                      stepIndex: 1,
                                      totalSteps: 4,
                                      title: 'Check-in Button',
                                      description:
                                          'Tap to extend your walk and reset the countdown timer. Works identically to tapping the center Check-in ring.',
                                      onNext: () => ShowcaseView.get().next(),
                                      onPrev: () => ShowcaseView.get().previous(),
                                      onSkip: () => _dismissTour(showcaseContext),
                                    ),
                                    child: SizedBox(
                                      width: 240,
                                      child: TextButton(
                                        style: TextButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        onPressed: () => sessionProv.confirmSafeCheckIn(user),
                                        child: const Text(
                                          'Check-in',
                                          style: TextStyle(
                                            color: brandGreen,
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: const Color(0xFFE2E8F0),
                                  ),
                                  const SizedBox(height: 4),
                                  Showcase.withWidget(
                                    key: _endModeKey,
                                    targetShapeBorder: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    targetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                    overlayColor: Colors.black,
                                    overlayOpacity: 0.72,
                                    container: _MinimalTourTooltip(
                                      stepIndex: 2,
                                      totalSteps: 4,
                                      title: 'End Safety Mode',
                                      description:
                                          'Conclude your session and stop background GPS tracking once you reach your destination.',
                                      onNext: () => ShowcaseView.get().next(),
                                      onPrev: () => ShowcaseView.get().previous(),
                                      onSkip: () => _dismissTour(showcaseContext),
                                    ),
                                    child: SizedBox(
                                      width: 240,
                                      child: TextButton(
                                        style: TextButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        onPressed: () => sessionProv.endSafetyMode(),
                                        child: const Text(
                                          "End safety mode ",
                                          style: TextStyle(
                                            color: Color(0xFF64748B),
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Container(
                                    width: 48,
                                    height: 1,
                                    color: const Color(0xFFE2E8F0),
                                  ),
                                  const SizedBox(height: 4),
                                  Showcase.withWidget(
                                    key: _reportEmergencyKey,
                                    targetShapeBorder: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    targetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                    overlayColor: Colors.black,
                                    overlayOpacity: 0.72,
                                    container: _MinimalTourTooltip(
                                      stepIndex: 3,
                                      totalSteps: 4,
                                      title: 'Report Emergency',
                                      description:
                                          'Instantly alerts and shares your location with the security team.',
                                      onNext: () => _dismissTour(showcaseContext),
                                      onPrev: () => ShowcaseView.get().previous(),
                                      onSkip: () => _dismissTour(showcaseContext),
                                    ),
                                    child: SizedBox(
                                      width: 200,
                                      child: TextButton(
                                        style: TextButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        ),
                                        onPressed: () => _onReportEmergencyTap(sessionProv, user),
                                        child: const Text(
                                          'Report Emergency',
                                          style: TextStyle(
                                            color: Color(0xFFEF4444),
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],

                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ),
      ),
    );
  }

  void _showSelfTriggeredThreatSheet(
    BuildContext context,
    SafetySessionProvider sessionProv,
    dynamic user,
  ) {
    IncidentCategory selectedCategory = IncidentCategory.physicalThreat;
    final descController = TextEditingController();

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (modalCtx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          final screenHeight = MediaQuery.of(ctx).size.height;
          return Container(
            height: screenHeight * 0.82,
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Center(
                  child: Container(
                    width: 40,
                    height: 4.5,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2E8F0),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                // Main content
                Expanded(
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "Report Emergency",
                          style: TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Help is on the way. Choose threat type if safe to do so.',
                          style: TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 20),
                        DropdownButtonFormField<IncidentCategory>(
                          value: selectedCategory,
                          style: const TextStyle(
                            color: Color(0xFF0F172A),
                            fontSize: 14.5,
                            fontWeight: FontWeight.w500,
                          ),
                          decoration: InputDecoration(
                            labelText: "Threat type",
                            labelStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 13.5),
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            focusedBorder: const OutlineInputBorder(
                              borderRadius: BorderRadius.all(Radius.circular(12)),
                              borderSide: BorderSide(color: Color(0xFFEF4444), width: 1.5),
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: IncidentCategory.physicalThreat,
                              child: Text("Physical attack or threat"),
                            ),
                            DropdownMenuItem(
                              value: IncidentCategory.harassment,
                              child: Text("Being followed or harassed"),
                            ),
                            DropdownMenuItem(
                              value: IncidentCategory.theft,
                              child: Text("Robbery or theft"),
                            ),
                            DropdownMenuItem(
                              value: IncidentCategory.hazard,
                              child: Text("Unsafe area or road danger"),
                            ),
                            DropdownMenuItem(
                              value: IncidentCategory.emergency,
                              child: Text("Medical or severe emergency"),
                            ),
                            DropdownMenuItem(
                              value: IncidentCategory.other,
                              child: Text("Something else"),
                            ),
                          ],
                          onChanged: (val) {
                            if (val != null) {
                              setModalState(() {
                                selectedCategory = val;
                              });
                            }
                          },
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: descController,
                          minLines: 6,
                          maxLines: 9,
                          style: const TextStyle(fontSize: 14, color: Color(0xFF0F172A)),
                          decoration: InputDecoration(
                            hintText: 'Add description (optional)...',
                            hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13.5),
                            alignLabelWithHint: true,
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                            ),
                            focusedBorder: const OutlineInputBorder(
                              borderRadius: BorderRadius.all(Radius.circular(12)),
                              borderSide: BorderSide(color: Color(0xFFEF4444), width: 1.5),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ),
                // Bottom action container pinned cleanly to the bottom
                Container(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    12,
                    24,
                    MediaQuery.of(ctx).viewInsets.bottom + 20,
                  ),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      top: BorderSide(color: Color(0xFFF1F5F9), width: 1.0),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          onPressed: () {
                            final desc = descController.text.trim();
                            try {
                              final incProv = modalCtx.read<IncidentProvider>();
                              final loc = sessionProv.locationService.currentLocation;
                              final addr = sessionProv.locationService.getAddressForLocation(loc);
                              final effectiveAddr = (addr.isNotEmpty && !addr.startsWith('Current Area'))
                                  ? addr
                                  : 'Live Emergency Location';

                              var targetIncidentId = sessionProv.activeEmergencyIncidentId;
                              if (targetIncidentId == null || targetIncidentId.isEmpty) {
                                final openInc = incProv.allIncidents.where(
                                  (i) => (i.reportedBy == user.id || i.reporterName == user.name) && i.status == IncidentStatus.open,
                                ).toList();
                                if (openInc.isNotEmpty) {
                                  targetIncidentId = openInc.first.id;
                                }
                              }

                              final activeComm = incProv.activeCommunity;

                              if (targetIncidentId != null && targetIncidentId.isNotEmpty) {
                                // 1. Update local IncidentProvider
                                incProv.updateIncident(
                                  id: targetIncidentId,
                                  title: 'Emergency: ${selectedCategory.label}',
                                  description: desc.isNotEmpty ? desc : 'Self-triggered emergency alert',
                                  category: selectedCategory,
                                  urgency: IncidentUrgency.critical,
                                  location: loc,
                                  addressName: effectiveAddr,
                                  communityId: activeComm.id,
                                  stateCode: activeComm.code,
                                  countryCode: activeComm.countryCode,
                                );

                                // 2. Directly update Cloud Firestore document
                                FirebaseFirestoreService.syncIncidentReport(
                                  id: targetIncidentId,
                                  reportedBy: user.id,
                                  reporterName: user.name,
                                  category: selectedCategory.value,
                                  title: 'Emergency: ${selectedCategory.label}',
                                  description: desc.isNotEmpty ? desc : 'Self-triggered emergency alert',
                                  location: loc,
                                  addressName: effectiveAddr,
                                  communityId: activeComm.id,
                                  stateCode: activeComm.code,
                                  countryCode: activeComm.countryCode,
                                  status: 'open',
                                  urgency: 'critical',
                                );
                              } else {
                                incProv.reportIncident(
                                  user: user,
                                  title: 'Emergency: ${selectedCategory.label}',
                                  description: desc.isNotEmpty ? desc : 'Self-triggered emergency alert',
                                  category: selectedCategory,
                                  location: loc,
                                  addressName: effectiveAddr,
                                  isAnonymous: false,
                                  urgency: IncidentUrgency.critical,
                                );
                              }
                            } catch (_) {}

                            Navigator.pop(modalCtx);

                            AppNotification.show(
                              context,
                              message: "Details updated. Help is on the way.",
                              type: NotificationType.success,
                            );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFEF4444),
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'Submit',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        height: 46,
                        child: OutlinedButton(
                          onPressed: () {
                            Navigator.pop(modalCtx);
                            _handleCancelEmergencyWithPin(sessionProv, user);
                          },
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: Color(0xFFA5D6A7), width: 1.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            "I'm Safe, Cancel False Alarm",
                            style: TextStyle(
                              color: Color(0xFF1B8529),
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      SizedBox(
                        width: double.infinity,
                        child: TextButton(
                          onPressed: () => Navigator.pop(modalCtx),
                          child: const Text(
                            'Close, keep emergency active',
                            style: TextStyle(
                              color: Color(0xFF94A3B8),
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCountdownPowerButton({
    required bool isActive,
    required bool isTimeout,
    required bool isEmergency,
    required bool isActivating,
    required double progress,
    required Color brandGreen,
    required Color timeoutOrange,
  }) {
    const double buttonSize = 200.0;
    const double strokeWidth = 4.0;

    final Color iconColor = isEmergency
        ? Colors.white
        : (isTimeout
            ? timeoutOrange
            : (isActive ? brandGreen : const Color(0xFF94A3B8)));

    final Color buttonBg = isEmergency
        ? const Color(0xFF380606)
        : Colors.white;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeInOutCubic,
      width: buttonSize,
      height: buttonSize,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: buttonBg,
        boxShadow: [
          if (isEmergency)
            BoxShadow(
              color: Colors.red.shade900.withOpacity(0.55),
              blurRadius: 40,
              spreadRadius: 4,
              offset: const Offset(0, 10),
            )
          else if (isTimeout)
            BoxShadow(
              color: timeoutOrange.withOpacity(0.3),
              blurRadius: 32,
              spreadRadius: 2,
              offset: const Offset(0, 8),
            )
          else if (isActive)
            BoxShadow(
              color: brandGreen.withOpacity(0.3),
              blurRadius: 32,
              spreadRadius: 2,
              offset: const Offset(0, 8),
            )
          else ...[
            BoxShadow(
              color: const Color(0xFF0F172A).withOpacity(0.09),
              blurRadius: 28,
              spreadRadius: 0,
              offset: const Offset(0, 10),
            ),
            BoxShadow(
              color: const Color(0xFF64748B).withOpacity(0.06),
              blurRadius: 10,
              spreadRadius: -2,
              offset: const Offset(0, 4),
            ),
          ],
        ],
      ),
      child: CustomPaint(
        painter: CircularCountdownBorderPainter(
          progress: (isActive && !isActivating) ? progress : 0.0,
          activeColor: brandGreen,
          trackColor: isEmergency
              ? Colors.white.withOpacity(0.12)
              : (isTimeout
                  ? timeoutOrange.withOpacity(0.15)
                  : (isActive ? const Color(0xFFF1F5F9) : const Color(0xFFE2E8F0))),
          strokeWidth: strokeWidth,
          isTimeout: isTimeout,
          timeoutColor: timeoutOrange,
          isEmergency: isEmergency,
        ),
        child: Center(
          child: isActivating
              ? SpinKitDualRing(
                  color: brandGreen,
                  size: 52.0,
                  lineWidth: 3.5,
                )
              : CustomPaint(
                  size: const Size(64, 64),
                  painter: ThinPowerIconPainter(
                    color: iconColor,
                    strokeWidth: 3.2,
                  ),
                ),
        ),
      ),
    );
  }

  void _showBatteryInfoModal(BuildContext context, int batteryLevel, bool isEmergency) {
    HapticFeedback.selectionClick();

    final Color indicatorColor;
    final String statusLabel;
    final String description;

    if (batteryLevel <= 20) {
      indicatorColor = const Color(0xFFEF4444);
      statusLabel = 'Low Battery';
      description = 'Your device is under 20%. Background GPS precision may be constrained by your operating system. Connect a charger if starting an extended walk.';
    } else if (batteryLevel <= 40) {
      indicatorColor = const Color(0xFFD97706);
      statusLabel = 'Moderate Battery';
      description = 'Sufficient battery for real-time safety monitoring, live tracking, and emergency response.';
    } else {
      indicatorColor = const Color(0xFF1B8529);
      statusLabel = 'Healthy Battery';
      description = 'Battery level is optimal. Low-power telemetry and background safety services are operating at peak fidelity.';
    }

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(24, 14, 24, 30),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4.5,
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: indicatorColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    Icons.battery_charging_full_rounded,
                    color: indicatorColor,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$batteryLevel%, $statusLabel',
                      style: TextStyle(
                        color: indicatorColor,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    const Text(
                      'Live Device Telemetry',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              description,
              style: const TextStyle(
                color: Color(0xFF475569),
                fontSize: 13.5,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: TextButton(
                onPressed: () => Navigator.pop(ctx),
                style: TextButton.styleFrom(
                  backgroundColor: const Color(0xFFF1F5F9),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Dismiss',
                  style: TextStyle(
                    color: Color(0xFF0F172A),
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildIPhoneSleepingBattery(int level, {bool isEmergency = false}) {
    final double fraction = (level / 100.0).clamp(0.08, 1.0);

    final Color fillColor;
    if (isEmergency) {
      fillColor = Colors.white;
    } else if (level <= 20) {
      fillColor = const Color(0xFFEF4444); // Red for low
    } else if (level <= 40) {
      fillColor = const Color(0xFFD97706); // Amber for moderate
    } else {
      fillColor = const Color(0xFF1B8529); // Green for healthy
    }

    const double width = 24.0;
    const double height = 12.0;

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Main horizontal capsule / body
        Container(
          width: width,
          height: height,
          padding: const EdgeInsets.all(1.6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3.5),
            border: Border.all(
              color: isEmergency ? Colors.white : const Color(0xFF94A3B8),
              width: 1.2,
            ),
          ),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: fraction,
              heightFactor: 1.0,
              child: Container(
                decoration: BoxDecoration(
                  color: fillColor,
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            ),
          ),
        ),
        // Terminal cap on right side
        Container(
          width: 1.5,
          height: 4.5,
          decoration: BoxDecoration(
            color: isEmergency ? Colors.white : const Color(0xFF94A3B8),
            borderRadius: const BorderRadius.horizontal(right: Radius.circular(1.0)),
          ),
        ),
      ],
    );
  }
}

/// Custom painter for a sleek, thin circular countdown border
class CircularCountdownBorderPainter extends CustomPainter {
  final double progress; // 0.0 to 1.0
  final Color activeColor;
  final Color trackColor;
  final double strokeWidth;
  final bool isTimeout;
  final Color timeoutColor;
  final bool isEmergency;

  CircularCountdownBorderPainter({
    required this.progress,
    required this.activeColor,
    required this.trackColor,
    this.strokeWidth = 4.0,
    required this.isTimeout,
    required this.timeoutColor,
    this.isEmergency = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    if (isEmergency) {
      // Solid white ring in emergency
      final emergencyPaint = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..isAntiAlias = true
        ..strokeWidth = strokeWidth;
      canvas.drawCircle(center, radius, emergencyPaint);
      return;
    }

    // Background track (subtle light circle)
    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true
      ..strokeWidth = strokeWidth;
    canvas.drawCircle(center, radius, trackPaint);

    // Active countdown arc diminishing towards 0 (applies to both normal walk and warning period)
    if (progress > 0) {
      final strokeColor = isTimeout ? timeoutColor : activeColor;
      final progressPaint = Paint()
        ..color = strokeColor
        ..style = PaintingStyle.stroke
        ..isAntiAlias = true
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;

      // Start at 12 o'clock (-pi / 2) and sweep clockwise
      const startAngle = -math.pi / 2;
      final sweepAngle = 2 * math.pi * progress.clamp(0.0, 1.0);

      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle,
        false,
        progressPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CircularCountdownBorderPainter oldDelegate) =>
      progress != oldDelegate.progress ||
      activeColor != oldDelegate.activeColor ||
      trackColor != oldDelegate.trackColor ||
      strokeWidth != oldDelegate.strokeWidth ||
      isTimeout != oldDelegate.isTimeout ||
      timeoutColor != oldDelegate.timeoutColor ||
      isEmergency != oldDelegate.isEmergency;
}

/// Custom painter for an ultra-thin, sleek minimalist power symbol
class ThinPowerIconPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;

  ThinPowerIconPainter({
    required this.color,
    this.strokeWidth = 3.2,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width * 0.40;

    // Circular arc with gap at the top
    const gapAngle = 52.0 * math.pi / 180.0;
    const startAngle = -math.pi / 2 + (gapAngle / 2);
    const sweepAngle = 2 * math.pi - gapAngle;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      paint,
    );

    // Vertical power pin line at top
    final topY = center.dy - radius - 2;
    final bottomY = center.dy + (radius * 0.12);
    canvas.drawLine(Offset(center.dx, topY), Offset(center.dx, bottomY), paint);
  }

  @override
  bool shouldRepaint(covariant ThinPowerIconPainter oldDelegate) =>
      color != oldDelegate.color || strokeWidth != oldDelegate.strokeWidth;
}



/// Minimalist light mode tour tooltip card:
/// Clean compact square geometry, crisp white surface, modern slate typography, and clear skip controls.
class _MinimalTourTooltip extends StatelessWidget {
  final int stepIndex;
  final int totalSteps;
  final String title;
  final String description;
  final VoidCallback onNext;
  final VoidCallback? onPrev;
  final VoidCallback onSkip;

  const _MinimalTourTooltip({
    required this.stepIndex,
    required this.totalSteps,
    required this.title,
    required this.description,
    required this.onNext,
    this.onPrev,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final isLast = stepIndex == totalSteps - 1;

    return Container(
      width: 285,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.12),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Step counter & Skip Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${stepIndex + 1} of $totalSteps',
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                ),
              ),
              GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  onSkip();
                },
                behavior: HitTestBehavior.opaque,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Text(
                    'Skip',
                    style: TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Title
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 4),

          // Description
          Text(
            description,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.38,
              color: Color(0xFF475569),
            ),
          ),
          const SizedBox(height: 14),

          // Actions
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (onPrev != null)
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onPrev!();
                  },
                  behavior: HitTestBehavior.opaque,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                    child: Text(
                      'Back',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                )
              else
                const SizedBox.shrink(),
              SizedBox(
                height: 32,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    onNext();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1B8529),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    visualDensity: VisualDensity.compact,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                  child: Text(
                    isLast ? "Done" : 'Next',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
