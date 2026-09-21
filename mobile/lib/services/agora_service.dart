import 'dart:async';
import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import '../config/constants.dart';

enum CallStatus {
  idle,
  connecting,
  inCall,
  ended,
  error,
}

class AgoraVoiceService extends ChangeNotifier {
  RtcEngine? _engine;
  CallStatus _status = CallStatus.idle;
  bool _isMuted = false;
  bool _isSpeakerOn = true;
  int _callDurationSeconds = 0;
  Timer? _durationTimer;
  String? _currentChannel;
  String? _remoteResponderName;
  bool _isEngineInitialized = false;
  // Bug 3 fix: track whether the event handler has been registered so we
  // never register it more than once per engine instance. Without this,
  // calling prewarm() then startEmergencyVoiceLink() would register the
  // handler twice, causing double onJoinChannelSuccess firings.
  bool _handlersRegistered = false;

  // Grace window (ms) — user-offline events that arrive within this window
  // after joining are ghost events from a previous call and must be ignored.
  static const int _ghostEventGraceMs = 4000;
  int _joinedAtMs = 0;

  final StreamController<CallStatus> _statusController =
      StreamController<CallStatus>.broadcast();
  final StreamController<int> _durationController =
      StreamController<int>.broadcast();

  CallStatus get status => _status;
  bool get isMuted => _isMuted;
  bool get isSpeakerOn => _isSpeakerOn;
  int get durationSeconds => _callDurationSeconds;
  String? get currentChannel => _currentChannel;
  String? get remoteResponderName => _remoteResponderName;

  Stream<CallStatus> get onStatusChanged => _statusController.stream;
  Stream<int> get onDurationChanged => _durationController.stream;

  void _setStatus(CallStatus s) {
    _status = s;
    _statusController.add(s);
    notifyListeners();
  }

