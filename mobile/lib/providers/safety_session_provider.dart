import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart';
import '../main.dart';
import '../models/incident_report.dart';
import '../models/location_point.dart';
import '../models/safety_session.dart';
import '../models/user.dart';
import '../screens/active_voice_call_screen.dart';
import '../services/agora_service.dart';
import '../services/api_service.dart';
import '../services/boundary_service.dart';
import '../services/fcm_service.dart';
import '../services/firebase_firestore_service.dart';
import '../services/foreground_call_service.dart';
import '../services/location_service.dart';
import '../services/overlay_service.dart';
import '../services/storage_service.dart';
import '../services/vibration_service.dart';

class SafetySessionProvider extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  final LocationService locationService = LocationService();
  final AgoraVoiceService agoraService = AgoraVoiceService();

  SafetySession? _currentSession;
  User? _lastUser;
  bool _isActive = false;
  int _secondsRemaining = 0;
  int _totalIntervalSeconds = 300;
  int _graceSecondsRemaining = 0;
  int _totalGraceSeconds = 60;
  bool _isGracePeriodActive = false;
  bool _isActivating = false;
  String? _activeEmergencyIncidentId;
  Timer? _countdownTimer;
  Timer? _emergencyVibrationTimer;

  StreamSubscription<LocationPoint>? _locationSubscription;
  StreamSubscription<int>? _batterySubscription;
  StreamSubscription<bool>? _locationAvailabilitySubscription;
  bool _locationDisabledNotificationPending = false;

  String? get activeEmergencyIncidentId => _activeEmergencyIncidentId;

  void setActiveEmergencyIncidentId(String? id) {
    _activeEmergencyIncidentId = id;
    notifyListeners();
  }

  String get _currentStatusString {
    if (isEmergency) return 'emergency';
    if (_isGracePeriodActive) return 'distress_pending';
    if (_isActive) return 'active';
    return 'resolved';
  }

  SafetySessionProvider() {
    // Bridge: whenever AgoraVoiceService notifies (mute, speaker, status), re-notify this provider
    // so any widget watching SafetySessionProvider also rebuilds
    agoraService.addListener(_onAgoraChanged);

    _restoreActiveSessionFromStorage();

    _locationSubscription = locationService.onLocationChanged.listen((newLoc) {
      if (_isActive && _currentSession != null) {
        final now = DateTime.now();
        final breadcrumbs = List<BreadcrumbPoint>.from(_currentSession!.breadcrumbs)
          ..add(BreadcrumbPoint(location: newLoc, recordedAt: now));

        final addr = locationService.getAddressForLocation(newLoc);
        final isClean = addr.isNotEmpty && 
            !addr.startsWith('Current Area') && 
            !addr.toLowerCase().startsWith('my location');
        final effectiveAddr = isClean ? addr : _currentSession!.addressName;

        _currentSession = _currentSession!.copyWith(
          currentLocation: newLoc,
          lastPingAt: now,
          breadcrumbs: breadcrumbs,
          addressName: effectiveAddr,
        );

        // Direct Cloud Firestore Streaming
        FirebaseFirestoreService.streamLocation(
          sessionId: _currentSession!.id,
          location: newLoc,
          batteryLevel: locationService.currentBatteryLevel,
          addressName: effectiveAddr,
          status: _currentStatusString,
        );
      }
      notifyListeners();
    });
    _batterySubscription = locationService.onBatteryChanged.listen((newBattery) {
      if (_isActive && _currentSession != null) {
        FirebaseFirestoreService.streamLocation(
          sessionId: _currentSession!.id,
          location: locationService.currentLocation,
          batteryLevel: newBattery,
          addressName: _currentSession!.addressName,
          status: _currentStatusString,
        );
      }
      notifyListeners();
    });

    _locationAvailabilitySubscription =
        locationService.onLocationAvailabilityChanged.listen((isAvailable) {
      if (!isAvailable && _isActive) {
        autoTurnOffDueToLocation();
      }
    });

    // Listen for events sent from the floating overlay window
    try {
      FlutterOverlayWindow.overlayListener.listen((data) {
        if (data != null && _lastUser != null) {
          try {
            final decoded = jsonDecode(data.toString());
            final action = decoded['action'];
            if (action == 'checkIn') {
              confirmSafeCheckIn(_lastUser!);
            } else if (action == 'emergencySos') {
              triggerEmergency(user: _lastUser!, reason: 'Overlay SOS Alert');
            } else if (action == 'acceptCall' || action == 'openCall') {
              ForegroundCallService.bringAppToForeground(
                callerName: decoded['callerName'] ?? 'Safety Command Dispatcher',
                callerRole: decoded['callerRole'] ?? 'Control Room Officer',
                channelName: decoded['channelName'] ?? 'safety_channel',
                token: decoded['token'],
                sessionId: _currentSession?.id ?? decoded['sessionId'] ?? '',
                userId: _lastUser?.id ?? decoded['userId'] ?? '',
              );
              ActiveVoiceCallScreen.show(
                callerName: decoded['callerName'] ?? 'Safety Command Dispatcher',
                callerRole: decoded['callerRole'] ?? 'Control Room Officer',
                channelName: decoded['channelName'] ?? 'safety_channel',
                token: decoded['token'],
                sessionId: _currentSession?.id ?? decoded['sessionId'] ?? '',
                userId: _lastUser?.id ?? decoded['userId'] ?? '',
              );
            } else if (action == 'declineCall') {
              if (_currentSession != null && _lastUser != null) {
                FirebaseFirestoreService.respondToCall(
                  sessionId: _currentSession!.id,
                  userId: _lastUser!.id,
                  status: 'declined',
                );
                OverlayService.dismissIncomingCallOverlay(
                  secondsRemaining: _secondsRemaining,
                  mode: _isGracePeriodActive ? OverlayStateMode.graceWarning : OverlayStateMode.active,
                );
              }
            }
          } catch (_) {}
        }
      });
    } catch (_) {}
  }

  void _restoreActiveSessionFromStorage() {
    try {
      final sessionMap = StorageService.loadActiveSession();
      if (sessionMap != null) {
        final session = SafetySession.fromJson(sessionMap);
        if (session.status != SessionStatus.resolved) {
          final user = StorageService.loadUser();
          _lastUser = user;
          _currentSession = session;
          _isActive = true;
          _totalIntervalSeconds = user.settings.checkInIntervalMinutes * 60;
          final diff = session.nextPromptDueAt.difference(DateTime.now()).inSeconds;
          _secondsRemaining = diff > 0 ? diff : 15;
          locationService.startSimulatedWalk();
          _startTimer(user);

          FirebaseFirestoreService.listenForIncomingCalls(
            userId: user.id,
            sessionId: session.id,
            onIncomingCall: (callData) {
              _handleIncomingCallIfPresent(callData);
            },
          );

          OverlayService.showSafetyOverlay(
            secondsRemaining: _secondsRemaining,
            mode: OverlayStateMode.active,
          );
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('[SafetySessionProvider] Restore error: $e');
    }
  }

  void _onAgoraChanged() {
    // Re-broadcast Agora state changes (mute, speaker, call status) to all listening widgets
    notifyListeners();
  }

  SafetySession? get currentSession => _currentSession;
  bool get isActive => _isActive;
  bool get isActivating => _isActivating;
  bool get isGracePeriodActive => _isGracePeriodActive;
  bool get isEmergency => _currentSession?.status == SessionStatus.emergency;
  bool get locationDisabledNotificationPending => _locationDisabledNotificationPending;
  int get secondsRemaining => _secondsRemaining;
  int get totalIntervalSeconds => _totalIntervalSeconds;
  int get graceSecondsRemaining => _graceSecondsRemaining;
  int get totalGraceSeconds => _totalGraceSeconds;
  SessionStatus get status => _currentSession?.status ?? SessionStatus.resolved;

  bool consumeLocationDisabledNotification() {
    if (_locationDisabledNotificationPending) {
      _locationDisabledNotificationPending = false;
      return true;
    }
    return false;
  }

  double get progressFraction {
    if (_isGracePeriodActive) {
      if (_totalGraceSeconds <= 0) return 0.0;
      return (_graceSecondsRemaining / _totalGraceSeconds).clamp(0.0, 1.0);
    }
    if (_totalIntervalSeconds <= 0) return 0.0;
    return (_secondsRemaining / _totalIntervalSeconds).clamp(0.0, 1.0);
  }

  Future<bool> startSafetyMode({
    required User user,
    LocationPoint? startingLocation,
  }) async {
    if (_isActivating || _isActive) return false;
    _isActivating = true;
    notifyListeners();

    try {
      // Fast location verification
      final isReady = await locationService.verifyLocationReady(
        promptUser: true,
        openSettingsIfDenied: true,
      );

      if (!isReady) {
        _isActivating = false;
        notifyListeners();
        return false;
      }

      final startLoc = startingLocation ?? locationService.currentLocation;
      final intervalMinutes = user.settings.checkInIntervalMinutes;
      _totalIntervalSeconds = intervalMinutes * 60;
      _secondsRemaining = _totalIntervalSeconds;
      _totalGraceSeconds = user.settings.timeoutDurationSeconds;
      _graceSecondsRemaining = _totalGraceSeconds;
      _isGracePeriodActive = false;

      // 0ms synchronous immediate boundary resolution
      final immediateComm = BoundaryService.getImmediatePerimeter(startLoc);
      String communityId = immediateComm.communityName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      if (communityId.isEmpty) communityId = 'ikeja';
      String stateCode = immediateComm.stateName ?? 'Lagos';
      String countryCode = immediateComm.countryCode ?? 'NG';

      String resolvedAddress = locationService.getAddressForLocation(startLoc);
      if (resolvedAddress.isEmpty || resolvedAddress.startsWith('Current Area') || resolvedAddress.toLowerCase().startsWith('my location')) {
        resolvedAddress = '${startLoc.lat.toStringAsFixed(4)}, ${startLoc.lng.toStringAsFixed(4)}';
      }

      // Fetch fresh hardware battery percentage
      final realBattery = await locationService.updateBatteryLevel();

      // Start safety session on backend immediately
      _currentSession = await _apiService.startSafetySession(
        user: user,
        initialLocation: startLoc,
        batteryLevel: realBattery,
        addressName: resolvedAddress.isNotEmpty ? resolvedAddress : null,
        communityId: communityId,
        stateCode: stateCode,
        countryCode: countryCode,
      );

      // Register device FCM push token with backend immediately
      FcmService.registerDeviceToken(
        userId: user.id,
        lat: startLoc.lat,
        lng: startLoc.lng,
        communityId: communityId,
      );

      // Resolve effective phone (primary phone or primary emergency contact)
      final effectivePhone = (user.phone != null && user.phone!.isNotEmpty)
          ? user.phone!
          : (user.emergencyContacts.isNotEmpty ? user.emergencyContacts.first.phone : '');

      // Direct Cloud Firestore Session Sync
      FirebaseFirestoreService.syncSession(
        sessionId: _currentSession!.id,
        userId: user.id,
        userName: user.name,
        userPhone: effectivePhone,
        userEmail: user.email ?? '',
        status: 'active',
        currentLocation: startLoc,
        batteryLevel: realBattery,
        addressName: resolvedAddress,
        communityId: communityId,
        stateCode: stateCode,
        countryCode: countryCode,
        agoraChannelName: _currentSession?.agoraChannelName ?? 'safety_emergency_${user.id}',
        breadcrumbs: [BreadcrumbPoint(location: startLoc, recordedAt: DateTime.now())],
      );

      // Start listening for incoming calls directly on Cloud Firestore
      FirebaseFirestoreService.listenForIncomingCalls(
        userId: user.id,
        sessionId: _currentSession!.id,
        onIncomingCall: (callData) {
          _handleIncomingCallIfPresent(callData);
        },
      );

      _lastUser = user;
      _isActive = true;
      StorageService.saveActiveSession(_currentSession?.toJson());
      locationService.startSimulatedWalk();
      _startTimer(user);

      // Pre-warm Agora RTC audio engine and request microphone permission upfront
      agoraService.prewarm().then((hasMic) {
        debugPrint('[Safety Session] Agora prewarmed. Mic granted: $hasMic');
      });

      // Launch floating overlay over other apps
      OverlayService.showSafetyOverlay(
        secondsRemaining: _secondsRemaining,
        mode: OverlayStateMode.active,
      );

      // Fast-track async boundary refinement in the background without blocking
      BoundaryService.resolveCommunityForLocation(startLoc).then((detailed) {
        if (_currentSession != null && _isActive) {
          locationService.reverseGeocodeLocation(startLoc).then((detailedAddr) {
            if (_currentSession != null && 
                _isActive && 
                detailedAddr.isNotEmpty && 
                !detailedAddr.startsWith('Current Area') && 
                !detailedAddr.toLowerCase().startsWith('my location')) {
              
              _currentSession = _currentSession!.copyWith(
                addressName: detailedAddr,
                communityId: detailed.communityName.isNotEmpty
                    ? detailed.communityName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '')
                    : _currentSession!.communityId,
                stateCode: detailed.stateName ?? _currentSession!.stateCode,
                countryCode: detailed.countryCode ?? _currentSession!.countryCode,
              );
              StorageService.saveActiveSession(_currentSession?.toJson());
              notifyListeners();

              // Immediately sync refined address to Firestore
              FirebaseFirestoreService.streamLocation(
                sessionId: _currentSession!.id,
                location: startLoc,
                batteryLevel: locationService.currentBatteryLevel,
                addressName: detailedAddr,
              );

              // Update backend MongoDB
              _apiService.pingSafetySession(
                sessionId: _currentSession!.id,
                location: startLoc,
                addressName: detailedAddr,
              ).then((res) {
                _handleIncomingCallIfPresent(res);
              });
            }
          });
        }
      });

      _isActivating = false;
      notifyListeners();
      return true;
    } catch (e) {
      _isActivating = false;
      notifyListeners();
      return false;
    }
  }

  void _handleIncomingCallIfPresent(Map<String, dynamic>? data) {
    if (data == null) return;
    final activeCall = data['activeCall'] ??
        (data['status'] == 'ringing' || data['type'] == 'incoming_call' ? data : null);
    if (activeCall != null && activeCall['status'] == 'ringing') {
      if (agoraService.status == CallStatus.idle) {
        debugPrint('[SafetySessionProvider] Incoming call ringing detected: $activeCall');
        final callerName = activeCall['callerName']?.toString() ?? 'Safety Command Dispatcher';
        final callerRole = activeCall['callerRole']?.toString() ?? 'Control Room Officer';
        final channelName = activeCall['channelName']?.toString() ?? 'safety_channel';
        final token = activeCall['token']?.toString();
        final sessionId = _currentSession?.id ?? activeCall['sessionId']?.toString() ?? '';
        final userId = _lastUser?.id ?? activeCall['userId']?.toString() ?? '';

        final bool autoAnswer = StorageService.loadUser().settings.callHandlingPreference == 'auto_answer_speaker';

        // 1. Immediately present incoming call on the floating overlay window
        OverlayService.showIncomingCallOverlay(
          callerName: callerName,
          callerRole: callerRole,
          channelName: channelName,
          token: token,
          sessionId: sessionId,
          userId: userId,
        );

        // 2. Bring app from background to foreground & show full-screen call UI
        ActiveVoiceCallScreen.show(
          callerName: callerName,
          callerRole: callerRole,
          channelName: channelName,
          token: token,
          sessionId: sessionId,
          userId: userId,
          autoAnswer: autoAnswer,
        );
      }
    } else if (activeCall != null && (activeCall['status'] == 'ended' || activeCall['status'] == 'declined')) {
      OverlayService.dismissIncomingCallOverlay(
        secondsRemaining: _secondsRemaining,
        mode: _isGracePeriodActive ? OverlayStateMode.graceWarning : OverlayStateMode.active,
      );
    }
  }

  void _startTimer(User user) {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!_isActive) {
        timer.cancel();
        return;
      }

      // Check hardware location/GPS health every 2 seconds during active walk
      if (_secondsRemaining % 2 == 0) {
        locationService.isLocationReadyWithoutPrompt().then((isReady) {
          if (!isReady && _isActive) {
            autoTurnOffDueToLocation();
          }
        });
      }

      if (!_isGracePeriodActive) {
        if (_secondsRemaining > 0) {
          _secondsRemaining--;
          OverlayService.updateOverlayData(
            secondsRemaining: _secondsRemaining,
            mode: OverlayStateMode.active,
          );
          notifyListeners();
        } else {
          // Interval reached! Transition to Grace Period warning
          _enterGracePeriod(user);
        }
      } else {
        // Grace period countdown active (faster warning countdown)
        if (_graceSecondsRemaining > 0) {
          _graceSecondsRemaining--;
          OverlayService.updateOverlayData(
            secondsRemaining: _graceSecondsRemaining,
            mode: OverlayStateMode.graceWarning,
          );
          // Vibrate every 2 seconds to warn the user periodically
          if (_graceSecondsRemaining % 2 == 0) {
            VibrationService.vibrateWarning();
          }
          notifyListeners();
        } else {
          // Grace period expired without check-in -> ESCALATE TO EMERGENCY!
          timer.cancel();
          triggerEmergency(user: user, reason: 'Missed safety check-in grace period');
        }
      }
    });
  }

  void _enterGracePeriod(User user) {
    _isGracePeriodActive = true;
    _totalGraceSeconds = user.settings.timeoutDurationSeconds > 0
        ? user.settings.timeoutDurationSeconds
        : 60;
    _graceSecondsRemaining = _totalGraceSeconds;
    if (_currentSession != null) {
      _currentSession = _currentSession!.copyWith(
        status: SessionStatus.distressPending,
      );
      StorageService.saveActiveSession(_currentSession?.toJson());
      // Real-time Firestore sync: updates Admin Radar from Green to Amber/Orange immediately
      FirebaseFirestoreService.updateSessionStatus(
        sessionId: _currentSession!.id,
        status: 'distress_pending',
      );
    }
    OverlayService.updateOverlayData(
      secondsRemaining: _graceSecondsRemaining,
      mode: OverlayStateMode.graceWarning,
    );

    // Auto open / bring app to foreground and wake screen
    ForegroundCallService.wakeAndForeground(
      type: 'warning',
      title: '⚠️ Safety Check-In Warning',
      message: 'Safety timer elapsed. Please check in to confirm you are safe.',
    );

    // Switch to Home / Safety Mode tab so user immediately sees Warning screen
    mainNavKey.currentState?.switchToTab(0);

    // Initial warning vibration
    VibrationService.vibrateWarning();

    notifyListeners();
  }

  /// User taps "I'm Safe" confirmation check-in
  void confirmSafeCheckIn(User user) {
    _stopEmergencyVibrations();
    _isGracePeriodActive = false;
    _secondsRemaining = _totalIntervalSeconds;
    _graceSecondsRemaining = _totalGraceSeconds;

    final emergId = _activeEmergencyIncidentId;
    _activeEmergencyIncidentId = null;
    if (emergId != null && emergId.isNotEmpty) {
      FirebaseFirestoreService.resolveIncidentReport(incidentId: emergId);
    }
    FirebaseFirestoreService.resolveAllUserEmergencyIncidents(userId: user.id);

    OverlayService.updateOverlayData(
      secondsRemaining: _secondsRemaining,
      mode: OverlayStateMode.active,
    );

    if (_currentSession != null) {
      final now = DateTime.now();
      final currentLoc = locationService.currentLocation;
      final breadcrumbs = List<BreadcrumbPoint>.from(_currentSession!.breadcrumbs)
        ..add(BreadcrumbPoint(location: currentLoc, recordedAt: now));

      _currentSession = _currentSession!.copyWith(
        status: SessionStatus.active,
        lastPingAt: now,
        nextPromptDueAt: now.add(Duration(seconds: _totalIntervalSeconds)),
        currentLocation: currentLoc,
        breadcrumbs: breadcrumbs,
      );
      StorageService.saveActiveSession(_currentSession?.toJson());

      // Real-time Firestore sync: updates Admin Radar from Red/Amber back to Green immediately
      FirebaseFirestoreService.updateSessionStatus(
        sessionId: _currentSession!.id,
        status: 'active',
      );

      _apiService.checkInSafetySession(
        sessionId: _currentSession!.id,
        userId: user.id,
        intervalMinutes: user.settings.checkInIntervalMinutes,
      );
    }
    notifyListeners();
  }


  /// Instant Emergency SOS escalation (Manual or Timeout)
  /// Instant Emergency SOS escalation (Manual or Timeout)
  void triggerEmergency({
    required User user,
    String reason = 'Manual SOS Alert',
    dynamic incidentProvider,
  }) {
    _isGracePeriodActive = false;
    _countdownTimer?.cancel();
    OverlayService.updateOverlayData(
      secondsRemaining: 0,
      mode: OverlayStateMode.emergency,
    );

    // Auto open / bring app to foreground and wake screen
    ForegroundCallService.wakeAndForeground(
      type: 'emergency',
      title: '🚨 EMERGENCY SOS ACTIVATED',
      message: 'Emergency distress beacon activated. Help is on the way.',
    );

    // Switch to Home / Safety Mode tab so user immediately sees Emergency screen
    mainNavKey.currentState?.switchToTab(0);

    // Start repeating emergency vibrations
    _startEmergencyVibrations();

    final now = DateTime.now();
    final currentLoc = locationService.currentLocation;
    final breadcrumbs = _currentSession != null
        ? (List<BreadcrumbPoint>.from(_currentSession!.breadcrumbs)
          ..add(BreadcrumbPoint(location: currentLoc, recordedAt: now)))
        : [BreadcrumbPoint(location: currentLoc, recordedAt: now)];

    final initialAddr = locationService.getAddressForLocation(currentLoc);
    _currentSession = (_currentSession ??
        SafetySession(
          id: 'sess_emergency_${now.millisecondsSinceEpoch}',
          userId: user.id,
          userName: user.name,
          userPhone: user.phone,
          userEmail: user.email,
          status: SessionStatus.emergency,
          lastPingAt: now,
          nextPromptDueAt: now,
          currentLocation: currentLoc,
          addressName: (initialAddr.isNotEmpty && !initialAddr.startsWith('Current Area')) ? initialAddr : null,
        ))
        .copyWith(
      status: SessionStatus.emergency,
      emergencyTriggeredAt: now,
      currentLocation: currentLoc,
      breadcrumbs: breadcrumbs,
      agoraChannelName: 'safety_emergency_${user.id}',
    );

    _isActive = true;

    if (_currentSession != null) {
      final effectivePhone = (user.phone != null && user.phone!.isNotEmpty)
          ? user.phone!
          : (user.emergencyContacts.isNotEmpty ? user.emergencyContacts.first.phone : '');

      final effectiveAddr = (_currentSession!.addressName != null &&
              _currentSession!.addressName!.isNotEmpty &&
              !_currentSession!.addressName!.startsWith('Current Area'))
          ? _currentSession!.addressName!
          : (initialAddr.isNotEmpty && !initialAddr.startsWith('Current Area') ? initialAddr : 'Live Emergency Location');

      final incidentId = 'inc_emerg_${user.id}_${now.millisecondsSinceEpoch}';
      _activeEmergencyIncidentId = incidentId;

      // 0. Direct Instant Injection into IncidentProvider
      if (incidentProvider != null) {
        try {
          final directReport = IncidentReport(
            id: incidentId,
            reportedBy: user.id,
            reporterName: user.name,
            isAnonymous: false,
            source: 'safety_mode_emergency',
            category: IncidentCategory.emergency,
            title: 'Emergency Distress SOS: ${user.name}',
            description: reason,
            location: currentLoc,
            addressName: effectiveAddr,
            communityId: _currentSession!.communityId ?? 'ikeja',
            stateCode: _currentSession!.stateCode ?? 'Lagos',
            countryCode: _currentSession!.countryCode ?? 'NG',
            status: IncidentStatus.open,
            urgency: IncidentUrgency.critical,
            staffComments: const [],
            createdAt: now,
            updatedAt: now,
          );
          incidentProvider.addIncidentDirectly(directReport);
        } catch (_) {}
      }

      // 1. Instant Direct Firebase Cloud Firestore emergency incident report sync
      FirebaseFirestoreService.syncIncidentReport(
        id: incidentId,
        reportedBy: user.id,
        reporterName: user.name,
        category: 'emergency',
        title: 'Emergency Distress SOS: ${user.name}',
        description: reason,
        location: currentLoc,
        addressName: effectiveAddr,
        communityId: _currentSession!.communityId ?? 'ikeja',
        stateCode: _currentSession!.stateCode ?? 'Lagos',
        countryCode: _currentSession!.countryCode ?? 'NG',
        status: 'open',
        urgency: 'critical',
      );

      // 2. Instant Firebase Cloud Firestore emergency session beacon sync
      FirebaseFirestoreService.syncSession(
        sessionId: _currentSession!.id,
        userId: user.id,
        userName: user.name,
        userPhone: effectivePhone,
        userEmail: user.email ?? '',
        status: 'emergency',
        currentLocation: currentLoc,
        batteryLevel: locationService.currentBatteryLevel,
        addressName: effectiveAddr,
        communityId: _currentSession!.communityId ?? 'ikeja',
        stateCode: _currentSession!.stateCode ?? 'Lagos',
        countryCode: _currentSession!.countryCode ?? 'NG',
        agoraChannelName: _currentSession!.agoraChannelName ?? 'safety_channel',
        breadcrumbs: breadcrumbs,
      );

      // 3. Fastify Backend synchronization & FCM Proximity Broadcast
      _apiService.triggerSos(
        sessionId: _currentSession!.id,
        incidentId: incidentId,
        userId: user.id,
        reason: reason,
        location: currentLoc,
        addressName: effectiveAddr,
        communityId: _currentSession!.communityId,
        stateCode: _currentSession!.stateCode,
        countryCode: _currentSession!.countryCode,
        userName: user.name,
        userPhone: effectivePhone,
      ).then((res) {
        if (res != null) {
          final incId = res['incidentId'] ?? res['incident']?['_id'] ?? res['incident']?['id'];
          if (incId != null && incId.toString().isNotEmpty) {
            _activeEmergencyIncidentId = incId.toString();
            notifyListeners();
          }
        }
      });
    }

    // Start auto Agora emergency voice room link if auto-answer configured
    final autoAnswer = StorageService.loadUser().settings.callHandlingPreference == 'auto_answer_speaker' ||
        user.settings.callHandlingPreference == 'auto_answer_speaker';
    agoraService.startEmergencyVoiceLink(
      channelName: _currentSession?.agoraChannelName ?? 'safety_emergency_${user.id}',
      autoAnswer: autoAnswer,
    );


    notifyListeners();
  }

  void _startEmergencyVibrations() {
    _emergencyVibrationTimer?.cancel();
    VibrationService.vibrateEmergency();
    _emergencyVibrationTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!isEmergency) {
        timer.cancel();
        VibrationService.cancel();
        return;
      }
      VibrationService.vibrateEmergency();
    });
  }

  void _stopEmergencyVibrations() {
    _emergencyVibrationTimer?.cancel();
    _emergencyVibrationTimer = null;
    VibrationService.cancel();
    ForegroundCallService.dismissSafetyAlert();
  }

  /// Cancel SOS / Reset False Alarm
  void cancelEmergency(User user) {
    _stopEmergencyVibrations();
    final emergId = _activeEmergencyIncidentId;
    _activeEmergencyIncidentId = null;
    if (emergId != null && emergId.isNotEmpty) {
      FirebaseFirestoreService.resolveIncidentReport(incidentId: emergId);
    }
    FirebaseFirestoreService.resolveAllUserEmergencyIncidents(userId: user.id);
    agoraService.endCall();
    confirmSafeCheckIn(user);
    _startTimer(user);
    notifyListeners();
  }

  /// End Safety Walk cleanly
  void endSafetyMode() {
    _stopEmergencyVibrations();
    _isActive = false;
    _isGracePeriodActive = false;
    final emergId = _activeEmergencyIncidentId;
    _activeEmergencyIncidentId = null;
    if (emergId != null && emergId.isNotEmpty) {
      FirebaseFirestoreService.resolveIncidentReport(incidentId: emergId);
    }
    if (_lastUser != null) {
      FirebaseFirestoreService.resolveAllUserEmergencyIncidents(userId: _lastUser!.id);
    }
    _countdownTimer?.cancel();
    StorageService.saveActiveSession(null);
    locationService.stopSimulatedWalk();
    agoraService.endCall();
    OverlayService.closeOverlay();

    if (_currentSession != null) {
      FirebaseFirestoreService.removeSession(sessionId: _currentSession!.id);
      FirebaseFirestoreService.stopListeningCalls();

      _apiService.resolveSafetySession(
        sessionId: _currentSession!.id,
        userId: _lastUser?.id,
      );
      _currentSession = _currentSession!.copyWith(
        status: SessionStatus.resolved,
      );
    }

    notifyListeners();
  }

  /// Check location health on app resume or background return
  Future<void> checkLocationHealth() async {
    if (!_isActive) return;
    final isReady = await locationService.isLocationReadyWithoutPrompt();
    if (!isReady && _isActive) {
      autoTurnOffDueToLocation();
    }
  }

  /// Auto-turn off Safety Mode when user disables device GPS / location permission outside the app
  void autoTurnOffDueToLocation() {
    if (!_isActive) return;
    endSafetyMode();
    _locationDisabledNotificationPending = true;
    notifyListeners();
  }

  /// Completely reset safety session, timers, GPS walk, and call state upon logout or guest switch
  void resetSession() {
    _stopEmergencyVibrations();
    _isActive = false;
    _isGracePeriodActive = false;
    _countdownTimer?.cancel();
    _countdownTimer = null;
    _secondsRemaining = 0;
    _graceSecondsRemaining = 0;
    _currentSession = null;
    _locationDisabledNotificationPending = false;
    locationService.stopSimulatedWalk();
    agoraService.endCall();
    OverlayService.closeOverlay();
    notifyListeners();
  }

  @override
  void dispose() {
    _stopEmergencyVibrations();
    _countdownTimer?.cancel();
    _locationSubscription?.cancel();
    _batterySubscription?.cancel();
    _locationAvailabilitySubscription?.cancel();
    agoraService.removeListener(_onAgoraChanged);
    locationService.dispose();
    agoraService.dispose();
    super.dispose();
  }
}