  Future<void> _initEngineIfNeeded() async {
    if (_isEngineInitialized && _engine != null) return;
    debugPrint('[Agora RTC] Initializing engine...');
    try {
      _engine = createAgoraRtcEngine();
      await _engine!.initialize(const RtcEngineContext(
        appId: AppConstants.agoraAppId,
        channelProfile: ChannelProfileType.channelProfileCommunication,
      ));
      debugPrint('[Agora RTC] initialize() done');

      // Bug 3 fix: only register the event handler once per engine instance.
      if (!_handlersRegistered) {
        _engine!.registerEventHandler(
          RtcEngineEventHandler(
            onJoinChannelSuccess: (RtcConnection connection, int elapsed) {
              debugPrint('[Agora RTC] ✅ onJoinChannelSuccess: channel=${connection.channelId} uid=${connection.localUid}');
              // Record join timestamp for ghost-event filtering.
              _joinedAtMs = DateTime.now().millisecondsSinceEpoch;
              _setStatus(CallStatus.inCall);
              _startDurationTimer();
              // Bug 4 fix: configure audio routing IMMEDIATELY inside the
              // success callback so it always runs, regardless of whether the
              // screen widget's stream listener is attached or fires in time.
              _configureAudioNow();
            },
            onUserJoined: (RtcConnection connection, int remoteUid, int elapsed) {
              debugPrint('[Agora RTC] 👤 Remote user joined: $remoteUid');
            },
            onUserOffline: (RtcConnection connection, int remoteUid, UserOfflineReasonType reason) {
              debugPrint('[Agora RTC] 👤 Remote user offline: $remoteUid reason: $reason');
              // Bug 5 fix: ignore ghost user-offline events that arrive within
              // the grace window immediately after joining. These are residual
              // signals from a previous call session that propagate late.
              final msSinceJoin = DateTime.now().millisecondsSinceEpoch - _joinedAtMs;
              if (_joinedAtMs > 0 && msSinceJoin < _ghostEventGraceMs) {
                debugPrint('[Agora RTC] ⚠️ Ignoring ghost user-offline for UID $remoteUid (${msSinceJoin}ms after join — grace window).');
                return;
              }
              if (_status == CallStatus.inCall || _status == CallStatus.connecting) {
                debugPrint('[Agora RTC] Remote caller disconnected from channel — ending call.');
                _setStatus(CallStatus.ended);
              }
            },
            onLocalAudioStateChanged: (RtcConnection connection, LocalAudioStreamState state, LocalAudioStreamReason reason) {
              debugPrint('[Agora RTC] 🎙️ LocalAudioState: $state reason: $reason');
            },
            onRemoteAudioStateChanged: (RtcConnection connection, int remoteUid, RemoteAudioState state, RemoteAudioStateReason reason, int elapsed) {
              debugPrint('[Agora RTC] 🔊 RemoteAudioState uid=$remoteUid: $state reason=$reason');
            },
            onAudioPublishStateChanged: (String channel, StreamPublishState oldState, StreamPublishState newState, int elapseSinceLastState) {
              debugPrint('[Agora RTC] 📡 AudioPublish: $oldState -> $newState');
            },
            onAudioVolumeIndication: (RtcConnection connection, List<AudioVolumeInfo> speakers, int totalVolume, int speakerNumber) {
              if (totalVolume > 0) {
                debugPrint('[Agora RTC] 🔈 Volume total=$totalVolume');
              }
            },
            onError: (ErrorCodeType err, String msg) {
              debugPrint('[Agora RTC] ❌ onError: $err => $msg');
            },
            onLeaveChannel: (RtcConnection connection, RtcStats stats) {
              debugPrint('[Agora RTC] 🚪 Left channel: ${connection.channelId}');
            },
            onConnectionStateChanged: (RtcConnection connection, ConnectionStateType state, ConnectionChangedReasonType reason) {
              debugPrint('[Agora RTC] 🔗 ConnectionState: $state reason=$reason');
            },
          ),
        );
        _handlersRegistered = true;
        debugPrint('[Agora RTC] Event handlers registered.');
      }

      await _engine!.enableAudio();
      debugPrint('[Agora RTC] enableAudio() done');
      await _engine!.setClientRole(role: ClientRoleType.clientRoleBroadcaster);
      debugPrint('[Agora RTC] setClientRole(broadcaster) done');
      await _engine!.setDefaultAudioRouteToSpeakerphone(true);
      debugPrint('[Agora RTC] setDefaultAudioRouteToSpeakerphone(true) done');
      await _engine!.enableAudioVolumeIndication(interval: 500, smooth: 3, reportVad: true);
      debugPrint('[Agora RTC] enableAudioVolumeIndication() done');

      _isEngineInitialized = true;
      debugPrint('[Agora RTC] ✅ Engine initialized successfully');
    } catch (e, stack) {
      debugPrint('[Agora RTC] ❌ Init error: $e\n$stack');
      _isEngineInitialized = false;
      _handlersRegistered = false;
      _engine = null;
    }
  }

  // Bug 4 fix: internal method that always runs right inside onJoinChannelSuccess
  // so audio routing is guaranteed to be configured before any UI state change.
  Future<void> _configureAudioNow() async {
    try {
      await _engine?.setEnableSpeakerphone(true);
      await _engine?.adjustRecordingSignalVolume(100);
      await _engine?.adjustPlaybackSignalVolume(100);
      await _engine?.muteLocalAudioStream(false);
      await _engine?.muteAllRemoteAudioStreams(false);
      debugPrint('[Agora RTC] ✅ Post-join audio configured (inside onJoinChannelSuccess)');
    } catch (e) {
      debugPrint('[Agora RTC] _configureAudioNow error: $e');
    }
  }

  /// Pre-warm engine and request microphone permission when Safety Mode activates
  Future<bool> prewarm() async {
    debugPrint('[Agora RTC] prewarm() start');
    try {
      final micStatus = await Permission.microphone.request();
      debugPrint('[Agora RTC] prewarm mic status: $micStatus');
      if (micStatus.isGranted) {
        await _initEngineIfNeeded();
      }
      return micStatus.isGranted;
    } catch (e) {
      debugPrint('[Agora RTC] prewarm error: $e');
      return false;
    }
  }

  void _startDurationTimer() {
    _durationTimer?.cancel();
    _callDurationSeconds = 0;
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _callDurationSeconds++;
      _durationController.add(_callDurationSeconds);
      notifyListeners();
    });
    debugPrint('[Agora RTC] Duration timer started');
  }

  Future<bool> startEmergencyVoiceLink({
    required String channelName,
    String responderName = 'Command Dispatcher',
    String? token,
    int uid = 2,
    bool autoAnswer = false,
  }) async {
    debugPrint('[Agora RTC] startEmergencyVoiceLink: channel=$channelName uid=$uid tokenLen=${token?.length ?? 0}');
    _currentChannel = channelName;
    _remoteResponderName = responderName;
    _isMuted = false;
    _isSpeakerOn = true;
    _joinedAtMs = 0;
    _setStatus(CallStatus.connecting);

    try {
      // Ensure mic permission
      final micStatus = await Permission.microphone.request();
      debugPrint('[Agora RTC] mic permission: $micStatus');
      if (!micStatus.isGranted) {
        debugPrint('[Agora RTC] ⚠️ Mic denied — trying to open settings');
        await openAppSettings();
      }

      // Ensure engine is ready
      await _initEngineIfNeeded();

      if (_engine == null) {
        debugPrint('[Agora RTC] ❌ Engine is null after init — cannot join');
        _setStatus(CallStatus.error);
        return false;
      }

      // CRITICAL: minimal join — do NOT call pre-join audio APIs like muteLocalAudioStream
      // before channel is joined; they can fail on some Android versions and abort the join.
      // Post-join audio config is handled inside onJoinChannelSuccess via _configureAudioNow().
      debugPrint('[Agora RTC] 🚀 Calling joinChannel...');
      await _engine!.joinChannel(
        token: token?.isNotEmpty == true ? token! : '',
        channelId: channelName,
        uid: uid,
        options: const ChannelMediaOptions(
          channelProfile: ChannelProfileType.channelProfileCommunication,
          clientRoleType: ClientRoleType.clientRoleBroadcaster,
          autoSubscribeAudio: true,
          publishMicrophoneTrack: true,
          enableAudioRecordingOrPlayout: true,
        ),
      );
      debugPrint('[Agora RTC] joinChannel() returned — waiting for onJoinChannelSuccess callback');
      return true;
    } catch (e, stack) {
      debugPrint('[Agora RTC] ❌ startEmergencyVoiceLink failed: $e\n$stack');
      _setStatus(CallStatus.error);
      return false;
    }
  }

  /// Public post-join audio configuration — still callable from the screen
  /// as an extra guarantee (double-calling is harmless).
  Future<void> configureAudioAfterJoin() async {
    await _configureAudioNow();
  }

  Future<void> toggleMute() async {
    _isMuted = !_isMuted;
    debugPrint('[Agora RTC] 🎙️ toggleMute -> $_isMuted');
    try {
      await _engine?.muteLocalAudioStream(_isMuted);
    } catch (e) {
      debugPrint('[Agora RTC] toggleMute error: $e');
    }
    notifyListeners();
  }

  Future<void> toggleSpeaker() async {
    _isSpeakerOn = !_isSpeakerOn;
    debugPrint('[Agora RTC] 🔊 toggleSpeaker -> $_isSpeakerOn');
    try {
      await _engine?.setEnableSpeakerphone(_isSpeakerOn);
    } catch (e) {
      debugPrint('[Agora RTC] toggleSpeaker error: $e');
    }
    notifyListeners();
  }

  Future<void> endCall() async {
    debugPrint('[Agora RTC] endCall()');
    _durationTimer?.cancel();
    _callDurationSeconds = 0;
    _joinedAtMs = 0;
    _setStatus(CallStatus.ended);

    try {
      await _engine?.leaveChannel();
    } catch (e) {
      debugPrint('[Agora RTC] leaveChannel error: $e');
    }

    Future.delayed(const Duration(milliseconds: 400), () {
      _setStatus(CallStatus.idle);
    });
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
    _joinedAtMs = 0;
    try {
      _engine?.leaveChannel();
      _engine?.release();
    } catch (_) {}
    _isEngineInitialized = false;
    _handlersRegistered = false;
    _engine = null;
    _statusController.close();
    _durationController.close();
    super.dispose();
  }
}
